const mongoose = require("mongoose");
const DocumentModel = require("./model");
const { nextDocumentCode } = require("./counter.model");
const TransferModel = require("./transfer.model");
const { createInitialTransfers } = require("./transfer.service");
const UserModel = require("../../user/user.model");
const OfficeModel = require("../master_data/office/model");
const DocumentTypeModel = require("../master_data/type_of_document/model");
const FrameWorkModel = require("../master_data/framework/model");
const StatusOfProcessModel = require("../master_data/status_of_process/model");
const getFilteredMongoDB = require("../../../../util/mongo_db/mongoDB_Queries");
const { logActivity } = require("../../../../util/log");
const { sanitizeUpdate } = require("../../../../util/helper");
const multer = require("multer");
const { uploadBuffer } = require("../../../../util/cloudinary");

// ───────────── multipart/form-data support (files + fields in one request) ─────────────
const MAX_FILE_MB = 20;
const MAX_FILES = 30;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: MAX_FILES },
});

// Fields sent as JSON text inside form-data
const JSON_FIELDS = ["reference_document", "document_main_url"];
// Id-list fields: accept repeated keys, JSON array text, or comma list
const LIST_FIELDS = ["send_to_office_id", "send_to_user_id"];
// Reference fields that must be ObjectId (empty string → remove)
const ID_FIELDS = ["status_of_process_id", "document_type_id", "framework_id"];

/**
 * Accepts JSON body (as before) OR form-data:
 *   document_files        → files for document_main_url (many)
 *   reference_document    → JSON text: [{ "number_document", "date_sign", "objective" }, ...]
 *   reference_files_0     → files for reference_document[0] (many), reference_files_1 → [1], ...
 *   any other field       → text (objective, number_document, date_sign, ...)
 * Files are uploaded to Cloudinary and merged into req.body.
 */
function parseDocumentForm(req, res, next) {
  if (!req.is("multipart/form-data")) return next();

  upload.any()(req, res, async (err) => {
    if (err) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `ឯកសារធំពេក! (អតិបរមា ${MAX_FILE_MB}MB)`
          : err.code === "LIMIT_FILE_COUNT"
            ? `អាចបញ្ចូលបានអតិបរមា ${MAX_FILES} ឯកសារ`
            : err.message;
      return res.status(400).json({ success: false, message });
    }
    try {
      // 1) JSON text fields → objects
      for (const key of JSON_FIELDS) {
        if (typeof req.body[key] === "string") {
          const raw = req.body[key].trim();
          if (raw === "") {
            delete req.body[key];
            continue;
          }
          try {
            req.body[key] = JSON.parse(raw);
          } catch {
            return res.status(400).json({ success: false, message: `${key} ត្រូវតែជា JSON array` });
          }
        }
      }
      // 1b) id lists → arrays
      for (const key of LIST_FIELDS) {
        const v = req.body[key];
        if (v === undefined) continue;
        const list = (Array.isArray(v) ? v : [v]).flatMap((x) => {
          const t = String(x).trim();
          if (t.startsWith("[")) {
            try {
              return JSON.parse(t);
            } catch {
              return [];
            }
          }
          return t.split(",");
        });
        req.body[key] = list.map((x) => String(x).trim()).filter(Boolean);
      }
      // 2) empty ids → remove (so they don't fail as invalid ObjectId)
      for (const key of ID_FIELDS) if (req.body[key] === "") delete req.body[key];

      // 3) upload files
      const files = req.files || [];
      const mainFiles = files.filter((f) => f.fieldname === "document_files");
      const refFiles = files.filter((f) => /^reference_files_\d+$/.test(f.fieldname));
      const unknown = files.filter((f) => f.fieldname !== "document_files" && !/^reference_files_\d+$/.test(f.fieldname));
      if (unknown.length) {
        return res.status(400).json({
          success: false,
          message: `field ឯកសារមិនត្រឹមត្រូវ: ${[...new Set(unknown.map((f) => f.fieldname))].join(", ")} (ប្រើ document_files ឬ reference_files_0, reference_files_1 ...)`,
        });
      }

      if (mainFiles.length) {
        const uploaded = await Promise.all(mainFiles.map((f) => uploadBuffer(f, "documents")));
        const current = Array.isArray(req.body.document_main_url) ? req.body.document_main_url : [];
        req.body.document_main_url = [...current, ...uploaded];
        req.uploadedMainFiles = uploaded.length;
      }

      if (refFiles.length) {
        const refs = Array.isArray(req.body.reference_document) ? req.body.reference_document : [];
        for (const f of refFiles) {
          const index = Number(f.fieldname.split("_").pop());
          if (!refs[index]) {
            return res.status(400).json({
              success: false,
              message: `មិនមាន reference_document[${index}] សម្រាប់ ${f.fieldname}`,
            });
          }
        }
        const uploaded = await Promise.all(
          refFiles.map(async (f) => ({ index: Number(f.fieldname.split("_").pop()), file: await uploadBuffer(f, "references") })),
        );
        for (const { index, file } of uploaded) {
          refs[index].files = [...(Array.isArray(refs[index].files) ? refs[index].files : []), file];
        }
        req.body.reference_document = refs;
      }
      next();
    } catch (e) {
      res.status(500).json({ success: false, message: "Upload ទៅ Cloudinary មិនបានសម្រេច", error: e.message || e });
    }
  });
}
const baseRoute = "document";

const route = (prop) => {
  // **************** Declaration ****************
  const urlAPI = `/${prop.main_route}/${baseRoute}`;
  const logTitle = "document";
  const document = "ឯកសារ";

  const serverError = "ម៉ាសុីនមេមានបញ្ហា សូមព្យាយាមម្តងទៀតពេលក្រោយ!";
  const noIDFound = "មិនមាន ID ត្រឹមត្រូវ!";
  const notFoundData = "មិនមានទិន្នន័យក្នុងប្រព័ន្ធ!";
  const noDataUpdate = "មិនមានទិន្នន័យដើម្បីកែប្រែ!";
  const noOffice = "គណនីរបស់អ្នកមិនទាន់មានការិយាល័យ!";
  const noPermission = "អ្នកមិនមានសិទ្ធិលើឯកសារនេះទេ!";

  // Fields the client may NOT set directly (managed by the system / send routes)
  const SYSTEM_FIELDS = [
    "code_of_document",
    "office_id_open",
    "document_progress",
    "send_from_office_id",
    "send_from_user_id",
    "date_sent",
  ];

  // Populate for detail / list
  const populate = [
    { path: "office_id_open", select: "name name_in_eng" },
    { path: "document_type_id", select: "name code" },
    { path: "framework_id", select: "name code" },
    { path: "status_of_process_id", select: "name" },
    { path: "send_from_office_id", select: "name name_in_eng" },
    { path: "send_from_user_id", select: "firstname lastname email" },
    { path: "send_to_office_id", select: "name name_in_eng" },
    { path: "send_to_user_id", select: "firstname lastname email office_id" },
    { path: "created_by", select: "firstname lastname email" },
  ];

  // ******************** Helper ****************************
  const isId = (id) => mongoose.Types.ObjectId.isValid(id);
  const sameId = (a, b) => String(a?._id || a) === String(b?._id || b);

  function checkValidtion(res, req, requiredFields) {
    for (const field of requiredFields) {
      const value = req.body[field.key];
      if (value === undefined || value === null || value === "") {
        res.status(400).json({ success: false, message: `សូមបញ្ចូល ${field.label}` });
        return false;
      }
    }
    return true;
  }

  // Current user + office (from DB, not the session snapshot)
  async function getMe(req) {
    const { user_id } = req.session;
    const user = await UserModel.findById(user_id).select("email office_id is_super_admin");
    return {
      userId: user_id,
      email: user?.email || "unknown",
      officeId: user?.office_id || null,
      isSuperAdmin: !!user?.is_super_admin,
    };
  }

  // Validate optional master-data references → error message or null
  async function checkRefs(body) {
    const refs = [
      { key: "document_type_id", model: DocumentTypeModel, label: "ប្រភេទឯកសារ" },
      { key: "framework_id", model: FrameWorkModel, label: "ក្របខណ្ឌឯកសារ" },
      { key: "status_of_process_id", model: StatusOfProcessModel, label: "លំហូរឯកសារ" },
    ];
    for (const r of refs) {
      const v = body[r.key];
      if (v === undefined || v === null || v === "") continue;
      if (!isId(v) || !(await r.model.exists({ _id: v, deleted: false }))) {
        return `រកមិនឃើញ${r.label}!`;
      }
    }
    return null;
  }

  // Validate a list of office ids → { ids } or { error }
  async function checkOffices(officeIds) {
    const ids = [...new Set((Array.isArray(officeIds) ? officeIds : [officeIds]).filter(Boolean).map(String))];
    if (ids.length === 0) return { error: "សូមជ្រើសរើសការិយាល័យទទួល!" };
    if (ids.some((id) => !isId(id))) return { error: noIDFound };
    const count = await OfficeModel.countDocuments({ _id: { $in: ids }, deleted: false });
    if (count !== ids.length) return { error: "រកមិនឃើញការិយាល័យខ្លះ!" };
    return { ids };
  }

  // Add document_progress (in/out) from the viewer's office
  function withProgress(doc, me) {
    const data = doc.toObject ? doc.toObject() : doc;
    const mine = me.officeId && sameId(data.office_id_open, me.officeId);
    data.document_progress = mine ? "out" : "in";
    return data;
  }

  // Validate receivers → { send_to_office_id, send_to_user_id } or { error }
  async function checkTargets(body, me, { required = false } = {}) {
    const clean = (v) =>
      [...new Set((Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).trim()).filter(Boolean))];
    const offices = clean(body.send_to_office_id);
    const users = clean(body.send_to_user_id);

    if (required && offices.length === 0 && users.length === 0) {
      return { error: "សូមជ្រើសរើសអង្គភាព ឬអ្នកប្រើប្រាស់ទទួលយ៉ាងហោចណាស់មួយ!" };
    }
    if ([...offices, ...users].some((x) => !isId(x))) return { error: noIDFound };
    if (me.officeId && offices.some((o) => sameId(o, me.officeId))) {
      return { error: "មិនអាចផ្ញើទៅអង្គភាពខ្លួនឯងបានទេ!" };
    }
    if (users.some((u) => sameId(u, me.userId))) {
      return { error: "មិនអាចផ្ញើទៅខ្លួនឯងបានទេ!" };
    }
    if (offices.length && (await OfficeModel.countDocuments({ _id: { $in: offices }, deleted: false })) !== offices.length) {
      return { error: "រកមិនឃើញអង្គភាពទទួលខ្លះ!" };
    }
    if (users.length && (await UserModel.countDocuments({ _id: { $in: users }, deleted: false })) !== users.length) {
      return { error: "រកមិនឃើញអ្នកប្រើប្រាស់ទទួលខ្លះ!" };
    }
    return { send_to_office_id: offices, send_to_user_id: users };
  }

  // Can this user see / act on the document?
  function isOwner(doc, me) {
    return me.isSuperAdmin || (me.officeId && sameId(doc.office_id_open, me.officeId));
  }
  function isRecipient(doc, me) {
    return (
      (!!me.officeId && (doc.send_to_office_id || []).some((o) => sameId(o, me.officeId))) ||
      (doc.send_to_user_id || []).some((u) => sameId(u, me.userId))
    );
  }

  // ===================================== CREATE (out) ================================================
  prop.app.post(`${urlAPI}`, prop.api_auth, prop.jwt_auth, prop.request_user, parseDocumentForm, async (req, res) => {
    try {
      if (!checkValidtion(res, req, [{ key: "objective", label: "កម្មវត្ថុ" }])) return;

      const me = await getMe(req);
      if (!me.officeId) return res.status(400).json({ success: false, message: noOffice });

      const refError = await checkRefs(req.body);
      if (refError) return res.status(404).json({ success: false, message: refError });

      const body = sanitizeUpdate(req.body, SYSTEM_FIELDS);

      // receivers are optional at create (can be set later with /send)
      const targets = await checkTargets(body, me);
      if (targets.error) return res.status(400).json({ success: false, message: targets.error });
      const hasTargets = targets.send_to_office_id.length + targets.send_to_user_id.length > 0;

      const code = await nextDocumentCode();

      const saveData = await DocumentModel.create({
        ...body,
        code_of_document: code,
        document_progress: "out",
        office_id_open: me.officeId,
        send_from_office_id: me.officeId,
        send_from_user_id: me.userId,
        send_to_office_id: targets.send_to_office_id,
        send_to_user_id: targets.send_to_user_id,
        date_sent: hasTargets ? new Date() : null,
        status: body.status || "new", // default new — not changed by sending
        deleted: false,
        created_by: me.userId,
        updated_by: me.userId,
      });

      if (hasTargets) {
        await createInitialTransfers({
          document: saveData,
          offices: targets.send_to_office_id,
          users: targets.send_to_user_id,
          me,
          note: req.body.send_note,
          status_of_process_id: saveData.status_of_process_id,
        });
      }

      await logActivity({
        title: `${document}ថ្មី ${code} ត្រូវបានបង្កើត!`,
        description: `បង្កើតដោយគណនី: ${me.email}`,
        categoryTitle: logTitle,
        createdBy: me.userId,
        req,
      });

      res.status(201).json({
        success: true,
        data: saveData,
        message: `${document} ${code} ត្រូវបានរក្សារទុក!`,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });

  // ===================================== GET LIST ================================================
  // ?box=out  → documents my office created
  // ?box=in   → documents sent to my office
  // ?box=all  → both (default)
  // Also: page, limit, sort, order, q, q_key, q_id, q_key_id, status
  prop.app.get(`${urlAPI}`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const me = await getMe(req);
      const box = ["in", "out", "all"].includes(req.query.box) ? req.query.box : "all";
      const filters = [];

      if (me.officeId || !me.isSuperAdmin) {
        const out = { office_id_open: me.officeId || null };
        const inbox = { $or: [{ send_to_office_id: me.officeId }, { send_to_user_id: me.userId }] };
        if (box === "out") filters.push(out);
        else if (box === "in") filters.push(inbox);
        else if (!me.isSuperAdmin) filters.push({ $or: [out, inbox] });
      }

      if (["new", "process", "close"].includes(req.query.status)) {
        filters.push({ status: req.query.status });
      }

      const result = await getFilteredMongoDB(req.query, DocumentModel, populate, filters, null);

      res.status(200).json({
        success: true,
        data: result.data.map((d) => withProgress(d, me)),
        pagination: result.pagination,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ===================================== GET BY ID ================================================
  prop.app.get(`${urlAPI}/:id`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isId(id)) return res.status(400).json({ success: false, message: noIDFound });

      const me = await getMe(req);
      const data = await DocumentModel.findOne({ _id: id, deleted: false }).populate(populate);
      if (!data) return res.status(404).json({ success: false, message: notFoundData });
      const inHop =
        !isOwner(data, me) &&
        !isRecipient(data, me) &&
        (await TransferModel.exists({
          document_id: id,
          deleted: false,
          $or: [
            { to_user_id: me.userId },
            { from_user_id: me.userId },
            ...(me.officeId ? [{ to_office_id: me.officeId }, { from_office_id: me.officeId }] : []),
          ],
        }));
      if (!isOwner(data, me) && !isRecipient(data, me) && !inHop) {
        return res.status(403).json({ success: false, message: noPermission });
      }

      res.status(200).json({ success: true, data: withProgress(data, me) });
    } catch (err) {
      res.status(500).json({ success: false, message: "Internal Error", error: err.message || err });
    }
  });

  // ===================================== UPDATE (owner office only) ================================================
  prop.app.put(`${urlAPI}/:id`, prop.api_auth, prop.jwt_auth, prop.request_user, parseDocumentForm, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isId(id)) return res.status(400).json({ success: false, message: noIDFound });

      const me = await getMe(req);
      const existing = await DocumentModel.findOne({ _id: id, deleted: false });
      if (!existing) return res.status(404).json({ success: false, message: notFoundData });
      if (!isOwner(existing, me)) return res.status(403).json({ success: false, message: noPermission });

      const updateFields = sanitizeUpdate(req.body, SYSTEM_FIELDS);
      Object.keys(updateFields).forEach((k) => updateFields[k] === undefined && delete updateFields[k]);

      // form-data update: uploaded document_files are appended to the files already saved
      const $push = {};
      if (req.uploadedMainFiles && typeof req.body.document_main_url !== "undefined") {
        const sentList = updateFields.document_main_url;
        const newFiles = sentList.slice(sentList.length - req.uploadedMainFiles);
        const keptFromClient = sentList.slice(0, sentList.length - req.uploadedMainFiles);
        if (keptFromClient.length === 0) {
          delete updateFields.document_main_url;
          $push.document_main_url = { $each: newFiles };
        }
      }
      if (Object.keys(updateFields).length === 0 && Object.keys($push).length === 0) {
        return res.status(400).json({ success: false, message: noDataUpdate });
      }

      const refError = await checkRefs(updateFields);
      if (refError) return res.status(404).json({ success: false, message: refError });

      if ("send_to_office_id" in updateFields || "send_to_user_id" in updateFields) {
        const targets = await checkTargets(
          {
            send_to_office_id: updateFields.send_to_office_id ?? existing.send_to_office_id,
            send_to_user_id: updateFields.send_to_user_id ?? existing.send_to_user_id,
          },
          me,
        );
        if (targets.error) return res.status(400).json({ success: false, message: targets.error });
        updateFields.send_to_office_id = targets.send_to_office_id;
        updateFields.send_to_user_id = targets.send_to_user_id;
      }

      const updated = await DocumentModel.findByIdAndUpdate(
        id,
        { $set: { ...updateFields, updated_by: me.userId }, ...(Object.keys($push).length ? { $push } : {}) },
        { new: true, runValidators: true },
      ).populate(populate);

      await logActivity({
        title: `${document} ${updated.code_of_document} ត្រូវបានកែប្រែ!`,
        description: `គណនី: ${me.email} បានកែប្រែ: ${[...Object.keys(updateFields), ...Object.keys($push)].join(", ")}`,
        categoryTitle: logTitle,
        createdBy: me.userId,
        req,
      });

      res.status(200).json({
        success: true,
        data: withProgress(updated, me),
        message: `${document} ${updated.code_of_document} ត្រូវបានកែប្រែ!`,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });

  // ===================================== REPLACE ONE FILE WITH A SIGNED PDF ================================================
  // PUT /document/:id/file  (multipart/form-data)
  //   file      = new signed PDF (required)
  //   public_id = public_id of the existing file to replace (required)
  // Allowed: a receiver who still holds the document (transfer pending/received),
  //          or the owner office (incl. super admin) while the document has not been sent yet.
  // The old file stays on Cloudinary (recoverable). Only that one entry is replaced.
  function parseSingleFile(req, res, next) {
    upload.single("file")(req, res, (err) => {
      if (err) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? `ឯកសារធំពេក! (អតិបរមា ${MAX_FILE_MB}MB)`
            : err.code === "LIMIT_UNEXPECTED_FILE"
              ? "សូមប្រើ field ឈ្មោះ file សម្រាប់ឯកសារ"
              : err.message;
        return res.status(400).json({ success: false, message });
      }
      next();
    });
  }

  prop.app.put(
    `${urlAPI}/:id/file`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    parseSingleFile,
    async (req, res) => {
      try {
        const { id } = req.params;
        if (!isId(id)) return res.status(400).json({ success: false, message: noIDFound });

        const doc = await DocumentModel.findOne({ _id: id, deleted: false });
        if (!doc) return res.status(404).json({ success: false, message: notFoundData });

        // ✅ Validate input
        const file = req.file;
        const public_id = String(req.body?.public_id || "").trim();
        if (!file) return res.status(400).json({ success: false, message: "សូមជ្រើសរើសឯកសារ PDF ដែលបានចុះហត្ថលេខា!" });
        if (!public_id) return res.status(400).json({ success: false, message: "សូមបញ្ចូល public_id របស់ឯកសារដែលត្រូវជំនួស!" });
        const isPdf = file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname || "");
        if (!isPdf) return res.status(400).json({ success: false, message: "អនុញ្ញាតតែឯកសារ PDF ប៉ុណ្ណោះ!" });

        // ✅ Permission
        const me = await getMe(req);
        const holdsDocument = await TransferModel.exists({
          document_id: id,
          deleted: false,
          status: { $in: ["pending", "received"] },
          $or: [
            { to_user_id: me.userId },
            ...(me.officeId ? [{ to_user_id: null, to_office_id: me.officeId }] : []),
          ],
        });
        let allowed = !!holdsDocument;
        if (!allowed && isOwner(doc, me)) {
          const sent = await TransferModel.exists({ document_id: id, deleted: false });
          allowed = !sent;
        }
        if (!allowed) return res.status(403).json({ success: false, message: noPermission });

        // ✅ Find the file to replace (main file or reference file)
        let kind = null;
        let oldFile = (doc.document_main_url || []).find((f) => f.public_id === public_id);
        if (oldFile) kind = "main";
        else {
          for (const ref of doc.reference_document || []) {
            oldFile = (ref.files || []).find((f) => f.public_id === public_id);
            if (oldFile) {
              kind = "reference";
              break;
            }
          }
        }
        if (!kind) return res.status(404).json({ success: false, message: "រកមិនឃើញឯកសារនេះក្នុងឯកសារ" });

        // ✅ Upload the signed PDF (keep the old display name)
        const newFile = await uploadBuffer(file, kind === "main" ? "documents" : "references");
        newFile.original_name = oldFile.original_name;

        // ✅ Replace only that entry
        const path = kind === "main" ? "document_main_url.$[f]" : "reference_document.$[].files.$[f]";
        const updated = await DocumentModel.findOneAndUpdate(
          { _id: id, deleted: false },
          { $set: { [path]: newFile, updated_by: me.userId } },
          { new: true, arrayFilters: [{ "f.public_id": public_id }] },
        ).populate(populate);
        if (!updated) return res.status(404).json({ success: false, message: notFoundData });

        await logActivity({
          title: `${document} ${doc.code_of_document} ត្រូវបានជំនួសឯកសារដោយឯកសារចុះហត្ថលេខា`,
          description: `គណនី: ${me.email} បានជំនួសឯកសារ ${public_id} ដោយ ${newFile.public_id}`,
          categoryTitle: logTitle,
          createdBy: me.userId,
          req,
        });

        res.status(200).json({
          success: true,
          data: withProgress(updated, me),
          file: newFile,
          message: "ឯកសារត្រូវបានរក្សាទុក!",
        });
      } catch (err) {
        res.status(500).json({ success: false, message: serverError, error: err.message || err });
      }
    },
  );

  // ===================================== SEND (set receivers) ================================================
  // body: { send_to_office_id: [...], send_to_user_id: [...], note } — at least one office or one user
  // Adds receivers (keeps the ones already sent) and creates a step-1 transfer for each new receiver
  prop.app.post(`${urlAPI}/:id/send`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isId(id)) return res.status(400).json({ success: false, message: noIDFound });

      const me = await getMe(req);
      if (!me.officeId) return res.status(400).json({ success: false, message: noOffice });

      const doc = await DocumentModel.findOne({ _id: id, deleted: false });
      if (!doc) return res.status(404).json({ success: false, message: notFoundData });
      if (!isOwner(doc, me)) return res.status(403).json({ success: false, message: noPermission });

      const targets = await checkTargets(req.body, me, { required: true });
      if (targets.error) return res.status(400).json({ success: false, message: targets.error });

      const updated = await DocumentModel.findByIdAndUpdate(
        id,
        {
          $addToSet: {
            send_to_office_id: { $each: targets.send_to_office_id },
            send_to_user_id: { $each: targets.send_to_user_id },
          },
          $set: {
            send_from_office_id: me.officeId,
            send_from_user_id: me.userId,
            date_sent: doc.date_sent || new Date(),
            updated_by: me.userId,
          },
        },
        { new: true },
      ).populate(populate);

      const transfers = await createInitialTransfers({
        document: updated,
        offices: targets.send_to_office_id,
        users: targets.send_to_user_id,
        me,
        note: req.body.note,
        status_of_process_id: updated.status_of_process_id?._id || updated.status_of_process_id,
      });

      await logActivity({
        title: `${document} ${doc.code_of_document} ត្រូវបានផ្ញើ!`,
        description: `គណនី: ${me.email} បានផ្ញើទៅ ${targets.send_to_office_id.length} អង្គភាព និង ${targets.send_to_user_id.length} អ្នកប្រើប្រាស់`,
        categoryTitle: logTitle,
        createdBy: me.userId,
        req,
      });

      res.status(200).json({
        success: true,
        data: withProgress(updated, me),
        transfers_created: transfers.length,
        message: `${document} ${doc.code_of_document} ត្រូវបានផ្ញើ!`,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });

  // ===================================== SOFT DELETE (owner office only) ================================================
  prop.app.delete(`${urlAPI}/:id`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isId(id)) return res.status(400).json({ success: false, message: noIDFound });

      const me = await getMe(req);
      const doc = await DocumentModel.findOne({ _id: id, deleted: false });
      if (!doc) return res.status(404).json({ success: false, message: notFoundData });
      if (!isOwner(doc, me)) return res.status(403).json({ success: false, message: noPermission });

      await DocumentModel.updateOne({ _id: id }, { deleted: true, updated_by: me.userId });

      await logActivity({
        title: `${document} ${doc.code_of_document} ត្រូវបានលុប!`,
        description: `គណនី: ${me.email} បានលុបទិន្នន័យចេញពីប្រព័ន្ធ។`,
        categoryTitle: logTitle,
        createdBy: me.userId,
        req,
      });

      res.status(200).json({ success: true, message: `${document} ${doc.code_of_document} ត្រូវបានលុប!` });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });

  // ===================================== RESTORE (owner office only) ================================================
  prop.app.put(`${urlAPI}/restore/:id`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isId(id)) return res.status(400).json({ success: false, message: noIDFound });

      const me = await getMe(req);
      const doc = await DocumentModel.findOne({ _id: id, deleted: true });
      if (!doc) return res.status(404).json({ success: false, message: notFoundData });
      if (!isOwner(doc, me)) return res.status(403).json({ success: false, message: noPermission });

      await DocumentModel.updateOne({ _id: id }, { deleted: false, updated_by: me.userId });

      await logActivity({
        title: `${document} ${doc.code_of_document} ត្រូវបានស្តារឡើងវិញ!`,
        description: `គណនី: ${me.email} បានស្តារទិន្នន័យចូលក្នុងប្រព័ន្ធ។`,
        categoryTitle: logTitle,
        createdBy: me.userId,
        req,
      });

      res.status(200).json({ success: true, message: `${document} ${doc.code_of_document} បានស្តារឡើងវិញ!` });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });
};

module.exports = route;

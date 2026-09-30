const DocumentModel = require("./model");
const TransferModel = require("./transfer.model");
const { buildRows, isReceiver, holdingRow, sameId, isId } = require("./transfer.service");
const UserModel = require("../../user/user.model");
const OfficeModel = require("../master_data/office/model");
const StatusOfProcessModel = require("../master_data/status_of_process/model");
const { logActivity } = require("../../../../util/log");

const route = (prop) => {
  // **************** Declaration ****************
  const urlAPI = `/${prop.main_route}/document-transfer`;
  const logTitle = "document";
  const document = "ឯកសារ";

  const serverError = "ម៉ាសុីនមេមានបញ្ហា សូមព្យាយាមម្តងទៀតពេលក្រោយ!";
  const noIDFound = "មិនមាន ID ត្រឹមត្រូវ!";
  const notFound = "មិនមានទិន្នន័យក្នុងប្រព័ន្ធ!";
  const noPermission = "អ្នកមិនមានសិទ្ធិលើឯកសារនេះទេ!";

  const STATUSES = ["pending", "received", "forwarded", "returned", "done"];
  const OPEN = ["received", "forwarded"]; // states where the receiver may still act

  const populate = [
    {
      path: "document_id",
      select: "code_of_document number_document objective date_sign status document_type_id office_id_open",
      populate: [
        { path: "document_type_id", select: "name" },
        { path: "office_id_open", select: "name name_in_eng" },
      ],
    },
    { path: "from_office_id", select: "name name_in_eng" },
    { path: "from_user_id", select: "firstname lastname email" },
    { path: "to_office_id", select: "name name_in_eng" },
    { path: "to_user_id", select: "firstname lastname email" },
    { path: "received_by", select: "firstname lastname email" },
    { path: "status_of_process_id", select: "name" },
  ];

  // ******************** Helper ****************************
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

  const fail = (res, code, message) => res.status(code).json({ success: false, message });

  // Validate receivers for forward
  async function checkTargets(body, me) {
    const clean = (v) => [...new Set((Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).trim()).filter(Boolean))];
    const offices = clean(body.send_to_office_id);
    const users = clean(body.send_to_user_id);
    if (offices.length === 0 && users.length === 0) {
      return { error: "សូមជ្រើសរើសអង្គភាព ឬអ្នកប្រើប្រាស់ទទួលយ៉ាងហោចណាស់មួយ!" };
    }
    if ([...offices, ...users].some((x) => !isId(x))) return { error: noIDFound };
    if (offices.some((o) => sameId(o, me.officeId))) return { error: "មិនអាចបញ្ជូនទៅអង្គភាពខ្លួនឯងបានទេ!" };
    if (users.some((u) => sameId(u, me.userId))) return { error: "មិនអាចបញ្ជូនទៅខ្លួនឯងបានទេ!" };
    if (offices.length && (await OfficeModel.countDocuments({ _id: { $in: offices }, deleted: false })) !== offices.length) {
      return { error: "រកមិនឃើញអង្គភាពទទួលខ្លះ!" };
    }
    if (users.length && (await UserModel.countDocuments({ _id: { $in: users }, deleted: false })) !== users.length) {
      return { error: "រកមិនឃើញអ្នកប្រើប្រាស់ទទួលខ្លះ!" };
    }
    return { offices, users };
  }

  async function checkStatusOfProcess(id) {
    if (id === undefined || id === null || id === "") return null;
    if (!isId(id) || !(await StatusOfProcessModel.exists({ _id: id, deleted: false }))) {
      return "រកមិនឃើញលំហូរឯកសារ!";
    }
    return null;
  }

  // Load a transfer the current user is the receiver of
  async function loadMine(req, res) {
    const { tid } = req.params;
    if (!isId(tid)) return fail(res, 400, noIDFound) && null;
    const me = await getMe(req);
    const t = await TransferModel.findOne({ _id: tid, deleted: false });
    if (!t) return fail(res, 404, notFound) && null;
    if (!isReceiver(t, me)) return fail(res, 403, noPermission) && null;
    return { me, t };
  }

  // Filter: transfers addressed to me (as user) or to my office (office-level rows)
  const toMeFilter = (me) => ({
    $or: [{ to_user_id: me.userId }, ...(me.officeId ? [{ to_office_id: me.officeId, to_user_id: null }] : [])],
  });

  async function paged(req, filter) {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const order = req.query.order === "asc" ? 1 : -1;
    const query = TransferModel.find(filter).populate(populate).sort({ date_sent: order }).skip((page - 1) * limit).limit(limit);
    const [data, total] = await Promise.all([
      process.env.PERF_LEGACY === "1" ? query : query.lean(), // [perf] lean: plain JSON, same fields
      TransferModel.countDocuments(filter),
    ]);
    return { data, pagination: { total, totalPages: Math.ceil(total / limit), currentPage: page, pageSize: limit } };
  }

  // ===================================== INBOX ================================================
  // ?status=pending|received|forwarded|returned|done (comma list ok) · page · limit · order
  prop.app.get(`${urlAPI}/inbox`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const me = await getMe(req);
      const filter = { deleted: false, ...toMeFilter(me) };
      const statuses = String(req.query.status || "").split(",").filter((s) => STATUSES.includes(s));
      if (statuses.length) filter.status = { $in: statuses };
      res.json({ success: true, ...(await paged(req, filter)) });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });

  // ===================================== SENT BY ME / MY OFFICE ================================================
  // ?scope=me|office (default office) · status · page · limit
  prop.app.get(`${urlAPI}/sent`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const me = await getMe(req);
      const filter = { deleted: false };
      if (req.query.scope === "me" || !me.officeId) filter.from_user_id = me.userId;
      else filter.from_office_id = me.officeId;
      const statuses = String(req.query.status || "").split(",").filter((s) => STATUSES.includes(s));
      if (statuses.length) filter.status = { $in: statuses };
      res.json({ success: true, ...(await paged(req, filter)) });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });

  // ===================================== RECEIVE ================================================
  prop.app.put(`${urlAPI}/:tid/receive`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const ctx = await loadMine(req, res);
      if (!ctx) return;
      const { me, t } = ctx;
      if (t.status !== "pending") return fail(res, 400, "ឯកសារនេះបានទទួលរួចហើយ!");

      t.status = "received";
      t.date_received = new Date();
      t.received_by = me.userId;
      await t.save();

      const doc = await DocumentModel.findById(t.document_id).select("code_of_document");
      await logActivity({
        title: `${document} ${doc?.code_of_document || ""} ត្រូវបានទទួល!`,
        description: `គណនី: ${me.email} បានទទួលឯកសារ`,
        categoryTitle: logTitle,
        createdBy: me.userId,
        req,
      });

      res.json({ success: true, data: await t.populate(populate), message: `${document}ត្រូវបានទទួល!` });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });

  // ===================================== FORWARD (transfer to next offices / users) ================================================
  // body: { send_to_office_id: [], send_to_user_id: [], note, status_of_process_id }
  prop.app.post(`${urlAPI}/:tid/forward`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const ctx = await loadMine(req, res);
      if (!ctx) return;
      const { me, t } = ctx;
      if (!OPEN.includes(t.status)) {
        return fail(res, 400, t.status === "pending" ? "សូមទទួលឯកសារជាមុនសិន!" : "ឯកសារនេះបានបញ្ចប់នៅអង្គភាពរបស់អ្នករួចហើយ!");
      }

      const targets = await checkTargets(req.body, me);
      if (targets.error) return fail(res, 400, targets.error);
      const sopError = await checkStatusOfProcess(req.body.status_of_process_id);
      if (sopError) return fail(res, 404, sopError);

      const holding = await holdingRow(t);
      const rows = await buildRows({
        documentId: t.document_id,
        offices: targets.offices,
        users: targets.users,
        me,
        base: {
          action: "forward",
          step: t.step + 1,
          parent_transfer_id: t._id,
          prev_transfer_id: holding ? holding._id : null,
          note: req.body.note || "",
          status_of_process_id: req.body.status_of_process_id || null,
        },
      });
      const created = await TransferModel.insertMany(rows);

      t.status = "forwarded";
      t.date_done = new Date();
      await t.save();

      if (req.body.status_of_process_id) {
        await DocumentModel.updateOne({ _id: t.document_id }, { status_of_process_id: req.body.status_of_process_id });
      }

      const doc = await DocumentModel.findById(t.document_id).select("code_of_document");
      await logActivity({
        title: `${document} ${doc?.code_of_document || ""} ត្រូវបានបញ្ជូនបន្ត!`,
        description: `គណនី: ${me.email} បានបញ្ជូនបន្តទៅ ${rows.length} អ្នកទទួល`,
        categoryTitle: logTitle,
        createdBy: me.userId,
        req,
      });

      const data = await TransferModel.find({ _id: { $in: created.map((c) => c._id) } }).populate(populate);
      res.status(201).json({ success: true, data, message: `${document}ត្រូវបានបញ្ជូនបន្ត!` });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });

  // ===================================== RETURN (roll back one step) ================================================
  // body: { note, status_of_process_id }
  prop.app.post(`${urlAPI}/:tid/return`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const ctx = await loadMine(req, res);
      if (!ctx) return;
      const { me, t } = ctx;
      if (!OPEN.includes(t.status)) {
        return fail(res, 400, t.status === "pending" ? "សូមទទួលឯកសារជាមុនសិន!" : "ឯកសារនេះបានបញ្ចប់នៅអង្គភាពរបស់អ្នករួចហើយ!");
      }

      const holding = await holdingRow(t);
      if (!holding) return fail(res, 400, "អ្នកជាអង្គភាពដើមនៃឯកសារ មិនអាចរុញត្រឡប់បានទៀតទេ!");

      const sopError = await checkStatusOfProcess(req.body.status_of_process_id);
      if (sopError) return fail(res, 404, sopError);

      // back to whoever sent it to me (office, or the user if it was sent to me personally from a user)
      const created = await TransferModel.create({
        document_id: t.document_id,
        action: "return",
        step: t.step + 1,
        parent_transfer_id: t._id,
        origin_transfer_id: holding.prev_transfer_id || null,
        from_office_id: me.officeId || null,
        from_user_id: me.userId,
        to_office_id: holding.from_office_id || null,
        to_user_id: holding.from_office_id ? null : holding.from_user_id,
        status: "pending",
        note: req.body.note || "",
        status_of_process_id: req.body.status_of_process_id || null,
        date_sent: new Date(),
      });

      t.status = "returned";
      t.date_done = new Date();
      await t.save();

      if (req.body.status_of_process_id) {
        await DocumentModel.updateOne({ _id: t.document_id }, { status_of_process_id: req.body.status_of_process_id });
      }

      const doc = await DocumentModel.findById(t.document_id).select("code_of_document");
      await logActivity({
        title: `${document} ${doc?.code_of_document || ""} ត្រូវបានរុញត្រឡប់!`,
        description: `គណនី: ${me.email} បានរុញត្រឡប់ឯកសារ`,
        categoryTitle: logTitle,
        createdBy: me.userId,
        req,
      });

      res.status(201).json({ success: true, data: await created.populate(populate), message: `${document}ត្រូវបានរុញត្រឡប់!` });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });

  // ===================================== DONE (finish at my office) ================================================
  // body: { note }
  prop.app.put(`${urlAPI}/:tid/done`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const ctx = await loadMine(req, res);
      if (!ctx) return;
      const { me, t } = ctx;
      if (t.status !== "received") {
        return fail(res, 400, t.status === "pending" ? "សូមទទួលឯកសារជាមុនសិន!" : "មិនអាចបញ្ចប់ឯកសារនេះបានទេ!");
      }
      t.status = "done";
      t.date_done = new Date();
      t.done_note = req.body?.note || "";
      await t.save();

      res.json({ success: true, data: await t.populate(populate), message: `${document}ត្រូវបានបញ្ចប់នៅអង្គភាពរបស់អ្នក!` });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });

  // ===================================== TRACKING ================================================
  // GET /document/:id/tracking → timeline + tree + summary
  prop.app.get(`/${prop.main_route}/document/:id/tracking`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const { id } = req.params;
      if (!isId(id)) return fail(res, 400, noIDFound);
      const me = await getMe(req);

      const doc = await DocumentModel.findOne({ _id: id, deleted: false })
        .select("code_of_document number_document objective status office_id_open send_from_office_id send_from_user_id created_date")
        .populate([
          { path: "office_id_open", select: "name name_in_eng" },
          { path: "send_from_user_id", select: "firstname lastname email" },
        ]);
      if (!doc) return fail(res, 404, notFound);

      const rows = await TransferModel.find({ document_id: id, deleted: false })
        .populate(populate.slice(1))
        .sort({ date_sent: 1 })
        .lean();

      // permission: creator office, super admin, or anyone who sent / received a hop
      const involved =
        me.isSuperAdmin ||
        sameId(doc.office_id_open, me.officeId) ||
        rows.some(
          (r) =>
            sameId(r.from_user_id, me.userId) ||
            sameId(r.to_user_id, me.userId) ||
            (me.officeId && (sameId(r.to_office_id, me.officeId) || sameId(r.from_office_id, me.officeId))),
        );
      if (!involved) return fail(res, 403, noPermission);

      const hours = (a, b) => (a && b ? Math.round(((new Date(b) - new Date(a)) / 36e5) * 100) / 100 : null);
      const now = new Date();

      // timeline
      const timeline = rows.map((r) => ({
        ...r,
        waiting_hours: hours(r.date_sent, r.date_received || (r.status === "pending" ? now : null)), // sent → received
        holding_hours: hours(r.date_received, r.date_done || (r.status === "received" ? now : null)), // received → action
        children: [],
      }));

      // tree (by parent_transfer_id)
      const byId = Object.fromEntries(timeline.map((r) => [String(r._id), r]));
      const tree = [];
      timeline.forEach((r) => {
        const parent = r.parent_transfer_id && byId[String(r.parent_transfer_id)];
        if (parent) parent.children.push(r);
        else tree.push(r);
      });

      // summary
      const officeIds = new Set([String(doc.office_id_open?._id || doc.office_id_open)]);
      const userIds = new Set();
      rows.forEach((r) => {
        [r.from_office_id, r.to_office_id].forEach((o) => o && officeIds.add(String(o._id || o)));
        [r.from_user_id, r.to_user_id, r.received_by].forEach((u) => u && userIds.add(String(u._id || u)));
      });
      const current = rows.filter((r) => r.status === "pending" || r.status === "received");
      const first = rows[0]?.date_sent;
      const lastAction = rows.reduce((m, r) => {
        const d = r.date_done || r.date_received || r.date_sent;
        return d && (!m || d > m) ? d : m;
      }, null);

      const summary = {
        total_steps: rows.reduce((m, r) => Math.max(m, r.step), 0),
        total_transfers: rows.length,
        offices_passed: officeIds.size, // including the creator office
        users_involved: userIds.size,
        returns: rows.filter((r) => r.action === "return").length,
        current_holders: current.map((r) => ({
          transfer_id: r._id,
          status: r.status,
          office: r.to_office_id,
          user: r.to_user_id,
          since: r.date_received || r.date_sent,
        })),
        first_sent: first || null,
        last_action: lastAction,
        total_hours: hours(first, current.length ? now : lastAction),
      };

      res.json({ success: true, data: { document: doc, summary, timeline: timeline.map(({ children, ...r }) => r), tree } });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });
};

module.exports = route;

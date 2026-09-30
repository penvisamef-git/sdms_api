const mongoose = require("mongoose");
const DocumentModel = require("../document/model");
const TransferModel = require("../document/transfer.model");
const UserModel = require("../../user/user.model");
const OfficeModel = require("../master_data/office/model");
const baseRoute = "home";

// Documents are counted in the month of this date field (default: created_date)
const DATE_FIELDS = ["created_date", "date_in", "date_registration_document", "date_sign", "date_sent"];
const TZ_OFFSET_HOURS = 7; // Asia/Phnom_Penh

const route = (prop) => {
  const urlAPI = `/${prop.main_route}/${baseRoute}`;
  const serverError = "ម៉ាសុីនមេមានបញ្ហា សូមព្យាយាមម្តងទៀតពេលក្រោយ!";

  const officeChain = {
    path: "office_id",
    select: "name name_in_eng department_id",
    populate: {
      path: "department_id",
      select: "name name_in_eng general_directorate_id",
      populate: {
        path: "general_directorate_id",
        select: "name name_in_eng unit_id",
        populate: { path: "unit_id", select: "name name_in_eng" },
      },
    },
  };

  const docPopulate = [
    { path: "office_id_open", select: "name name_in_eng" },
    { path: "document_type_id", select: "name" },
    { path: "status_of_process_id", select: "name" },
    { path: "send_from_user_id", select: "firstname lastname" },
  ];

  // ******************** Helper ****************************
  async function getMe(req, { withChain = true } = {}) {
    const { user_id } = req.session;
    let query = UserModel.findById(user_id).select("firstname lastname email office_id is_super_admin role");
    // [perf] the office chain is only needed by /summary and /my-office
    if (withChain || process.env.PERF_LEGACY === "1") query = query.populate(officeChain);
    const user = await query;
    return {
      user,
      userId: user_id,
      officeId: user?.office_id?._id || user?.office_id || null,
      isSuperAdmin: !!user?.is_super_admin,
    };
  }

  // ?month=2026-09 | ?month=9&year=2026 | default current month (Phnom Penh time)
  function monthRange(query) {
    const nowPP = new Date(Date.now() + TZ_OFFSET_HOURS * 36e5);
    let year = nowPP.getUTCFullYear();
    let month = nowPP.getUTCMonth() + 1;
    const m = String(query.month || "").match(/^(\d{4})-(\d{1,2})$/);
    if (m) {
      year = +m[1];
      month = +m[2];
    } else if (query.month) {
      month = +query.month;
      if (query.year) year = +query.year;
    }
    if (!(month >= 1 && month <= 12) || !(year >= 2000 && year <= 2100)) return null;
    const from = new Date(Date.UTC(year, month - 1, 1) - TZ_OFFSET_HOURS * 36e5);
    const to = new Date(Date.UTC(year, month, 1) - TZ_OFFSET_HOURS * 36e5);
    return { value: `${year}-${String(month).padStart(2, "0")}`, year, month, from, to };
  }

  // Filter to transfers addressed to me or my office
  const toMe = (me) => ({
    $or: [{ to_user_id: me.userId }, ...(me.officeId ? [{ to_office_id: me.officeId, to_user_id: null }] : [])],
  });

  // Documents I can see: created by my office, sent to me / my office, or reached me through a transfer
  async function visibleFilter(me) {
    if (me.isSuperAdmin && !me.officeId) return { deleted: false };
    const viaTransfer = await TransferModel.distinct("document_id", { deleted: false, ...toMe(me) });
    const or = [{ send_to_user_id: me.userId }, { _id: { $in: viaTransfer } }];
    if (me.officeId) or.push({ office_id_open: me.officeId }, { send_to_office_id: me.officeId });
    return { deleted: false, $or: or };
  }

  function chainOf(user) {
    const office = user?.office_id && typeof user.office_id === "object" ? user.office_id : null;
    const dep = office?.department_id && typeof office.department_id === "object" ? office.department_id : null;
    const gd = dep?.general_directorate_id && typeof dep.general_directorate_id === "object" ? dep.general_directorate_id : null;
    const unit = gd?.unit_id && typeof gd.unit_id === "object" ? gd.unit_id : null;
    const pick = (x) => (x ? { _id: x._id, name: x.name, name_in_eng: x.name_in_eng || null } : null);
    return { office: pick(office), department: pick(dep), general_directorate: pick(gd), unit: pick(unit) };
  }

  const badMonth = (res) =>
    res.status(400).json({ success: false, message: "ខែមិនត្រឹមត្រូវ! (ឧ. month=2026-09)" });

  // ===================================== MY OFFICE (office → department → general directorate → unit) ================================================
  prop.app.get(`${urlAPI}/my-office`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const me = await getMe(req);
      if (!me.user) return res.status(404).json({ success: false, message: "មិនមានអ្នកប្រើប្រាស់!" });
      res.json({
        success: true,
        data: {
          user: { _id: me.user._id, firstname: me.user.firstname, lastname: me.user.lastname, email: me.user.email },
          ...chainOf(me.user),
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });

  // ===================================== NEW DOCUMENTS (status = new, visible to me) ================================================
  // ?month=2026-09 · date_field=created_date|date_in|date_registration_document|date_sign|date_sent
  // ?box=all|out|in · page · limit · all_time=true (ignore month)
  prop.app.get(`${urlAPI}/new-documents`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const me = await getMe(req, { withChain: false });
      const range = monthRange(req.query);
      if (!range) return badMonth(res);
      const dateField = DATE_FIELDS.includes(req.query.date_field) ? req.query.date_field : "created_date";

      const filter = { ...(await visibleFilter(me)), status: "new" };
      if (req.query.all_time !== "true") filter[dateField] = { $gte: range.from, $lt: range.to };
      if (req.query.box === "out") filter.office_id_open = me.officeId;
      if (req.query.box === "in") filter.office_id_open = { $ne: me.officeId };

      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
      const [data, total] = await Promise.all([
        DocumentModel.find(filter)
          .select("code_of_document number_document objective status date_in date_sign date_registration_document date_sent office_id_open document_type_id status_of_process_id send_from_user_id created_date")
          .populate(docPopulate)
          .sort({ [dateField]: -1, created_date: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        DocumentModel.countDocuments(filter),
      ]);

      res.json({
        success: true,
        month: req.query.all_time === "true" ? null : { value: range.value, from: range.from, to: range.to, date_field: dateField },
        data: data.map((d) => ({
          ...d,
          document_progress: me.officeId && String(d.office_id_open?._id || d.office_id_open) === String(me.officeId) ? "out" : "in",
        })),
        pagination: { total, totalPages: Math.ceil(total / limit), currentPage: page, pageSize: limit },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });

  // ===================================== SUMMARY (home screen, one call) ================================================
  // ?month=2026-09 · date_field=created_date|date_in|date_registration_document|date_sign|date_sent
  prop.app.get(`${urlAPI}/summary`, prop.api_auth, prop.jwt_auth, prop.request_user, async (req, res) => {
    try {
      const me = await getMe(req);
      const range = monthRange(req.query);
      if (!range) return badMonth(res);
      const dateField = DATE_FIELDS.includes(req.query.date_field) ? req.query.date_field : "created_date";
      const inMonth = { $gte: range.from, $lt: range.to };

      const visible = await visibleFilter(me);
      const isOut = (d) => me.officeId && String(d.office_id_open?._id || d.office_id_open) === String(me.officeId);

      const [monthDocs, newDocs, newTotal, waiting, onHand, sentMonth, returnedToMe, doneMonth, recentInbox] = await Promise.all([
        // all visible documents of the month (small projection, grouped below)
        DocumentModel.find({ ...visible, [dateField]: inMonth })
          .select(`status office_id_open document_type_id status_of_process_id ${dateField}`)
          .populate([
            { path: "document_type_id", select: "name" },
            { path: "status_of_process_id", select: "name" },
          ])
          .lean(),
        // latest new documents of the month
        DocumentModel.find({ ...visible, status: "new", [dateField]: inMonth })
          .select("code_of_document number_document objective status date_in date_sign office_id_open document_type_id created_date")
          .populate(docPopulate)
          .sort({ [dateField]: -1, created_date: -1 })
          .limit(5)
          .lean(),
        DocumentModel.countDocuments({ ...visible, status: "new", [dateField]: inMonth }),
        // transfers (not month-limited: what needs action now)
        TransferModel.countDocuments({ deleted: false, status: "pending", ...toMe(me) }),
        TransferModel.countDocuments({ deleted: false, status: "received", ...toMe(me) }),
        // transfers in the month
        TransferModel.countDocuments({
          deleted: false,
          ...(me.officeId ? { from_office_id: me.officeId } : { from_user_id: me.userId }),
          date_sent: inMonth,
        }),
        TransferModel.countDocuments({ deleted: false, action: "return", ...toMe(me), date_sent: inMonth }),
        TransferModel.countDocuments({ deleted: false, status: "done", ...toMe(me), date_done: inMonth }),
        TransferModel.find({ deleted: false, status: "pending", ...toMe(me) })
          .select("document_id action step note date_sent from_office_id from_user_id")
          .populate([
            { path: "document_id", select: "code_of_document objective number_document" },
            { path: "from_office_id", select: "name" },
            { path: "from_user_id", select: "firstname lastname" },
          ])
          .sort({ date_sent: -1 })
          .limit(5)
          .lean(),
      ]);

      // group month documents
      const byStatus = { new: 0, process: 0, close: 0 };
      const byType = {};
      const byFlow = {};
      const byDay = {};
      let out = 0;
      monthDocs.forEach((d) => {
        byStatus[d.status] = (byStatus[d.status] || 0) + 1;
        if (isOut(d)) out++;
        const t = d.document_type_id;
        const tk = t ? String(t._id) : "none";
        byType[tk] = byType[tk] || { _id: t?._id || null, name: t?.name || "គ្មានប្រភេទ", count: 0 };
        byType[tk].count++;
        const f = d.status_of_process_id;
        const fk = f ? String(f._id) : "none";
        byFlow[fk] = byFlow[fk] || { _id: f?._id || null, name: f?.name || "គ្មានលំហូរ", count: 0 };
        byFlow[fk].count++;
        const date = d[dateField] ? new Date(new Date(d[dateField]).getTime() + TZ_OFFSET_HOURS * 36e5).toISOString().slice(0, 10) : null;
        if (date) byDay[date] = (byDay[date] || 0) + 1;
      });

      // every day of the month, 0 when empty (ready for a chart)
      const days = [];
      for (let t = range.from.getTime(); t < range.to.getTime(); t += 864e5) {
        const date = new Date(t + TZ_OFFSET_HOURS * 36e5).toISOString().slice(0, 10);
        days.push({ date, count: byDay[date] || 0 });
      }

      res.json({
        success: true,
        data: {
          month: { value: range.value, from: range.from, to: range.to, date_field: dateField },
          me: {
            user: me.user
              ? { _id: me.user._id, firstname: me.user.firstname, lastname: me.user.lastname, email: me.user.email }
              : null,
            ...chainOf(me.user),
          },
          documents: {
            total: monthDocs.length,
            out, // created by my office
            in: monthDocs.length - out, // received by me / my office
            by_status: byStatus,
            by_type: Object.values(byType).sort((a, b) => b.count - a.count),
            by_status_of_process: Object.values(byFlow).sort((a, b) => b.count - a.count),
            by_day: days,
          },
          new_documents: {
            total: newTotal,
            latest: newDocs.map((d) => ({ ...d, document_progress: isOut(d) ? "out" : "in" })),
          },
          transfers: {
            waiting_to_receive: waiting, // now
            on_hand: onHand, // now (received, not yet forwarded / returned / done)
            sent_this_month: sentMonth,
            returned_to_me_this_month: returnedToMe,
            done_this_month: doneMonth,
            recent_inbox: recentInbox,
          },
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: serverError, error: err.message || err });
    }
  });
};

module.exports = route;

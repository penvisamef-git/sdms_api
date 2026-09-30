const mongoose = require("mongoose");
const TransferModel = require("./transfer.model");
const UserModel = require("../../user/user.model");

const sameId = (a, b) => a != null && b != null && String(a?._id || a) === String(b?._id || b);

// Receivers → one row object per receiver (users keep their own office for display)
async function buildRows({ documentId, offices = [], users = [], me, base }) {
  const userDocs = users.length
    ? await UserModel.find({ _id: { $in: users } }).select("office_id").lean()
    : [];
  const userOffice = Object.fromEntries(userDocs.map((u) => [String(u._id), u.office_id || null]));
  const now = new Date();
  const common = {
    document_id: documentId,
    from_office_id: me.officeId || null,
    from_user_id: me.userId,
    date_sent: now,
    status: "pending",
    ...base,
  };
  return [
    ...offices.map((o) => ({ ...common, to_office_id: o, to_user_id: null })),
    ...users.map((u) => ({ ...common, to_office_id: userOffice[String(u)] || null, to_user_id: u })),
  ];
}

// First send by the creator office → step 1 rows (skips receivers that already have a step-1 row)
async function createInitialTransfers({ document, offices, users, me, note, status_of_process_id }) {
  const existing = await TransferModel.find({ document_id: document._id, action: "send", deleted: false })
    .select("to_office_id to_user_id")
    .lean();
  const newOffices = offices.filter((o) => !existing.some((t) => !t.to_user_id && sameId(t.to_office_id, o)));
  const newUsers = users.filter((u) => !existing.some((t) => sameId(t.to_user_id, u)));
  const rows = await buildRows({
    documentId: document._id,
    offices: newOffices,
    users: newUsers,
    me,
    base: { action: "send", step: 1, note: note || "", status_of_process_id: status_of_process_id || null },
  });
  return rows.length ? TransferModel.insertMany(rows) : [];
}

// Can "me" act on this transfer row?
function isReceiver(t, me) {
  if (t.to_user_id) return sameId(t.to_user_id, me.userId);
  return !!me.officeId && sameId(t.to_office_id, me.officeId);
}

// The row by which the receiver of `t` holds the document (null = receiver is the creator)
async function holdingRow(t) {
  if (t.action !== "return") return t;
  if (!t.origin_transfer_id) return null;
  return TransferModel.findById(t.origin_transfer_id).lean();
}

module.exports = { buildRows, createInitialTransfers, isReceiver, holdingRow, sameId, isId: mongoose.Types.ObjectId.isValid };

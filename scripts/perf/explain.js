/**
 * Explain the main queries exactly as the routes build them.
 *   node scripts/perf/explain.js --email admintest1@gmail.com --month 2026-09 --label before
 * Output: table in the console + scripts/perf/out/explain-<label>.json
 */
const fs = require("fs");
const path = require("path");
const { mongoose, models, connect, arg } = require("./_common");
const { Document, DocumentTransfer, Session, User } = models;

(async () => {
  await connect();
  const label = arg("label", "run");
  const email = arg("email");
  const user = email ? await User.findOne({ email }).lean() : await User.findOne({ office_id: { $ne: null }, deleted: false }).lean();
  if (!user) throw new Error("user not found (use --email)");
  const me = { userId: user._id, officeId: user.office_id || null };

  const [y, mo] = (arg("month") || new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 7)).split("-").map(Number);
  const from = new Date(Date.UTC(y, mo - 1, 1) - 7 * 36e5);
  const to = new Date(Date.UTC(y, mo, 1) - 7 * 36e5);
  const inMonth = { $gte: from, $lt: to };

  const toMe = { $or: [{ to_user_id: me.userId }, ...(me.officeId ? [{ to_office_id: me.officeId, to_user_id: null }] : [])] };
  const viaTransfer = await DocumentTransfer.distinct("document_id", { deleted: false, ...toMe });
  const visible = {
    deleted: false,
    $or: [
      { send_to_user_id: me.userId },
      { _id: { $in: viaTransfer } },
      ...(me.officeId ? [{ office_id_open: me.officeId }, { send_to_office_id: me.officeId }] : []),
    ],
  };
  const outBox = { deleted: false, $and: [{ office_id_open: me.officeId || null }] };
  const inBox = { deleted: false, $and: [{ $or: [{ send_to_office_id: me.officeId }, { send_to_user_id: me.userId }] }] };
  const anyDoc = await Document.findOne({ deleted: false }).select("_id").lean();
  const session = await Session.findOne({ user_id: me.userId }).select("access_token").lean();

  const q = {
    "home.summary monthDocs": () => Document.find({ ...visible, created_date: inMonth }),
    "home.summary / new-documents (status new)": () => Document.find({ ...visible, status: "new", created_date: inMonth }).sort({ created_date: -1 }).limit(10),
    "home.visibleFilter distinct": () => DocumentTransfer.find({ deleted: false, ...toMe }).select("document_id"),
    "document?box=out": () => Document.find(outBox).sort({ created_date: -1 }).limit(10),
    "document?box=in": () => Document.find(inBox).sort({ created_date: -1 }).limit(10),
    "transfer inbox": () => DocumentTransfer.find({ deleted: false, ...toMe, status: { $in: ["pending", "received"] } }).sort({ date_sent: -1 }).limit(10),
    "transfer sent (office)": () => DocumentTransfer.find({ deleted: false, from_office_id: me.officeId }).sort({ date_sent: -1 }).limit(10),
    "home sent_this_month": () => DocumentTransfer.find({ deleted: false, from_office_id: me.officeId, date_sent: inMonth }),
    "tracking (one document)": () => DocumentTransfer.find({ document_id: anyDoc?._id, deleted: false }).sort({ date_sent: 1 }),
    "request_user session lookup": () => Session.findOne({ access_token: session?.access_token || "x" }),
  };

  const stageOf = (p) => (p ? p.stage + (p.inputStage ? ">" + stageOf(p.inputStage) : p.inputStages ? ">[" + p.inputStages.map(stageOf).join("|") + "]" : "") : "");
  const rows = [];
  for (const [name, build] of Object.entries(q)) {
    const e = await build().explain("executionStats");
    const s = e.executionStats;
    rows.push({ query: name, plan: stageOf(e.queryPlanner.winningPlan.queryPlan || e.queryPlanner.winningPlan), nReturned: s.nReturned, docsExamined: s.totalDocsExamined, keysExamined: s.totalKeysExamined, ms: s.executionTimeMillis });
  }
  console.table(rows);
  fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "out", `explain-${label}.json`), JSON.stringify({ user: user.email, month: `${y}-${mo}`, rows }, null, 2));
  console.log(`saved scripts/perf/out/explain-${label}.json`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

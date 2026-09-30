const mongoose = require("mongoose");

// Running numbers, e.g. { _id: "document-2026", seq: 123 }
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", counterSchema);

// DOC-2026-000001 (restarts every year, safe when many users create at the same time)
async function nextDocumentCode() {
  const year = new Date().toLocaleString("en-US", { timeZone: "Asia/Phnom_Penh", year: "numeric" });
  const counter = await Counter.findOneAndUpdate(
    { _id: `document-${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  return `DOC-${year}-${String(counter.seq).padStart(6, "0")}`;
}

module.exports = { Counter, nextDocumentCode };

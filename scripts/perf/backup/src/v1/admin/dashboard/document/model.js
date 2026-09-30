const mongoose = require("mongoose");
const { Schema } = mongoose;

// ───────────── File uploaded to Cloudinary (from POST /api/admin/upload) ─────────────
const fileSchema = new Schema(
  {
    url: { type: String, required: true },
    public_id: { type: String, required: true },
    resource_type: { type: String, default: "raw" },
    format: { type: String, default: null },
    bytes: { type: Number, default: 0 },
    original_name: { type: String, default: "" },
  },
  { _id: false },
);

// ───────────── Reference document (ឯកសារយោង) ─────────────
const referenceSchema = new Schema(
  {
    number_document: { type: String, default: "" }, // លេខឯកសារ
    date_sign: { type: Date, default: null }, // កាលបរិច្ឆេទចុះហត្ថលេខា
    objective: { type: String, default: "" }, // កម្មវត្ថុ
    files: { type: [fileSchema], default: [] }, // ឯកសារយោង
  },
  { _id: true },
);

// ───────────── Document ─────────────
const documentSchema = new Schema(
  {
    document_progress: { type: String, enum: ["in", "out"], default: "out" }, // ចូល / ចេញ (for creator = out)
    date_in: { type: Date, default: null }, // កាលបរិច្ឆេទចូល
    date_registration_document: { type: Date, default: null }, // ចុះលេខចេញ
    note_from_user: { type: String, default: "" }, // កំណត់សម្គាល់
    code_of_document: { type: String, index: true }, // លេខកូដឯកសារ (auto)
    number_document: { type: String, default: "" }, // លេខឯកសារ
    date_sign: { type: Date, default: null }, // កាលបរិច្ឆេទចុះហត្ថលេខា
    objective: { type: String, default: "" }, // កម្មវត្ថុ

    status_of_process_id: { type: Schema.Types.ObjectId, ref: "MastData_StatusOfProcess", default: null }, // លំហូរឯកសារ
    status: { type: String, enum: ["new", "process", "close"], default: "new" }, // ស្ថានភាពក្នុងអង្គភាព
    document_type_id: { type: Schema.Types.ObjectId, ref: "MastData_DocumentType", default: null }, // ប្រភេទឯកសារ
    framework_id: { type: Schema.Types.ObjectId, ref: "MastData_FrameWork", default: null }, // ក្របខណ្ឌឯកសារ

    office_id_open: { type: Schema.Types.ObjectId, ref: "MastData_Office", required: true }, // អង្គភាពបើក (creator office)
    // ───── Sender / receivers ─────
    send_from_office_id: { type: Schema.Types.ObjectId, ref: "MastData_Office", required: true }, // អង្គភាពផ្ញើ
    send_from_user_id: { type: Schema.Types.ObjectId, ref: "User", required: true }, // អ្នកផ្ញើ
    send_to_office_id: [{ type: Schema.Types.ObjectId, ref: "MastData_Office" }], // អង្គភាពទទួល
    send_to_user_id: [{ type: Schema.Types.ObjectId, ref: "User" }], // អ្នកទទួល
    date_sent: { type: Date, default: null }, // កាលបរិច្ឆេទផ្ញើ

    document_main_url: { type: [fileSchema], default: [] }, // ឯកសារគោល
    reference_document: { type: [referenceSchema], default: [] }, // ឯកសារយោង

    // >>>>>> Default <<<<< //
    deleted: { type: Boolean, default: false },
    created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updated_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: { createdAt: "created_date", updatedAt: "updated_date" },
  },
);

documentSchema.index({ office_id_open: 1, deleted: 1 });
documentSchema.index({ send_to_office_id: 1, deleted: 1 });
documentSchema.index({ send_to_user_id: 1, deleted: 1 });

module.exports = mongoose.model("Document", documentSchema);

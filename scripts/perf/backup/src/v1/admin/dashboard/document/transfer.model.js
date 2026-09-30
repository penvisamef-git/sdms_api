const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * One row = one hop of a document to ONE receiver (office, or a user in an office).
 *
 *   action  send     : first send by the creator office
 *           forward  : receiver passes it on to other offices / users
 *           return   : receiver sends it back one step (បានរុញត្រឡប់)
 *
 *   status  pending → received → forwarded | returned | done
 *
 * parent_transfer_id : the row that was acted on to create this one (builds the tree)
 * prev_transfer_id   : (send/forward) the row by which the SENDER holds the document (null = sender is the creator)
 * origin_transfer_id : (return) the row by which the RECEIVER holds the document again (null = receiver is the creator)
 */
const transferSchema = new Schema(
  {
    document_id: { type: Schema.Types.ObjectId, ref: "Document", required: true, index: true },

    step: { type: Number, default: 1 },
    action: { type: String, enum: ["send", "forward", "return"], required: true },

    parent_transfer_id: { type: Schema.Types.ObjectId, ref: "DocumentTransfer", default: null },
    prev_transfer_id: { type: Schema.Types.ObjectId, ref: "DocumentTransfer", default: null },
    origin_transfer_id: { type: Schema.Types.ObjectId, ref: "DocumentTransfer", default: null },

    from_office_id: { type: Schema.Types.ObjectId, ref: "MastData_Office", default: null },
    from_user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },

    to_office_id: { type: Schema.Types.ObjectId, ref: "MastData_Office", default: null },
    to_user_id: { type: Schema.Types.ObjectId, ref: "User", default: null }, // set = only this user can act

    status: {
      type: String,
      enum: ["pending", "received", "forwarded", "returned", "done"],
      default: "pending",
      index: true,
    },
    status_of_process_id: { type: Schema.Types.ObjectId, ref: "MastData_StatusOfProcess", default: null },
    note: { type: String, default: "" }, // instruction for the receiver

    date_sent: { type: Date, default: Date.now },
    date_received: { type: Date, default: null },
    date_done: { type: Date, default: null }, // when this receiver forwarded / returned / closed
    received_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    done_note: { type: String, default: "" }, // note when closing at this office

    deleted: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: "created_date", updatedAt: "updated_date" },
  },
);

transferSchema.index({ to_office_id: 1, status: 1, deleted: 1 });
transferSchema.index({ to_user_id: 1, status: 1, deleted: 1 });
transferSchema.index({ from_office_id: 1, deleted: 1 });

module.exports = mongoose.model("DocumentTransfer", transferSchema);

const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    activity_log_category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActivityLogCategory",
      required: true,
    },
    status: {
      type: Boolean,
      default: true,
      required: false,
    },
    deleted: {
      type: Boolean,
      default: false,
      required: false,
    },

    device: Object,
    time: String,
    create_by_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: { createdAt: "created_date", updatedAt: "updated_date" },
  }
);

module.exports = mongoose.model("ActivityLog", activityLogSchema);

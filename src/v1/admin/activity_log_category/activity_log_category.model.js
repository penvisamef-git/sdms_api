const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    name: String,
    title: String,
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
  },
  {
    timestamps: { createdAt: "created_date", updatedAt: "updated_date" },
  }
);

module.exports = mongoose.model("ActivityLogCategory", activityLogSchema);

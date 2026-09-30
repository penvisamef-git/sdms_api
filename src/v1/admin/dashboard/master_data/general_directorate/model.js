const mongoose = require("mongoose");

const generalDirectorateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    name_in_eng: { type: String, required: false },

    unit_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MastData_Unit",
      required: true,
    },

    // >>>>>> Default <<<<< //
    note: String,
    status: {
      type: Boolean,
      default: true,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: { createdAt: "created_date", updatedAt: "updated_date" },
  },
);

module.exports = mongoose.model("MastData_GeneralDirectorate", generalDirectorateSchema);

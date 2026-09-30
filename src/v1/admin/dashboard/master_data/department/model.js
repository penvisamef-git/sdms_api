const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    name_in_eng: { type: String, required: false },

    general_directorate_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MastData_GeneralDirectorate",
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

module.exports = mongoose.model("MastData_Department", departmentSchema);

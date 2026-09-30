const mongoose = require("mongoose");
const { USER_ROLES } = require("../../../util/user_roles");
const userSchema = new mongoose.Schema(
  {
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    contact: { type: String, required: true },
    email: { type: String, required: true },
    organization: { type: String, required: true },
    job_title: { type: String, required: false },
    password: { type: String, required: true },
    
    // Role (fixed list, see src/util/user_roles.js)
    role: {
      type: String,
      enum: [...USER_ROLES, null],
      default: null,
    },

    is_first_login: {
      type: Boolean,
      default: true,
    },

    is_super_admin_and_developer: {
      type: Boolean,
      default: false,
    },

    is_super_admin: {
      type: Boolean,
      default: false,
    },

    // Office the user works in (Office → Department → General Directorate → Unit)
    office_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MastData_Office",
      required: false,
    },

    can_login_in_app: {
      type: Boolean,
      default: false,
    },


    // >>>>>> Defualt <<<<< //
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
module.exports = mongoose.model("User", userSchema);

const mongoose = require("mongoose");
const userSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    access_token: String,
    device: Object,
    time: String,
    access_token: String,
    create_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    user_data: Object,
  },
  {
    timestamps: { createdAt: "created_date", updatedAt: "updated_date" },
  }
);
module.exports = mongoose.model("Session", userSchema);

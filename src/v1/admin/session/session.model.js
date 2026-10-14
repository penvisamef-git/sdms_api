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
    // which app signed in: "web" | "app" (one session per user per client). Old sessions have none = web.
    client: { type: String, default: "web" },
    user_data: Object,
  },
  {
    timestamps: { createdAt: "created_date", updatedAt: "updated_date" },
  }
);
// [perf] request_user runs Session.findOne({ access_token }) on every authenticated request
userSchema.index({ access_token: 1 });
userSchema.index({ user_id: 1, client: 1 });
module.exports = mongoose.model("Session", userSchema);

const { body, validationResult } = require("express-validator");
const User = require("../v1/admin/user/user.model");
const ActivityLog = require("../v1/admin/activity_log/activity_log.model");
const helper = require("./helper");
const UAParser = require("ua-parser-js");
// Validation middleware
const validateActivityLog = [
  body("title").notEmpty().withMessage("Title is required"),
  body("description").notEmpty().withMessage("Description is required"),
  body("type").notEmpty().withMessage("Type is required"),
  body("email").notEmpty().withMessage("Email is required"),
];

// Main logic as middleware
function createActivityLogger({ title, description, type }) {
  return async (req, res, next) => {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    var deviceInfo = extractDeviceInfo(req);
    const log = new ActivityLog({
      title,
      description,
      type,
      device: deviceInfo,
      time: helper.cambodiaDate(),
      create_by: user._id,
    });

    await log.save();
    req.activityLog = log;
    next();
  };
}

function extractDeviceInfo(req) {
  const userAgent = req.headers["user-agent"] || "";
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  return {
    browser: result.browser.name + " " + result.browser.version,
    os: result.os.name + " " + result.os.version,
    device: result.device.type || "desktop",
    userAgent: userAgent,
  };
}

module.exports = {
  validateActivityLog,
  createActivityLogger,
};

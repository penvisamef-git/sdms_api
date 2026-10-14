const crypto = require("crypto");
const AuthKey = require("../v1/admin/auth/auth_api_key.model");

// API_KEY_STRICT=true → the x-api-key header must really equal API_AUTH_KEY (before: it was never compared).
// Off by default so nothing breaks; turn it on once the web / app send the right key.
function sameKey(sent) {
  const a = Buffer.from(String(sent || ""));
  const b = Buffer.from(String(process.env.API_AUTH_KEY || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
// the key row almost never changes → ask MongoDB once per 5 minutes, not on every request
let cachedKey = null;
let cachedUntil = 0;

async function api_auth(req, res, next) {
  try {
    if (process.env.API_KEY_STRICT === "true" && !sameKey(req.headers["x-api-key"])) {
      return res
        .status(401)
        .json({ message: "Unauthorized Access", success: false });
    }

    let key = Date.now() < cachedUntil ? cachedKey : null;
    if (!key) {
      key = await AuthKey.findOne({
        api_auth_key: process.env.API_AUTH_KEY,
      });
      if (key) {
        cachedKey = key;
        cachedUntil = Date.now() + 5 * 60 * 1000;
      }
    }

    if (!key) {
      return res
        .status(401)
        .json({ message: "Unauthorized Access", success: false });
    }

    req.apiKeyData = key;

    // Proceed to next middleware
    next();
  } catch (err) {
    // console.error("API Auth Error:", err);
    res.status(500).json({ message: "Internal Server Error", success: false });
  }
}

module.exports = {
  api_auth,
};

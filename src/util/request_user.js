const { getSession } = require("./session_cache");

async function request_by(req, res, next) {
  try {
    let token = req.headers["x-access-token"] || req.headers["authorization"];
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    if (token.startsWith("Bearer ")) {
      token = token.slice(7).trim();
    }

    const session = await getSession(token);

    if (!session) {
      return res
        .status(401)
        .json({ success: false, message: "Session not found or expired" });
    }

    req.session = session; // now accessible in route handler
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
}

module.exports = request_by;

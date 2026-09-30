const jwt = require("jsonwebtoken");

function jwt_auth(req, res, next) {
  try {
    let token = req.headers["x-access-token"] || req.headers["authorization"];

    if (!token) {
      return res
        .status(401)
        .send({ success: false, message: "Unauthorized Permission" });
    }

    if (token.startsWith("Bearer ")) {
      token = token.slice(7).trim();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET); // Use process.env.JWT_SECRET in production

    req.decode = decoded;
    next();
  } catch (err) {
    return res
      .status(401)
      .send({ success: false, message: "Unauthorized Permission" });
  }
}

module.exports = {
  jwt_auth,
};

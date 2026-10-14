require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const connectDB = require("./src/util/db");
const { api_auth } = require("./src/util/api_auth");
const { jwt_auth } = require("./src/util/jwt_auth");
const request_user = require("./src/util/request_user");
const adminAPI_V1 = require("./src/v1/admin/index.route");

const PORT = process.env.api_port || 8085;
const app = express();

// ================= Middleware =================
// Vercel sits behind one proxy → needed so req.ip is the real visitor (rate limit)
app.set("trust proxy", 1);

// CORS_ORIGINS="https://sdms-kh.web.app,https://sdms-kh.firebaseapp.com,http://localhost:3000"
// Not set → every website is allowed (as before). A mobile app sends no Origin, so it is always allowed.
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    maxAge: 600, // browsers remember the preflight for 10 minutes → fewer OPTIONS calls
  }),
);
app.use(helmet());

// [perf] gzip responses (JSON body unchanged, only transport-compressed). Remove this block to revert.
try {
  app.use(require("compression")());
} catch (e) {
  console.warn("compression not installed → run: npm install compression");
}

// [perf] log only slow requests (> 500 ms). Remove this block to revert.
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (ms > 500) console.log(`[slow] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(0)}ms`);
  });
  next();
});

app.use(express.json());

// ================= Login brute-force protection =================
// 10 wrong tries per email+IP per 15 minutes (a good login does not count), and 100 tries per IP.
// (Vercel keeps this counter per running instance — it slows attackers down, it is not a perfect lock.)
const loginPaths = [
  "/api/admin/auth/login",
  "/api/admin/auth/login/app",
  "/api/admin/auth/login-with-encryptpassword",
];
const tooMany = { success: false, message: "ព្យាយាមចូលច្រើនដងពេក សូមរង់ចាំបន្តិចរួចសាកល្បងម្តងទៀត!" };
app.use(
  loginPaths,
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}|${String(req.body?.email || "").toLowerCase()}`,
    message: tooMany,
    validate: false,
  }),
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: tooMany,
  }),
);

// ================= Connection =================
connectDB();

app.get("/", (req, res) => {
  api_auth(req, res, () => {
    res.send({
      success: true,
      message: "API Connected",
    });
  });
});

// ================= Routes =================
const prop = { app, jwt, api_auth, jwt_auth, request_user };
adminAPI_V1(prop);

// ================= Errors =================
// last safety net: JSON answer, never an HTML page / stack trace
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error("[error]", err);
  res.status(status).json({
    success: false,
    message: status >= 500 ? "ម៉ាសុីនមេមានបញ្ហា សូមព្យាយាមម្តងទៀតពេលក្រោយ!" : "Bad request",
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});

// 🧼 Gracefully handle shutdown
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("🛑 MongoDB disconnected cleanly");
  process.exit(0);
});

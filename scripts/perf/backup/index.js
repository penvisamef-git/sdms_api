require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const connectDB = require("./src/util/db");
const { api_auth } = require("./src/util/api_auth");
const { jwt_auth } = require("./src/util/jwt_auth");
const request_user = require("./src/util/request_user");
const adminAPI_V1 = require("./src/v1/admin/index.route");

const PORT = process.env.api_port || 8085;
const app = express();

// ================= Middleware =================
app.use(cors());
app.use(helmet());
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});

// 🧼 Gracefully handle shutdown
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("🛑 MongoDB disconnected cleanly");
  process.exit(0);
});

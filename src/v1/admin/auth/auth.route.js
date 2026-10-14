const helper = require("../../../util/helper");
const User = require("../user/user.model");
const baseRoute = "auth";
const { logActivity } = require("../../../util/log");
const Session = require("../session/session.model");
const { createLoginSession } = require("../../../util/session_helper");
const { forget } = require("../../../util/session_cache");
const bcrypt = require("bcrypt");

// Office → Department → General Directorate → Unit
const populateOffice = {
  path: "office_id",
  select: "name name_in_eng department_id",
  populate: {
    path: "department_id",
    select: "name name_in_eng general_directorate_id",
    populate: {
      path: "general_directorate_id",
      select: "name name_in_eng unit_id",
      populate: { path: "unit_id", select: "name name_in_eng" },
    },
  },
};

const wrongLogin = "អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ!";
// compared when the email does not exist, so a wrong email and a wrong password take the same time
const DUMMY_HASH = bcrypt.hashSync("sdms-dummy-password", 10);

const route = (prop) => {
  const urlAPI = `/${prop.main_route}/${baseRoute}`;

  prop.app.get(
    `${urlAPI}/test-logged-in`,
    prop.api_auth,
    prop.jwt_auth,
    async (req, res) => {
      res.json({
        success: true,
        message: "API Connected : Permission and Access",
      });
    },
  );

  // Check email + password. Sends the error answer itself and returns null when the login must stop.
  async function authenticate(req, res, { appOnly = false } = {}) {
    const { email, password } = req.body || {};

    // 1. Validate required fields (text only — blocks {"$ne": null} style tricks)
    for (const [key, value] of Object.entries({ email, password })) {
      if (!value) {
        res.json({ success: false, message: `Field '${key}' is required` });
        return null;
      }
      if (typeof value !== "string") {
        res.status(400).json({ success: false, message: `Field '${key}' is invalid` });
        return null;
      }
    }

    // 2. Find user + check password (bcrypt)
    const user = await User.findOne({ email: email.trim() });
    const isMatch = await bcrypt.compare(password, user?.password || DUMMY_HASH);
    if (!user || !isMatch) {
      res.status(401).json({ success: false, message: wrongLogin });
      return null;
    }

    // 3. Account state (shown only after the password was right)
    if (user.deleted) {
      res.status(404).json({ success: false, message: "មិនមានអ្នកប្រើប្រាស់ក្នុងប្រព័ន្ធ!" });
      return null;
    }
    if (!user.status) {
      res.status(404).json({ success: false, message: "គណនីត្រូវបានផ្អាក!" });
      return null;
    }
    if (appOnly && user.can_login_in_app !== true) {
      res.status(403).json({ success: false, message: "គណនីនេះមិនអនុញ្ញាតឱ្យប្រើក្នុង App ទេ!" });
      return null;
    }
    return user;
  }

  // Session + log + the answer the clients expect
  async function finishLogin(req, res, user, client) {
    await logActivity({
      title: `ឧបករណ៍ ${helper.extractDeviceInfo(req).device} បានចូលគណនី (សាអេឡិចត្រូនិច : ${user.email})`,
      description: `ប្រើប្រាស់ ${helper.extractDeviceInfo(req).browser} ចូលក្នុងប្រព័ន្ធ - ${helper.cambodiaDate()}`,
      categoryTitle: "auth",
      createdBy: user._id,
      req,
    });

    const { access_token, safeUser } = await createLoginSession(prop, user, req, client);

    const userData = { ...safeUser };
    userData.access_token = access_token;

    // Office info (office → department → general directorate → unit)
    if (user.office_id) {
      const userWithOffice = await User.findById(user._id)
        .select("office_id")
        .populate(populateOffice);
      userData.office = userWithOffice?.office_id || null;
    }

    // Role (fixed list) — replaces the old group permission lookup
    userData.permission = user.role || null;
    // kept for older apps that read user_data (no password inside)
    if (client === "app") userData.user_data = safeUser;

    res.json({
      success: true,
      data: userData,
      log: { device: helper.extractDeviceInfo(req) },
    });
  }

  // ---------------- Web ----------------
  prop.app.post(`${urlAPI}/login`, prop.api_auth, async (req, res) => {
    try {
      const user = await authenticate(req, res);
      if (!user) return;
      await finishLogin(req, res, user, "web");
    } catch (err) {
      console.error("[login]", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  });

  // ---------------- Mobile app ----------------
  prop.app.post(`${urlAPI}/login/app`, prop.api_auth, async (req, res) => {
    try {
      const user = await authenticate(req, res, { appOnly: true });
      if (!user) return;
      await finishLogin(req, res, user, "app");
    } catch (err) {
      console.error("[login/app]", err);
      res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  });

  // ---------------- Old "encrypted password" login ----------------
  // It compared the typed text with the saved bcrypt hash, so anybody holding a hash could sign in with it.
  // Switched off. (Only for a legacy client: set ALLOW_ENCRYPT_LOGIN=true — not recommended.)
  prop.app.post(
    `${urlAPI}/login-with-encryptpassword`,
    prop.api_auth,
    async (req, res) => {
      if (process.env.ALLOW_ENCRYPT_LOGIN !== "true") {
        return res.status(410).json({ success: false, message: "This login is disabled." });
      }
      try {
        const { email, password } = req.body || {};
        if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
          return res.status(400).json({ success: false, message: "Invalid Username and Password!" });
        }
        const user = await User.findOne({ email: email.trim() });
        if (!user || user.password !== password || user.deleted || !user.status) {
          return res.status(401).json({ success: false, message: "Invalid Username and Password!" });
        }
        await finishLogin(req, res, user, "web");
      } catch (err) {
        console.error("[login-with-encryptpassword]", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
      }
    },
  );

  // ---------------- Sign out (this device only) ----------------
  prop.app.post(
    `${urlAPI}/logout`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        await Session.deleteOne({ _id: req.session._id });
        forget(req.session.access_token);
        res.json({ success: true, message: "បានចាកចេញពីប្រព័ន្ធ!" });
      } catch (err) {
        res.status(500).json({ success: false, message: "Internal Server Error" });
      }
    },
  );
};

module.exports = route;

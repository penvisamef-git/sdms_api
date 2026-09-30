const helper = require("../../../util/helper");
const User = require("../user/user.model");
const ModelGroupUser = require("../user/group/group_user.model");
const baseRoute = "auth";
const { logActivity } = require("../../../util/log");
const Session = require("../session/session.model");
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

  prop.app.post(`${urlAPI}/login`, prop.api_auth, async (req, res) => {
    const { email, password } = req.body;

    // 1. Validate required fields
    const requiredFields = { email, password };
    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        return res.json({
          success: false,
          message: `Field '${key}' is required`,
        });
      }
    }

    // 2. Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "អ៊ីមែលមិនត្រឹមត្រូវ!" });
    }

    // 3. Check password using bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "ពាក្យសម្ងាត់មិនត្រឹមត្រូវ!",
      });
    }

    // Check if account is deleted or inactive
    if (user.deleted) {
      return res.status(404).json({
        success: false,
        message: "មិនមានអ្នកប្រើប្រាស់ក្នុងប្រព័ន្ធ!",
      });
    }

    if (!user.status) {
      return res.status(404).json({
        success: false,
        message: "គណនីត្រូវបានផ្អាក!",
      });
    }

    // 4. Log activity after successful login
    await logActivity({
      title: `ឧបករណ៍ ${helper.extractDeviceInfo(req).device} បានចូលគណនី (សាអេឡិចត្រូនិច : ${email})`,
      description: `ប្រើប្រាស់ ${helper.extractDeviceInfo(req).browser} ចូលក្នុងប្រព័ន្ធ - ${helper.cambodiaDate()}`,
      categoryTitle: "auth",
      createdBy: user._id,
      req,
    });

    // 5. Create session
    const access_token = prop.jwt.sign(
      { userName: email, user: password },
      process.env.JWT_SECRET,
      { expiresIn: "720h" },
    );
    const existingSession = await Session.findOne({
      user_id: user._id,
    });

    if (existingSession) {
      existingSession.time = helper.cambodiaDate();
      existingSession.access_token = access_token;
      existingSession.device = helper.extractDeviceInfo(req);
      existingSession.user_data = user;
      await existingSession.save();
    } else {
      const session = new Session({
        user_id: user._id,
        device: helper.extractDeviceInfo(req),
        create_by: user._id,
        time: helper.cambodiaDate(),
        access_token: access_token,
        user_data: user,
      });
      await session.save();
    }

    // 6. Return success
    const userData = user.toObject();
    delete userData.password;
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

    res.json({
      success: true,
    
      data: userData,
      log: {
        device: helper.extractDeviceInfo(req),
      },
    });
  });

  prop.app.post(
    `${urlAPI}/login-with-encryptpassword`,
    prop.api_auth,
    async (req, res) => {
      const { email, password } = req.body;

      // 1. Validate required fields
      const requiredFields = { email, password };
      for (const [key, value] of Object.entries(requiredFields)) {
        if (!value) {
          return res.json({
            success: false,
            message: `Field '${key}' is required`,
          });
        }
      }

      // 2. Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "Invalid Username and Password!" });
      }

      // 3. Check password (plaintext comparison)
      if (user.password !== password) {
        return res.json({
          success: false,
          message: "Invalid Username and Password!",
        });
      }

      // Check if account is deleted or inactive
      if (user.deleted) {
        return res.status(404).json({
          success: false,
          message: "មិនមានអ្នកប្រើប្រាស់ក្នុងប្រព័ន្ធ!",
        });
      }

      if (!user.status) {
        return res.status(404).json({
          success: false,
          message: "គណនីត្រូវបានផ្អាក!",
        });
      }

      // 4. Log activity after successful login
      await logActivity({
        title: `ឧបករណ៍ ${helper.extractDeviceInfo(req).device} បានចូលគណនី (សាអេឡិចត្រូនិច : ${email})`,
        description: `ប្រើប្រាស់ ${helper.extractDeviceInfo(req).browser} ចូលក្នុងប្រព័ន្ធ - ${helper.cambodiaDate()}`,
        categoryTitle: "auth",
        createdBy: user._id,
        req,
      });

      // 5. Create session
      const access_token = prop.jwt.sign(
        { userName: email, user: password },
        process.env.JWT_SECRET,
        { expiresIn: "720h" },
      );
      const existingSession = await Session.findOne({
        user_id: user._id,
      });

      if (existingSession) {
        existingSession.time = helper.cambodiaDate();
        existingSession.access_token = access_token;
        existingSession.device = helper.extractDeviceInfo(req);
        existingSession.user_data = user;
        await existingSession.save();
      } else {
        const session = new Session({
          user_id: user._id,
          device: helper.extractDeviceInfo(req),
          create_by: user._id,
          time: helper.cambodiaDate(),
          access_token: access_token,
          user_data: user,
        });
        await session.save();
      }

      // 6. Return success
      const userData = user.toObject();
      delete userData.password;
      userData.access_token = access_token;
      userData.user_data = user;

      res.json({
        success: true,
        data: userData,
        log: {
          device: helper.extractDeviceInfo(req),
        },
      });
    },
  );

    prop.app.post(`${urlAPI}/login/app`, prop.api_auth, async (req, res) => {
    const { email, password } = req.body;

    // 1. Validate required fields
    const requiredFields = { email, password };
    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        return res.json({
          success: false,
          message: `Field '${key}' is required`,
        });
      }
    }

    // 2. Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "មិនមានគណនីមិនត្រឹមត្រូវ!" });
    }

    if(user?.can_login_in_app != true){
         return res
        .status(404)
        .json({ success: false, message: "គណនីមិនត្រឹមត្រូវ​!" });
    }

    // 3. Check password using bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.json({
        success: false,
        message: "ពាក្យសម្ងាត់មិនត្រឹមត្រូវ!",
      });
    }

    // Check if account is deleted or inactive
    if (user.deleted) {
      return res.status(404).json({
        success: false,
        message: "មិនមានអ្នកប្រើប្រាស់ក្នុងប្រព័ន្ធ!",
      });
    }

    if (!user.status) {
      return res.status(404).json({
        success: false,
        message: "គណនីត្រូវបានផ្អាក!",
      });
    }

    // 4. Log activity after successful login
    await logActivity({
      title: `ឧបករណ៍ ${helper.extractDeviceInfo(req).device} បានចូលគណនី (សាអេឡិចត្រូនិច : ${email})`,
      description: `ប្រើប្រាស់ ${helper.extractDeviceInfo(req).browser} ចូលក្នុងប្រព័ន្ធ - ${helper.cambodiaDate()}`,
      categoryTitle: "auth",
      createdBy: user._id,
      req,
    });

    // 5. Create session
    const access_token = prop.jwt.sign(
      { userName: email, user: password },
      process.env.JWT_SECRET,
      { expiresIn: "720h" },
    );
    const existingSession = await Session.findOne({
      user_id: user._id,
    });

    if (existingSession) {
      existingSession.time = helper.cambodiaDate();
      existingSession.access_token = access_token;
      existingSession.device = helper.extractDeviceInfo(req);
      existingSession.user_data = user;
      await existingSession.save();
    } else {
      const session = new Session({
        user_id: user._id,
        device: helper.extractDeviceInfo(req),
        create_by: user._id,
        time: helper.cambodiaDate(),
        access_token: access_token,
        user_data: user,
      });
      await session.save();
    }

    // 6. Return success
    const userData = user.toObject();
    delete userData.password;
    userData.access_token = access_token;

    // Office info (office → department → general directorate → unit)
    if (user.office_id) {
      const userWithOffice = await User.findById(user._id)
        .select("office_id")
        .populate(populateOffice);
      userData.office = userWithOffice?.office_id || null;
    }
    userData.user_data = user;

    res.json({
      success: true,
      data: userData,
      log: {
        device: helper.extractDeviceInfo(req),
      },
    });
  });
};

module.exports = route;

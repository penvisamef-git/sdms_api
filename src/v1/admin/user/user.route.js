const mongoose = require("mongoose");
const UserModel = require("../user/user.model");
const getFilteredMongoDB = require("../../../util/mongo_db/mongoDB_Queries");
const baseRoute = "users";
const { logActivity } = require("../../../util/log");
const { sanitizeUpdate } = require("../../../util/helper");
const bcrypt = require("bcrypt");
const modelGroupUser = require("../user/group/group_user.model");
const SessionModel = require("../session/session.model");
const { USER_ROLES } = require("../../../util/user_roles");
const OfficeModel = require("../dashboard/master_data/office/model");
const route = (prop) => {
  // **************** Declaration ****************
  const urlAPI = `/${prop.main_route}/${baseRoute}`;
  // Log
  const logTitle = "user";
  // Error Content
  const document = "អ្នកប្រើប្រាស់";

  function updatedText(name) {
    return `${document} ${name} ត្រូវបានកែប្រែ និងរក្សារទុក!`;
  }
  function deletedText(name) {
    return `${document}  ${name} ត្រូវបានលុបចេញពីប្រព័ន្ធ!`;
  }
  const serverError = "ម៉ាសុីនមេមានបញ្ហា សូមព្យាយាមម្តងទៀតពេលក្រោយ!";
  const existsText = `អ្នកប្រើប្រាស់ (សាអេឡិចត្រូនិច) មាននៅក្នុងប្រព័ន្ធរួចហើយ!`;
  const noDataFound = `មិនមាន${document}នៅក្នុងប្រព័ន្ធ!`;
  const newSave = `${document} ថ្មីត្រូវបានរក្សារទុក!`;
  const noIDFound = "មិនមាន ID ត្រឹមត្រូវ!";
  const notFoundData = "មិនមានទិន្នន័យក្នុងប្រព័ន្ធ!";
  const noDataUpdate = "មិនមានទិន្នន័យដើម្បីកែប្រែ!";
  const officeNotFound = "រកមិនឃើញការិយាល័យ!";
  const roleInvalid = `តួនាទីមិនត្រឹមត្រូវ! (${USER_ROLES.join(" | ")})`;

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

  // ✅ Returns an error response body if office_id is invalid, otherwise null
  async function checkOffice(office_id) {
    if (!mongoose.Types.ObjectId.isValid(office_id)) {
      return { status: 400, message: noIDFound };
    }
    const office = await OfficeModel.exists({ _id: office_id, deleted: false });
    if (!office) {
      return { status: 404, message: officeNotFound };
    }
    return null;
  }

  // ******************** Helper ****************************
  function checkValidtion(res, req, requiredFields) {
    for (const field of requiredFields) {
      const value = req.body[field.key];

      if (
        value === undefined || // missing key
        value === null || // null value
        value === "" // empty string
      ) {
        res.json({
          success: false,
          message: `សូមបញ្ចូល ${field.label}`,
        });
        return false;
      }
    }
    return true;
  }

  prop.app.post(
    `${urlAPI}`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        // ───────────────────────────────────────────────
        // ✅ Validate required fields

        const requiredFields = [
          { key: "firstname", label: "គ្គោត្តនាម" },
          { key: "lastname", label: "នាម" },
          { key: "contact", label: "លេខទំនាកទំនង" },
          { key: "email", label: "សារអេឡិចត្រូនិច" },
          { key: "organization", label: "ស្ថាប័ន/អង្គភាព" },
          { key: "password", label: "ពាក្យសម្ងាត់" },
          { key: "office_id", label: "ការិយាល័យ" },
        ];
        if (!checkValidtion(res, req, requiredFields)) return;

        // ───────────────────────────────────────────────
        // ✅ Get creator ID from session
        const { user_id: userId } = req.session;

        const {
          firstname,
          lastname,
          contact,
          email,
          organization,
          job_title,
          password,
          role,
          office_id,
          note,
          status,
          can_login_in_app,
        } = req.body;
        const titleResponse = firstname + " " + lastname;

        // ───────────────────────────────────────────────

        // ✅ Validate role (optional, must be one of USER_ROLES)
        if (role && !USER_ROLES.includes(role)) {
          return res.status(400).json({
            success: false,
            message: roleInvalid,
          });
        }

        // ✅ Validate office
        const officeError = await checkOffice(office_id);
        if (officeError) {
          return res.status(officeError.status).json({
            success: false,
            message: officeError.message,
          });
        }

        // ✅ Create new user
        const exists = await UserModel.exists({ email });
        if (exists) {
          return res.json({
            success: false,
            message: existsText,
          });
        }
        const userData = await UserModel.findOne({ _id: userId });
        const is_super_admin = false;
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const is_first_login = true;
        const saveData = await UserModel.create({
          firstname,
          lastname,
          contact,
          email,
          organization,
          job_title,
          password: hashedPassword,
          role: role || null,
          office_id,
          is_super_admin,
          is_first_login,
          note,
          status,
          can_login_in_app,
          deleted: false, //  Hidden
          created_by: userId, //  Hidden
          updated_by: userId, //  Hidden
        });

        // ───────────────────────────────────────────────
        // ✅ Log activity
        const userEmail = userData.email;

        await logActivity({
          title: `${document}ថ្មី ${titleResponse} ត្រូវបានបង្កើត!`,
          description: `បង្កើតដោយគណនី: ${userEmail}`,
          categoryTitle: logTitle,
          createdBy: userId,
          req,
        });

        // ───────────────────────────────────────────────
        // ✅ Response
        res.status(201).json({
          success: true,
          data: saveData,
          message: newSave,
        });
      } catch (err) {
        // console.log("**********************");
        // console.log("**********************");
        // console.log("**********************");
        // console.log(">>>>>", err);
        res.status(500).json({
          success: false,
          message: serverError,
          error: err,
        });
      }
    },
  );

  // Roles for the dropdown
  prop.app.get(`${urlAPI}-roles`, prop.api_auth, prop.jwt_auth, prop.request_user, (req, res) => {
    res.json({ success: true, data: USER_ROLES });
  });

  prop.app.get(
    `${urlAPI}/:id`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const { id } = req.params;

        if (id) {
          // ✅ Validate ID
          if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message: "No ID Found",
            });
          }

          var userData = await UserModel.findOne({
            _id: id,
            deleted: false,
          }).populate(populateOffice);

          if (!userData) {
            return res.status(404).json({
              success: false,
              message: notFoundData,
            });
          }

          const user = userData.toObject();
          delete user.password;

          return res.status(200).json({ success: true, data: user });
        }
      } catch (err) {
        res.status(500).json({
          success: false,
          message: "Internal Error",
          error: err,
        });
      }
    },
  );

  prop.app.get(
    `${urlAPI}`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const result = await getFilteredMongoDB(
          req.query,
          UserModel,
          [populateOffice],
          [{ is_super_admin: false }],
          null,
        );

        const newData = result.data.map((row) => {
          const user = row.toObject();
          delete user.password;
          return user;
        });

        res.status(200).json({
          success: true,
          data: newData,
          pagination: result.pagination,
        });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    },
  );

  prop.app.get(
    `${urlAPI}-all`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const filter = { deleted: false };

        // Optional: ?office_id=<id> to get users of one office
        if (req.query.office_id) {
          if (!mongoose.Types.ObjectId.isValid(req.query.office_id)) {
            return res.status(400).json({ success: false, message: noIDFound });
          }
          filter.office_id = req.query.office_id;
        }

        const result = await UserModel.find(filter).populate(populateOffice);

        const newData = result.map((row) => {
          const user = row.toObject();
          delete user.password;
          return user;
        });

        res.status(200).json({
          success: true,
          data: newData,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: "Server error",
          error: err.message || err,
        });
      }
    },
  );

  prop.app.delete(
    `${urlAPI}/:id`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        // ───────────────────────────────────────────────
        // ✅  ID
        const { id } = req.params;
        const { user_id: userId } = req.session;

        // ───────────────────────────────────────────────
        // ✅ Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: noIDFound,
          });
        }

        // ───────────────────────────────────────────────
        // ✅ Dynamically build update fields
        const updateFields = {
          deleted: true,
          updated_by: userId,
        };

        // ───────────────────────────────────────────────
        // ✅ Remove empty fields (null or undefined)
        Object.keys(updateFields).forEach(
          (key) => updateFields[key] == null && delete updateFields[key],
        );

        // ───────────────────────────────────────────────
        // ✅ Ensure there's at least one field to update
        if (Object.keys(updateFields).length === 1) {
          // Only `updated_by` exists
          return res.status(400).json({
            success: false,
            message: noDataUpdate,
          });
        }

        // ───────────────────────────────────────────────
        // ✅ Update unit
        const updatedUnit = await UserModel.findByIdAndUpdate(
          id,
          updateFields,
          {
            new: true,
          },
        );

        if (!updatedUnit) {
          return res.status(404).json({
            success: false,
            message: noDataFound,
          });
        }

        // ───────────────────────────────────────────────
        // ✅ Log activity
        const userData = await UserModel.findOne({ _id: userId });
        const userEmail = userData.email;
        delete updateFields.updated_by;
        await logActivity({
          title: `${document} ${
            updatedUnit.firstname + " " + updatedUnit.lastname
          } ត្រូវបានលុប!`,
          description: `គណនី: ${userEmail} បានលុបទិន្នន័យចេញពីប្រព័ន្ធ។`,
          categoryTitle: logTitle,
          createdBy: userId,
          req,
        });

        // ───────────────────────────────────────────────
        // ✅ Response
        res.status(200).json({
          success: true,
          data: `${document} ${
            updatedUnit.firstname + " " + updatedUnit.lastname
          } បានលុប`,
          message: deletedText(
            `${updatedUnit.firstname + " " + updatedUnit.lastname}`,
          ),
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: serverError,
          error: err,
        });
      }
    },
  );

  // Change MY password (needs the old one). Must stay above `PUT /users/:id`.
  prop.app.put(
    `${urlAPI}/change-password`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const { user_id: userId } = req.session;
        const { old_password, new_password } = req.body || {};

        // 400 (not 401) on purpose: the web signs out when it sees 401
        if (typeof old_password !== "string" || !old_password) {
          return res.status(400).json({ success: false, message: "សូមបញ្ចូលពាក្យសម្ងាត់ចាស់" });
        }
        if (typeof new_password !== "string" || new_password.length < 8) {
          return res.status(400).json({
            success: false,
            message: "ពាក្យសម្ងាត់ថ្មីត្រូវមានយ៉ាងតិច ៨ តួអក្សរ",
          });
        }
        if (old_password === new_password) {
          return res.status(400).json({
            success: false,
            message: "ពាក្យសម្ងាត់ថ្មីត្រូវខុសពីពាក្យសម្ងាត់ចាស់",
          });
        }

        const me = await UserModel.findOne({ _id: userId, deleted: false });
        if (!me) {
          return res.status(404).json({ success: false, message: noDataFound });
        }
        const isMatch = await bcrypt.compare(old_password, me.password);
        if (!isMatch) {
          return res.status(400).json({ success: false, message: "ពាក្យសម្ងាត់ចាស់មិនត្រឹមត្រូវ!" });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await UserModel.updateOne(
          { _id: userId },
          { $set: { password: hashedPassword, is_first_login: false, updated_by: userId } },
        );

        // sign out every OTHER device, keep this one
        await SessionModel.deleteMany({ user_id: userId, _id: { $ne: req.session._id } });

        await logActivity({
          title: `${document} ${me.firstname} ${me.lastname} ត្រូវបានកែប្រែ!`,
          description: `គណនី: ${me.email} បានប្តូរពាក្យសម្ងាត់ខ្លួនឯង។`,
          categoryTitle: logTitle,
          createdBy: userId,
          req,
        });

        res.status(200).json({ success: true, message: "បានប្តូរពាក្យសម្ងាត់ថ្មី!" });
      } catch (err) {
        console.error("[change-password]", err);
        res.status(500).json({ success: false, message: serverError });
      }
    },
  );

  prop.app.put(
    `${urlAPI}/:id`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        // ───────────────────────────────────────────────
        // ✅  ID
        const { id } = req.params;
        const { user_id: userId } = req.session;

        // ───────────────────────────────────────────────
        // ✅ Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: noIDFound,
          });
        }

        // ───────────────────────────────────────────────
        // ✅ Dynamically build update fields
        const updateFields = {
          ...sanitizeUpdate(req.body, [
            "password",
            "is_super_admin",
            "is_super_admin_and_developer",
            "is_first_login",
          ]),
          updated_by: userId,
        };

        // ───────────────────────────────────────────────
        // ✅ Remove empty fields (null or undefined)
        Object.keys(updateFields).forEach(
          (key) => updateFields[key] == null && delete updateFields[key],
        );

        // ───────────────────────────────────────────────
        // ✅ Ensure there's at least one field to update
        if (Object.keys(updateFields).length === 1) {
          // Only `updated_by` exists
          return res.status(400).json({
            success: false,
            message: noDataUpdate,
          });
        }

        // ───────────────────────────────────────────────
        // ✅ Validate role if changed ("" clears it)
        if (updateFields.role !== undefined) {
          if (updateFields.role === "") updateFields.role = null;
          else if (!USER_ROLES.includes(updateFields.role)) {
            return res.status(400).json({ success: false, message: roleInvalid });
          }
        }

        // ───────────────────────────────────────────────
        // ✅ Validate office if changed
        if (updateFields.office_id !== undefined) {
          const officeError = await checkOffice(updateFields.office_id);
          if (officeError) {
            return res.status(officeError.status).json({
              success: false,
              message: officeError.message,
            });
          }
        }

        // ───────────────────────────────────────────────
        // ✅ Update unit
        const updatedUnit = await UserModel.findByIdAndUpdate(
          id,
          updateFields,
          {
            new: true,
          },
        );

        if (!updatedUnit) {
          return res.status(404).json({
            success: false,
            message: noDataFound,
          });
        }

        // ───────────────────────────────────────────────
        // ✅ Log activity
        const userData = await UserModel.findOne({ _id: userId });
        const userEmail = userData.email;
        delete updateFields.updated_by;
        await logActivity({
          title: `${document} ${
            updatedUnit.firstname + " " + updatedUnit.lastname
          } ត្រូវបានកែប្រែ!`,
          description: `គណនី: ${userEmail} បានកែប្រែព័ត៌មានដូចជា : ${JSON.stringify(
            updateFields,
          )}`,
          categoryTitle: logTitle,
          createdBy: userId,
          req,
        });

        // ───────────────────────────────────────────────
        // ✅ Response
        res.status(200).json({
          success: true,
          data: updatedUnit,
          message: updatedText(
            updatedUnit.firstname + " " + updatedUnit.lastname,
          ),
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: serverError,
          error: err,
        });
      }
    },
  );

  // Update password for admin
  prop.app.put(
    `${urlAPI}/reset-password/:id`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        // ───────────────────────────────────────────────
        // ✅  ID
        const { id } = req.params;
        const { user_id: userId } = req.session;

        const requiredFields = [{ key: "password", label: "ពាក្យសម្ងាត់" }];
        if (!checkValidtion(res, req, requiredFields)) return;

        // ───────────────────────────────────────────────
        // ✅ Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: noIDFound,
          });
        }

        // ───────────────────────────────────────────────
        // ✅ Dynamically build update fields
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);

        const updateFields = {
          password: hashedPassword,
          is_first_login: true,
          updated_by: userId,
        };

        // ───────────────────────────────────────────────
        // ✅ Remove empty fields (null or undefined)
        Object.keys(updateFields).forEach(
          (key) => updateFields[key] == null && delete updateFields[key],
        );

        // ───────────────────────────────────────────────
        // ✅ Ensure there's at least one field to update
        if (Object.keys(updateFields).length === 1) {
          // Only `updated_by` exists
          return res.status(400).json({
            success: false,
            message: noDataUpdate,
          });
        }

        // ───────────────────────────────────────────────
        // ✅ Update unit
        const updatedData = await UserModel.findByIdAndUpdate(
          id,
          updateFields,
          {
            new: true,
          },
        );

        if (!updatedData) {
          return res.status(404).json({
            success: false,
            message: noDataFound,
          });
        }

        // ───────────────────────────────────────────────
        // ✅ Log activity
        const userData = await UserModel.findOne({ _id: userId });
        const userEmail = userData.email;
        delete updateFields.updated_by;
        await logActivity({
          title: `${document} ${
            updatedData.firstname + " " + updatedData.lastname
          } ត្រូវបានកែប្រែ!`,
          description: `គណនី: ${userEmail} បានកំណត់ពាក្យស​ម្ងាត់ឡើងវិញ។`,
          categoryTitle: logTitle,
          createdBy: userId,
          req,
        });

        // ───────────────────────────────────────────────
        // ✅ Clear session
        await SessionModel.deleteMany({ user_id: updatedData._id });

        // ───────────────────────────────────────────────
        // ✅ Response
        res.status(200).json({
          success: true,
          data: updatedData,
          message: updatedText(
            updatedData.firstname + " " + updatedData.lastname,
          ),
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: serverError,
          error: err,
        });
      }
    },
  );

  // This for only new client login need to add new password after reset password from add
  prop.app.put(
    `${urlAPI}/update-password-no-token/:id`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        // ───────────────────────────────────────────────
        // ✅  ID
        const { id } = req.params;

        // only for yourself, and only while the password still has to be set (after an admin reset / new account)
        if (String(req.session.user_id) !== String(id)) {
          return res.status(403).json({
            success: false,
            message: "អ្នកមិនមានសិទ្ធិប្តូរពាក្យសម្ងាត់របស់អ្នកដទៃទេ!",
          });
        }
        const target = await UserModel.findOne({ _id: id, deleted: false }).select("is_first_login").lean();
        if (!target || target.is_first_login !== true) {
          return res.status(403).json({
            success: false,
            message: "សូមប្រើមុខងារ ប្តូរពាក្យសម្ងាត់ (ត្រូវការពាក្យសម្ងាត់ចាស់)!",
          });
        }

        const requiredFields = [{ key: "password", label: "ពាក្យសម្ងាត់" }];
        if (!checkValidtion(res, req, requiredFields)) return;

        // ───────────────────────────────────────────────
        // ✅ Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: noIDFound,
          });
        }

        // ───────────────────────────────────────────────
        // ✅ Dynamically build update fields
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);

        const updateFields = {
          password: hashedPassword,
          is_first_login: false,
        };

        // ───────────────────────────────────────────────
        // ✅ Remove empty fields (null or undefined)
        Object.keys(updateFields).forEach(
          (key) => updateFields[key] == null && delete updateFields[key],
        );

        // ───────────────────────────────────────────────
        // ✅ Ensure there's at least one field to update
        if (Object.keys(updateFields).length === 1) {
          // Only `updated_by` exists
          return res.status(400).json({
            success: false,
            message: noDataUpdate,
          });
        }

        // ───────────────────────────────────────────────
        // ✅ Update unit
        const updatedData = await UserModel.findByIdAndUpdate(
          id,
          updateFields,
          {
            new: true,
          },
        );

        if (!updatedData) {
          return res.status(404).json({
            success: false,
            message: noDataFound,
          });
        }

        // ───────────────────────────────────────────────
        // ✅ Response
        res.status(200).json({
          success: true,
          data: updatedData,
          message: updatedText(
            updatedData.firstname + " " + updatedData.lastname,
          ),
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: serverError,
          error: err,
        });
      }
    },
  );

  // ===================================== App ================================================
  prop.app.get(
    `${urlAPI}-app/profile`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const { user_id: userId } = req.session;
        const id = userId;

        if (id) {
          // ✅ Validate ID
          if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
              success: false,
              message: "No ID Found",
            });
          }

          var userData = await UserModel.findOne({
            _id: id,
            deleted: false,
          }).populate(populateOffice);

          if (!userData) {
            return res.status(404).json({
              success: false,
              message: notFoundData,
            });
          }

          const user = userData.toObject();
          delete user.password;

          return res.status(200).json({ success: true, data: user });
        }
      } catch (err) {
        res.status(500).json({
          success: false,
          message: "Internal Error",
          error: err,
        });
      }
    },
  );
};

module.exports = route;

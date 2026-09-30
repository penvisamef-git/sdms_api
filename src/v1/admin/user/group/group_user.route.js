const mongoose = require("mongoose");
const UserModel = require("../../user/user.model");
const GroupUserModel = require("./group_user.model");
const getFilteredMongoDB = require("../../../../util/mongo_db/mongoDB_Queries");
const baseRoute = "group-user-permission";
const { logActivity } = require("../../../../util/log");
const { sanitizeUpdate } = require("../../../../util/helper");

const route = (prop) => {
  // **************** Declaration ****************
  const urlAPI = `/${prop.main_route}/${baseRoute}`;
  // Log
  const logTitle = "user_group_permission";
  // Error Content
  const document = "សិទ្ធអ្នកប្រើប្រាស់";

  function updatedText(name) {
    return `${document} ${name} ត្រូវបានកែប្រែ និងរក្សារទុក!`;
  }
  function deletedText(name) {
    return `${document} ${name} ត្រូវបានលុបចេញពីប្រព័ន្ធ!`;
  }
  const serverError = "ម៉ាសុីនមេមានបញ្ហា សូមព្យាយាមម្តងទៀតពេលក្រោយ!";
  const existsText = `សិទ្ធអ្នកប្រើប្រាស់ មាននៅក្នុងប្រព័ន្ធរួចហើយ!`;
  const noDataFound = `មិនមាន${document}នៅក្នុងប្រព័ន្ធ!`;
  const newSave = `${document} ថ្មីត្រូវបានរក្សារទុក!`;
  const noIDFound = "មិនមាន ID ត្រឹមត្រូវ!";
  const notFoundData = "មិនមានទិន្នន័យក្នុងប្រព័ន្ធ!";
  const noDataUpdate = "មិនមានទិន្នន័យដើម្បីកែប្រែ!";

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
        return false; // Return false to indicate validation failed
      }
    }
    return true; // Return true if all validations pass
  }

  // ===================== CREATE =====================
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
          { key: "name", label: "ឈ្មោះ" },
          { key: "permission", label: "សិទ្ធអ្នកប្រើប្រាស់" },
        ];
        
        const isValid = checkValidtion(res, req, requiredFields);
        if (!isValid) return; // Stop execution if validation fails

        // ───────────────────────────────────────────────
        // ✅ Get creator ID from session
        const { user_id: userId } = req.session;
        const { name, permission, note, status } = req.body;

        // ───────────────────────────────────────────────
        // ✅ Check if name already exists
        const exists = await GroupUserModel.findOne({ 
          name: name.trim(),
          deleted: false 
        });
        
        if (exists) {
          return res.json({
            success: false,
            message: existsText,
          });
        }

        // ───────────────────────────────────────────────
        // ✅ Create new group permission
        const saveData = await GroupUserModel.create({
          name: name.trim(),
          permission: permission || {},
          note: note || "",
          status: status !== undefined ? status : true,
          deleted: false,
          created_by: userId,
          updated_by: userId,
        });

        // ───────────────────────────────────────────────
        // ✅ Log activity
        const userData = await UserModel.findOne({ _id: userId });
        const userEmail = userData ? userData.email : "Unknown";

        await logActivity({
          title: `${document}ថ្មី ${name} ត្រូវបានបង្កើត!`,
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
        console.error("Error creating group permission:", err);
        res.status(500).json({
          success: false,
          message: serverError,
          error: err.message,
        });
      }
    }
  );

  // ===================== GET BY ID =====================
  prop.app.get(
    `${urlAPI}/:id`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const { id } = req.params;

        if (!id) {
          return res.status(400).json({
            success: false,
            message: noIDFound,
          });
        }

        // ✅ Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "ID មិនត្រឹមត្រូវ!",
          });
        }

        const unit = await GroupUserModel.findOne({
          _id: id,
          deleted: false,
        });

        if (!unit) {
          return res.status(404).json({
            success: false,
            message: notFoundData,
          });
        }

        return res.status(200).json({ success: true, data: unit });
      } catch (err) {
        console.error("Error getting group permission:", err);
        res.status(500).json({
          success: false,
          message: "Internal Error",
          error: err.message,
        });
      }
    }
  );

  // ===================== GET ALL =====================
  prop.app.get(
    `${urlAPI}`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const result = await getFilteredMongoDB(
          req.query,
          GroupUserModel,
          [],
          []
        );

        res.json({ success: true, ...result });
      } catch (err) {
        console.error("Error getting all group permissions:", err);
        res.status(500).json({ success: false, message: err.message });
      }
    }
  );

  // ===================== GET ALL (without filter) =====================
  prop.app.get(
    `${urlAPI}-all`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const data = await GroupUserModel.find({ deleted: false });
        res.status(200).json({
          success: true,
          data: data,
        });
      } catch (err) {
        console.error("Error getting all group permissions:", err);
        res.status(500).json({
          success: false,
          message: "Server error",
          error: err.message || err,
        });
      }
    }
  );

  // ===================== DELETE =====================
  prop.app.delete(
    `${urlAPI}/:id`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const { id } = req.params;
        const { user_id: userId } = req.session;

        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: noIDFound,
          });
        }

        // Check if exists
        const existing = await GroupUserModel.findOne({
          _id: id,
          deleted: false,
        });

        if (!existing) {
          return res.status(404).json({
            success: false,
            message: noDataFound,
          });
        }

        // Soft delete
        const updatedUnit = await GroupUserModel.findByIdAndUpdate(
          id,
          {
            deleted: true,
            updated_by: userId,
          },
          {
            new: true,
          }
        );

        // ───────────────────────────────────────────────
        // ✅ Log activity
        const userData = await UserModel.findOne({ _id: userId });
        const userEmail = userData ? userData.email : "Unknown";

        await logActivity({
          title: `${document} ${existing.name} ត្រូវបានលុប!`,
          description: `គណនី: ${userEmail} បានលុបទិន្នន័យចេញពីប្រព័ន្ធ។`,
          categoryTitle: logTitle,
          createdBy: userId,
          req,
        });

        res.status(200).json({
          success: true,
          data: updatedUnit,
          message: deletedText(existing.name),
        });
      } catch (err) {
        console.error("Error deleting group permission:", err);
        res.status(500).json({
          success: false,
          message: serverError,
          error: err.message,
        });
      }
    }
  );

  // ===================== UPDATE =====================
  prop.app.put(
    `${urlAPI}/:id`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const { id } = req.params;
        const { user_id: userId } = req.session;

        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: noIDFound,
          });
        }

        // Check if exists
        const existing = await GroupUserModel.findOne({
          _id: id,
          deleted: false,
        });

        if (!existing) {
          return res.status(404).json({
            success: false,
            message: noDataFound,
          });
        }

        // Check if name already exists (if name is being changed)
        if (req.body.name && req.body.name !== existing.name) {
          const nameExists = await GroupUserModel.findOne({
            name: req.body.name.trim(),
            deleted: false,
            _id: { $ne: id },
          });

          if (nameExists) {
            return res.status(400).json({
              success: false,
              message: existsText,
            });
          }
        }

        // Build update fields
        const updateFields = {
          ...sanitizeUpdate(req.body),
          updated_by: userId,
        };

        // Remove undefined or null fields
        Object.keys(updateFields).forEach(
          (key) => (updateFields[key] == null || updateFields[key] === '') && delete updateFields[key]
        );

        // Ensure there's at least one field to update
        if (Object.keys(updateFields).length === 1 && updateFields.updated_by) {
          return res.status(400).json({
            success: false,
            message: noDataUpdate,
          });
        }

        // Update
        const updatedUnit = await GroupUserModel.findByIdAndUpdate(
          id,
          updateFields,
          {
            new: true,
            runValidators: true,
          }
        );

        // Log activity
        const userData = await UserModel.findOne({ _id: userId });
        const userEmail = userData ? userData.email : "Unknown";
        
        const logFields = { ...updateFields };
        delete logFields.updated_by;

        await logActivity({
          title: `${document} ${updatedUnit.name} ត្រូវបានកែប្រែ!`,
          description: `គណនី: ${userEmail} បានកែប្រែព័ត៌មានដូចជា : ${JSON.stringify(logFields)}`,
          categoryTitle: logTitle,
          createdBy: userId,
          req,
        });

        res.status(200).json({
          success: true,
          data: updatedUnit,
          message: updatedText(updatedUnit.name),
        });
      } catch (err) {
        console.error("Error updating group permission:", err);
        res.status(500).json({
          success: false,
          message: serverError,
          error: err.message,
        });
      }
    }
  );
};

module.exports = route;
const helper = require("../../../util/helper");
const User = require("../user/user.model");
const ActivityLogCategory = require("../activity_log_category/activity_log_category.model");
const ActivityLog = require("../activity_log/activity_log.model");
const Model = require("./session.model");
const ModelGroup = require("../user/group/group_user.model");
const baseRoute = "session";
const mongoose = require("mongoose");

const route = (prop) => {
  const urlAPI = `/${prop.main_route}/${baseRoute}`;

  prop.app.get(
    `${urlAPI}`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const { user_id: userId } = req.session;
        const result = await getFilteredMongoDB(req.query, Model, [], [], null);
        const modelGroup = await ModelGroup.find({});

        const newData = result.data.map((row) => {
          delete row.user_data?.password;
          delete row.user_data?.password;

          modelGroup.map((rowGr) => {
            if (rowGr._id == row.access_token) {
              row.group_permssion = rowGr;
            }
          });

          const data = row.toObject();
          return data;
        });

        res.status(200).json({
          modelGroup: modelGroup,
          success: true,
          data: newData,
          pagination: result.pagination,
        });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
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
        const { id } = req.params;
        const { user_id: userId } = req.session;

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid ID format!",
          });
        }

        // Check if document exists
        const existingDoc = await Model.findById(id);
        if (!existingDoc) {
          return res.status(404).json({
            success: false,
            message: "Document not found!",
          });
        }

        // Permanent delete (hard delete)
        const deletedDoc = await Model.findByIdAndDelete(id);

        // Optional: Log the deletion
        console.log(`Document deleted permanently by user ${userId}:`, {
          id: deletedDoc._id,
          deletedBy: userId,
          deletedAt: new Date(),
          data: deletedDoc.toObject(),
        });

        res.status(200).json({
          success: true,
          message: "Document deleted permanently!",
          data: deletedDoc,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    },
  );

  async function getFilteredMongoDB(
    query,
    Model,
    populate = [],
    additionalFilter = [],
    unit_id,
  ) {
    // Pagination
    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    // Sorting
    const sortField = query.sort || "created_date";
    const sortOrder = query.order === "asc" ? 1 : -1;

    // Soft delete toggle
    const includeDeleted = query.includeDeleted === "true";
    const deleteFilter = includeDeleted ? {} : { deleted: false };

    // Specific ID Filter (q_id + q_key_id)
    const qId = query.q_id;
    const qKeyId = query.q_key_id;
    let specificOr = [];

    if (qId && qKeyId) {
      let ids;
      let fields;

      try {
        ids = Array.isArray(qId) ? qId : JSON.parse(qId);
      } catch {
        ids = [qId];
      }

      try {
        fields = Array.isArray(qKeyId) ? qKeyId : JSON.parse(qKeyId || "[]");
      } catch {
        fields = qKeyId ? qKeyId.split(",") : [];
      }

      const validObjectIds = ids
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));

      if (fields.length && validObjectIds.length) {
        specificOr = fields.map((field) => ({
          [field]: { $in: validObjectIds },
        }));
      }
    }

    // General keyword search (q + q_key)
    const keyword = query.q?.trim();
    const qKeys = query.q_key;
    let generalOr = [];

    if (keyword && qKeys) {
      let fields;

      try {
        fields = Array.isArray(qKeys) ? qKeys : JSON.parse(qKeys || "[]");
      } catch {
        fields = qKeys ? qKeys.split(",") : [];
      }

      generalOr = fields.map((field) => {
        if (
          (field.endsWith("_id") && mongoose.Types.ObjectId.isValid(keyword)) ||
          (field.endsWith("created_by_id") &&
            mongoose.Types.ObjectId.isValid(keyword))
        ) {
          return { [field]: new mongoose.Types.ObjectId(keyword) };
        }
        return { [field]: { $regex: keyword, $options: "i" } };
      });
    }

    // Compose final MongoDB filter

    let mongoFilter = {};

    if (specificOr.length && generalOr.length) {
      mongoFilter.$and = [{ $or: specificOr }, { $or: generalOr }];
    } else if (specificOr.length) {
      mongoFilter.$or = specificOr;
    } else if (generalOr.length) {
      mongoFilter.$or = generalOr;
    }

    // ✅ Add additional filters like is_super_admin: false
    if (additionalFilter.length > 0) {
      if (mongoFilter.$and) {
        mongoFilter.$and.push(...additionalFilter);
      } else {
        mongoFilter.$and = [...additionalFilter];
      }
    }

    // Query database with filter, pagination, sorting
    const [data, total] = await Promise.all([
      Model.find(mongoFilter)
        .sort({ [sortField]: sortOrder })
        .populate(populate)
        .skip(skip)
        .limit(limit),
      Model.countDocuments(mongoFilter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        pageSize: limit,
      },
    };
  }

  prop.app.post(`${urlAPI}`, prop.api_auth, async (req, res) => {
    const { user_id } = req.body;

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
        .json({ success: false, message: "User not found" });
    }

    // 3. Check password (plaintext example — use bcrypt in real app)
    if (user.password !== password) {
      return res.json({ success: false, message: "Invalid Password!" });
    }

    // 4. Log activity after successful login
    const categoryLog = await ActivityLogCategory.findOne({ title: "auth" });
    if (!categoryLog) {
      return res
        .status(404)
        .json({ success: false, message: "Activity log category not found" });
    }
    const log = new ActivityLog({
      title: `ឧបករណ៍ ${
        helper.extractDeviceInfo(req).device
      } បានចូលគណនី (សាអេឡិចត្រូនិច : ${email})`,
      description: `ប្រើប្រាស់ ${
        helper.extractDeviceInfo(req).browser
      } ចូលក្នុងប្រព័ន្ធ - ${helper.cambodiaDate()}`,
      activity_log_category_id: categoryLog._id,
      create_by_id: user._id,
      device: helper.extractDeviceInfo(req), // optional
      time: helper.cambodiaDate(),
    });

    await log.save();

    // 5. Return success
    const userData = user.toObject();
    delete userData.password;
    const access_token = prop.jwt.sign(
      { userName: email, user: password },
      "access_token",
      { expiresIn: "720h" },
    );
    userData.access_token = access_token;
    res.json({ success: true, data: userData });
  });
};

module.exports = route;

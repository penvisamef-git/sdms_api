const { logActivity } = require("../log");
const UserModel = require("../../v1/admin/user/user.model");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
// Post
async function post(
  res,
  req,
  requiredFieldsData,
  dataWillAdd,
  model,
  titleLog,
  logTitle_key,
  isUnfinishConnection
) {
  try {
    // Declare Add
    const dataPrepare = dataWillAdd;

    // ───────────────────────────────────────────────
    // ✅ Validate required fields
    const requiredFields = requiredFieldsData;
    if (!checkValidtion_Request(res, req, requiredFields)) return;

    // ───────────────────────────────────────────────
    // ✅ Get creator ID from session
    const { user_id: userId, user_data: { unit_id } = {} } = req.session;
    dataPrepare.unit_id = unit_id;
    const titleResponse = titleLog;

    // ───────────────────────────────────────────────
    // ✅ Create new unit
    const saveData = await model.create({
      ...dataPrepare,
      deleted: false, //  Hidden
      created_by: userId, //  Hidden
      updated_by: userId, //  Hidden
    });

    // ───────────────────────────────────────────────
    // ✅ Log activity
    const userData = await UserModel.findOne({ _id: userId });
    const userEmail = userData.email;
    await logActivity({
      title: `${titleResponse}ថ្មីត្រូវបានបង្កើត`,
      description: `បង្កើតដោយគណនី: ${userEmail}`,
      categoryTitle: logTitle_key,
      createdBy: userId,
      req,
    });

    // ───────────────────────────────────────────────
    // ✅ Response
    if (!isUnfinishConnection) {
      res.status(201).json({
        success: true,
        data: saveData,
        message: `${titleResponse}ថ្មីត្រូវបានបង្កើត​​ និងរក្សារទុក!`,
      });
    } else {
      return saveData;
    }
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: `មានបញ្ហាក្នុងប្រព័ន្ធសូមព្យាយាមម្តងទៀតពេលក្រោយ: ${err}`,
    });
  }
}

function checkValidtion_Request(res, req, requiredFields) {
  for (const field of requiredFields) {
    const value = req.body[field.key];

    if (
      value === undefined || // missing key
      value === null || // null value
      value === "" // empty string
    ) {
      res.status(400).json({
        success: false,
        message: `សូមបញ្ចូល ${field.label}`,
      });
      return false;
    }
  }
  return true;
}

// Get by ID
async function getByID(res, req, model, isDeleted, populate = []) {
  try {
    const { id } = req.params;

    if (id) {
      // ✅ Validate ID
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "មិនមានទិន្នន័យនៅក្នុងប្រព័ន្ធ!",
        });
      }

      const unit = await model
        .findOne({
          _id: id,
          deleted: isDeleted,
        })
        .populate(populate);

      if (!unit) {
        return res.status(404).json({
          success: false,
          message: notFoundData,
        });
      }

      return res.status(200).json({ success: true, data: unit });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Internal Error",
      message: `មានបញ្ហាក្នុងប្រព័ន្ធសូមព្យាយាមម្តងទៀតពេលក្រោយ: ${err}`,
    });
  }
}

// Get All
async function getAll(res, req, model, isDeleted) {
  try {
    const { user_id: userId, user_data: { unit_id } = {} } = req.session;
    const data = await model.find({ deleted: isDeleted, unit_id: unit_id });
    return res
      .status(200)
      .json({ success: true, count: data.length, data: data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `មានបញ្ហាក្នុងប្រព័ន្ធ សូមព្យាយាមម្តងទៀត: ${err.message}`,
    });
  }
}

// Update
async function update(
  res,
  req,
  requiredFieldsData,
  dataWillUpdate,
  model,
  titleLog,
  logTitle_key
) {
  try {
    const { id } = req.params;

    // ✅ Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID មិនត្រឹមត្រូវ",
      });
    }

    var checkIsHaveData = await model.findOne({ _id: id, deleted: false });
    if (!checkIsHaveData) {
      return res.status(404).json({
        success: false,
        message: "មិនមានទិន្នន័យនៅក្នុងប្រព័ន្ធ!",
      });
    }

    // ✅ Validate required fields
    if (!checkValidtion_Request(res, req, requiredFieldsData)) return;

    // ✅ Get updater ID from session
    const { user_id: userId } = req.session;
    const titleResponse = titleLog;

    // ✅ Prepare data
    const dataPrepare = {
      ...dataWillUpdate,
      updated_by: userId,
    };

    // ✅ Update data
    const updated = await model.findOneAndUpdate(
      { _id: id, deleted: false },
      dataPrepare,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "មិនមានទិន្នន័យនៅក្នុងប្រព័ន្ធ!",
      });
    }

    // ✅ Log activity
    const userData = await UserModel.findOne({ _id: userId });
    const userEmail = userData.email;
    await logActivity({
      title: `${titleResponse}ត្រូវបានកែប្រែ`,
      description: `កែប្រែដោយគណនី: ${userEmail}`,
      categoryTitle: logTitle_key,
      createdBy: userId,
      req,
    });

    // ✅ Response
    return res.status(200).json({
      success: true,
      data: updated,
      message: `${titleResponse}ត្រូវបានកែប្រែដោយជោគជ័យ!`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `មានបញ្ហាក្នុងប្រព័ន្ធ សូមព្យាយាមម្តងទៀត: ${err.message}`,
    });
  }
}

// Deleted
async function remove(res, req, model, titleLog, logTitle_key) {
  try {
    const { id } = req.params;

    // ✅ Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID មិនត្រឹមត្រូវ",
      });
    }

    var checkIsHaveData = await model.findOne({ _id: id, deleted: false });
    if (!checkIsHaveData) {
      return res.status(404).json({
        success: false,
        message: "មិនមានទិន្នន័យនៅក្នុងប្រព័ន្ធ!",
      });
    }

    // ✅ Get updater ID from session
    const { user_id: userId } = req.session;
    const titleResponse = titleLog;

    // ✅ Prepare data
    const dataPrepare = {
      deleted: true,
      updated_by: userId,
    };

    // ✅ Update data
    const updated = await model.findOneAndUpdate(
      { _id: id, deleted: false },
      dataPrepare,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "មិនមានទិន្នន័យនៅក្នុងប្រព័ន្ធ!",
      });
    }

    // ✅ Log activity
    const userData = await UserModel.findOne({ _id: userId });
    const userEmail = userData.email;
    await logActivity({
      title: `${titleResponse}ត្រូវបានលុប`,
      description: `កែប្រែដោយគណនី: ${userEmail}`,
      categoryTitle: logTitle_key,
      createdBy: userId,
      req,
    });

    // ✅ Response
    return res.status(200).json({
      success: true,
      data: updated,
      message: `${titleResponse}ត្រូវបានលុបដោយជោគជ័យ!`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `មានបញ្ហាក្នុងប្រព័ន្ធ សូមព្យាយាមម្តងទៀត: ${err.message}`,
    });
  }
}

// Filter Pagination
async function getPagination(
  query,
  Model,
  populate = [],
  additionalFilter = [],
  req
) {
  // Pagination
  const { user_id: userId, user_data: { unit_id } = {} } = req.session;
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
  let mongoFilter = {
    ...deleteFilter,
    unit_id: unit_id,
  };

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
    Model.find({ ...mongoFilter })
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

module.exports = { post, getByID, getAll, update, remove, getPagination };

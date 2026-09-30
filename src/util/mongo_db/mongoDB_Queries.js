const mongoose = require("mongoose");

async function getFilteredMongoDB(
  query,
  Model,
  populate = [],
  additionalFilter = [],
  unit_id
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
  // Only scope by unit when a unit_id is given (null/undefined = no unit filter)
  const unitFilter = unit_id != null ? { unit_id: unit_id } : {};
  let mongoFilter = {
    ...deleteFilter,
    ...unitFilter,
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


module.exports = getFilteredMongoDB;

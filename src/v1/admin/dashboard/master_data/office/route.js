const mongoose = require("mongoose");
const OfficeModel = require("./model");
const DepartmentModel = require("../department/model");
const getFilteredMongoDB = require("../../../../../util/mongo_db/mongoDB_Queries");
const { logActivity } = require("../../../../../util/log");
const { sanitizeUpdate } = require("../../../../../util/helper");
const baseRoute = "master-data/office";
const UserModel = require("../../../user/user.model");

const route = (prop) => {
    // **************** Declaration ****************
    const urlAPI = `/${prop.main_route}/${baseRoute}`;
    // Log
    const logTitle = "office";
    // Error Content
    const document = "ការិយាល័យ";

    function updatedText(name) {
        return `${document} ${name} ត្រូវបានកែប្រែ និងរក្សារទុក!`;
    }
    function deletedText(name) {
        return `${document} ${name} ត្រូវបានលុបចេញពីប្រព័ន្ធ!`;
    }
    const serverError = "ម៉ាសុីនមេមានបញ្ហា សូមព្យាយាមម្តងទៀតពេលក្រោយ!";
    const existsText = `${document} មាននៅក្នុងនាយកដ្ឋាននេះរួចហើយ!`;
    const noDataFound = `មិនមាន${document}នៅក្នុងប្រព័ន្ធ!`;
    const newSave = `${document} ថ្មីត្រូវបានរក្សារទុក!`;
    const noIDFound = "មិនមាន ID ត្រឹមត្រូវ!";
    const notFoundData = "មិនមានទិន្នន័យក្នុងប្រព័ន្ធ!";
    const noDataUpdate = "មិនមានទិន្នន័យដើម្បីកែប្រែ!";
    const departmentNotFound = "រកមិនឃើញនាយកដ្ឋាន!";

    // Office → Department → General Directorate → Unit
    const populateDepartment = {
        path: "department_id",
        select: "name name_in_eng general_directorate_id",
        populate: {
            path: "general_directorate_id",
            select: "name name_in_eng unit_id",
            populate: { path: "unit_id", select: "name name_in_eng" },
        },
    };

    // ******************** Helper ****************************
    function checkValidtion(res, req, requiredFields) {
        for (const field of requiredFields) {
            const value = req.body[field.key];

            if (value === undefined || value === null || value === "") {
                res.json({
                    success: false,
                    message: `សូមបញ្ចូល ${field.label}`,
                });
                return false;
            }
        }
        return true;
    }

    // ✅ Returns an error response body if department_id is invalid, otherwise null
    async function checkDepartment(department_id) {
        if (!mongoose.Types.ObjectId.isValid(department_id)) {
            return { status: 400, message: noIDFound };
        }
        const department = await DepartmentModel.exists({
            _id: department_id,
            deleted: false,
        });
        if (!department) {
            return { status: 404, message: departmentNotFound };
        }
        return null;
    }

    // ===================================== CREATE ================================================
    prop.app.post(
        `${urlAPI}`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                // ✅ Validate required fields
                const requiredFields = [
                    { key: "name", label: "ឈ្មោះ" },
                    { key: "department_id", label: "នាយកដ្ឋាន" },
                ];
                if (!checkValidtion(res, req, requiredFields)) return;

                const { user_id: userId } = req.session;
                const { name, name_in_eng, department_id, note, status } = req.body;
                const titleResponse = name;

                // ✅ Validate department
                const departmentError = await checkDepartment(department_id);
                if (departmentError) {
                    return res.status(departmentError.status).json({
                        success: false,
                        message: departmentError.message,
                    });
                }

                // ✅ Check duplicate name inside the same department
                const exists = await OfficeModel.exists({
                    name,
                    department_id,
                    deleted: false,
                });
                if (exists) {
                    return res.json({
                        success: false,
                        message: existsText,
                    });
                }

                // ✅ Create
                const saveData = await OfficeModel.create({
                    name,
                    name_in_eng,
                    department_id,
                    note,
                    status,
                    deleted: false,
                    created_by: userId,
                    updated_by: userId,
                });

                // ✅ Log activity
                const userData = await UserModel.findOne({ _id: userId });
                const userEmail = userData?.email || "unknown";
                await logActivity({
                    title: `${document}ថ្មី ${titleResponse} ត្រូវបានបង្កើត!`,
                    description: `បង្កើតដោយគណនី: ${userEmail}`,
                    categoryTitle: logTitle,
                    createdBy: userId,
                    req,
                });

                // ✅ Response
                res.status(201).json({
                    success: true,
                    data: saveData,
                    message: newSave,
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

    // ===================================== GET ALL ================================================
    // Optional: ?department_id=<id> to get offices of one department (for dropdowns)
    prop.app.get(
        `${urlAPI}-all`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                const filter = { deleted: false };
                const { department_id } = req.query;
                if (department_id) {
                    if (!mongoose.Types.ObjectId.isValid(department_id)) {
                        return res.status(400).json({
                            success: false,
                            message: noIDFound,
                        });
                    }
                    filter.department_id = department_id;
                }

                const result = await OfficeModel.find(filter).populate(
                    populateDepartment,
                );

                res.status(200).json({
                    success: true,
                    data: result,
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

    // ===================================== GET BY ID ================================================
    prop.app.get(
        `${urlAPI}/:id`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                const { id } = req.params;

                if (!mongoose.Types.ObjectId.isValid(id)) {
                    return res.status(400).json({
                        success: false,
                        message: noIDFound,
                    });
                }

                const data = await OfficeModel.findOne({
                    _id: id,
                    deleted: false,
                }).populate(populateDepartment);

                if (!data) {
                    return res.status(404).json({
                        success: false,
                        message: notFoundData,
                    });
                }

                return res.status(200).json({ success: true, data });
            } catch (err) {
                res.status(500).json({
                    success: false,
                    message: "Internal Error",
                    error: err,
                });
            }
        },
    );

    // ===================================== GET LIST (with filter + pagination) ================================================
    // Filter by department: ?q_id=<department_id>&q_key_id=department_id
    prop.app.get(
        `${urlAPI}`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                const result = await getFilteredMongoDB(
                    req.query,
                    OfficeModel,
                    [populateDepartment], // populate
                    [{ deleted: false }],
                    null,
                );

                res.status(200).json({
                    success: true,
                    data: result.data,
                    pagination: result.pagination,
                });
            } catch (err) {
                res.status(500).json({ success: false, message: err.message });
            }
        },
    );

    // ===================================== USERS IN OFFICE ================================================
    // GET /office/:id/users?page=1&limit=10&q=...&include_deleted=false
    // Without page → all users of the office
    prop.app.get(
        `${urlAPI}/:id/users`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                const { id } = req.params;
                if (!mongoose.Types.ObjectId.isValid(id)) {
                    return res.status(400).json({ success: false, message: noIDFound });
                }

                const office = await OfficeModel.findOne({ _id: id, deleted: false })
                    .select("name name_in_eng department_id")
                    .populate(populateDepartment);
                if (!office) {
                    return res.status(404).json({ success: false, message: noDataFound });
                }

                const filter = { office_id: id };
                if (req.query.include_deleted !== "true") filter.deleted = false;

                // keyword search on name / email / contact
                const keyword = (req.query.q || "").trim();
                if (keyword) {
                    const rx = { $regex: keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
                    filter.$or = [{ firstname: rx }, { lastname: rx }, { email: rx }, { contact: rx }];
                }

                const query = UserModel.find(filter)
                    .select("-password")
                    .sort({ firstname: 1 });

                if (req.query.page) {
                    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
                    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
                    const [data, total] = await Promise.all([
                        query.skip((page - 1) * limit).limit(limit),
                        UserModel.countDocuments(filter),
                    ]);
                    return res.status(200).json({
                        success: true,
                        office,
                        data,
                        pagination: { total, totalPages: Math.ceil(total / limit), currentPage: page, pageSize: limit },
                    });
                }

                const data = await query;
                res.status(200).json({ success: true, office, count: data.length, data });
            } catch (err) {
                res.status(500).json({
                    success: false,
                    message: "Server error",
                    error: err.message || err,
                });
            }
        },
    );

    // ===================================== UPDATE ================================================
    prop.app.put(
        `${urlAPI}/:id`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                const { id } = req.params;
                const { user_id: userId } = req.session;

                // ✅ Validate ID
                if (!mongoose.Types.ObjectId.isValid(id)) {
                    return res.status(400).json({
                        success: false,
                        message: noIDFound,
                    });
                }

                // ✅ Build update fields
                const updateFields = {
                    ...sanitizeUpdate(req.body),
                    updated_by: userId,
                };

                // ✅ Remove empty fields
                Object.keys(updateFields).forEach(
                    (key) => updateFields[key] == null && delete updateFields[key],
                );

                if (Object.keys(updateFields).length === 1) {
                    return res.status(400).json({
                        success: false,
                        message: noDataUpdate,
                    });
                }

                // ✅ Validate department if changed
                if (updateFields.department_id !== undefined) {
                    const departmentError = await checkDepartment(
                        updateFields.department_id,
                    );
                    if (departmentError) {
                        return res.status(departmentError.status).json({
                            success: false,
                            message: departmentError.message,
                        });
                    }
                }

                // ✅ Update
                const updatedData = await OfficeModel.findOneAndUpdate(
                    { _id: id, deleted: false },
                    updateFields,
                    { new: true },
                );

                if (!updatedData) {
                    return res.status(404).json({
                        success: false,
                        message: noDataFound,
                    });
                }

                // ✅ Log activity
                const userData = await UserModel.findOne({ _id: userId });
                const userEmail = userData?.email || "unknown";
                delete updateFields.updated_by;
                await logActivity({
                    title: `${document} ${updatedData.name} ត្រូវបានកែប្រែ!`,
                    description: `គណនី: ${userEmail} បានកែប្រែព័ត៌មានដូចជា : ${JSON.stringify(
                        updateFields,
                    )}`,
                    categoryTitle: logTitle,
                    createdBy: userId,
                    req,
                });

                // ✅ Response
                res.status(200).json({
                    success: true,
                    data: updatedData,
                    message: updatedText(updatedData.name),
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

    // ===================================== SOFT DELETE ================================================
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

                const updatedData = await OfficeModel.findOneAndUpdate(
                    { _id: id, deleted: false },
                    { deleted: true, updated_by: userId },
                    { new: true },
                );

                if (!updatedData) {
                    return res.status(404).json({
                        success: false,
                        message: noDataFound,
                    });
                }

                // ✅ Log activity
                const userData = await UserModel.findOne({ _id: userId });
                const userEmail = userData?.email || "unknown";
                await logActivity({
                    title: `${document} ${updatedData.name} ត្រូវបានលុប!`,
                    description: `គណនី: ${userEmail} បានលុបទិន្នន័យចេញពីប្រព័ន្ធ។`,
                    categoryTitle: logTitle,
                    createdBy: userId,
                    req,
                });

                res.status(200).json({
                    success: true,
                    data: `${document} ${updatedData.name} បានលុប`,
                    message: deletedText(updatedData.name),
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

    // ===================================== RESTORE ================================================
    prop.app.put(
        `${urlAPI}/restore/:id`,
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

                const updatedData = await OfficeModel.findByIdAndUpdate(
                    id,
                    { deleted: false, updated_by: userId },
                    { new: true },
                );

                if (!updatedData) {
                    return res.status(404).json({
                        success: false,
                        message: noDataFound,
                    });
                }

                // ✅ Log activity
                const userData = await UserModel.findOne({ _id: userId });
                const userEmail = userData?.email || "unknown";
                await logActivity({
                    title: `${document} ${updatedData.name} ត្រូវបានស្តារឡើងវិញ!`,
                    description: `គណនី: ${userEmail} បានស្តារទិន្នន័យចូលក្នុងប្រព័ន្ធ។`,
                    categoryTitle: logTitle,
                    createdBy: userId,
                    req,
                });

                res.status(200).json({
                    success: true,
                    data: updatedData,
                    message: `${document} ${updatedData.name} បានស្តារឡើងវិញ!`,
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
};

module.exports = route;

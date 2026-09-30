const mongoose = require("mongoose");
const GeneralDirectorateModel = require("./model");
const UnitModel = require("../unit/model");
const DepartmentModel = require("../department/model");
const { generalDirectorateNodes } = require("../../../../../util/org_tree");
const getFilteredMongoDB = require("../../../../../util/mongo_db/mongoDB_Queries");
const { logActivity } = require("../../../../../util/log");
const { sanitizeUpdate } = require("../../../../../util/helper");
const baseRoute = "master-data/general-directorate";
const UserModel = require("../../../user/user.model");

const route = (prop) => {
    // **************** Declaration ****************
    const urlAPI = `/${prop.main_route}/${baseRoute}`;
    // Log
    const logTitle = "general_directorate";
    // Error Content
    const document = "អគ្គនាយកដ្ឋាន";

    function updatedText(name) {
        return `${document} ${name} ត្រូវបានកែប្រែ និងរក្សារទុក!`;
    }
    function deletedText(name) {
        return `${document} ${name} ត្រូវបានលុបចេញពីប្រព័ន្ធ!`;
    }
    const serverError = "ម៉ាសុីនមេមានបញ្ហា សូមព្យាយាមម្តងទៀតពេលក្រោយ!";
    const existsText = `${document} មាននៅក្នុងអង្គភាពនេះរួចហើយ!`;
    const noDataFound = `មិនមាន${document}នៅក្នុងប្រព័ន្ធ!`;
    const newSave = `${document} ថ្មីត្រូវបានរក្សារទុក!`;
    const noIDFound = "មិនមាន ID ត្រឹមត្រូវ!";
    const notFoundData = "មិនមានទិន្នន័យក្នុងប្រព័ន្ធ!";
    const noDataUpdate = "មិនមានទិន្នន័យដើម្បីកែប្រែ!";
    const unitNotFound = "រកមិនឃើញអង្គភាព!";
    const hasChildError = `មិនអាចលុប${document}បានទេ ព្រោះនៅមាននាយកដ្ឋានក្រោមឱវាទ!`;

    const populateUnit = { path: "unit_id", select: "name name_in_eng" };

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

    // ✅ Returns an error response body if unit_id is invalid, otherwise null
    async function checkUnit(unit_id) {
        if (!mongoose.Types.ObjectId.isValid(unit_id)) {
            return { status: 400, message: noIDFound };
        }
        const unit = await UnitModel.exists({ _id: unit_id, deleted: false });
        if (!unit) {
            return { status: 404, message: unitNotFound };
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
                    { key: "unit_id", label: "អង្គភាព" },
                ];
                if (!checkValidtion(res, req, requiredFields)) return;

                const { user_id: userId } = req.session;
                const { name, name_in_eng, unit_id, note, status } = req.body;
                const titleResponse = name;

                // ✅ Validate unit
                const unitError = await checkUnit(unit_id);
                if (unitError) {
                    return res.status(unitError.status).json({
                        success: false,
                        message: unitError.message,
                    });
                }

                // ✅ Check duplicate name inside the same unit
                const exists = await GeneralDirectorateModel.exists({
                    name,
                    unit_id,
                    deleted: false,
                });
                if (exists) {
                    return res.json({
                        success: false,
                        message: existsText,
                    });
                }

                // ✅ Create
                const saveData = await GeneralDirectorateModel.create({
                    name,
                    name_in_eng,
                    unit_id,
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
    // Optional: ?unit_id=<id> to get general directorates of one unit (for dropdowns)
    prop.app.get(
        `${urlAPI}-all`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                const filter = { deleted: false };
                const { unit_id } = req.query;
                if (unit_id) {
                    if (!mongoose.Types.ObjectId.isValid(unit_id)) {
                        return res.status(400).json({
                            success: false,
                            message: noIDFound,
                        });
                    }
                    filter.unit_id = unit_id;
                }

                const result = await GeneralDirectorateModel.find(filter).populate(
                    populateUnit,
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

                const data = await GeneralDirectorateModel.findOne({
                    _id: id,
                    deleted: false,
                }).populate(populateUnit);

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
    // Filter by unit: ?q_id=<unit_id>&q_key_id=unit_id
    prop.app.get(
        `${urlAPI}`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                const result = await getFilteredMongoDB(
                    req.query,
                    GeneralDirectorateModel,
                    [populateUnit], // populate
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

    // ===================================== GET TREE ================================================
    // General Directorate → Department → Office
    // Optional: ?general_directorate_id=<id> (one only) · ?include_users=true (users under each office)
    prop.app.get(
        `${urlAPI}-tree`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                const filter = {};
                // Optional: ?unit_id=<id> (all under that parent)
                if (req.query.unit_id) {
                    if (!mongoose.Types.ObjectId.isValid(req.query.unit_id)) {
                        return res.status(400).json({ success: false, message: noIDFound });
                    }
                    filter.unit_id = req.query.unit_id;
                }
                const { general_directorate_id } = req.query;
                if (general_directorate_id) {
                    if (!mongoose.Types.ObjectId.isValid(general_directorate_id)) {
                        return res.status(400).json({ success: false, message: noIDFound });
                    }
                    filter._id = general_directorate_id;
                }
                const data = await generalDirectorateNodes(filter, { includeUsers: req.query.include_users === "true" });
                res.status(200).json({ success: true, data });
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

                // ✅ Validate unit if changed
                if (updateFields.unit_id !== undefined) {
                    const unitError = await checkUnit(updateFields.unit_id);
                    if (unitError) {
                        return res.status(unitError.status).json({
                            success: false,
                            message: unitError.message,
                        });
                    }
                }

                // ✅ Update
                const updatedData = await GeneralDirectorateModel.findOneAndUpdate(
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

                // ✅ Block delete while active departments still belong to this general directorate
                const hasChild = await DepartmentModel.exists({
                    general_directorate_id: id,
                    deleted: false,
                });
                if (hasChild) {
                    return res.status(400).json({
                        success: false,
                        message: hasChildError,
                    });
                }

                const updatedData = await GeneralDirectorateModel.findOneAndUpdate(
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

                const updatedData = await GeneralDirectorateModel.findByIdAndUpdate(
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

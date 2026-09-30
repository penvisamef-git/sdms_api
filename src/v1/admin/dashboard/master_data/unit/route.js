const mongoose = require("mongoose");
const UnitModel = require("./model");
const GeneralDirectorateModel = require("../general_directorate/model");
const DepartmentModel = require("../department/model");
const OfficeModel = require("../office/model");
const { generalDirectorateNodes, groupBy } = require("../../../../../util/org_tree");
const getFilteredMongoDB = require("../../../../../util/mongo_db/mongoDB_Queries");
const { logActivity } = require("../../../../../util/log");
const { sanitizeUpdate } = require("../../../../../util/helper");
const baseRoute = "master-data/unit";
const UserModel = require("../../../user/user.model");

const route = (prop) => {
    // **************** Declaration ****************
    const urlAPI = `/${prop.main_route}/${baseRoute}`;
    // Log
    const logTitle = "unit";
    // Error Content
    const document = "អង្គភាព";

    function updatedText(name) {
        return `${document} ${name} ត្រូវបានកែប្រែ និងរក្សារទុក!`;
    }
    function deletedText(name) {
        return `${document} ${name} ត្រូវបានលុបចេញពីប្រព័ន្ធ!`;
    }
    const serverError = "ម៉ាសុីនមេមានបញ្ហា សូមព្យាយាមម្តងទៀតពេលក្រោយ!";
    const existsText = `${document} មាននៅក្នុងប្រព័ន្ធរួចហើយ!`;
    const noDataFound = `មិនមាន${document}នៅក្នុងប្រព័ន្ធ!`;
    const newSave = `${document} ថ្មីត្រូវបានរក្សារទុក!`;
    const noIDFound = "មិនមាន ID ត្រឹមត្រូវ!";
    const notFoundData = "មិនមានទិន្នន័យក្នុងប្រព័ន្ធ!";
    const noDataUpdate = "មិនមានទិន្នន័យដើម្បីកែប្រែ!";
    const hasChildError = `មិនអាចលុប${document}បានទេ ព្រោះនៅមានអគ្គនាយកដ្ឋានក្រោមឱវាទ!`;

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

    // ===================================== CREATE ================================================
    prop.app.post(
        `${urlAPI}`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                // ✅ Validate required fields
                const requiredFields = [{ key: "name", label: "ឈ្មោះ" }];
                if (!checkValidtion(res, req, requiredFields)) return;

                const { user_id: userId } = req.session;
                const { name, name_in_eng, location, note, status } = req.body;
                const titleResponse = name;

                // ✅ Check duplicate name
                const exists = await UnitModel.exists({
                    name,
                    deleted: false,
                });
                if (exists) {
                    return res.json({
                        success: false,
                        message: existsText,
                    });
                }

                // ✅ Create
                const saveData = await UnitModel.create({
                    name,
                    name_in_eng,
                    location,
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

                const data = await UnitModel.findOne({
                    _id: id,
                    deleted: false,
                });

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
    prop.app.get(
        `${urlAPI}`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                const result = await getFilteredMongoDB(
                    req.query,
                    UnitModel,
                    [], // populate
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

    // ===================================== GET ALL ================================================
    prop.app.get(
        `${urlAPI}-all`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                const result = await UnitModel.find({ deleted: false });

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

    // ===================================== GET TREE ================================================
    // Unit → General Directorate → Department → Office
    // Optional: ?unit_id=<id> (one unit only) · ?include_users=true (users under each office)
    prop.app.get(
        `${urlAPI}-tree`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                const unitFilter = { deleted: false };
                const { unit_id } = req.query;
                if (unit_id) {
                    if (!mongoose.Types.ObjectId.isValid(unit_id)) {
                        return res.status(400).json({ success: false, message: noIDFound });
                    }
                    unitFilter._id = unit_id;
                }

                const units = await UnitModel.find(unitFilter)
                    .select("name name_in_eng location note status")
                    .sort({ created_date: 1 })
                    .lean();

                const gds = groupBy(
                    await generalDirectorateNodes(
                        { unit_id: { $in: units.map((u) => u._id) } },
                        { includeUsers: req.query.include_users === "true" },
                    ),
                    "unit_id",
                );

                const tree = units.map((unit) => ({
                    ...unit,
                    level: "unit",
                    children: gds[String(unit._id)] || [],
                }));

                res.status(200).json({ success: true, data: tree });
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

                // ✅ Update
                const updatedData = await UnitModel.findByIdAndUpdate(
                    id,
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

                // ✅ Block delete while active general directorates still belong to this unit
                const hasChild = await GeneralDirectorateModel.exists({
                    unit_id: id,
                    deleted: false,
                });
                if (hasChild) {
                    return res.status(400).json({
                        success: false,
                        message: hasChildError,
                    });
                }

                const updateFields = {
                    deleted: true,
                    updated_by: userId,
                };

                const updatedData = await UnitModel.findByIdAndUpdate(
                    id,
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

    // ===================================== RESTORE (Optional) ================================================
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

                const updatedData = await UnitModel.findByIdAndUpdate(
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
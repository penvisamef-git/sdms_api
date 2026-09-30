const mongoose = require("mongoose");
const FrameWorkModel = require("./model");
const getFilteredMongoDB = require("../../../../../util/mongo_db/mongoDB_Queries");
const { logActivity } = require("../../../../../util/log");
const { sanitizeUpdate } = require("../../../../../util/helper");
const baseRoute = "master-data/framework";
const UserModel = require("../../../user/user.model");

const route = (prop) => {
    // **************** Declaration ****************
    const urlAPI = `/${prop.main_route}/${baseRoute}`;
    // Log
    const logTitle = "framework";
    // Error Content
    const document = "ក្របខ័ណ្ឌ";

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
    const parentNotFound = "រកមិនឃើញក្របខ័ណ្ឌមេ!";
    const selfParentError = "មិនអាចកំណត់ខ្លួនឯងជាក្របខ័ណ្ឌមេបានទេ!";
    const circularParentError = "មិនអាចកំណត់ក្របខ័ណ្ឌមេជាកូនចៅរបស់ខ្លួនឯងបានទេ!";

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

    // ✅ Check if candidateParentId is a descendant of id
    async function isDescendant(id, candidateParentId) {
        let currentId = candidateParentId;
        const visited = new Set();

        while (currentId) {
            const current = String(currentId);
            if (current === String(id)) return true;
            if (visited.has(current)) return false;
            visited.add(current);

            const parent = await FrameWorkModel.findById(currentId).select(
                "framework_parent_id",
            );
            if (!parent || !parent.framework_parent_id) return false;
            currentId = parent.framework_parent_id;
        }
        return false;
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
                const { name, code, framework_parent_id, note, status } = req.body;
                const titleResponse = name;

              

                // ✅ Validate parent if provided
                if (framework_parent_id) {
                    if (!mongoose.Types.ObjectId.isValid(framework_parent_id)) {
                        return res.status(400).json({
                            success: false,
                            message: noIDFound,
                        });
                    }
                    const parent = await FrameWorkModel.findOne({
                        _id: framework_parent_id,
                        deleted: false,
                    });
                    if (!parent) {
                        return res.status(404).json({
                            success: false,
                            message: parentNotFound,
                        });
                    }
                }

                // ✅ Create
                const saveData = await FrameWorkModel.create({
                    name,
                    code,
                    framework_parent_id: framework_parent_id || null,
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

                const data = await FrameWorkModel.findOne({
                    _id: id,
                    deleted: false,
                }).populate("framework_parent_id", "name code");

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
                    FrameWorkModel,
                    [{ path: "framework_parent_id", select: "name code" }], // populate
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
                const result = await FrameWorkModel.find({ deleted: false })
                    .populate("framework_parent_id", "name code");

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
    prop.app.get(
        `${urlAPI}-tree`,
        prop.api_auth,
        prop.jwt_auth,
        prop.request_user,
        async (req, res) => {
            try {
                const all = await FrameWorkModel.find({ deleted: false }).lean();

                const map = {};
                all.forEach((item) => {
                    map[item._id] = { ...item, children: [] };
                });

                const tree = [];
                all.forEach((item) => {
                    if (item.framework_parent_id && map[item.framework_parent_id]) {
                        map[item.framework_parent_id].children.push(map[item._id]);
                    } else {
                        tree.push(map[item._id]);
                    }
                });

                res.status(200).json({
                    success: true,
                    data: tree,
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

                // ✅ Self-parent guard
                if (
                    updateFields.framework_parent_id &&
                    String(updateFields.framework_parent_id) === String(id)
                ) {
                    return res.status(400).json({
                        success: false,
                        message: selfParentError,
                    });
                }

                // ✅ Validate parent + circular ref
                if (updateFields.framework_parent_id) {
                    if (!mongoose.Types.ObjectId.isValid(updateFields.framework_parent_id)) {
                        return res.status(400).json({
                            success: false,
                            message: noIDFound,
                        });
                    }

                    const parent = await FrameWorkModel.findOne({
                        _id: updateFields.framework_parent_id,
                        deleted: false,
                    });
                    if (!parent) {
                        return res.status(404).json({
                            success: false,
                            message: parentNotFound,
                        });
                    }

                    const circular = await isDescendant(id, updateFields.framework_parent_id);
                    if (circular) {
                        return res.status(400).json({
                            success: false,
                            message: circularParentError,
                        });
                    }
                }

                // ✅ Update
                const updatedData = await FrameWorkModel.findByIdAndUpdate(
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

                const updateFields = {
                    deleted: true,
                    updated_by: userId,
                };

                const updatedData = await FrameWorkModel.findByIdAndUpdate(
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

                const updatedData = await FrameWorkModel.findByIdAndUpdate(
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

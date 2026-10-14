const index = (prop) => {
  // Declaration
  prop.main_route = "api/admin";

  // Role guard first: every /api/admin call is checked against the user's role (see util/role_guard.js)
  const { role_guard } = require("../../util/role_guard");
  prop.app.use(`/${prop.main_route}`, role_guard);

  // All Route
  const authRoute = require("./auth/auth.route");
  authRoute(prop);
  const sessionRoute = require("./session/session.route");
  sessionRoute(prop);
  const userRoute = require("./user/user.route");
  userRoute(prop);
  const userGroupRoute = require("./user/group/group_user.route");
  userGroupRoute(prop);
  const activityLogRoute = require("./activity_log/activity_log.route");
  activityLogRoute(prop);
  const activityLogCategoryRoute = require("./activity_log_category/activity_log_category.route");
  activityLogCategoryRoute(prop);

  const masterDataDocumentType = require("./dashboard/master_data/type_of_document/route");
  masterDataDocumentType(prop);

  const masterDataStatusOfProcess = require("./dashboard/master_data/status_of_process/route");
  masterDataStatusOfProcess(prop);

  const masterDataFrameWork = require("./dashboard/master_data/framework/route");
  masterDataFrameWork(prop);

  const masterDataUnit = require("./dashboard/master_data/unit/route");
  masterDataUnit(prop);

  const masterDataGeneralDirectorate = require("./dashboard/master_data/general_directorate/route");
  masterDataGeneralDirectorate(prop);

  const masterDataDepartment = require("./dashboard/master_data/department/route");
  masterDataDepartment(prop);

  const masterDataOffice = require("./dashboard/master_data/office/route");
  masterDataOffice(prop);

  const documentRoute = require("./dashboard/document/route");
  documentRoute(prop);

  const documentTransferRoute = require("./dashboard/document/transfer.route");
  documentTransferRoute(prop);

  const homeRoute = require("./dashboard/home/route");
  homeRoute(prop);

  const uploadRoute = require("./upload/upload.route");
  uploadRoute(prop);
};

module.exports = index;

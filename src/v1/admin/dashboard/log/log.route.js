const mongoose = require("mongoose");
const ActivityLogModel = require("../../activity_log/activity_log.model");
const getFilteredMongoDB = require("../../../../util/mongo_db/mongoDB_Queries");
const route = (prop) => {
  // **************** Declaration ****************
  // Route
  const baseRoute = "summary/activity-log";
  const urlAPI = `/${prop.main_route}/${baseRoute}`;

  // prop.app.get(
  //   `${urlAPI}/:id`, // optional ":id"
  //   prop.api_auth,
  //   prop.jwt_auth,
  //   prop.request_user,
  //   async (req, res) => {
  //     try {
  //       const { id } = req.params;

  //       if (id) {
  //         // ✅ Validate ID
  //         if (!mongoose.Types.ObjectId.isValid(id)) {
  //           return res.status(400).json({
  //             success: false,
  //             message: noIDFound,
  //           });
  //         }

  //         const unit = await ActivityLogModel.findOne({
  //           _id: id,
  //           deleted: false,
  //         });

  //         if (!unit) {
  //           return res.status(404).json({
  //             success: false,
  //             message: notFoundData,
  //           });
  //         }

  //         return res.status(200).json({ success: true, data: unit });
  //       }
  //     } catch (err) {
  //       res.status(500).json({
  //         success: false,
  //         message: serverError,
  //         error: err,
  //       });
  //     }
  //   }
  // );

  prop.app.get(
    `${urlAPI}`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const result = await getFilteredMongoDB(req.query, ActivityLogModel, ['activity_log_category_id']);
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    }
  );
};

module.exports = route;

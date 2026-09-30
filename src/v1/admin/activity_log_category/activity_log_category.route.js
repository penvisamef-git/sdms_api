const helper = require("../../../util/helper");
const { body, validationResult } = require("express-validator");
const ActivityLogCategory = require("./activity_log_category.model");
const getFilteredMongoDB = require("../../../util/mongo_db/mongoDB_Queries");
const baseRoute = "activity_log/category";

const route = (prop) => {
  // **************** Declaration ****************
  const urlAPI = `/${prop.main_route}/${baseRoute}`;
  prop.app.post(
    `${urlAPI}`,
    prop.api_auth,
    [
      body("name")
        .isString()
        .notEmpty()
        .withMessage("Category name is required"),
      body("title").isString().notEmpty().withMessage("Title name is required"),
    ],
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { name, title } = req.body;

      try {
        const category = new ActivityLogCategory({ name, title });
        await category.save();

        res.status(201).json({
          success: true,
          message: "Activity Log Category created successfully",
          data: category,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({
          success: false,
          message: "Server error",
        });
      }
    }
  );

  prop.app.get(
    `${urlAPI}`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const result = await getFilteredMongoDB(
          req.query,
          ActivityLogCategory,
          []
        );
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    }
  );

  prop.app.get(
    `${urlAPI}-all`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const categories = await ActivityLogCategory.find(); // Fetch all categories

        res.status(200).json({
          success: true,
          data: categories,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: "Server error",
          error: err.message || err,
        });
      }
    }
  );
};

module.exports = route;

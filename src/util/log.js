const ActivityLog = require("../v1/admin/activity_log/activity_log.model");
const ActivityLogCategory = require("../v1/admin/activity_log_category/activity_log_category.model");
const helper = require("./helper"); // adjust path if needed
const { activityLogType } = require("./activity_log_type");

async function logActivity({
  title,
  description,
  categoryTitle,
  createdBy,
  req,
}) {
  try {
    const dateLog = helper.cambodiaDate();
    const categoryLogList = activityLogType();

    // Find the category by title from the list
    const category = categoryLogList.find(
      (cat) => cat.title.toLowerCase() === categoryTitle?.toLowerCase(),
    );

    if (!category) {
      // If category not found, use default "other" category (id: 0)
      console.warn(
        `Category "${categoryTitle}" not found, using "other" as default`,
      );
      const defaultCategory = categoryLogList.find(
        (cat) => cat.id === 0 || cat.title.toLowerCase() === "other",
      );

      if (!defaultCategory) {
        return; // Exit if no default category found
      }

      // Find or create the category in database
      let categoryDoc = await ActivityLogCategory.findOne({
        title: defaultCategory.title,
      });

      if (!categoryDoc) {
        categoryDoc = new ActivityLogCategory({
          title: defaultCategory.title,
          status: true,
        });
        await categoryDoc.save();
      }

      // Create the activity log with default category
      const log = new ActivityLog({
        title,
        description,
        activity_log_category_id: categoryDoc._id,
        create_by_id: createdBy,
        device: helper.extractDeviceInfo(req),
        time: dateLog,
      });

      await log.save();
      return;
    }

    // Find or create the category in database
    let categoryDoc = await ActivityLogCategory.findOne({
      title: category.title,
    });

    if (!categoryDoc) {
      categoryDoc = new ActivityLogCategory({
        title: category.title,
        status: true,
      });
      await categoryDoc.save();
    }

    // Create the activity log
    const log = new ActivityLog({
      title,
      description,
      activity_log_category_id: categoryDoc._id,
      create_by_id: createdBy,
      device: helper.extractDeviceInfo(req),
      time: dateLog,
    });

    await log.save();
  } catch (err) {
    console.error("Failed to log activity:", err);
    // Don't throw here to avoid crashing the main request flow
  }
}

module.exports = { logActivity };

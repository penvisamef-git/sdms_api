const multer = require("multer");
const { uploadBuffer, deleteFile, signUpload, ping } = require("../../../util/cloudinary");
const baseRoute = "upload";

// Keep files in memory, then stream them to Cloudinary
const MAX_FILE_MB = 20;
const MAX_FILES = 10;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: MAX_FILES },
});

// Allowed sub folders inside CLOUDINARY_FOLDER
const FOLDERS = ["documents", "references", "others"];

const route = (prop) => {
  const urlAPI = `/${prop.main_route}/${baseRoute}`;
  const serverError = "ម៉ាសុីនមេមានបញ្ហា សូមព្យាយាមម្តងទៀតពេលក្រោយ!";

  // ===================================== TEST CONNECTION ================================================
  prop.app.get(`${urlAPI}/ping`, prop.api_auth, prop.jwt_auth, async (req, res) => {
    try {
      const result = await ping();
      res.json({ success: true, message: "Cloudinary connected", data: result });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Cloudinary not connected",
        error: err.message || err.error?.message || err,
      });
    }
  });

  // ===================================== UPLOAD (multiple files) ================================================
  // form-data: files = <file> (repeat for many), folder = documents | references | others
  prop.app.post(
    `${urlAPI}`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    (req, res, next) => {
      upload.array("files", MAX_FILES)(req, res, (err) => {
        if (err) {
          const message =
            err.code === "LIMIT_FILE_SIZE"
              ? `ឯកសារធំពេក! (អតិបរមា ${MAX_FILE_MB}MB)`
              : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
                ? `អាចបញ្ចូលបានអតិបរមា ${MAX_FILES} ឯកសារ (field: files)`
                : err.message;
          return res.status(400).json({ success: false, message });
        }
        next();
      });
    },
    async (req, res) => {
      try {
        if (!req.files || req.files.length === 0) {
          return res.status(400).json({ success: false, message: "សូមជ្រើសរើសឯកសារ!" });
        }
        const folder = FOLDERS.includes(req.body.folder) ? req.body.folder : "documents";
        const data = await Promise.all(req.files.map((f) => uploadBuffer(f, folder)));
        res.status(201).json({ success: true, count: data.length, data });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: serverError,
          error: err.message || err.error?.message || err,
        });
      }
    },
  );

  // ===================================== SIGNATURE (direct upload from browser) ================================================
  prop.app.get(
    `${urlAPI}/signature`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    (req, res) => {
      const folder = FOLDERS.includes(req.query.folder) ? req.query.folder : "documents";
      res.json({ success: true, data: signUpload(folder) });
    },
  );

  // ===================================== DELETE FILE ================================================
  // body: { public_id, resource_type }
  prop.app.delete(
    `${urlAPI}`,
    prop.api_auth,
    prop.jwt_auth,
    prop.request_user,
    async (req, res) => {
      try {
        const { public_id, resource_type } = req.body || {};
        if (!public_id) {
          return res.status(400).json({ success: false, message: "សូមបញ្ចូល public_id" });
        }
        const result = await deleteFile(public_id, resource_type || "image");
        res.json({ success: result.result === "ok", data: result });
      } catch (err) {
        res.status(500).json({ success: false, message: serverError, error: err.message || err });
      }
    },
  );
};

module.exports = route;

// Cloudinary connection + helpers
// Needs in .env: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
// Optional:      CLOUDINARY_FOLDER (default "sdms")
let cloudinary;
try {
  cloudinary = require("cloudinary").v2;
} catch (e) {
  // Package not installed yet → run: npm install cloudinary
  const missing = () => {
    throw new Error("Cloudinary package not installed. Run: npm install cloudinary");
  };
  cloudinary = {
    config() {},
    uploader: { upload_stream: missing, destroy: missing },
    utils: { api_sign_request: missing },
    api: { ping: missing },
  };
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const BASE_FOLDER = process.env.CLOUDINARY_FOLDER || "sdms";

// Upload one file buffer (from multer memoryStorage) → file info to save in DB
// multer (busboy) reads names as latin1 → fix to UTF-8 only when that gives a valid result
function fixFileName(name = "") {
  const utf8 = Buffer.from(name, "latin1").toString("utf8");
  return utf8.includes("\ufffd") ? name : utf8;
}

function uploadBuffer(file, subFolder = "documents") {
  const originalName = fixFileName(file.originalname);
  const dot = originalName.lastIndexOf(".");
  const ext = dot > 0 ? originalName.slice(dot + 1).toLowerCase() : null;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${BASE_FOLDER}/${subFolder}`,
        resource_type: "auto", // images, pdf, word, excel, ...
        use_filename: true,
        unique_filename: true,
        filename_override: originalName, // keeps the name (and .xlsx/.docx extension for raw files)
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
          resource_type: result.resource_type,
          format: result.format || ext,
          bytes: result.bytes,
          original_name: originalName,
        });
      },
    );
    stream.end(file.buffer);
  });
}

// Delete a file by public_id
function deleteFile(public_id, resource_type = "image") {
  return cloudinary.uploader.destroy(public_id, { resource_type });
}

// Signature for uploading straight from the browser (skips the API size limit)
function signUpload(subFolder = "documents") {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `${BASE_FOLDER}/${subFolder}`;
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET,
  );
  return {
    timestamp,
    folder,
    signature,
    api_key: process.env.CLOUDINARY_API_KEY,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    upload_url: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
  };
}

async function ping() {
  return cloudinary.api.ping();
}

module.exports = { cloudinary, uploadBuffer, deleteFile, signUpload, ping };

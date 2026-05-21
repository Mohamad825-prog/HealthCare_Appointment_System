import fs from "fs";
import multer from "multer";
import path from "path";

const uploadDir = "uploads/service-results";
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, uniqueName + path.extname(file.originalname || ""));
    },
});

const allowedMimeTypes = new Set([
    "application/pdf",
    "image/png",
    "image/jpg",
    "image/jpeg",
    "image/webp",
]);

const fileFilter = (req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) {
        cb(null, true);
        return;
    }

    cb(new Error("Unsupported file type. Only PDF, PNG, JPG, JPEG, and WEBP files are allowed."), false);
};

const serviceResultUpload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});

export default serviceResultUpload;

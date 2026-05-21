import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

// Configure Cloudinary with your credentials
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Function to upload a file to Cloudinary
export async function uploadToCloudinary(filePath, folder = "Doctor", resourceType = "image") {
    try {
        const result = await cloudinary.uploader.upload(filePath, {
            folder,
            resource_type: resourceType,
        });

        return result;
    } catch (err) {
        console.error("Cloudinary upload error:", err);
        throw err;
    } finally {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}

// Function to delete an asset from Cloudinary
export async function deleteFromCloudinary(publicId, resourceType = "image") {
    try {
        if (!publicId) return;
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    }

    catch (err) {
        console.error("Cloudinary deletion error:", err);
        throw err;
    }
}

export default cloudinary;


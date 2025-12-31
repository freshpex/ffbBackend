import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import logger from "../middleware/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "uploads";

// Initialize Supabase client if credentials are available
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    logger.info("Supabase storage initialized successfully");
  } catch (error) {
    logger.warn("Failed to initialize Supabase storage, falling back to local storage:", error.message);
  }
}

// Local storage fallback
const UPLOADS_ROOT = path.join(__dirname, "..", "uploads");
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Upload to Supabase Storage
 */
async function uploadToSupabase(file, folder) {
  try {
    const timestamp = Date.now();
    const safeName = `${timestamp}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const filePath = `${folder}/${safeName}`;

    // Upload to Supabase bucket
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  } catch (error) {
    logger.error("Supabase upload error:", error);
    throw error;
  }
}

/**
 * Upload to local filesystem (fallback)
 */
async function uploadToLocal(file, folder) {
  try {
    ensureDir(UPLOADS_ROOT);
    const targetDir = path.join(UPLOADS_ROOT, folder);
    ensureDir(targetDir);

    const timestamp = Date.now();
    const safeName = `${timestamp}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const outPath = path.join(targetDir, safeName);

    // Write file buffer or move file
    if (file.buffer) {
      await fs.promises.writeFile(outPath, file.buffer);
    } else if (file.path) {
      await fs.promises.rename(file.path, outPath);
    } else {
      throw new Error("Unsupported file object: missing buffer or path");
    }

    // Return URL path (relative for local serving)
    const baseUrl = process.env.BACKEND_URL || "";
    return `${baseUrl}/uploads/${folder}/${safeName}`;
  } catch (error) {
    logger.error("Local upload error:", error);
    throw error;
  }
}

/**
 * uploadToS3
 * - Primary: Uses Supabase Storage when configured (works on Vercel)
 * - Fallback: Uses local filesystem when Supabase not configured
 * - Accepts a Multer file object and folder name
 * - Returns the public URL to the uploaded file
 */
export const uploadToS3 = async (file, folder = "general") => {
  try {
    // Try Supabase first if configured
    if (supabase) {
      try {
        return await uploadToSupabase(file, folder);
      } catch (supabaseError) {
        logger.warn(`Supabase upload failed, falling back to local: ${supabaseError.message}`);
        // Fall through to local storage
      }
    }

    // Use local storage as fallback
    return await uploadToLocal(file, folder);
  } catch (error) {
    logger.error("File upload failed:", error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

export default { uploadToS3 };

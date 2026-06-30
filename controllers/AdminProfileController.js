import User from "../models/User.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { ApiError } from "../middleware/errorHandler.js";
import logger from "../middleware/logger.js";
import { getAdminRecipientEmails, sendTemplateEmail } from "../services/emailService.js";

// Configure multer storage for admin profile images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads/admin-profile-images";

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "admin-profile-" + uniqueSuffix + ext);
  },
});

// File filter for image uploads
const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new ApiError("Only image files are allowed", 400), false);
  }
};

// Initialize multer upload middleware
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

// Get admin profile
export const getAdminProfile = async (req, res, next) => {
  try {
    const adminId = req.user._id;

    const admin = await User.findById(adminId).select(
      "-password -resetToken -resetTokenExpiry",
    );

    if (!admin || !["admin", "superadmin"].includes(admin.role)) {
      throw new ApiError("Admin not found", 404);
    }

    res.status(200).json({
      success: true,
      data: admin,
    });
  } catch (error) {
    next(error);
  }
};

// Update admin profile
export const updateAdminProfile = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const { firstName, lastName, email, phone } = req.body;

    // Validate admin status
    const admin = await User.findById(adminId);
    if (!admin || !["admin", "superadmin"].includes(admin.role)) {
      throw new ApiError("Admin not found", 404);
    }

    // Update admin profile
    const updatedAdmin = await User.findByIdAndUpdate(
      adminId,
      {
        $set: {
          firstName,
          lastName,
          email,
          phone,
        },
      },
      { new: true, runValidators: true },
    ).select("-password -resetToken -resetTokenExpiry");

    res.status(200).json({
      success: true,
      data: updatedAdmin,
      message: "Admin profile updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

// Upload admin profile image
export const uploadAdminProfileImage = async (req, res, next) => {
  try {
    const adminId = req.user._id;

    // Validate admin status
    const admin = await User.findById(adminId);
    if (!admin || !["admin", "superadmin"].includes(admin.role)) {
      throw new ApiError("Admin not found", 404);
    }

    if (!req.file) {
      throw new ApiError("No image file uploaded", 400);
    }

    // Get file path and create URL
    const filePath = req.file.path.replace(/\\/g, "/"); // Replace backslashes with forward slashes
    const imageUrl = `${req.protocol}://${req.get("host")}/${filePath}`;

    // Update admin with new image URL
    const updatedAdmin = await User.findByIdAndUpdate(
      adminId,
      {
        $set: {
          profileImage: imageUrl,
        },
      },
      { new: true },
    ).select("-password -resetToken -resetTokenExpiry");

    res.status(200).json({
      success: true,
      data: {
        imageUrl,
        admin: updatedAdmin,
      },
      message: "Admin profile image uploaded successfully",
    });
  } catch (error) {
    next(error);
  }
};

// Change admin password
export const changeAdminPassword = async (req, res, next) => {
  try {
    const adminId = req.user?._id;
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      throw new ApiError(
        "Current password and new password are required",
        400,
        "validation_error",
      );
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      throw new ApiError(
        "New password must be at least 8 characters long",
        400,
        "validation_error",
      );
    }

    const admin = await User.findById(adminId);
    if (!admin || !["admin", "superadmin"].includes(admin.role)) {
      throw new ApiError("Admin not found", 404, "not_found");
    }

    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch) {
      throw new ApiError("Current password is incorrect", 400, "invalid_password");
    }

    admin.password = newPassword;
    await admin.save();

    // Send notifications
    try {
      const time = new Date().toISOString();
      const ip = req.ip || req.headers["x-forwarded-for"] || "";
      const userAgent = req.headers["user-agent"] || "";

      // Notify the admin whose password changed
      if (admin.email) {
        sendTemplateEmail({
          templateKey: "password_changed_user",
          to: admin.email,
          variables: {
            name: `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || "Admin",
            time,
            ip,
            userAgent,
          },
          customId: "event:password-changed:admin-self",
        }).catch((err) => {
          logger.error("Failed to send admin password changed email", {
            message: err?.message,
            adminId: admin._id?.toString(),
          });
        });
      }

      // Notify other admins
      const adminEmails = await getAdminRecipientEmails();
      if (adminEmails.length) {
        sendTemplateEmail({
          templateKey: "password_changed_admin",
          to: adminEmails,
          variables: {
            name: `${admin.firstName || ""} ${admin.lastName || ""}`.trim() || "(no name)",
            email: admin.email,
            userId: admin._id?.toString(),
            time,
            ip,
            userAgent,
          },
          customId: "event:password-changed:admin-notify",
        }).catch((err) => {
          logger.error("Failed to send admin password changed admin-notify email", {
            message: err?.message,
            adminId: admin._id?.toString(),
          });
        });
      }
    } catch (err) {
      logger.error("Admin password change email setup failed", {
        message: err?.message,
        adminId: admin._id?.toString(),
      });
    }

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    next(error);
  }
};

// Get admin preferences/settings
export const getAdminPreferences = async (req, res, next) => {
  try {
    const adminId = req.user?._id;
    const admin = await User.findById(adminId).select("settings role");

    if (!admin || !["admin", "superadmin"].includes(admin.role)) {
      throw new ApiError("Admin not found", 404, "not_found");
    }

    res.status(200).json({
      success: true,
      data: admin.settings || {},
    });
  } catch (error) {
    next(error);
  }
};

// Update admin preferences/settings
export const updateAdminPreferences = async (req, res, next) => {
  try {
    const adminId = req.user?._id;
    const { settings } = req.body || {};

    if (!settings || typeof settings !== "object") {
      throw new ApiError("Settings object is required", 400, "validation_error");
    }

    const admin = await User.findById(adminId);
    if (!admin || !["admin", "superadmin"].includes(admin.role)) {
      throw new ApiError("Admin not found", 404, "not_found");
    }

    // Merge allowed settings only
    admin.settings = {
      ...(admin.settings || {}),
      ...settings,
      notifications: {
        ...(admin.settings?.notifications || {}),
        ...(settings.notifications || {}),
        email: settings.notifications?.email ?? admin.settings?.notifications?.email,
        app: settings.notifications?.app ?? admin.settings?.notifications?.app,
      },
    };

    await admin.save();

    res.status(200).json({
      success: true,
      message: "Preferences updated successfully",
      data: admin.settings || {},
    });
  } catch (error) {
    next(error);
  }
};

export default {
  upload,
  getAdminProfile,
  updateAdminProfile,
  uploadAdminProfileImage,
  changeAdminPassword,
  getAdminPreferences,
  updateAdminPreferences,
};

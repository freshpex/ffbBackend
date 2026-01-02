import User from "../models/User.js";
import Investment from "../models/Investment.js";
import Transaction from "../models/Transaction.js";
import multer from "multer";
import { ApiError } from "../middleware/errorHandler.js";
import logger from "../middleware/logger.js";
import { uploadToS3 } from "../services/storageService.js";

const storage = multer.memoryStorage();

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

const serializeUserProfile = (user) => {
  if (!user) return null;

  // Support both legacy string address and current object address
  const addressValue =
    typeof user.address === "string"
      ? user.address
      : user.address?.street || "";

  return {
    id: user._id?.toString?.() || user.id,
    email: user.email || "",
    username: user.username || "",
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    profileImage: user.profileImage || "",
    phone: user.phone || user.phoneNumber || "",
    address: addressValue,
    country: user.country || "",
    balance: user.balance || 0,
    accountBalance: user.balance || 0,
    kycStatus: user.kycStatus,
    kycVerified: user.kycVerified,
    kycVerifiedAt: user.kycVerifiedAt,
    kycNotes: user.kycNotes,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId)
      .select("-password -__v -refreshToken")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: serializeUserProfile(user),
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get user account summary (may include balance, investments, etc)
export const getAccountSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get user data
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get investments count and total
    const investments = await Investment.find({ user: userId });
    const investmentTotal = investments.reduce(
      (sum, inv) => sum + inv.amount,
      0,
    );

    // Get transaction stats
    const deposits = await Transaction.find({
      user: userId,
      type: "deposit",
      status: "completed",
    });
    const withdrawals = await Transaction.find({
      user: userId,
      type: "withdrawal",
      status: "completed",
    });

    const depositTotal = deposits.reduce((sum, dep) => sum + dep.amount, 0);
    const withdrawalTotal = withdrawals.reduce(
      (sum, wit) => sum + wit.amount,
      0,
    );

    // Create summary object
    const summary = {
      balance: user.balance || "N/A",
      investmentCount: investments.length,
      investmentTotal,
      depositTotal,
      withdrawalTotal,
      lastLogin: user.lastLoginAt,
      accountStatus: user.status,
      kycVerified: user.kycVerified,
    };

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

// Update user profile
export const updateUserProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { firstName, lastName, phone, phoneNumber, address, country } =
      req.body;

    const existing = await User.findById(userId).select("address").lean();

    const resolvedPhone = phone ?? phoneNumber;

    const $set = {
      firstName,
      lastName,
      phone: resolvedPhone,
      country,
    };

    if (typeof address === "string") {
      // If legacy users have `address` stored as a string, MongoDB can't set `address.street`.
      // In that case replace `address` with an object.
      if (typeof existing?.address === "string") {
        $set.address = { street: address };
      } else {
        $set["address.street"] = address;
      }
    } else if (address && typeof address === "object") {
      $set.address = address;
    }

    // Find user and update
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set,
      },
      { new: true, runValidators: true },
    ).select("-password -resetToken -resetTokenExpiry");

    if (!user) {
      throw new ApiError("User not found", 404);
    }

    res.status(200).json({
      success: true,
      data: serializeUserProfile(user),
      message: "Profile updated successfully",
    });
  } catch (error) {
    logger.error("Error updating user profile:", error);
    next(error);
  }
};

// Upload profile image
export const uploadProfileImage = async (req, res, next) => {
  try {
    const userId = req.user._id;

    if (!req.file) {
      throw new ApiError("No image file uploaded", 400);
    }

    // Upload to Supabase (or local fallback) and store public URL
    const imageUrl = await uploadToS3(req.file, "profile-images");

    // Update user with new image URL
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          profileImage: imageUrl,
        },
      },
      { new: true },
    ).select("-password -resetToken -resetTokenExpiry");

    if (!user) {
      throw new ApiError("User not found", 404);
    }

    res.status(200).json({
      success: true,
      data: {
        ...serializeUserProfile(user),
        // Keep these for backward compatibility
        profileImage: imageUrl,
        imageUrl,
      },
      message: "Profile image uploaded successfully",
    });
  } catch (error) {
    next(error);
  }
};

// Add a new controller method to get user balance
export const getUserBalance = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch user data including the balance
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        balance: user.balance || "N/A",
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  upload,
  getUserProfile,
  updateUserProfile,
  uploadProfileImage,
  getUserBalance,
  getAccountSummary,
};

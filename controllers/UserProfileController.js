import User from "../models/User.js";
import Investment from "../models/Investment.js";
import Transaction from "../models/Transaction.js";
import multer from "multer";
import mongoose from "mongoose";
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
    accountNumber: user.accountNumber || "",
    balance: user.balance || 0,
    bonusBalance: user.bonusBalance || 0,
    accountBalance: user.balance || 0,
    kycStatus: user.kycStatus,
    kycVerified: user.kycVerified,
    kycVerifiedAt: user.kycVerifiedAt,
    kycNotes: user.kycNotes,
    status: user.status || "active",
    hasWithdrawalPin: !!user.withdrawalPinHash,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

const BONUS_CONVERSION_MIN_DEPOSIT = 200;
const BONUS_CONVERSION_MIN_AMOUNT_FIRST = 300;
const BONUS_CONVERSION_MIN_AMOUNT_SUBSEQUENT = 1000;

const getUserIdFromReq = (req) => req.user?._id || req.user?.id;

const getCompletedDepositTotal = async (userId, session) => {
  const matchUserId =
    typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

  const pipeline = [
    {
      $match: {
        user: matchUserId,
        type: "deposit",
        status: "completed",
        currency: { $in: ["USD", "USDT"] },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ];

  const query = Transaction.aggregate(pipeline);
  if (session) query.session(session);

  const agg = await query;

  return agg[0]?.total || 0;
};

const getHasConvertedBonusBefore = async (userId, session) => {
  const matchUserId =
    typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

  const query = Transaction.exists({
    user: matchUserId,
    type: "bonus",
    "metadata.kind": "bonus_conversion",
  });

  if (session) query.session(session);

  const exists = await query;
  return !!exists;
};

const getMinBonusConversionAmount = (hasConvertedBefore) =>
  hasConvertedBefore
    ? BONUS_CONVERSION_MIN_AMOUNT_SUBSEQUENT
    : BONUS_CONVERSION_MIN_AMOUNT_FIRST;

export const getBonusConversionStatus = async (req, res, next) => {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) throw new ApiError("Unauthorized", 401, "unauthorized");

    const [user, depositTotal, hasConvertedBefore] = await Promise.all([
      User.findById(userId).select("balance bonusBalance").lean(),
      getCompletedDepositTotal(userId),
      getHasConvertedBonusBefore(userId),
    ]);

    if (!user) throw new ApiError("User not found", 404, "not_found");

    const depositEligible = depositTotal >= BONUS_CONVERSION_MIN_DEPOSIT;
    const minBonusConversionAmount = getMinBonusConversionAmount(
      hasConvertedBefore,
    );
    const bonusMeetsMinimum =
      Number(user.bonusBalance || 0) >= Number(minBonusConversionAmount);

    // Keep "eligible" backwards-compatible with the deposit eligibility gate.
    const eligible = depositEligible;

    res.status(200).json({
      success: true,
      data: {
        balance: user.balance || 0,
        bonusBalance: user.bonusBalance || 0,
        depositTotal,
        minDepositRequired: BONUS_CONVERSION_MIN_DEPOSIT,
        hasConvertedBefore,
        minBonusConversionAmount,
        bonusMeetsMinimum,
        depositEligible,
        eligible,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const convertBonusBalance = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = getUserIdFromReq(req);
    if (!userId) throw new ApiError("Unauthorized", 401, "unauthorized");

    const user = await User.findById(userId)
      .select("balance bonusBalance")
      .session(session);

    if (!user) throw new ApiError("User not found", 404, "not_found");

    const depositTotal = await getCompletedDepositTotal(userId, session);
    if (depositTotal < BONUS_CONVERSION_MIN_DEPOSIT) {
      throw new ApiError(
        `You must have at least ${BONUS_CONVERSION_MIN_DEPOSIT} USDT in completed deposits before converting bonus balance`,
        403,
        "bonus_not_eligible",
      );
    }

    const hasConvertedBefore = await getHasConvertedBonusBefore(userId, session);
    const minBonusConversionAmount = getMinBonusConversionAmount(
      hasConvertedBefore,
    );

    const requestedAmount = req.body?.amount;
    const amount =
      requestedAmount === undefined || requestedAmount === null || requestedAmount === ""
        ? Number(user.bonusBalance || 0)
        : Number(requestedAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError("Valid conversion amount is required", 400, "validation_error");
    }

    if (amount < minBonusConversionAmount) {
      const err = new ApiError(
        `Minimum bonus conversion amount is ${minBonusConversionAmount} USDT${hasConvertedBefore ? " for subsequent conversions" : " for your first conversion"}`,
        400,
        "bonus_conversion_minimum_not_met",
      );
      err.details = {
        minBonusConversionAmount,
        hasConvertedBefore,
        requestedAmount: amount,
        bonusBalance: Number(user.bonusBalance || 0),
      };
      throw err;
    }

    if ((user.bonusBalance || 0) < amount) {
      throw new ApiError("Insufficient bonus balance", 400, "insufficient_bonus_balance");
    }

    const convertedAmount = parseFloat((amount * 0.5).toFixed(2));

    const updated = await User.findOneAndUpdate(
      { _id: userId, bonusBalance: { $gte: amount } },
      { $inc: { bonusBalance: -amount, balance: convertedAmount } },
      { session, new: true },
    );

    if (!updated) {
      throw new ApiError("Insufficient bonus balance", 400, "insufficient_bonus_balance");
    }

    await Transaction.create(
      [
        {
          user: userId,
          type: "bonus",
          amount: convertedAmount,
          currency: "USD",
          status: "completed",
          method: "internal",
          description: "Converted bonus balance to main balance (50% conversion rate)",
          processedAt: new Date(),
          metadata: {
            kind: "bonus_conversion",
            depositTotal,
            minDepositRequired: BONUS_CONVERSION_MIN_DEPOSIT,
            minBonusConversionAmount,
            hasConvertedBefore,
            originalBonusAmount: amount,
            convertedAmount,
            conversionRate: 0.5,
          },
        },
      ],
      { session },
    );

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Bonus balance converted successfully (50% conversion rate applied)",
      data: {
        originalBonusAmount: amount,
        convertedAmount,
        conversionRate: 0.5,
        balance: updated.balance || 0,
        bonusBalance: updated.bonusBalance || 0,
        depositTotal,
        minDepositRequired: BONUS_CONVERSION_MIN_DEPOSIT,
        minBonusConversionAmount,
        hasConvertedBefore,
        eligible: true,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error converting bonus balance:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select("-password -__v -refreshToken +withdrawalPinHash");
    if (user && !user.accountNumber) {
      try {
        user.accountNumber = await user.constructor.generateUniqueAccountNumber();
        await user.save();
      } catch (e) {
        logger.warn(`Failed to backfill account number for user ${userId}: ${e.message}`);
      }
    }

    const userObj = user ? user.toObject() : null;

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: serializeUserProfile(userObj),
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
      bonusBalance: user.bonusBalance || 0,
      investmentCount: investments.length,
      investmentTotal,
      depositTotal,
      withdrawalTotal,
      bonusConversionEligible: depositTotal >= BONUS_CONVERSION_MIN_DEPOSIT,
      bonusConversionMinDepositRequired: BONUS_CONVERSION_MIN_DEPOSIT,
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
  getBonusConversionStatus,
  convertBonusBalance,
};

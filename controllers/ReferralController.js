import Referral from "../models/Referral.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import mongoose from "mongoose";
import crypto from "crypto";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

// Get current user's referral code
export const getReferralCode = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    // If user doesn't have a referral code, generate one
    if (!user.referralCode) {
      user.referralCode = crypto.randomBytes(4).toString("hex").toUpperCase();
      await user.save();
    }

    res.status(200).json({
      success: true,
      data: {
        referralCode: user.referralCode,
        referralLink: `${process.env.FRONTEND_URL || "http://localhost:5172"}/register?ref=${user.referralCode}`,
      },
    });
  } catch (error) {
    logger.error("Error getting referral code:", error);
    next(error);
  }
};

// Get user's referrals
export const getUserReferrals = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = { referrer: req.user._id };

    if (status) {
      query.status = status;
    }

    // Execute query with pagination
    const total = await Referral.countDocuments(query);
    const referrals = await Referral.find(query)
      .populate("referee", "firstName lastName email createdAt")
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Get statistics
    const totalReferrals = await Referral.countDocuments({
      referrer: req.user._id,
    });
    const completedReferrals = await Referral.countDocuments({
      referrer: req.user._id,
      status: "completed",
    });

    // Get total earnings
    const totalEarnings = await Referral.aggregate([
      {
        $match: {
          referrer: new mongoose.Types.ObjectId(req.user._id),
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$rewards.referrerBonus" },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        referrals,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
        stats: {
          totalReferrals,
          completedReferrals,
          pendingReferrals: totalReferrals - completedReferrals,
          totalEarnings: totalEarnings[0]?.total || 0,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching user referrals:", error);
    next(error);
  }
};

// Apply referral code during registration
export const applyReferralCode = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { referralCode, userId } = req.body;

    if (!referralCode || !userId) {
      throw new ApiError(
        "Referral code and user ID are required",
        400,
        "validation_error",
      );
    }

    // Find referrer by referral code
    const referrer = await User.findOne({ referralCode }).session(session);

    if (!referrer) {
      throw new ApiError("Invalid referral code", 404, "not_found");
    }

    // Ensure referrer is not the same as referee
    if (referrer._id.toString() === userId) {
      throw new ApiError("You cannot refer yourself", 400, "invalid_operation");
    }

    // Find the referee
    const referee = await User.findById(userId).session(session);

    if (!referee) {
      throw new ApiError("Referee user not found", 404, "not_found");
    }

    // Check if referee already has a referral
    const existingReferral = await Referral.findOne({
      referee: userId,
    }).session(session);

    if (existingReferral) {
      throw new ApiError(
        "User already has a referral",
        400,
        "duplicate_referral",
      );
    }

    // Create referral record
    const referral = new Referral({
      referrer: referrer._id,
      referee: referee._id,
      code: referralCode,
      status: "pending",
      rewards: {
        referrerBonus: 50,
        refereeBonus: 25,
        currency: "USD",
      },
    });

    await referral.save({ session });

    // Update referee with referrer info
    referee.referredBy = referrer._id;
    await referee.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: "Referral applied successfully",
      data: referral,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error applying referral code:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Complete a referral (called when referee completes certain actions like deposit)
export const completeReferral = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { referralId } = req.params;

    const referral = await Referral.findById(referralId)
      .populate("referrer")
      .populate("referee")
      .session(session);

    if (!referral) {
      throw new ApiError("Referral not found", 404, "not_found");
    }

    if (referral.status !== "pending") {
      throw new ApiError(
        `Referral is already ${referral.status}`,
        400,
        "invalid_status",
      );
    }

    // Update referral status
    referral.status = "completed";
    referral.completedAt = new Date();

    await referral.save({ session });

    // Credit referrer with the bonus
    const referrer = referral.referrer;
    referrer.balance += referral.rewards.referrerBonus;
    await referrer.save({ session });

    // Create transaction record for referrer
    const referrerTransaction = new Transaction({
      user: referrer._id,
      type: "bonus",
      amount: referral.rewards.referrerBonus,
      currency: referral.rewards.currency,
      status: "completed",
      method: "referral",
      description: `Referral bonus for referring ${referral.referee.email}`,
      reference: referral._id.toString(),
      processedAt: new Date(),
    });

    await referrerTransaction.save({ session });

    // Credit referee with the bonus
    const referee = referral.referee;
    referee.balance += referral.rewards.refereeBonus;
    await referee.save({ session });

    // Create transaction record for referee
    const refereeTransaction = new Transaction({
      user: referee._id,
      type: "bonus",
      amount: referral.rewards.refereeBonus,
      currency: referral.rewards.currency,
      status: "completed",
      method: "referral",
      description: "Welcome bonus from referral",
      reference: referral._id.toString(),
      processedAt: new Date(),
    });

    await refereeTransaction.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Referral completed successfully",
      data: referral,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error completing referral ${req.params.referralId}:`, error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Generate referral link
export const generateReferralLink = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    if (!user.referralCode) {
      user.referralCode = crypto.randomBytes(4).toString("hex").toUpperCase();
      await user.save();
    }

    const baseUrl = process.env.FRONTEND_URL || "https://ffbroker.vercel.app";
    const referralLink = `${baseUrl}/register?ref=${user.referralCode}`;

    res.status(200).json({
      success: true,
      data: {
        referralCode: user.referralCode,
        referralLink,
      },
    });
  } catch (error) {
    logger.error("Error generating referral link:", error);
    next(error);
  }
};

// Get referral program details
export const getReferralProgram = async (req, res, next) => {
  try {
    const referralProgram = {
      details: {
        referrerBonus: 50, // USD
        refereeBonus: 25, // USD
        maxReferrals: 50, // Maximum number of referrals per user
        requirements: [
          "Referee must complete KYC verification",
          "Referee must make a minimum deposit of $100",
          "Both referrer and referee accounts must be in good standing",
        ],
        terms: [
          "Bonuses are credited once all requirements are met",
          "The company reserves the right to modify or terminate the program at any time",
          "Fraudulent referrals will result in account suspension and forfeiture of bonuses",
          "Self-referrals are not permitted",
        ],
      },
      tiers: [
        {
          level: 1,
          name: "Bronze",
          minReferrals: 0,
          maxReferrals: 5,
          bonusMultiplier: 1.0,
          benefits: ["Basic referral bonus"],
        },
        {
          level: 2,
          name: "Silver",
          minReferrals: 5,
          maxReferrals: 15,
          bonusMultiplier: 1.25,
          benefits: [
            "25% increased referral bonus",
            "Priority customer support",
          ],
        },
        {
          level: 3,
          name: "Gold",
          minReferrals: 15,
          maxReferrals: 30,
          bonusMultiplier: 1.5,
          benefits: [
            "50% increased referral bonus",
            "Reduced trading fees",
            "Premium educational content",
          ],
        },
        {
          level: 4,
          name: "Platinum",
          minReferrals: 30,
          maxReferrals: 50,
          bonusMultiplier: 2.0,
          benefits: [
            "100% increased referral bonus",
            "VIP customer support",
            "Exclusive investment opportunities",
          ],
        },
      ],
      steps: [
        {
          step: 1,
          title: "Get Your Referral Link",
          description: "Obtain your unique referral link from your dashboard.",
        },
        {
          step: 2,
          title: "Share With Friends",
          description:
            "Share your referral link via email, social media, or messaging apps.",
        },
        {
          step: 3,
          title: "Friends Sign Up",
          description:
            "When friends use your link to sign up, they become your referrals.",
        },
        {
          step: 4,
          title: "Earn Rewards",
          description:
            "Both you and your friends earn bonuses once requirements are met.",
        },
      ],
    };

    res.status(200).json({
      success: true,
      data: referralProgram,
    });
  } catch (error) {
    logger.error("Error fetching referral program details:", error);
    next(error);
  }
};

export default {
  getReferralCode,
  getUserReferrals,
  applyReferralCode,
  completeReferral,
  getReferralProgram,
  generateReferralLink,
};

import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  getReferralCode,
  getUserReferrals,
  applyReferralCode,
  completeReferral,
  getReferralProgram,
  generateReferralLink,
  getCommissionHistory,
} from "../controllers/ReferralController.js";

const router = express.Router();

// Get referral program details - public route
router.get("/program", asyncHandler(getReferralProgram));

// Apply authentication middleware to protected routes
router.use(verifyToken);

// Get current user's referral code
router.get("/code", asyncHandler(getReferralCode));

// Get commission history
router.get("/commissions", asyncHandler(getCommissionHistory));

// Generate referral link
router.post("/generate-link", asyncHandler(generateReferralLink));

// Get user's referrals
router.get("/", asyncHandler(getUserReferrals));

// Apply referral code
router.post("/apply", asyncHandler(applyReferralCode));

// Complete a referral (typically called by system)
router.put("/:referralId/complete", asyncHandler(completeReferral));

export default router;

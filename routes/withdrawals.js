import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  getUserWithdrawals,
  getWithdrawalById,
  createWithdrawal,
  createInternalTransfer,
  cancelWithdrawal,
  getWithdrawalMethods,
  getWithdrawalStats,
} from "../controllers/WithdrawalController.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);

// Get all user withdrawals
router.get("/", asyncHandler(getUserWithdrawals));

router.get("/history", asyncHandler(getUserWithdrawals));

// Get withdrawal stats
router.get("/stats", asyncHandler(getWithdrawalStats));

// Get available withdrawal methods
router.get("/methods", asyncHandler(getWithdrawalMethods));

// Create new withdrawal request
router.post("/", asyncHandler(createWithdrawal));

// Internal transfer (send to another user by account number)
router.post("/transfer", asyncHandler(createInternalTransfer));

// Get specific withdrawal by ID
router.get("/:id", asyncHandler(getWithdrawalById));

// Cancel withdrawal
router.put("/:id/cancel", asyncHandler(cancelWithdrawal));

export default router;

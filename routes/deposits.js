import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  getUserDeposits,
  getDepositById,
  createDeposit,
  cancelDeposit,
  getDepositMethods,
  getDepositStats,
} from "../controllers/DepositController.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);

// Get all user deposits
router.get("/", asyncHandler(getUserDeposits));

router.get("/history", asyncHandler(getUserDeposits));

// Get deposit stats
router.get("/stats", asyncHandler(getDepositStats));

// Get available deposit methods
router.get("/methods", asyncHandler(getDepositMethods));

// Create new deposit request
router.post("/", asyncHandler(createDeposit));

// Get specific deposit by ID
router.get("/:id", asyncHandler(getDepositById));

// Cancel deposit
router.put("/:id/cancel", asyncHandler(cancelDeposit));

export default router;

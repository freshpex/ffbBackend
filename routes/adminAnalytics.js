import express from "express";
import { verifyToken, verifyAdmin } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  getAnalyticsOverview,
  getUserGrowthAnalytics,
  getFinancialAnalytics,
  getTransactionAnalytics,
  getPerformanceAnalytics,
} from "../controllers/AdminAnalyticsController.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);
router.use(verifyAdmin);

// Get analytics overview for dashboard
router.get("/overview", asyncHandler(getAnalyticsOverview));

// Get user growth analytics
router.get("/users", asyncHandler(getUserGrowthAnalytics));

// Get financial analytics
router.get("/financial", asyncHandler(getFinancialAnalytics));

// Get transaction analytics
router.get("/transactions", asyncHandler(getTransactionAnalytics));

// Get performance analytics
router.get("/performance", asyncHandler(getPerformanceAnalytics));

export default router;

import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getAccountSummary,
  getRecentTransactions,
  getFinancialHighlights,
  getMarketPulse,
  getDashboardData
} from '../controllers/DashboardController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);

// Get all dashboard data in a single request
router.get('/', asyncHandler(getDashboardData));

// Get account summary
router.get('/account-summary', asyncHandler(getAccountSummary));

// Get recent transactions
router.get('/recent-transactions', asyncHandler(getRecentTransactions));

// Get financial highlights
router.get('/financial-highlights', asyncHandler(getFinancialHighlights));

// Get market pulse data
router.get('/market-pulse', asyncHandler(getMarketPulse));

export default router;

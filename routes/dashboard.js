import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getDashboardOverview,
  getRecentTransactions,
  getFinancialHighlights,
  getMarketOverview,
  getMarketPulse,
  getMarketNews,
  getAccountSummary
} from '../controllers/DashboardController.js';

const router = express.Router();

// Get dashboard overview (combines multiple data points)
router.get('/', verifyToken, asyncHandler(getDashboardOverview));

// Get account summary
router.get('/account-summary', verifyToken, asyncHandler(getAccountSummary));

// Get recent transactions
router.get('/transactions', verifyToken, asyncHandler(getRecentTransactions));

// Get recent transactions (alternative path)
router.get('/recent-transactions', verifyToken, asyncHandler(getRecentTransactions));

// Get financial highlights
router.get('/financial-highlights', verifyToken, asyncHandler(getFinancialHighlights));

// Get market overview
router.get('/market-overview', verifyToken, asyncHandler(getMarketOverview));

// Get market pulse
router.get('/market-pulse', verifyToken, asyncHandler(getMarketPulse));

// Get market news
router.get('/market-news', verifyToken, asyncHandler(getMarketNews));

export default router;

import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getInvestmentPlans,
  getInvestmentPlanById,
  getUserInvestments,
  createInvestment,
  getInvestmentById,
  getInvestmentStatistics
} from '../controllers/InvestmentController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);

// Get all investment plans
router.get('/plans', asyncHandler(getInvestmentPlans));

// Get specific investment plan
router.get('/plans/:id', asyncHandler(getInvestmentPlanById));

// Get investment statistics
router.get('/statistics', asyncHandler(getInvestmentStatistics));

// Add the new user statistics endpoint
router.get('/user/statistics', asyncHandler(getInvestmentStatistics));

// Get user's investments with specific routes
router.get('/user-investments', asyncHandler(getUserInvestments));
router.get('/user', asyncHandler(getUserInvestments));

// Get user's investments (default route)
router.get('/', asyncHandler(getUserInvestments));

// Create a new investment
router.post('/', asyncHandler(createInvestment));

// Get specific investment details
router.get('/:id', asyncHandler(getInvestmentById));

export default router;

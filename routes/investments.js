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

// Add this specific route for user investments BEFORE the :id route
router.get('/user-investments', verifyToken, asyncHandler(getUserInvestments));

// Get specific investment plan
router.get('/plans/:id', asyncHandler(getInvestmentPlanById));

// Get user's investments
router.get('/', asyncHandler(getUserInvestments));

// Create a new investment
router.post('/', asyncHandler(createInvestment));

// Get specific investment details
router.get('/:id', asyncHandler(getInvestmentById));

// Get investment statistics
router.get('/statistics', asyncHandler(getInvestmentStatistics));

export default router;

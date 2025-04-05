import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getInvestmentPlans,
  getInvestmentPlanById,
  getUserInvestments,
  createInvestment,
  getInvestmentById
} from '../controllers/InvestmentController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);

// Get all investment plans
router.get('/plans', asyncHandler(getInvestmentPlans));

// Get specific investment plan
router.get('/plans/:id', asyncHandler(getInvestmentPlanById));

// Get user's investments
router.get('/', asyncHandler(getUserInvestments));

// Create a new investment
router.post('/', asyncHandler(createInvestment));

// Get specific investment details
router.get('/:id', asyncHandler(getInvestmentById));

export default router;

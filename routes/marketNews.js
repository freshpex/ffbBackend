import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getMarketNews,
  getNewsById,
  getLatestNews
} from '../controllers/MarketNewsController.js';

const router = express.Router();

// Public route for latest news
router.get('/latest', asyncHandler(getLatestNews));

// Apply authentication middleware to protected routes
router.use(verifyToken);

// Get all market news with filtering
router.get('/', asyncHandler(getMarketNews));

// Get specific news by ID
router.get('/:id', asyncHandler(getNewsById));

export default router;

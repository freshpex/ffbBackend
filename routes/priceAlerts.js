import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getUserPriceAlerts,
  createPriceAlert,
  updatePriceAlert,
  deletePriceAlert
} from '../controllers/PriceAlertController.js';

const router = express.Router();

// Get user's price alerts
router.get('/', verifyToken, asyncHandler(getUserPriceAlerts));

// Create new price alert
router.post('/', verifyToken, asyncHandler(createPriceAlert));

// Update price alert
router.patch('/:id', verifyToken, asyncHandler(updatePriceAlert));

// Delete price alert
router.delete('/:id', verifyToken, asyncHandler(deletePriceAlert));

export default router;

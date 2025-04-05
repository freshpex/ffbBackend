import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getUserAlerts,
  createAlert,
  updateAlert,
  deleteAlert
} from '../controllers/PriceAlertController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);

// Get all price alerts for current user
router.get('/', asyncHandler(getUserAlerts));

// Create new price alert
router.post('/', asyncHandler(createAlert));

// Update price alert
router.put('/:id', asyncHandler(updateAlert));

// Delete price alert
router.delete('/:id', asyncHandler(deleteAlert));

export default router;

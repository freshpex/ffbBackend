import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getUserATMCards,
  getATMCardById,
  createATMCardRequest,
  updateATMCardLimits,
  cancelATMCardRequest,
  getATMCardRequests
} from '../controllers/ATMCardsController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);

// Get all ATM cards for a user
router.get('/', asyncHandler(getUserATMCards));

// Get ATM card details by ID
router.get('/:id', asyncHandler(getATMCardById));

// Create a new ATM card request
router.post('/', asyncHandler(createATMCardRequest));

// Update ATM card limits
router.put('/:id/limits', asyncHandler(updateATMCardLimits));

// Cancel ATM card request
router.put('/:id/cancel', asyncHandler(cancelATMCardRequest));

// Get ATM card requests
router.get('/requests', asyncHandler(getATMCardRequests));

export default router;

import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getUserWithdrawals,
  getWithdrawalById,
  createWithdrawal,
  cancelWithdrawal,
  getWithdrawalMethods,
  getWithdrawalStats
} from '../controllers/WithdrawalController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);

// Get all user withdrawals
router.get('/', asyncHandler(getUserWithdrawals));

// Get withdrawal stats
router.get('/stats', asyncHandler(getWithdrawalStats));

// Get available withdrawal methods
router.get('/methods', asyncHandler(getWithdrawalMethods));

// Create new withdrawal request
router.post('/', asyncHandler(createWithdrawal));

// Get specific withdrawal by ID
router.get('/:id', asyncHandler(getWithdrawalById));

// Cancel withdrawal
router.put('/:id/cancel', asyncHandler(cancelWithdrawal));

export default router;

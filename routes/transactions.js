import express from 'express';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import mongoose from 'mongoose';
import logger from '../middleware/logger.js';

const router = express.Router();

// Get all user's transactions
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { type, status, page = 1, limit = 10 } = req.query;
    
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized - Authentication required' });
    }
    
    const query = { user: req.user._id };
    
    if (type) {
      query.type = type;
    }
    
    if (status) {
      query.status = status;
    }
    
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const total = await Transaction.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
}));

// Get user's deposits
router.get('/deposits', asyncHandler(async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized - Authentication required' });
    }
    
    const query = { 
      user: req.user._id,
      type: 'deposit'
    };
    
    if (status) {
      query.status = status;
    }
    
    const deposits = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const total = await Transaction.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        deposits,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching deposits:', error);
    res.status(500).json({ message: 'Server error' });
  }
}));

// Get user's withdrawals
router.get('/withdrawals', asyncHandler(async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized - Authentication required' });
    }
    
    const query = { 
      user: req.user._id,
      type: 'withdrawal'
    };
    
    if (status) {
      query.status = status;
    }
    
    const withdrawals = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const total = await Transaction.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        withdrawals,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ message: 'Server error' });
  }
}));

// Create deposit request
router.post('/deposit', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized - Authentication required' });
    }
    
    const { amount, method, walletAddress, currency = 'USD' } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid deposit amount' });
    }
    
    if (!method) {
      return res.status(400).json({ message: 'Payment method is required' });
    }
    
    const transaction = new Transaction({
      user: req.user._id,
      type: 'deposit',
      amount,
      currency,
      method,
      walletAddress,
      status: 'pending',
      description: `Deposit via ${method}`
    });
    
    await transaction.save({ session });
    
    await session.commitTransaction();
    
    res.status(201).json({
      success: true,
      message: 'Deposit request created successfully',
      data: transaction
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating deposit:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
});

// Create withdrawal request
router.post('/withdrawal', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized - Authentication required' });
    }
    
    const { amount, method, walletAddress, bankDetails, paypalEmail, cryptoType, currency = 'USD' } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid withdrawal amount' });
    }
    
    if (!method) {
      return res.status(400).json({ message: 'Payment method is required' });
    }
    
    if (method === 'cryptocurrency' && !walletAddress) {
      return res.status(400).json({ message: 'Wallet address is required for crypto withdrawals' });
    }
    
    if (method === 'bank_transfer' && !bankDetails) {
      return res.status(400).json({ message: 'Bank details are required for bank transfers' });
    }
    
    if (method === 'paypal' && !paypalEmail) {
      return res.status(400).json({ message: 'PayPal email is required for PayPal withdrawals' });
    }
    
    const user = await User.findById(req.user._id).session(session);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    
    // Calculate fee - 1% for example
    const fee = parseFloat((amount * 0.01).toFixed(2));
    const totalAmount = amount + fee;
    
    if (user.balance < totalAmount) {
      return res.status(400).json({ 
        message: `Insufficient balance. You need ${totalAmount} (including ${fee} fee) but have ${user.balance}`
      });
    }
    
    // Deduct amount + fee from user balance immediately
    user.balance -= totalAmount;
    await user.save({ session });
    
    // Create withdrawal transaction
    const transaction = new Transaction({
      user: user._id,
      type: 'withdrawal',
      amount: -amount, // Negative amount for withdrawal
      fee,
      currency,
      method,
      walletAddress,
      bankDetails,
      paypalEmail,
      cryptoType,
      status: 'pending',
      description: `Withdrawal via ${method}`
    });
    
    await transaction.save({ session });
    
    // Create fee transaction
    const feeTransaction = new Transaction({
      user: user._id,
      type: 'fee',
      amount: -fee, // Negative amount for fee
      currency,
      method: 'system',
      status: 'completed',
      description: 'Withdrawal fee',
      reference: transaction._id.toString(),
      processedAt: new Date()
    });
    
    await feeTransaction.save({ session });
    
    await session.commitTransaction();
    
    res.status(201).json({
      success: true,
      message: 'Withdrawal request created successfully',
      data: transaction
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating withdrawal:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    session.endSession();
  }
});

// Get transaction by ID
router.get('/:id', asyncHandler(async (req, res) => {
  const transaction = await Transaction.findOne({
    _id: req.params.id,
    user: req.user._id
  });
  
  if (!transaction) {
    return res.status(404).json({ message: 'Transaction not found' });
  }
  
  res.status(200).json(transaction);
}));

export default router;

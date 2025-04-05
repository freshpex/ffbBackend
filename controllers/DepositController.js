import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';

// Get all deposits for a user
export const getUserDeposits = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const query = { 
      user: req.user._id,
      type: 'deposit'
    };
    
    if (status) {
      query.status = status;
    }
    
    // Execute query with pagination
    const total = await Transaction.countDocuments(query);
    const deposits = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
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
    logger.error('Error fetching user deposits:', error);
    next(error);
  }
};

// Get deposit by ID
export const getDepositById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const deposit = await Transaction.findOne({
      _id: id,
      user: req.user._id,
      type: 'deposit'
    });
    
    if (!deposit) {
      throw new ApiError('Deposit not found', 404, 'not_found');
    }
    
    res.status(200).json({
      success: true,
      data: deposit
    });
  } catch (error) {
    logger.error(`Error fetching deposit ${req.params.id}:`, error);
    next(error);
  }
};

// Create new deposit request
export const createDeposit = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { amount, method, currency = 'USD', walletAddress, txHash, description } = req.body;
    
    // Validate amount
    if (!amount || isNaN(amount) || amount <= 0) {
      throw new ApiError('Valid deposit amount is required', 400, 'validation_error');
    }
    
    // Validate method
    if (!method) {
      throw new ApiError('Payment method is required', 400, 'validation_error');
    }
    
    // Create deposit transaction
    const deposit = new Transaction({
      user: req.user._id,
      type: 'deposit',
      amount: parseFloat(amount),
      currency,
      method,
      status: 'pending',
      walletAddress,
      txHash,
      description: description || `Deposit via ${method}`,
      createdAt: new Date()
    });
    
    await deposit.save({ session });
    
    await session.commitTransaction();
    
    // Log the transaction
    logger.info(`User ${req.user.email} created deposit request for ${amount} ${currency} via ${method}`);
    
    res.status(201).json({
      success: true,
      message: 'Deposit request created successfully',
      data: deposit
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating deposit:', error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Cancel deposit request
export const cancelDeposit = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    
    const deposit = await Transaction.findOne({
      _id: id,
      user: req.user._id,
      type: 'deposit',
      status: 'pending'
    });
    
    if (!deposit) {
      throw new ApiError('Pending deposit not found', 404, 'not_found');
    }
    
    // Update deposit status
    deposit.status = 'cancelled';
    deposit.updatedAt = new Date();
    
    await deposit.save({ session });
    
    await session.commitTransaction();
    
    logger.info(`User ${req.user.email} cancelled deposit request ${id}`);
    
    res.status(200).json({
      success: true,
      message: 'Deposit request cancelled successfully',
      data: deposit
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error cancelling deposit ${req.params.id}:`, error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Get deposit methods (available payment methods)
export const getDepositMethods = async (req, res, next) => {
  try {
    // These could be stored in a database in a real application
    const depositMethods = [
      {
        id: 'bank_transfer',
        name: 'Bank Transfer',
        description: 'Transfer directly from your bank account',
        processingTime: '1-3 business days',
        minAmount: 100,
        maxAmount: 100000,
        fee: '0%',
        status: 'active',
        instructions: [
          'Initiate a transfer from your bank to our account details below',
          'Use your user ID as reference',
          'Upload proof of payment for faster processing'
        ],
        fields: [
          { name: 'transferReference', label: 'Transfer Reference', type: 'text', required: true },
          { name: 'bankName', label: 'Bank Name', type: 'text', required: true }
        ],
        accountDetails: {
          bankName: 'Fidelity First Bank',
          accountName: 'Fidelity First Brokers Ltd',
          accountNumber: '1234567890',
          routingNumber: '123456789',
          swiftCode: 'FIDLUS22'
        }
      },
      {
        id: 'credit_card',
        name: 'Credit/Debit Card',
        description: 'Instant deposit using Visa, Mastercard, or Amex',
        processingTime: 'Instant',
        minAmount: 10,
        maxAmount: 50000,
        fee: '2.5%',
        status: 'active',
        instructions: [
          'Enter your card details securely',
          'Confirm the transaction',
          'Funds will be added to your account immediately'
        ],
        fields: [
          { name: 'cardNumber', label: 'Card Number', type: 'text', required: true },
          { name: 'expiryDate', label: 'Expiry Date', type: 'text', required: true },
          { name: 'cvv', label: 'CVV', type: 'text', required: true },
          { name: 'nameOnCard', label: 'Name on Card', type: 'text', required: true }
        ]
      },
      {
        id: 'cryptocurrency',
        name: 'Cryptocurrency',
        description: 'Deposit via Bitcoin, Ethereum, or USDT',
        processingTime: '10-60 minutes',
        minAmount: 50,
        maxAmount: 1000000,
        fee: '0%',
        status: 'active',
        instructions: [
          'Select your preferred cryptocurrency',
          'Send the exact amount to the wallet address provided',
          'Include the transaction hash for verification'
        ],
        fields: [
          { name: 'txHash', label: 'Transaction Hash', type: 'text', required: true }
        ],
        walletAddresses: {
          BTC: '3FZbgi29cpjq2GjdwV8eyHuJJnkLtktZc5',
          ETH: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
          USDT: 'TG9MfLbJAoojpbj6jm7wFUHgbD5AvYhZRD'
        }
      },
      {
        id: 'paypal',
        name: 'PayPal',
        description: 'Quick and secure deposits via PayPal',
        processingTime: 'Instant',
        minAmount: 10,
        maxAmount: 10000,
        fee: '1.5%',
        status: 'active',
        instructions: [
          'Click the PayPal button to be redirected',
          'Log in to your PayPal account',
          'Confirm the payment'
        ],
        fields: []
      }
    ];
    
    res.status(200).json({
      success: true,
      data: depositMethods
    });
  } catch (error) {
    logger.error('Error fetching deposit methods:', error);
    next(error);
  }
};

// Get deposit statistics for the user
export const getDepositStats = async (req, res, next) => {
  try {
    // Total deposits
    const totalDeposits = await Transaction.countDocuments({ 
      user: req.user._id,
      type: 'deposit'
    });
    
    // Pending deposits
    const pendingDeposits = await Transaction.countDocuments({ 
      user: req.user._id,
      type: 'deposit',
      status: 'pending'
    });
    
    // Completed deposits
    const completedDeposits = await Transaction.countDocuments({ 
      user: req.user._id,
      type: 'deposit',
      status: 'completed'
    });
    
    // Total deposit amount
    const depositVolume = await Transaction.aggregate([
      { 
        $match: { 
          user: new mongoose.Types.ObjectId(req.user._id),
          type: 'deposit',
          status: 'completed'
        } 
      },
      { 
        $group: { 
          _id: null, 
          total: { $sum: '$amount' } 
        } 
      }
    ]);
    
    // Recent deposits
    const recentDeposits = await Transaction.find({
      user: req.user._id,
      type: 'deposit'
    })
    .sort({ createdAt: -1 })
    .limit(5);
    
    res.status(200).json({
      success: true,
      data: {
        total: totalDeposits,
        pending: pendingDeposits,
        completed: completedDeposits,
        volume: depositVolume[0]?.total || 0,
        recent: recentDeposits
      }
    });
  } catch (error) {
    logger.error('Error fetching deposit statistics:', error);
    next(error);
  }
};

export default {
  getUserDeposits,
  getDepositById,
  createDeposit,
  cancelDeposit,
  getDepositMethods,
  getDepositStats
};

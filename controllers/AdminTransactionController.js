import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';
import { createTransactionNotification } from '../services/notificationService.js';

// Get all transactions with filtering and pagination
export const getAllTransactions = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10,
      userId,
      type,
      status,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const query = {};
    
    if (userId) query.user = userId;
    if (type) query.type = type;
    if (status) query.status = status;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    const totalTransactions = await Transaction.countDocuments(query);
    const transactions = await Transaction.find(query)
      .sort(sort)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('user', 'email firstName lastName');
    
    res.status(200).json({
      success: true,
      data: {
        transactions,
        pagination: {
          total: totalTransactions,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalTransactions / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    next(error);
  }
};

// Get transaction by ID
export const getTransactionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const transaction = await Transaction.findById(id)
      .populate('user', 'email firstName lastName');
    
    if (!transaction) {
      throw new ApiError('Transaction not found', 404, 'not_found');
    }
    
    res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    logger.error(`Error fetching transaction ${req.params.id}:`, error);
    next(error);
  }
};

// Process transaction (approve or reject)
export const processTransaction = async (req, res, next) => {
  // Start a database transaction to ensure data consistency
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { action, notes } = req.body;
    
    if (!['approve', 'reject'].includes(action)) {
      throw new ApiError('Invalid action. Must be approve or reject', 400, 'validation_error');
    }
    
    // Get the transaction
    const transaction = await Transaction.findById(id).session(session);
    
    if (!transaction) {
      throw new ApiError('Transaction not found', 404, 'not_found');
    }
    
    // Check if transaction is already processed
    if (transaction.status !== 'pending') {
      throw new ApiError(`Transaction is already ${transaction.status}`, 400, 'invalid_status');
    }
    
    // Process the transaction
    const newStatus = action === 'approve' ? 'completed' : 'rejected';
    const adminId = req.user._id;
    
    // Update transaction
    transaction.status = newStatus;
    transaction.adminNotes = notes;
    transaction.processedBy = adminId;
    transaction.processedAt = new Date();
    
    await transaction.save({ session });
    
    // If approved, update user balance
    if (action === 'approve' && ['deposit', 'withdrawal'].includes(transaction.type)) {
      if (transaction.type === 'deposit') {
        await User.findByIdAndUpdate(
          transaction.user,
          { $inc: { balance: Math.abs(transaction.amount) } },
          { session, new: true }
        );
        
        await createTransactionNotification(transaction, req.user);
        logger.info(`Admin ${req.user.email} approved deposit of ${Math.abs(transaction.amount)} for user ID ${transaction.user}`);
      } 
      else if (transaction.type === 'withdrawal') {
        await createTransactionNotification(transaction, req.user);
        logger.info(`Admin ${req.user.email} approved withdrawal of ${Math.abs(transaction.amount)} for user ID ${transaction.user}`);
      }
    } 
    else if (action === 'reject' && transaction.type === 'withdrawal') {
      await User.findByIdAndUpdate(
        transaction.user,
        { $inc: { balance: Math.abs(transaction.amount) } },
        { session, new: true }
      );
      
      logger.info(`Admin ${req.user.email} rejected withdrawal and refunded ${Math.abs(transaction.amount)} to user ID ${transaction.user}`);
    }
    
    await session.commitTransaction();
    
    res.status(200).json({
      success: true,
      message: `Transaction ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      data: transaction
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error processing transaction ${req.params.id}:`, error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Get transaction statistics
export const getTransactionStats = async (req, res, next) => {
  try {
    // Total counts
    const totalDeposits = await Transaction.countDocuments({ type: 'deposit' });
    const totalWithdrawals = await Transaction.countDocuments({ type: 'withdrawal' });
    const pendingDeposits = await Transaction.countDocuments({ type: 'deposit', status: 'pending' });
    const pendingWithdrawals = await Transaction.countDocuments({ type: 'withdrawal', status: 'pending' });
    
    // Total volumes
    const depositVolume = await Transaction.aggregate([
      { $match: { type: 'deposit', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const withdrawalVolume = await Transaction.aggregate([
      { $match: { type: 'withdrawal', status: 'completed' } },
      { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
    ]);
    
    // Recent transactions
    const recentTransactions = await Transaction.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'email firstName lastName');
    
    res.status(200).json({
      success: true,
      data: {
        counts: {
          totalDeposits,
          totalWithdrawals,
          pendingDeposits,
          pendingWithdrawals
        },
        volumes: {
          depositVolume: depositVolume[0]?.total || 0,
          withdrawalVolume: withdrawalVolume[0]?.total || 0
        },
        recentTransactions
      }
    });
  } catch (error) {
    logger.error('Error fetching transaction stats:', error);
    next(error);
  }
};

export default {
  getAllTransactions,
  getTransactionById,
  processTransaction,
  getTransactionStats
};

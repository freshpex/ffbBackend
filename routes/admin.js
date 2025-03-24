import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Investment from '../models/Investment.js';
import Order from '../models/Order.js';
import { requireAdmin, requireSuperAdmin } from '../middleware/auth.js';

const router = express.Router();

// Apply admin middleware to all routes
router.use(requireAdmin);

// Get all users (with pagination and search)
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 10, search, role } = req.query;
    
    const query = {};
    
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role) {
      query.role = role;
    }
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 }
    };
    
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-apiKeys.secret')
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .sort(options.sort);
    
    res.status(200).json({
      users,
      totalPages: Math.ceil(total / options.limit),
      currentPage: options.page,
      total
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get specific user details
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-apiKeys.secret');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get user's investments
    const investments = await Investment.find({ user: user._id });
    
    // Get user's recent transactions
    const transactions = await Transaction.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Get user's recent orders
    const orders = await Order.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(10);
    
    res.status(200).json({
      user,
      investments,
      transactions,
      orders
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user (admin only)
router.put('/users/:id', async (req, res) => {
  try {
    const { firstName, lastName, balance, kycVerified, tradingEnabled, role } = req.body;
    
    // SuperAdmin check for role update
    if (role && role !== 'user' && req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Only SuperAdmin can update admin roles' });
    }
    
    // Create update object
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (balance !== undefined) updateData.balance = balance;
    if (kycVerified !== undefined) updateData.kycVerified = kycVerified;
    if (tradingEnabled !== undefined) updateData.tradingEnabled = tradingEnabled;
    if (role !== undefined) updateData.role = role;
    
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    ).select('-apiKeys.secret');
    
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get pending withdrawals
router.get('/withdrawals/pending', async (req, res) => {
  try {
    const withdrawals = await Transaction.find({
      type: 'withdrawal',
      status: 'pending'
    }).populate('user', 'firstName lastName email');
    
    res.status(200).json({ withdrawals });
  } catch (error) {
    console.error('Error fetching pending withdrawals:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve withdrawal
router.post('/withdrawals/:id/approve', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const withdrawal = await Transaction.findOne({
      _id: req.params.id,
      type: 'withdrawal',
      status: 'pending'
    });
    
    if (!withdrawal) {
      return res.status(404).json({ message: 'Pending withdrawal not found' });
    }
    
    // Update transaction status
    withdrawal.status = 'completed';
    withdrawal.approvedBy = req.user.userId;
    
    await withdrawal.save({ session });
    
    // Update user stats
    await User.findByIdAndUpdate(
      withdrawal.user,
      { $inc: { totalWithdrawn: withdrawal.amount } },
      { session }
    );
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      message: 'Withdrawal approved successfully',
      withdrawal
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error approving withdrawal:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reject withdrawal
router.post('/withdrawals/:id/reject', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { reason } = req.body;
    
    const withdrawal = await Transaction.findOne({
      _id: req.params.id,
      type: 'withdrawal',
      status: 'pending'
    });
    
    if (!withdrawal) {
      return res.status(404).json({ message: 'Pending withdrawal not found' });
    }
    
    // Update transaction status
    withdrawal.status = 'failed';
    withdrawal.adminNotes = reason || 'Rejected by admin';
    
    await withdrawal.save({ session });
    
    // Return funds to user
    await User.findByIdAndUpdate(
      withdrawal.user,
      { $inc: { balance: withdrawal.amount } },
      { session }
    );
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      message: 'Withdrawal rejected successfully',
      withdrawal
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error('Error rejecting withdrawal:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get pending KYC requests
router.get('/kyc/pending', async (req, res) => {
  try {
    const users = await User.find({
      kycVerified: false,
      'kycDocuments.idCard.url': { $exists: true }
    }).select('_id firstName lastName email kycDocuments createdAt');
    
    res.status(200).json({ users });
  } catch (error) {
    console.error('Error fetching pending KYC requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve KYC document
router.post('/kyc/:userId/approve', async (req, res) => {
  try {
    const { userId } = req.params;
    const { docType } = req.body;
    
    if (!docType || !['idCard', 'proofOfAddress'].includes(docType)) {
      return res.status(400).json({ message: 'Invalid document type' });
    }
    
    const updateField = `kycDocuments.${docType}.verified`;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { [updateField]: true } },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if all documents are verified, then verify KYC
    const allVerified = user.kycDocuments.idCard?.verified && 
                        user.kycDocuments.proofOfAddress?.verified;
    
    if (allVerified) {
      user.kycVerified = true;
      await user.save();
    }
    
    res.status(200).json({
      message: `${docType} approved successfully`,
      kycVerified: user.kycVerified
    });
  } catch (error) {
    console.error('Error approving KYC document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reject KYC document
router.post('/kyc/:userId/reject', async (req, res) => {
  try {
    const { userId } = req.params;
    const { docType, reason } = req.body;
    
    if (!docType || !['idCard', 'proofOfAddress'].includes(docType)) {
      return res.status(400).json({ message: 'Invalid document type' });
    }
    
    // Remove the document and set verified to false
    const updateObj = {
      [`kycDocuments.${docType}.verified`]: false,
      [`kycDocuments.${docType}.rejectionReason`]: reason || 'Rejected by admin'
    };
    
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateObj },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json({
      message: `${docType} rejected successfully`
    });
  } catch (error) {
    console.error('Error rejecting KYC document:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get system stats
router.get('/stats', async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments();
    
    // Get total deposits
    const deposits = await Transaction.aggregate([
      { $match: { type: 'deposit', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalDeposits = deposits.length > 0 ? deposits[0].total : 0;
    
    // Get active investments
    const investments = await Investment.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const activeInvestments = investments.length > 0 ? investments[0].total : 0;
    
    // Get total trades count
    const totalTrades = await Order.countDocuments({ status: 'filled' });
    
    // Get pending KYC count
    const pendingKYC = await User.countDocuments({
      kycVerified: false,
      'kycDocuments.idCard.url': { $exists: true }
    });
    
    // Get pending withdrawals count
    const pendingWithdrawals = await Transaction.countDocuments({
      type: 'withdrawal',
      status: 'pending'
    });
    
    // Get recent activity
    const recentActivity = await Transaction.aggregate([
      { $sort: { createdAt: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userData'
        }
      },
      {
        $project: {
          type: 1,
          amount: 1,
          status: 1,
          method: 1,
          createdAt: 1,
          description: 1,
          user: { $arrayElemAt: ['$userData', 0] }
        }
      },
      {
        $project: {
          type: 1,
          amount: 1,
          status: 1,
          method: 1,
          createdAt: 1,
          description: 1,
          'user.firstName': 1,
          'user.lastName': 1,
          'user.email': 1
        }
      }
    ]);
    
    // Format recent activity for display
    const formattedActivity = recentActivity.map(activity => ({
      type: activity.type,
      timestamp: activity.createdAt,
      description: `${activity.user.firstName} ${activity.user.lastName} - ${activity.description} (${activity.status})`
    }));
    
    res.status(200).json({
      totalUsers,
      totalDeposits,
      activeInvestments,
      totalTrades,
      pendingKYC,
      pendingWithdrawals,
      recentActivity: formattedActivity
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

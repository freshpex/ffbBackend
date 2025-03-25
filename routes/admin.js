import express from 'express';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Investment from '../models/Investment.js';
import Order from '../models/Order.js';
import { verifyToken, requireAdmin, requireSuperAdmin, checkRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import logger from '../middleware/logger.js';

const router = express.Router();

// Apply authentication to all admin routes
router.use(verifyToken);

// Get all users (admin only)
router.get('/users', requireAdmin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status, role } = req.query;
  
  const query = {};
  
  if (search) {
    query.$or = [
      { email: { $regex: search, $options: 'i' } },
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } }
    ];
  }
  
  if (status) {
    query.status = status;
  }
  
  if (role) {
    query.role = role;
  }
  
  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { createdAt: -1 },
    select: '-password'
  };
  
  const users = await User.find(query)
    .select('-password -apiKeys.secret')
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .sort(options.sort);
  
  const total = await User.countDocuments(query);
  
  res.status(200).json({
    users,
    totalPages: Math.ceil(total / options.limit),
    currentPage: options.page,
    total
  });
}));

// Get user by ID (admin only)
router.get('/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password -apiKeys.secret');
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  res.status(200).json(user);
}));

// Update user (admin only)
router.put('/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { firstName, lastName, role, status, balance, kycVerified, tradingEnabled } = req.body;
  
  // Restrict role changes to superadmin
  if (role === 'superadmin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ message: 'Only superadmins can assign superadmin role' });
  }
  
  const allowedUpdates = {};
  if (firstName) allowedUpdates.firstName = firstName;
  if (lastName) allowedUpdates.lastName = lastName;
  if (status) allowedUpdates.status = status;
  if (kycVerified !== undefined) allowedUpdates.kycVerified = kycVerified;
  if (tradingEnabled !== undefined) allowedUpdates.tradingEnabled = tradingEnabled;
  
  // Only admins can update role
  if (role && req.user.role === 'admin') {
    allowedUpdates.role = role;
  }
  
  // Only admins can update balance
  if (balance !== undefined && req.user.role === 'admin') {
    allowedUpdates.balance = balance;
  }
  
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $set: allowedUpdates },
    { new: true }
  ).select('-password -apiKeys.secret');
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  logger.info(`Admin ${req.user.email} updated user ${user.email}`);
  res.status(200).json(user);
}));

// Delete user (superadmin only)
router.delete('/users/:id', requireSuperAdmin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  // Prevent deleting another superadmin
  if (user.role === 'superadmin') {
    return res.status(403).json({ message: 'Cannot delete a superadmin account' });
  }
  
  await User.deleteOne({ _id: req.params.id });
  
  logger.info(`Superadmin ${req.user.email} deleted user ${user.email}`);
  res.status(200).json({ message: 'User deleted successfully' });
}));

// Get system stats (admin only)
router.get('/stats', requireAdmin, asyncHandler(async (req, res) => {
  const totalUsers = await User.countDocuments();
  const activeUsers = await User.countDocuments({ status: 'active' });
  const pendingKYC = await User.countDocuments({ kycVerified: false });
  
  const totalTransactions = await Transaction.countDocuments();
  const transactionVolume = await Transaction.aggregate([
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  const totalInvestments = await Investment.countDocuments();
  const investmentVolume = await Investment.aggregate([
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  const totalOrders = await Order.countDocuments();
  
  res.status(200).json({
    users: {
      total: totalUsers,
      active: activeUsers,
      pendingKYC
    },
    transactions: {
      count: totalTransactions,
      volume: transactionVolume[0]?.total || 0
    },
    investments: {
      count: totalInvestments,
      volume: investmentVolume[0]?.total || 0
    },
    orders: {
      count: totalOrders
    }
  });
}));

// Get recent activity (admin only)
router.get('/activity', requireAdmin, asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  
  const recentTransactions = await Transaction.find()
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .populate('user', 'email firstName lastName');
  
  const recentInvestments = await Investment.find()
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .populate('user', 'email firstName lastName');
  
  const recentOrders = await Order.find()
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .populate('user', 'email firstName lastName');
  
  res.status(200).json({
    transactions: recentTransactions,
    investments: recentInvestments,
    orders: recentOrders
  });
}));

// Manual KYC verification (admin only)
router.put('/kyc/:userId', requireAdmin, asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  
  if (!status || !['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ message: 'Valid status required (approved, rejected, pending)' });
  }
  
  const user = await User.findById(req.params.userId);
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  user.kycVerified = status === 'approved';
  user.kycStatus = status;
  user.kycNotes = notes;
  user.kycVerifiedAt = status === 'approved' ? new Date() : null;
  user.kycVerifiedBy = status === 'approved' ? req.user.userId : null;
  
  await user.save();
  
  logger.info(`Admin ${req.user.email} updated KYC status for ${user.email} to ${status}`);
  
  res.status(200).json({ 
    message: `KYC status updated to ${status}`,
    user: {
      id: user._id,
      email: user.email,
      kycVerified: user.kycVerified,
      kycStatus: user.kycStatus
    }
  });
}));

export default router;

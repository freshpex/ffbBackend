import express from 'express';
import User from '../models/User.js';
import { verifyToken } from '../middleware/auth.js';
import logger from '../middleware/logger.js';
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Configure multer for file uploads
const uploadsDir = path.join(process.cwd(), 'uploads/kyc');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${req.user.userId}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only jpg, png, and pdf files are allowed'));
    }
  }
});

// Get user profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const userEmail = req.user?.email;
    
    if (!userId && !userEmail) {
      return res.status(401).json({ message: 'Unauthorized access - user identification missing' });
    }
    
    let user;
    if (userId) {
      user = await User.findById(userId).select('-apiKeys.secret');
    }
    
    if (!user && userEmail) {
      user = await User.findOne({ email: userEmail }).select('-apiKeys.secret');
    }
    
    if (!user) {
      logger.warn(`User profile not found for ${userEmail || userId}`);
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json({
      id: user._id,
      uid: user.uid,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      balance: user.balance || 0,
      kycVerified: user.kycVerified || false,
      tradingEnabled: user.tradingEnabled !== false,
      referralCode: user.referralCode,
      settings: user.settings || {}
    });
  } catch (error) {
    logger.error('Error retrieving user profile:', error);
    res.status(500).json({ message: 'Server error retrieving user profile' });
  }
});

// Update user profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { firstName, lastName, phone, country, btcAddress, settings } = req.body;
    
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const allowedUpdates = {};
    if (firstName) allowedUpdates.firstName = firstName;
    if (lastName) allowedUpdates.lastName = lastName;
    if (phone) allowedUpdates.phone = phone;
    if (country) allowedUpdates.country = country;
    if (btcAddress) allowedUpdates.btcAddress = btcAddress;
    
    if (settings) {
      allowedUpdates.settings = { ...user.settings, ...settings };
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: allowedUpdates },
      { new: true }
    ).select('-apiKeys.secret');
    
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    logger.info(`User profile updated for ${user.email}`);
    res.status(200).json({ 
      message: 'Profile updated successfully',
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        role: updatedUser.role,
        settings: updatedUser.settings
      }
    });
  } catch (error) {
    logger.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Server error updating user profile' });
  }
});

// Upload KYC documents
router.post('/kyc', verifyToken, upload.fields([
  { name: 'idCard', maxCount: 1 },
  { name: 'proofOfAddress', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files) {
      return res.status(400).json({ message: 'No files were uploaded' });
    }
    
    const updates = {};
    
    if (req.files.idCard) {
      updates['kycDocuments.idCard'] = {
        url: `/uploads/kyc/${req.files.idCard[0].filename}`,
        verified: false
      };
    }
    
    if (req.files.proofOfAddress) {
      updates['kycDocuments.proofOfAddress'] = {
        url: `/uploads/kyc/${req.files.proofOfAddress[0].filename}`,
        verified: false
      };
    }
    
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updates },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json({
      message: 'KYC documents uploaded successfully',
      kycDocuments: user.kycDocuments
    });
  } catch (error) {
    logger.error('Error uploading KYC documents:', error);
    res.status(500).json({ message: 'Server error uploading documents' });
  }
});

// Get balance history
router.get('/balance/history', verifyToken, async (req, res) => {
  try {
    const { from, to, type, limit = 10, page = 1 } = req.query;
    
    const query = { user: req.user.userId };
    
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    
    if (type) {
      query.type = type;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Transaction.countDocuments(query);
    
    res.status(200).json({
      transactions,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      total
    });
  } catch (error) {
    logger.error('Error fetching balance history:', error);
    res.status(500).json({ message: 'Server error fetching balance history' });
  }
});

export default router;

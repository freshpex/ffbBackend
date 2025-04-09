import User from '../models/User.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ApiError } from '../middleware/errorHandler.js';
import logger from '../middleware/logger.js';

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/profile-images';
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'profile-' + uniqueSuffix + ext);
  }
});

// File filter for image uploads
const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new ApiError('Only image files are allowed', 400), false);
  }
};

// Initialize multer upload middleware
export const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});


export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId)
      .select('-password -__v -refreshToken')
      .lean();
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    return res.status(200).json({
      success: true,
      data: {
        id: user._id,
        email: user.email || '',
        username: user.username || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        profileImage: user.profileImage || '',
        phone: user.phone || '',
        address: user.address || '',
        accountBalance: user.accountBalance || 0,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get user account summary (may include balance, investments, etc)
export const getAccountSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get user data
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get investments count and total
    const investments = await Investment.find({ user: userId });
    const investmentTotal = investments.reduce((sum, inv) => sum + inv.amount, 0);
    
    // Get transaction stats
    const deposits = await Transaction.find({ 
      user: userId, 
      type: 'deposit',
      status: 'completed'
    });
    const withdrawals = await Transaction.find({ 
      user: userId, 
      type: 'withdrawal',
      status: 'completed'
    });
    
    const depositTotal = deposits.reduce((sum, dep) => sum + dep.amount, 0);
    const withdrawalTotal = withdrawals.reduce((sum, wit) => sum + wit.amount, 0);
    
    // Create summary object
    const summary = {
      balance: user.balance || 'N/A',
      investmentCount: investments.length,
      investmentTotal,
      depositTotal,
      withdrawalTotal,
      lastLogin: user.lastLoginAt,
      accountStatus: user.status,
      kycVerified: user.kycVerified
    };
    
    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

// Update user profile
export const updateUserProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { firstName, lastName, phone, address } = req.body;
    
    // Find user and update
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          firstName,
          lastName,
          phone,
          address
        }
      },
      { new: true, runValidators: true }
    ).select('-password -resetToken -resetTokenExpiry');
    
    if (!user) {
      throw new ApiError('User not found', 404);
    }
    
    res.status(200).json({
      success: true,
      data: user,
      message: 'Profile updated successfully'
    });
  } catch (error) {
logger.error('Error updating user profile:', error);
    next(error);
  }
};

// Upload profile image
export const uploadProfileImage = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    if (!req.file) {
      throw new ApiError('No image file uploaded', 400);
    }
    
    // Get file path and create URL
    const filePath = req.file.path.replace(/\\/g, '/'); // Replace backslashes with forward slashes
    const imageUrl = `${req.protocol}://${req.get('host')}/${filePath}`;
    
    // Update user with new image URL
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          profileImage: imageUrl
        }
      },
      { new: true }
    ).select('-password -resetToken -resetTokenExpiry');
    
    if (!user) {
      throw new ApiError('User not found', 404);
    }
    
    res.status(200).json({
      success: true,
      data: {
        imageUrl,
        user
      },
      message: 'Profile image uploaded successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Add a new controller method to get user balance
export const getUserBalance = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch user data including the balance
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        balance: user.balance || 'N/A'
      }
    });
  } catch (error) {
    next(error);
  }
};

export default {
  upload,
  getUserProfile,
  updateUserProfile,
  uploadProfileImage,
  getUserBalance,
  getAccountSummary
};

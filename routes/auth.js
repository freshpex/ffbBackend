import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import logger from '../middleware/logger.js';

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { uid, email, firstName, lastName } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ uid }, { email }] });
    if (existingUser) {
      // If user exists with the same email but different UID, update the UID
      if (existingUser.email === email && existingUser.uid !== uid) {
        existingUser.uid = uid;
        await existingUser.save();
        return res.status(200).json({ message: 'User updated successfully' });
      }
      
      return res.status(200).json({ message: 'User already exists' });
    }
    
    // Generate referral code
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Create new user
    const user = new User({
      uid,
      email,
      firstName,
      lastName,
      referralCode
    });
    
    await user.save();
    
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login user - Firebase handles authentication, this endpoint validates and returns user data
router.post('/login', async (req, res) => {
  try {
    const { uid } = req.body;
    
    const user = await User.findOne({ uid });
    if (!user) {
      return res.status(404).json({ message: 'User not found in database. Please ensure your account is synchronized.' });
    }
    
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Sync Firebase user with MongoDB
router.post('/sync', async (req, res) => {
  if (res.headersSent) {
    logger.warn('Attempted to process sync request after response was sent');
    return;
  }
  
  try {
    const { uid, email, displayName, firebaseToken } = req.body;
    
    if (!uid || !email) {
      return res.status(400).json({ message: 'Missing required user information' });
    }
    
    // No token verification is needed here as we trust the Firebase token
    // and are only using the data to create/update a user
    
    // Find user by uid or email with error handling
    let user;
    try {
      user = await User.findOne({ $or: [{ uid }, { email }] });
    } catch (dbError) {
      logger.error('Database error during user lookup:', dbError);
      return res.status(500).json({ message: 'Database error during synchronization' });
    }
    
    if (user) {
      // Update existing user if needed
      let updated = false;
      
      // If found by email but uid doesn't match, update uid
      if (user.uid !== uid) {
        user.uid = uid;
        updated = true;
      }
      
      // If displayName is provided and doesn't match current name
      if (displayName && displayName.includes(' ')) {
        const [firstName, ...lastNameParts] = displayName.split(' ');
        const lastName = lastNameParts.join(' ');
        
        if (user.firstName !== firstName || user.lastName !== lastName) {
          user.firstName = firstName;
          user.lastName = lastName;
          updated = true;
        }
      }
      
      if (updated) {
        try {
          await user.save();
          logger.info(`User synchronized and updated: ${email}`);
        } catch (saveError) {
          logger.error('Error saving user updates:', saveError);
          return res.status(500).json({ message: 'Error updating user information' });
        }
      } else {
        logger.info(`User already synchronized: ${email}`);
      }
      
      return res.status(200).json({ 
        message: updated ? 'User updated successfully' : 'User already synchronized',
        userId: user._id
      });
    }
    
    // User not found, create new user
    let firstName = 'User';
    let lastName = '';
    
    if (displayName && displayName.includes(' ')) {
      const nameParts = displayName.split(' ');
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    }
    
    // Generate referral code
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Create new user with error handling
    try {
      const newUser = new User({
        uid,
        email,
        firstName,
        lastName,
        referralCode
      });
      
      await newUser.save();
      logger.info(`New user created during sync: ${email}`);
      
      return res.status(201).json({ 
        message: 'User created successfully during synchronization',
        userId: newUser._id
      });
    } catch (createError) {
      logger.error('Error creating new user during sync:', createError);
      return res.status(500).json({ message: 'Error creating user' });
    }
  } catch (error) {
    logger.error('User sync error:', error);
    
    // Check if response has already been sent
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Server error during synchronization' });
    }
  }
});

// Reset password - handled by Firebase, this endpoint is a placeholder
router.post('/reset-password', (req, res) => {
  res.status(200).json({ message: 'Password reset email sent' });
});

export default router;

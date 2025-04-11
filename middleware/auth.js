import jwt from 'jsonwebtoken';
import { ApiError } from './errorHandler.js';
import User from '../models/User.js';
import logger from './logger.js';

// Verify JWT token middleware
export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('Access denied. No token provided', 401, 'auth_error');
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      throw new ApiError('Invalid token format', 401, 'auth_error');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Attach user to request object
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        throw new ApiError('User not found', 401, 'auth_error');
      }
      
      req.user = user;
      req.user.userId = user._id;
      
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new ApiError('Token expired', 401, 'token_expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new ApiError('Invalid token', 401, 'invalid_token');
      } else {
        throw error;
      }
    }
  } catch (error) {
    // Ensure we're using the ApiError format for consistency
    if (!(error instanceof ApiError)) {
      error = new ApiError(error.message || 'Authentication error', 401, 'auth_error');
    }
    next(error);
  }
};

// Admin role verification middleware
export const verifyAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'superadmin'].includes(req.user.role)) {
    return next(new ApiError('Access denied. Admin privileges required', 403, 'forbidden'));
  }
  next();
};

// Export verifyAdmin as requireAdmin (for compatibility)
export const requireAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'superadmin'].includes(req.user.role)) {
    return next(new ApiError('Access denied. Admin privileges required', 403, 'forbidden'));
  }
  next();
};

// Add requireSuperAdmin middleware
export const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'superadmin') {
    return next(new ApiError('Access denied. Superadmin privileges required', 403, 'forbidden'));
  }
  next();
};

// Check role utility function
export const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(`Access denied. Required role: ${roles.join(' or ')}`, 403, 'forbidden'));
    }
    next();
  };
};

// Optional: Token refresh middleware
export const refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
    
    if (!refreshToken) {
      throw new ApiError('Refresh token required', 401, 'auth_error');
    }
    
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      throw new ApiError('User not found', 401, 'auth_error');
    }
    
    // Generate new access token
    const accessToken = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    res.status(200).json({
      success: true,
      accessToken
    });
  } catch (error) {
    next(error);
  }
};

export default { verifyToken, verifyAdmin, requireAdmin, requireSuperAdmin, checkRole, refreshToken };

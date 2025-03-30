import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import logger from './logger.js';

// Helper to extract token from request
const extractToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.substring(7);
  }
  return null;
};

// Verify JWT token middleware
export const verifyToken = async (req, res, next) => {
  const requestId = req.requestId || 'unknown';
  try {
    const token = extractToken(req);
    
    if (!token) {
      logger.warn(`[${requestId}] Authentication failed: No token provided | IP: ${req.ip} | Path: ${req.originalUrl}`);
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }
    
    logger.debug(`[${requestId}] Processing token verification for ${req.method} request to ${req.originalUrl}`);
    
    try {
      // Verify the token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Add detailed logging for debugging
      logger.info(`[${requestId}] User authenticated: ${decoded.email} | Role: ${decoded.role} | Method: ${req.method} | Path: ${req.originalUrl}`);
      
      // Log request body for non-GET requests (after authentication)
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
        const safeBody = { ...req.body };
        // Redact sensitive fields
        if (safeBody.password) safeBody.password = '[REDACTED]';
        if (safeBody.token) safeBody.token = '[REDACTED]';
        if (safeBody.firebaseToken) safeBody.firebaseToken = '[REDACTED]';
        
        logger.debug(`[${requestId}] Authenticated request body:`, { 
          body: safeBody,
          user: decoded.email,
          method: req.method
        });
      }
      
      // Check token expiration time
      const currentTimestamp = Math.floor(Date.now() / 1000);
      if (decoded.exp <= currentTimestamp) {
        logger.warn(`[${requestId}] Token expired for user ${decoded.email}`);
        return res.status(401).json({ 
          success: false, 
          message: 'Token expired. Please log in again.' 
        });
      }
      
      // Attach user data to request object
      req.user = decoded;
      
      // If token is close to expiring (less than 10 minutes), issue a new one
      if (decoded.exp - currentTimestamp < 600) {
        logger.debug(`[${requestId}] Generating new token for user ${decoded.email} (token close to expiry)`);
        const user = await User.findById(decoded.userId);
        if (user) {
          const newToken = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRY || '24h' }
          );
          
          // Set new token in response header
          res.setHeader('X-New-Token', newToken);
        }
      }
      
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        logger.warn(`[${requestId}] Invalid token error | IP: ${req.ip} | Path: ${req.originalUrl} | Error: ${error.message}`);
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid token. Please log in again.' 
        });
      } else if (error.name === 'TokenExpiredError') {
        logger.warn(`[${requestId}] Token expired error | IP: ${req.ip} | Path: ${req.originalUrl}`);
        return res.status(401).json({ 
          success: false, 
          message: 'Token expired. Please log in again.' 
        });
      }
      
      logger.error(`[${requestId}] Auth middleware error:`, error);
      return res.status(500).json({ 
        success: false, 
        message: 'Authentication error' 
      });
    }
  } catch (error) {
    logger.error(`[${requestId}] Unhandled error in auth middleware:`, error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error during authentication' 
    });
  }
};

// Check admin role
export const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  
  logger.warn(`Non-admin user ${req.user?.userId} attempted to access admin resource`);
  return res.status(403).json({ 
    success: false, 
    message: 'Access denied. Admin privileges required.' 
  });
};

// Check superadmin role
export const requireSuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'superadmin') {
    return next();
  }
  
  logger.warn(`Non-superadmin user ${req.user?.userId} attempted to access superadmin resource`);
  return res.status(403).json({ 
    success: false, 
    message: 'Access denied. Super Admin privileges required.' 
  });
};

// Middleware for checking roles with a more flexible approach
export const checkRole = (requiredRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }
    
    // Convert single role to array if needed
    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    
    // If no roles required or empty array, just require authentication
    if (roles.length === 0) {
      return next();
    }
    
    // Check if user has any of the required roles
    if (roles.includes(req.user.role)) {
      return next();
    }
    
    logger.warn(`User ${req.user.userId} with role ${req.user.role} attempted to access resource requiring ${roles.join('/')}`);
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Insufficient privileges.' 
    });
  };
};

// Check API key validation
export const validateApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ 
      success: false, 
      message: 'API key is required' 
    });
  }
  
  try {
    // Find user with this API key
    const user = await User.findOne({ 'apiKeys.key': apiKey });
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid API key' 
      });
    }
    
    // Find the matching API key
    const keyData = user.apiKeys.find(k => k.key === apiKey);
    
    // Check if key is active
    if (!keyData.active) {
      return res.status(401).json({ 
        success: false, 
        message: 'API key is inactive' 
      });
    }
    
    // If key has restricted IPs, check if current IP is allowed
    if (keyData.allowedIPs && keyData.allowedIPs.length > 0) {
      const clientIP = req.ip || 
                     req.headers['x-forwarded-for'] || 
                     req.connection.remoteAddress;
                     
      if (!keyData.allowedIPs.includes(clientIP)) {
        logger.warn(`API key used from unauthorized IP: ${clientIP}`);
        return res.status(401).json({ 
          success: false, 
          message: 'API access not allowed from this IP address' 
        });
      }
    }
    
    // Track API usage for rate limiting
    keyData.lastUsed = new Date();
    user.markModified('apiKeys');
    await user.save();
    
    // Attach user to request
    req.user = {
      userId: user._id,
      email: user.email,
      role: user.role,
      apiKey: apiKey
    };
    
    next();
  } catch (error) {
    logger.error('API key validation error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error validating API key' 
    });
  }
};

export default { verifyToken, requireAdmin, requireSuperAdmin, checkRole, validateApiKey };

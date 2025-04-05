import PriceAlert from '../models/PriceAlert.js';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';

// Get all price alerts for current user
export const getUserAlerts = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, active } = req.query;
    
    const query = { user: req.user._id };
    
    // Add active filter if specified
    if (active !== undefined) {
      query.active = active === 'true';
    }
    
    // Execute query with pagination
    const total = await PriceAlert.countDocuments(query);
    const alerts = await PriceAlert.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      data: {
        alerts,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching price alerts:', error);
    next(error);
  }
};

// Create new price alert
export const createAlert = async (req, res, next) => {
  try {
    const { symbol, condition, price, repeatable } = req.body;
    
    // Validate required fields
    if (!symbol || !condition || price === undefined) {
      throw new ApiError('Symbol, condition, and price are required', 400, 'validation_error');
    }
    
    // Validate condition
    if (!['above', 'below'].includes(condition)) {
      throw new ApiError('Condition must be either "above" or "below"', 400, 'validation_error');
    }
    
    // Validate price
    if (typeof price !== 'number' || price <= 0) {
      throw new ApiError('Price must be a positive number', 400, 'validation_error');
    }
    
    // Create new alert
    const alert = new PriceAlert({
      user: req.user._id,
      symbol,
      condition,
      price,
      repeatable: repeatable || false,
      active: true
    });
    
    await alert.save();
    
    res.status(201).json({
      success: true,
      message: 'Price alert created successfully',
      data: alert
    });
  } catch (error) {
    logger.error('Error creating price alert:', error);
    next(error);
  }
};

// Update price alert
export const updateAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { condition, price, active, repeatable } = req.body;
    
    const alert = await PriceAlert.findOne({
      _id: id,
      user: req.user._id
    });
    
    if (!alert) {
      throw new ApiError('Price alert not found', 404, 'not_found');
    }
    
    // Update fields if provided
    if (condition !== undefined) {
      if (!['above', 'below'].includes(condition)) {
        throw new ApiError('Condition must be either "above" or "below"', 400, 'validation_error');
      }
      alert.condition = condition;
    }
    
    if (price !== undefined) {
      if (typeof price !== 'number' || price <= 0) {
        throw new ApiError('Price must be a positive number', 400, 'validation_error');
      }
      alert.price = price;
    }
    
    if (active !== undefined) {
      alert.active = active;
      
      // If reactivating, reset triggered flag
      if (active === true && alert.triggered) {
        alert.triggered = false;
        alert.triggeredAt = null;
      }
    }
    
    if (repeatable !== undefined) {
      alert.repeatable = repeatable;
    }
    
    await alert.save();
    
    res.status(200).json({
      success: true,
      message: 'Price alert updated successfully',
      data: alert
    });
  } catch (error) {
    logger.error(`Error updating price alert ${req.params.id}:`, error);
    next(error);
  }
};

// Delete price alert
export const deleteAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const alert = await PriceAlert.findOne({
      _id: id,
      user: req.user._id
    });
    
    if (!alert) {
      throw new ApiError('Price alert not found', 404, 'not_found');
    }
    
    await PriceAlert.deleteOne({ _id: id });
    
    res.status(200).json({
      success: true,
      message: 'Price alert deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting price alert ${req.params.id}:`, error);
    next(error);
  }
};

export default {
  getUserAlerts,
  createAlert,
  updateAlert,
  deleteAlert
};

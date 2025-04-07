import PriceAlert from '../models/PriceAlert.js';
import { ApiError } from '../middleware/errorHandler.js';

// Get user price alerts
export const getUserPriceAlerts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    const alerts = await PriceAlert.find({ user: userId }).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: alerts
    });
  } catch (error) {
    next(error);
  }
};

// Create price alert
export const createPriceAlert = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { symbol, targetPrice, direction, notificationType } = req.body;
    
    // Validation
    if (!symbol || !targetPrice || !direction) {
      throw new ApiError('Missing required fields', 400);
    }
    
    // Create alert
    const newAlert = await PriceAlert.create({
      user: userId,
      symbol,
      targetPrice,
      direction,
      notificationType: notificationType || 'app'
    });
    
    res.status(201).json({
      success: true,
      data: newAlert
    });
  } catch (error) {
    next(error);
  }
};

// Update price alert
export const updatePriceAlert = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const alertId = req.params.id;
    const updates = req.body;
    
    const alert = await PriceAlert.findById(alertId);
    
    // Check if alert exists
    if (!alert) {
      throw new ApiError('Price alert not found', 404);
    }
    
    // Check if alert belongs to user
    if (alert.user.toString() !== userId) {
      throw new ApiError('Unauthorized', 403);
    }
    
    // Update alert
    const updatedAlert = await PriceAlert.findByIdAndUpdate(
      alertId,
      updates,
      { new: true, runValidators: true }
    );
    
    res.status(200).json({
      success: true,
      data: updatedAlert
    });
  } catch (error) {
    next(error);
  }
};

// Delete price alert
export const deletePriceAlert = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const alertId = req.params.id;
    
    const alert = await PriceAlert.findById(alertId);
    
    // Check if alert exists
    if (!alert) {
      throw new ApiError('Price alert not found', 404);
    }
    
    // Check if alert belongs to user
    if (alert.user.toString() !== userId) {
      throw new ApiError('Unauthorized', 403);
    }
    
    // Delete alert
    await PriceAlert.findByIdAndDelete(alertId);
    
    res.status(200).json({
      success: true,
      message: 'Price alert deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getUserPriceAlerts,
  createPriceAlert,
  updatePriceAlert,
  deletePriceAlert
};

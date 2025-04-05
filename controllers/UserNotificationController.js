import Notification from '../models/Notification.js';
import mongoose from 'mongoose';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';

// Get all notifications for a user
export const getUserNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, read } = req.query;
    
    const query = { 
      recipient: req.user._id,
      forAdminOnly: false
    };
    
    // Add read filter if specified
    if (read !== undefined) {
      query.read = read === 'true';
    }
    
    // Execute query with pagination
    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    // Count unread notifications
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      forAdminOnly: false,
      read: false
    });
    
    res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching user notifications:', error);
    next(error);
  }
};

// Get notification by ID
export const getNotificationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findOne({
      _id: id,
      recipient: req.user._id,
      forAdminOnly: false
    });
    
    if (!notification) {
      throw new ApiError('Notification not found', 404, 'not_found');
    }
    
    res.status(200).json({
      success: true,
      data: notification
    });
  } catch (error) {
    logger.error(`Error fetching notification ${req.params.id}:`, error);
    next(error);
  }
};

// Mark notification as read
export const markNotificationAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findOne({
      _id: id,
      recipient: req.user._id,
      forAdminOnly: false
    });
    
    if (!notification) {
      throw new ApiError('Notification not found', 404, 'not_found');
    }
    
    notification.read = true;
    await notification.save();
    
    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    logger.error(`Error marking notification ${req.params.id} as read:`, error);
    next(error);
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { 
        recipient: req.user._id, 
        forAdminOnly: false,
        read: false
      },
      { read: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      data: {
        updatedCount: result.modifiedCount
      }
    });
  } catch (error) {
    logger.error('Error marking all notifications as read:', error);
    next(error);
  }
};

// Delete notification
export const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findOne({
      _id: id,
      recipient: req.user._id,
      forAdminOnly: false
    });
    
    if (!notification) {
      throw new ApiError('Notification not found', 404, 'not_found');
    }
    
    await Notification.deleteOne({ _id: id });
    
    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting notification ${req.params.id}:`, error);
    next(error);
  }
};

// Get notification statistics
export const getNotificationStats = async (req, res, next) => {
  try {
    const totalCount = await Notification.countDocuments({
      recipient: req.user._id,
      forAdminOnly: false
    });
    
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      forAdminOnly: false,
      read: false
    });
    
    const byType = await Notification.aggregate([
      {
        $match: {
          recipient: new mongoose.Types.ObjectId(req.user._id),
          forAdminOnly: false
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const typeStats = {};
    byType.forEach(item => {
      typeStats[item._id] = item.count;
    });
    
    res.status(200).json({
      success: true,
      data: {
        total: totalCount,
        unread: unreadCount,
        byType: typeStats
      }
    });
  } catch (error) {
    logger.error('Error fetching notification statistics:', error);
    next(error);
  }
};

export default {
  getUserNotifications,
  getNotificationById,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getNotificationStats
};

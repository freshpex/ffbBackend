import Notification from '../models/Notification.js';
import User from '../models/User.js';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';
import { validationResult } from 'express-validator';
import AdminNotification from '../models/AdminNotification.js';

// Get all admin notifications
export const getAdminNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, read } = req.query;
    
    const query = { 
      recipient: req.user._id,
      forAdminOnly: true
    };
    
    if (read !== undefined) {
      query.read = read === 'true';
    }
    
    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      forAdminOnly: true,
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
    logger.error('Error fetching admin notifications:', error);
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
      forAdminOnly: true
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
      forAdminOnly: true
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
        forAdminOnly: true,
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
      forAdminOnly: true
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

// Create system notification for all admins
export const createSystemNotification = async (req, res, next) => {
  try {
    const { title, message, type = 'info', priority = 'medium', link } = req.body;
    
    if (!title || !message) {
      throw new ApiError('Title and message are required', 400, 'validation_error');
    }
    
    // Find all admin users
    const adminUsers = await User.find({
      role: { $in: ['admin', 'superadmin'] }
    }).select('_id');
    
    if (adminUsers.length === 0) {
      throw new ApiError('No admin users found', 404, 'not_found');
    }
    
    // Create notifications for all admins
    const notifications = await Promise.all(
      adminUsers.map(admin => {
        const notification = new Notification({
          recipient: admin._id,
          type,
          title,
          message,
          priority,
          link,
          forAdminOnly: true,
          createdAt: new Date()
        });
        
        return notification.save();
      })
    );
    
    res.status(201).json({
      success: true,
      message: 'System notification created for all admins',
      data: {
        notificationsCount: notifications.length
      }
    });
  } catch (error) {
    logger.error('Error creating system notification:', error);
    next(error);
  }
};

// Get notification statistics
export const getNotificationStats = async (req, res, next) => {
  try {
    const totalCount = await Notification.countDocuments({
      recipient: req.user._id,
      forAdminOnly: true
    });
    
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      forAdminOnly: true,
      read: false
    });
    
    const byType = await Notification.aggregate([
      {
        $match: {
          recipient: new mongoose.Types.ObjectId(req.user._id),
          forAdminOnly: true
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

// Get unread notification count
export const getUnreadCount = async (req, res) => {
  try {
    const count = await AdminNotification.countDocuments({ read: false });
    
    return res.status(200).json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Mark a notification as read
export const markAsRead = async (req, res) => {
  try {
    const notificationId = req.params.id;
    
    const notification = await AdminNotification.findById(notificationId);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    // Update the notification
    notification.read = true;
    await notification.save();
    
    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req, res) => {
  try {
    const result = await AdminNotification.updateMany(
      { read: false },
      { $set: { read: true } }
    );
    
    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      count: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Internal function to create a new admin notification
// Export this function so it can be imported by notificationService.js
export const createAdminNotification = async (data) => {
  try {
    const notification = new AdminNotification({
      title: data.title,
      message: data.message,
      type: data.type || 'info',
      sourceId: data.sourceId,
      sourceModel: data.sourceModel,
      sourceType: data.sourceType,
      link: data.link
    });
    
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating admin notification:', error);
    throw error;
  }
};

// API endpoint to create notification (for testing/manual creation)
export const createNotification = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
      });
    }
    
    const { title, message, type, sourceId, sourceModel, sourceType, link } = req.body;
    
    const notification = await createAdminNotification({
      title,
      message,
      type,
      sourceId,
      sourceModel,
      sourceType,
      link
    });
    
    return res.status(201).json({
      success: true,
      message: 'Admin notification created successfully',
      data: notification
    });
  } catch (error) {
    console.error('Error creating admin notification:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

export default {
  getAdminNotifications,
  getNotificationById,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  createSystemNotification,
  getNotificationStats,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createAdminNotification,
  createNotification
};

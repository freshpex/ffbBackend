import Notification from "../models/Notification.js";
import { ApiError } from "../middleware/errorHandler.js";

// Get user notifications
export const getUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit = 10, offset = 0, unreadOnly = false } = req.query;

    // Build query
    const query = { user: userId };
    if (unreadOnly === "true") {
      query.read = false;
    }

    // Fetch notifications
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalCount = await Notification.countDocuments(query);

    res.status(200).json({
      success: true,
      data: notifications,
      meta: {
        total: totalCount,
        unreadCount: await Notification.countDocuments({
          user: userId,
          read: false,
        }),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Mark notification as read
export const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const notification = await Notification.findById(notificationId);

    // Check if notification exists
    if (!notification) {
      throw new ApiError("Notification not found", 404);
    }

    // Check if notification belongs to user
    if (notification.user.toString() !== userId) {
      throw new ApiError("Unauthorized", 403);
    }

    // Update notification
    notification.read = true;
    await notification.save();

    res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    next(error);
  }
};

// Mark all notifications as read
export const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Update all user's unread notifications
    await Notification.updateMany(
      { user: userId, read: false },
      { read: true },
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    next(error);
  }
};

// Delete notification
export const deleteNotification = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;

    const notification = await Notification.findById(notificationId);

    // Check if notification exists
    if (!notification) {
      throw new ApiError("Notification not found", 404);
    }

    // Check if notification belongs to user
    if (notification.user.toString() !== userId) {
      throw new ApiError("Unauthorized", 403);
    }

    // Delete notification
    await Notification.findByIdAndDelete(notificationId);

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};

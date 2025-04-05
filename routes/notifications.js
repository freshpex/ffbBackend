import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getUserNotifications,
  getNotificationById,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getNotificationStats
} from '../controllers/UserNotificationController.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);

// Get all user notifications
router.get('/', asyncHandler(getUserNotifications));

// Get notification statistics
router.get('/stats', asyncHandler(getNotificationStats));

// Mark all notifications as read
router.put('/mark-all-read', asyncHandler(markAllNotificationsAsRead));

// Get notification by ID
router.get('/:id', asyncHandler(getNotificationById));

// Mark notification as read
router.put('/:id/read', asyncHandler(markNotificationAsRead));

// Delete notification
router.delete('/:id', asyncHandler(deleteNotification));

export default router;

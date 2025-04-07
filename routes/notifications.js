import express from 'express';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification
} from '../controllers/UserNotificationController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// User routes - require authentication
router.get('/', verifyToken, getNotifications);
router.put('/:notificationId/read', verifyToken, markAsRead);
router.put('/read-all', verifyToken, markAllAsRead);
router.delete('/:notificationId', verifyToken, deleteNotification);


router.post('/', verifyToken, createNotification);

export default router;

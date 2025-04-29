import Notification from "../models/Notification.js";
import AdminNotification from "../models/AdminNotification.js";
import User from "../models/User.js";
import logger from "../middleware/logger.js";
import { sendNotificationEmail } from "./emailService.js";
import { createAdminNotification as createAdminNotificationInDB } from "../controllers/AdminNotificationController.js";
import websocketService from "./websocket.js";

// Function to create and broadcast a notification
const createAndBroadcastNotification = async (data) => {
  try {
    // Create notification in database
    const notification = await createAdminNotificationInDB(data);

    // Broadcast to connected admin clients via WebSocket
    if (websocketService && websocketService.emitAdminNotification) {
      websocketService.emitAdminNotification(websocketService.io, notification);
    }

    return notification;
  } catch (error) {
    console.error("Error creating and broadcasting notification:", error);
    throw error;
  }
};

// KYC notification service
export const createKycNotification = async (kycRequest, user) => {
  try {
    const { _id, status } = kycRequest;
    
    let adminNotification = null;
    if (status === "pending") {
      adminNotification = await createAndBroadcastNotification({
        title: "New KYC Verification Request",
        message: `${user.fullName} has submitted a KYC verification request that requires review.`,
        type: "kyc",
        sourceId: _id,
        sourceModel: "KycRequest",
        sourceType: "kyc_submitted",
        link: `/admin/kyc/${_id}`,
      });
    } else if (status === "approved") {
      adminNotification = await createAndBroadcastNotification({
        title: "KYC Request Approved",
        message: `${user.fullName}'s KYC verification request has been approved.`,
        type: "kyc",
        sourceId: _id,
        sourceModel: "KycRequest",
        sourceType: "kyc_approved",
        link: `/admin/kyc/${_id}`,
      });
      
      await createUserNotification({
        recipient: user._id,
        title: "KYC Verification Approved",
        message: "Your KYC verification request has been approved. You now have access to all platform features.",
        type: "kyc",
        priority: "high",
        link: "/dashboard/profile",
      }, true); // Send email notification
    } else if (status === "rejected") {
      adminNotification = await createAndBroadcastNotification({
        title: "KYC Request Rejected",
        message: `${user.fullName}'s KYC verification request has been rejected.`,
        type: "kyc",
        sourceId: _id,
        sourceModel: "KycRequest",
        sourceType: "kyc_rejected",
        link: `/admin/kyc/${_id}`,
      });
      
      await createUserNotification({
        recipient: user._id,
        title: "KYC Verification Rejected",
        message: "Your KYC verification request has been rejected. Please check your profile for more details and resubmit.",
        type: "kyc",
        priority: "high",
        link: "/dashboard/profile",
      }, true);
    }

    return adminNotification;
  } catch (error) {
    console.error("Error creating KYC notification:", error);
    throw error;
  }
};

// Support Ticket notification service
export const createSupportTicketNotification = async (ticket, user) => {
  try {
    const { _id, subject, status, user: ticketUser } = ticket;
    let adminNotification = null;
    
    // Get the user ID - it could be in ticket.user or passed as user._id
    const userId = ticketUser || user._id;
    
    // For admin notifications
    if (status === "open") {
      adminNotification = await createAndBroadcastNotification({
        title: "New Support Ticket",
        message: `${user.fullName} has opened a new support ticket: "${subject}".`,
        type: "support",
        sourceId: _id,
        sourceModel: "SupportTicket",
        sourceType: "ticket_created",
        link: `/admin/support/${_id}`,
      });
    } else if (status === "closed") {
      adminNotification = await createAndBroadcastNotification({
        title: "Support Ticket Closed",
        message: `Support ticket "${subject}" from ${user.fullName} has been closed.`,
        type: "support",
        sourceId: _id,
        sourceModel: "SupportTicket",
        sourceType: "ticket_closed",
        link: `/admin/support/${_id}`,
      });
      
      // Notify user when their ticket is closed
      await createUserNotification({
        recipient: userId,
        title: "Support Ticket Closed",
        message: `Your support ticket "${subject}" has been closed. Please submit a new ticket if you need further assistance.`,
        type: "support",
        priority: "medium",
        link: "/dashboard/support",
      });
    } else if (status === "responded") {
      adminNotification = await createAndBroadcastNotification({
        title: "Support Ticket Reply",
        message: `${user.fullName} has replied to support ticket: "${subject}".`,
        type: "support",
        sourceId: _id,
        sourceModel: "SupportTicket",
        sourceType: "ticket_replied",
        link: `/admin/support/${_id}`,
      });
      
      // Notify user when admin responds to their ticket
      await createUserNotification({
        recipient: userId,
        title: "New Reply to Your Support Ticket",
        message: `A support agent has replied to your ticket "${subject}". Please check for updates.`,
        type: "support",
        priority: "medium",
        link: "/dashboard/support",
      });
    } else if (status === "resolved") {
      // Notify user when their ticket is resolved
      await createUserNotification({
        recipient: userId,
        title: "Support Ticket Resolved",
        message: `Your support ticket "${subject}" has been resolved. Please let us know if you have any further questions.`,
        type: "support",
        priority: "medium",
        link: "/dashboard/support",
      });
    }

    return adminNotification;
  } catch (error) {
    console.error("Error creating support ticket notification:", error);
    throw error;
  }
};

// Card request notification service
export const createCardRequestNotification = async (cardRequest, user) => {
  try {
    const { _id, cardType, status } = cardRequest;
    let adminNotification = null;

    if (status === "pending") {
      adminNotification = await createAndBroadcastNotification({
        title: "New Card Request",
        message: `${user.fullName} has requested a new ${cardType} card.`,
        type: "card",
        sourceId: _id,
        sourceModel: "ATMCard",
        sourceType: "card_requested",
        link: `/admin/cards/${_id}`,
      });
    } else if (status === "approved") {
      adminNotification = await createAndBroadcastNotification({
        title: "Card Request Approved",
        message: `${user.fullName}'s request for a ${cardType} card has been approved.`,
        type: "card",
        sourceId: _id,
        sourceModel: "ATMCard",
        sourceType: "card_approved",
        link: `/admin/cards/${_id}`,
      });
      
      // Notify the user when their card request is approved
      await createUserNotification({
        recipient: user._id,
        title: "Card Request Approved",
        message: `Your request for a ${cardType} card has been approved. You will receive your card details shortly.`,
        type: "card",
        priority: "high",
        link: "/dashboard/cards",
      }, true);
    } else if (status === "rejected") {
      adminNotification = await createAndBroadcastNotification({
        title: "Card Request Rejected",
        message: `${user.fullName}'s request for a ${cardType} card has been rejected.`,
        type: "card",
        sourceId: _id,
        sourceModel: "ATMCard",
        sourceType: "card_rejected",
        link: `/admin/cards/${_id}`,
      });
      
      // Notify the user when their card request is rejected
      await createUserNotification({
        recipient: user._id,
        title: "Card Request Rejected",
        message: `Your request for a ${cardType} card has been rejected. Please contact support for more information.`,
        type: "card",
        priority: "medium",
        link: "/dashboard/cards",
      }, true);
    }

    return adminNotification;
  } catch (error) {
    console.error("Error creating card request notification:", error);
    throw error;
  }
};

// Transaction notification service
export const createTransactionNotification = async (transaction, user) => {
  try {
    const { _id, type, amount, currency, status } = transaction;
    let adminNotification = null;

    // Format the amount for display
    const formattedAmount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(Math.abs(amount));

    // For admin notifications - notify on large amounts or pending status
    if (amount > 10000 || status === "pending") {
      const title =
        type === "deposit"
          ? `Large Deposit (${formattedAmount})`
          : type === "withdrawal"
            ? `Large Withdrawal (${formattedAmount})`
            : `Large Transaction (${formattedAmount})`;

      adminNotification = await createAndBroadcastNotification({
        title,
        message: `${user.fullName} has initiated a ${type} of ${formattedAmount} that requires review.`,
        type: "transaction",
        sourceId: _id,
        sourceModel: "Transaction",
        sourceType: `transaction_${type}_${status}`,
        link: `/admin/transactions/${_id}`,
      });
    }

    // Always notify user about their own transactions
    if (type === "deposit") {
      let userTitle = "";
      let userMessage = "";

      if (status === "pending") {
        userTitle = `Deposit Processing: ${formattedAmount}`;
        userMessage = `Your deposit of ${formattedAmount} is being processed and will be credited to your account once confirmed.`;
      } else if (status === "completed") {
        userTitle = `Deposit Successful: ${formattedAmount}`;
        userMessage = `Your deposit of ${formattedAmount} has been successfully credited to your account.`;
      } else if (status === "rejected") {
        userTitle = `Deposit Rejected: ${formattedAmount}`;
        userMessage = `Unfortunately, your deposit of ${formattedAmount} was rejected. Please contact support for assistance.`;
      }

      if (userTitle && userMessage) {
        await createUserNotification({
          recipient: user._id,
          title: userTitle,
          message: userMessage,
          type: "transaction",
          priority: status === "rejected" ? "high" : "medium",
          link: "/dashboard/transactions",
        }, status !== "pending"); // Send email for completed or rejected
      }
    } else if (type === "withdrawal") {
      let userTitle = "";
      let userMessage = "";

      if (status === "pending") {
        userTitle = `Withdrawal Request: ${formattedAmount}`;
        userMessage = `Your withdrawal request for ${formattedAmount} has been received and is being processed.`;
      } else if (status === "completed") {
        userTitle = `Withdrawal Complete: ${formattedAmount}`;
        userMessage = `Your withdrawal of ${formattedAmount} has been successfully processed and sent to your account.`;
      } else if (status === "rejected") {
        userTitle = `Withdrawal Rejected: ${formattedAmount}`;
        userMessage = `Unfortunately, your withdrawal request for ${formattedAmount} was rejected. The funds have been returned to your account.`;
      }

      if (userTitle && userMessage) {
        await createUserNotification({
          recipient: user._id,
          title: userTitle,
          message: userMessage,
          type: "transaction",
          priority: status === "rejected" ? "high" : "medium",
          link: "/dashboard/transactions",
        }, status !== "pending"); // Send email for completed or rejected
      }
    }

    return adminNotification;
  } catch (error) {
    console.error("Error creating transaction notification:", error);
    throw error;
  }
};

/**
 * Create a notification for a regular user
 * @param {Object} notificationData - Notification data
 * @param {string|Object} notificationData.recipient - User ID or User object
 * @param {string} notificationData.title - Notification title
 * @param {string} notificationData.message - Notification message
 * @param {string} [notificationData.type] - Notification type
 * @param {string} [notificationData.priority] - Notification priority
 * @param {string} [notificationData.link] - Optional link
 * @param {Object} [notificationData.data] - Optional additional data
 * @param {boolean} [sendEmail=false] - Whether to send email notification
 * @returns {Promise<Object>} Created notification
 */
export const createUserNotification = async (notificationData, sendEmail = false) => {
  try {
    const {
      recipient,
      title,
      message,
      type = "info",
      priority = "medium",
      link = null,
      data = {},
    } = notificationData;

    if (!recipient || !title || !message) {
      throw new Error("Recipient, title, and message are required");
    }

    // Handle either user ID or user object
    const userId = typeof recipient === "object" ? recipient._id : recipient;
    
    const notification = new Notification({
      recipient: userId,
      title,
      message,
      type,
      priority,
      link,
      data,
      read: false,
      forAdminOnly: false,
    });

    await notification.save();
    
    // Send email notification if requested
    if (sendEmail) {
      try {
        // Get user if only ID was provided
        let user = typeof recipient === "object" ? recipient : await User.findById(userId);
        
        if (user && user.email && user.notificationSettings?.emailNotifications) {
          await sendNotificationEmail(user, notification);
        }
      } catch (emailError) {
        logger.error("Error sending notification email:", emailError);
        // We don't want to fail the notification creation if email fails
      }
    }

    return notification;
  } catch (error) {
    logger.error("Error creating user notification:", error);
    throw error;
  }
};

/**
 * Create a notification for admin users
 * @param {Object} notificationData - Notification data
 * @param {string} notificationData.title - Notification title
 * @param {string} notificationData.message - Notification message
 * @param {string} [notificationData.type] - Notification type
 * @param {string} [notificationData.sourceId] - Optional source ID reference
 * @param {string} [notificationData.sourceModel] - Optional source model name
 * @param {string} [notificationData.sourceType] - Optional source type
 * @param {string} [notificationData.link] - Optional link
 * @param {boolean} [sendEmail=false] - Whether to send email notification
 * @returns {Promise<Object>} Created notification
 */
export const createAdminNotification = async (notificationData, sendEmail = false) => {
  try {
    const {
      title,
      message,
      type = "info",
      sourceId = null,
      sourceModel = null,
      sourceType = null,
      link = null,
    } = notificationData;

    if (!title || !message) {
      throw new Error("Title and message are required");
    }

    const notification = new AdminNotification({
      title,
      message,
      type,
      sourceId,
      sourceModel,
      sourceType,
      link,
      read: false,
    });

    await notification.save();

    // If email notification is requested, send to all admin users
    if (sendEmail) {
      try {
        const adminUsers = await User.find({ role: { $in: ["admin", "superadmin"] } })
          .select("email notificationSettings");
        
        for (const admin of adminUsers) {
          if (admin.email && admin.notificationSettings?.emailNotifications) {
            await sendNotificationEmail(admin, notification);
          }
        }
      } catch (emailError) {
        logger.error("Error sending admin notification email:", emailError);
        // We don't want to fail the notification creation if email fails
      }
    }

    return notification;
  } catch (error) {
    logger.error("Error creating admin notification:", error);
    throw error;
  }
};

/**
 * Create a system notification for all admin users
 * @param {Object} notificationData - Notification data
 * @param {string} notificationData.title - Notification title
 * @param {string} notificationData.message - Notification message
 * @param {string} [notificationData.type] - Notification type
 * @param {string} [notificationData.priority] - Notification priority
 * @param {string} [notificationData.link] - Optional link
 * @param {boolean} [sendEmail=false] - Whether to send email notification
 * @returns {Promise<Array>} Created notifications
 */
export const createSystemNotification = async (notificationData, sendEmail = false) => {
  try {
    const {
      title,
      message,
      type = "system",
      priority = "medium",
      link = null,
    } = notificationData;

    if (!title || !message) {
      throw new Error("Title and message are required");
    }

    // Find all admin users
    const adminUsers = await User.find({ role: { $in: ["admin", "superadmin"] } }).select("_id email notificationSettings");

    if (adminUsers.length === 0) {
      throw new Error("No admin users found");
    }

    // Create notifications for all admins
    const notifications = await Promise.all(
      adminUsers.map(async (admin) => {
        const notification = new Notification({
          recipient: admin._id,
          type,
          title,
          message,
          priority,
          link,
          forAdminOnly: true,
        });

        await notification.save();
        
        // Send email if requested
        if (sendEmail && admin.email && admin.notificationSettings?.emailNotifications) {
          try {
            await sendNotificationEmail(admin, notification);
          } catch (emailError) {
            logger.error(`Error sending system notification email to ${admin.email}:`, emailError);
          }
        }
        
        return notification;
      })
    );

    return notifications;
  } catch (error) {
    logger.error("Error creating system notification:", error);
    throw error;
  }
};

/**
 * Broadcast a notification to multiple users
 * @param {Array} userIds - Array of user IDs
 * @param {Object} notificationData - Notification data
 * @param {boolean} [sendEmail=false] - Whether to send email notification
 * @returns {Promise<Array>} Created notifications
 */
export const broadcastNotification = async (userIds, notificationData, sendEmail = false) => {
  try {
    const {
      title,
      message,
      type = "info",
      priority = "medium",
      link = null,
      data = {},
    } = notificationData;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new Error("At least one user ID is required");
    }

    if (!title || !message) {
      throw new Error("Title and message are required");
    }

    // Create notifications for all specified users
    const notifications = await Promise.all(
      userIds.map(async (userId) => {
        const notification = new Notification({
          recipient: userId,
          title,
          message,
          type,
          priority,
          link,
          data,
          read: false,
          forAdminOnly: false,
        });

        await notification.save();
        
        // Send email if requested
        if (sendEmail) {
          try {
            const user = await User.findById(userId).select("email notificationSettings");
            if (user && user.email && user.notificationSettings?.emailNotifications) {
              await sendNotificationEmail(user, notification);
            }
          } catch (emailError) {
            logger.error(`Error sending broadcast notification email for user ${userId}:`, emailError);
          }
        }
        
        return notification;
      })
    );

    return notifications;
  } catch (error) {
    logger.error("Error broadcasting notification:", error);
    throw error;
  }
};

/**
 * Delete notifications that have expired
 */
export const deleteExpiredNotifications = async () => {
  try {
    const now = new Date();
    const deleted = await Notification.deleteMany({
      expiresAt: { $lt: now, $ne: null }
    });
    
    logger.info(`Deleted ${deleted.deletedCount} expired notifications`);
    return deleted.deletedCount;
  } catch (error) {
    logger.error("Error deleting expired notifications:", error);
    throw error;
  }
};

/**
 * Create login notification for admin when user logs in
 * @param {Object} user - User who logged in
 * @param {Object} loginData - Login details like IP, device, etc.
 * @returns {Promise<Object>} Created notification
 */
export const createLoginNotification = async (user, loginData = {}) => {
  try {
    if (!user) {
      throw new Error("User is required for login notification");
    }

    // Create notification for admin about suspicious logins
    const isSuspicious = loginData.suspicious || false;
    
    if (isSuspicious || user.role === "admin" || user.role === "superadmin") {
      await createAndBroadcastNotification({
        title: isSuspicious ? "Suspicious Login Alert" : "Admin Login",
        message: isSuspicious 
          ? `Suspicious login detected for user ${user.email} from IP ${loginData.ipAddress || 'unknown IP'}`
          : `Admin ${user.email} logged in from ${loginData.ipAddress || 'unknown IP'}`,
        type: isSuspicious ? "security" : "system",
        sourceType: "login_activity",
        priority: isSuspicious ? "high" : "medium",
      });
    }
    
    // Don't notify user about their own regular logins to avoid spam
    // But do notify them about suspicious logins or new device logins
    if (isSuspicious || loginData.newDevice) {
      await createUserNotification({
        recipient: user._id,
        title: isSuspicious ? "Suspicious Login Detected" : "New Device Login",
        message: isSuspicious
          ? `We detected a suspicious login to your account from ${loginData.location || 'an unknown location'}. If this wasn't you, please secure your account immediately.`
          : `Your account was accessed from a new device: ${loginData.device || 'Unknown'}. If this wasn't you, please contact support.`,
        type: "security",
        priority: isSuspicious ? "high" : "medium",
        link: "/dashboard/security",
      }, true); // Send email for security notifications
    }
    
    return true;
  } catch (error) {
    logger.error("Error creating login notification:", error);
    // Don't throw error to prevent login failures due to notification issues
    return false;
  }
};

export default {
  createKycNotification,
  createSupportTicketNotification,
  createCardRequestNotification,
  createTransactionNotification,
  createUserNotification,
  createAdminNotification,
  createSystemNotification,
  broadcastNotification,
  deleteExpiredNotifications,
  broadcastNotification,
  deleteExpiredNotifications,
  createLoginNotification
};
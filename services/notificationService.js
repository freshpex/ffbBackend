import AdminNotification from '../models/AdminNotification.js';
import { createAdminNotification } from '../controllers/AdminNotificationController.js';
import websocketService from './websocket.js';

// Function to create and broadcast a notification
const createAndBroadcastNotification = async (data) => {
  try {
    // Create notification in database
    const notification = await createAdminNotification(data);
    
    // Broadcast to connected admin clients via WebSocket
    if (websocketService && websocketService.emitAdminNotification) {
      websocketService.emitAdminNotification(websocketService.io, notification);
    }
    
    return notification;
  } catch (error) {
    console.error('Error creating and broadcasting notification:', error);
    throw error;
  }
};

// KYC notification service
export const createKycNotification = async (kycRequest, user) => {
  try {
    const { _id, status } = kycRequest;
    
    if (status === 'pending') {
      return await createAndBroadcastNotification({
        title: 'New KYC Verification Request',
        message: `${user.fullName} has submitted a KYC verification request that requires review.`,
        type: 'kyc',
        sourceId: _id,
        sourceModel: 'KycRequest',
        sourceType: 'kyc_submitted',
        link: `/admin/kyc/${_id}`
      });
    } else if (status === 'approved') {
      return await createAndBroadcastNotification({
        title: 'KYC Request Approved',
        message: `${user.fullName}'s KYC verification request has been approved.`,
        type: 'kyc',
        sourceId: _id,
        sourceModel: 'KycRequest',
        sourceType: 'kyc_approved',
        link: `/admin/kyc/${_id}`
      });
    } else if (status === 'rejected') {
      return await createAndBroadcastNotification({
        title: 'KYC Request Rejected',
        message: `${user.fullName}'s KYC verification request has been rejected.`,
        type: 'kyc',
        sourceId: _id,
        sourceModel: 'KycRequest',
        sourceType: 'kyc_rejected',
        link: `/admin/kyc/${_id}`
      });
    }
    
    return null;
  } catch (error) {
    console.error('Error creating KYC notification:', error);
    throw error;
  }
};

// Support Ticket notification service
export const createSupportTicketNotification = async (ticket, user) => {
  try {
    const { _id, subject, status } = ticket;
    
    if (status === 'open') {
      return await createAndBroadcastNotification({
        title: 'New Support Ticket',
        message: `${user.fullName} has opened a new support ticket: "${subject}".`,
        type: 'support',
        sourceId: _id,
        sourceModel: 'SupportTicket',
        sourceType: 'ticket_created',
        link: `/admin/support/${_id}`
      });
    } else if (status === 'closed') {
      return await createAndBroadcastNotification({
        title: 'Support Ticket Closed',
        message: `Support ticket "${subject}" from ${user.fullName} has been closed.`,
        type: 'support',
        sourceId: _id,
        sourceModel: 'SupportTicket',
        sourceType: 'ticket_closed',
        link: `/admin/support/${_id}`
      });
    } else if (status === 'responded') {
      return await createAndBroadcastNotification({
        title: 'Support Ticket Reply',
        message: `${user.fullName} has replied to support ticket: "${subject}".`,
        type: 'support',
        sourceId: _id,
        sourceModel: 'SupportTicket',
        sourceType: 'ticket_replied',
        link: `/admin/support/${_id}`
      });
    }
    
    return null;
  } catch (error) {
    console.error('Error creating support ticket notification:', error);
    throw error;
  }
};

// Card request notification service
export const createCardRequestNotification = async (cardRequest, user) => {
  try {
    const { _id, cardType, status } = cardRequest;
    
    if (status === 'pending') {
      return await createAndBroadcastNotification({
        title: 'New Card Request',
        message: `${user.fullName} has requested a new ${cardType} card.`,
        type: 'card',
        sourceId: _id,
        sourceModel: 'ATMCard',
        sourceType: 'card_requested',
        link: `/admin/cards/${_id}`
      });
    } else if (status === 'approved') {
      return await createAndBroadcastNotification({
        title: 'Card Request Approved',
        message: `${user.fullName}'s request for a ${cardType} card has been approved.`,
        type: 'card',
        sourceId: _id,
        sourceModel: 'ATMCard',
        sourceType: 'card_approved',
        link: `/admin/cards/${_id}`
      });
    } else if (status === 'rejected') {
      return await createAndBroadcastNotification({
        title: 'Card Request Rejected',
        message: `${user.fullName}'s request for a ${cardType} card has been rejected.`,
        type: 'card',
        sourceId: _id,
        sourceModel: 'ATMCard',
        sourceType: 'card_rejected',
        link: `/admin/cards/${_id}`
      });
    }
    
    return null;
  } catch (error) {
    console.error('Error creating card request notification:', error);
    throw error;
  }
};

// Transaction notification service
export const createTransactionNotification = async (transaction, user) => {
  try {
    const { _id, type, amount, currency, status } = transaction;
    
    // Only notify for large amounts or specific statuses
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD'
    }).format(amount);
    
    if (amount > 10000 || status === 'pending') {
      const title = type === 'deposit' 
        ? `Large Deposit (${formattedAmount})` 
        : type === 'withdrawal' 
          ? `Large Withdrawal (${formattedAmount})` 
          : `Large Transaction (${formattedAmount})`;
      
      return await createAndBroadcastNotification({
        title,
        message: `${user.fullName} has initiated a ${type} of ${formattedAmount} that requires review.`,
        type: 'transaction',
        sourceId: _id,
        sourceModel: 'Transaction',
        sourceType: `transaction_${type}_${status}`,
        link: `/admin/transactions/${_id}`
      });
    }
    
    return null;
  } catch (error) {
    console.error('Error creating transaction notification:', error);
    throw error;
  }
};

// System notification service
export const createSystemNotification = async (title, message, type = 'system') => {
  try {
    return await createAndBroadcastNotification({
      title,
      message,
      type,
      sourceType: 'system_event'
    });
  } catch (error) {
    console.error('Error creating system notification:', error);
    throw error;
  }
};

export default {
  createKycNotification,
  createSupportTicketNotification,
  createCardRequestNotification,
  createTransactionNotification,
  createSystemNotification
};

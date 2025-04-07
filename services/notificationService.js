import AdminNotification from '../models/AdminNotification.js';
import { createAdminNotification } from '../controllers/AdminNotificationController.js';

// KYC notification service
export const createKycNotification = async (kycRequest, user) => {
  try {
    const { _id, status } = kycRequest;
    let notification;
    
    if (status === 'pending') {
      notification = await createAdminNotification({
        title: 'New KYC Verification Request',
        message: `${user.fullName} has submitted a KYC verification request that requires review.`,
        type: 'kyc',
        sourceId: _id,
        sourceModel: 'KycRequest',
        sourceType: 'kyc_submitted',
        link: `/admin/kyc/${_id}`
      });
    } else if (status === 'approved') {
      notification = await createAdminNotification({
        title: 'KYC Request Approved',
        message: `${user.fullName}'s KYC verification request has been approved.`,
        type: 'kyc',
        sourceId: _id,
        sourceModel: 'KycRequest',
        sourceType: 'kyc_approved',
        link: `/admin/kyc/${_id}`
      });
    } else if (status === 'rejected') {
      notification = await createAdminNotification({
        title: 'KYC Request Rejected',
        message: `${user.fullName}'s KYC verification request has been rejected.`,
        type: 'kyc',
        sourceId: _id,
        sourceModel: 'KycRequest',
        sourceType: 'kyc_rejected',
        link: `/admin/kyc/${_id}`
      });
    }
    
    return notification;
  } catch (error) {
    console.error('Error creating KYC notification:', error);
    throw error;
  }
};

// Support Ticket notification service
export const createSupportTicketNotification = async (ticket, user) => {
  try {
    const { _id, subject, status } = ticket;
    let notification;
    
    if (status === 'open') {
      notification = await createAdminNotification({
        title: 'New Support Ticket',
        message: `${user.fullName} has opened a new support ticket: "${subject}".`,
        type: 'support',
        sourceId: _id,
        sourceModel: 'SupportTicket',
        sourceType: 'ticket_created',
        link: `/admin/support/${_id}`
      });
    } else if (status === 'closed') {
      notification = await createAdminNotification({
        title: 'Support Ticket Closed',
        message: `Support ticket "${subject}" from ${user.fullName} has been closed.`,
        type: 'support',
        sourceId: _id,
        sourceModel: 'SupportTicket',
        sourceType: 'ticket_closed',
        link: `/admin/support/${_id}`
      });
    } else if (status === 'responded') {
      notification = await createAdminNotification({
        title: 'Support Ticket Reply',
        message: `${user.fullName} has replied to support ticket: "${subject}".`,
        type: 'support',
        sourceId: _id,
        sourceModel: 'SupportTicket',
        sourceType: 'ticket_replied',
        link: `/admin/support/${_id}`
      });
    }
    
    return notification;
  } catch (error) {
    console.error('Error creating support ticket notification:', error);
    throw error;
  }
};

// Card request notification service
export const createCardRequestNotification = async (cardRequest, user) => {
  try {
    const { _id, cardType, status } = cardRequest;
    let notification;
    
    if (status === 'pending') {
      notification = await createAdminNotification({
        title: 'New Card Request',
        message: `${user.fullName} has requested a new ${cardType} card.`,
        type: 'card',
        sourceId: _id,
        sourceModel: 'ATMCard',
        sourceType: 'card_requested',
        link: `/admin/cards/${_id}`
      });
    } else if (status === 'approved') {
      notification = await createAdminNotification({
        title: 'Card Request Approved',
        message: `${user.fullName}'s request for a ${cardType} card has been approved.`,
        type: 'card',
        sourceId: _id,
        sourceModel: 'ATMCard',
        sourceType: 'card_approved',
        link: `/admin/cards/${_id}`
      });
    } else if (status === 'rejected') {
      notification = await createAdminNotification({
        title: 'Card Request Rejected',
        message: `${user.fullName}'s request for a ${cardType} card has been rejected.`,
        type: 'card',
        sourceId: _id,
        sourceModel: 'ATMCard',
        sourceType: 'card_rejected',
        link: `/admin/cards/${_id}`
      });
    }
    
    return notification;
  } catch (error) {
    console.error('Error creating card request notification:', error);
    throw error;
  }
};

// Transaction notification service
export const createTransactionNotification = async (transaction, user) => {
  try {
    const { _id, type, amount, currency, status } = transaction;
    let notification;
    
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
      
      notification = await createAdminNotification({
        title,
        message: `${user.fullName} has initiated a ${type} of ${formattedAmount} that requires review.`,
        type: 'transaction',
        sourceId: _id,
        sourceModel: 'Transaction',
        sourceType: `transaction_${type}_${status}`,
        link: `/admin/transactions/${_id}`
      });
    }
    
    return notification;
  } catch (error) {
    console.error('Error creating transaction notification:', error);
    throw error;
  }
};

// System notification service
export const createSystemNotification = async (title, message, type = 'system') => {
  try {
    const notification = await createAdminNotification({
      title,
      message,
      type,
      sourceType: 'system_event'
    });
    
    return notification;
  } catch (error) {
    console.error('Error creating system notification:', error);
    throw error;
  }
};

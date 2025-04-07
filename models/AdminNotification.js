const mongoose = require('mongoose');

const adminNotificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['info', 'alert', 'success', 'warning', 'user', 'kyc', 'card', 'transaction', 'support', 'security', 'system'],
    default: 'info'
  },
  read: {
    type: Boolean,
    default: false
  },
  sourceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mixed',
    required: false // ID of the related document (KYC request, support ticket, etc.)
  },
  sourceModel: {
    type: String,
    required: false // Name of the model the notification relates to
  },
  sourceType: {
    type: String,
    required: false // Specific type within the source (e.g., 'kyc_submitted', 'ticket_created')
  },
  link: {
    type: String,
    required: false // Optional link to navigate to when clicking the notification
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add index for faster queries
adminNotificationSchema.index({ read: 1 });
adminNotificationSchema.index({ type: 1 });
adminNotificationSchema.index({ createdAt: -1 });

const AdminNotification = mongoose.model('AdminNotification', adminNotificationSchema);

module.exports = AdminNotification;

import mongoose from 'mongoose';

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
    required: false
  },
  sourceModel: {
    type: String,
    required: false
  },
  sourceType: {
    type: String,
    required: false
  },
  link: {
    type: String,
    required: false
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

export default AdminNotification;

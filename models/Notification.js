import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      enum: ['info', 'success', 'warning', 'error', 'system', 'transaction', 'kyc', 'support'],
      default: 'info'
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    read: {
      type: Boolean,
      default: false
    },
    link: {
      type: String,
      default: null
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    expiresAt: {
      type: Date,
      default: null
    },
    forAdminOnly: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Add indexes for better query performance
notificationSchema.index({ recipient: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ forAdminOnly: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;

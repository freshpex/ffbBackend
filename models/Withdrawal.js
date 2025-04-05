import mongoose from 'mongoose';

const withdrawalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'USD'
  },
  method: {
    type: String,
    enum: ['bank_transfer', 'crypto', 'paypal', 'check', 'atm_card', 'other'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'on_hold'],
    default: 'pending'
  },
  reference: {
    type: String
  },
  details: {
    bankName: String,
    accountNumber: String,
    accountName: String,
    routingNumber: String,
    swiftCode: String,
    cryptoAddress: String,
    network: String,
    paymentMethod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentMethod'
    }
  },
  verificationDocument: String,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String,
  processingTime: {
    type: Number,  // Time taken to process in minutes
    default: 0
  },
  completedAt: Date,
  failureReason: String,
  fee: {
    type: Number,
    default: 0
  },
  ipAddress: String,
  deviceInfo: String,
  requireAdditionalVerification: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for faster lookups
withdrawalSchema.index({ user: 1 });
withdrawalSchema.index({ status: 1 });
withdrawalSchema.index({ createdAt: -1 });
withdrawalSchema.index({ method: 1 });

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

export default Withdrawal;

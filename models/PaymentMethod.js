import mongoose from 'mongoose';

const paymentMethodSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['card', 'bank_account', 'crypto', 'paypal'],
    required: true
  },
  name: {
    type: String,
    required: true
  },
  last4: {
    type: String,
    required: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  // Card specific fields
  expiryMonth: {
    type: Number,
    min: 1,
    max: 12
  },
  expiryYear: {
    type: Number,
    min: 2000
  },
  cardholderName: String,
  brand: String,
  bankName: String,
  accountName: String,
  routingNumber: String,
  cryptoAddress: String,
  network: String,
  status: {
    type: String,
    enum: ['active', 'expired', 'disabled'],
    default: 'active'
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

paymentMethodSchema.index({ user: 1 });
paymentMethodSchema.index({ type: 1 });
paymentMethodSchema.index({ status: 1 });

const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);

export default PaymentMethod;

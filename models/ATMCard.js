import mongoose from 'mongoose';

const atmCardSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  cardNumber: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['virtual-debit', 'standard-debit', 'premium-debit'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'frozen', 'cancelled', 'expired'],
    default: 'pending'
  },
  frozen: {
    type: Boolean,
    default: false
  },
  currency: {
    type: String,
    required: true,
    default: 'USD'
  },
  balance: {
    type: Number,
    default: 0
  },
  expiryDate: {
    type: String,
    required: true
  },
  cvv: {
    type: String
  },
  billingAddress: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },
  shippingAddress: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },
  limits: {
    daily: {
      type: Number,
      default: 1000
    },
    dailyUsed: {
      type: Number,
      default: 0
    },
    monthly: {
      type: Number,
      default: 5000
    },
    monthlyUsed: {
      type: Number,
      default: 0
    }
  },
  issuanceFee: {
    type: Number,
    default: 0
  },
  monthlyFee: {
    type: Number,
    default: 0
  },
  activationDate: {
    type: Date
  },
  requestDetails: {
    requestType: {
      type: String,
      enum: ['new', 'replacement', 'upgrade'],
      default: 'new'
    },
    reason: String,
    notes: String
  },
  metadata: {
    lastUsed: Date,
    deviceFingerprint: String,
    ipAddress: String
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
atmCardSchema.index({ user: 1 });
atmCardSchema.index({ status: 1 });

const ATMCard = mongoose.model('ATMCard', atmCardSchema);

export default ATMCard;

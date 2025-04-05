import mongoose from 'mongoose';

const investmentPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  minimumInvestment: {
    type: Number,
    required: true,
    min: 0
  },
  maximumInvestment: {
    type: Number,
    min: 0
  },
  annualInterestRate: {
    type: Number,
    required: true,
    min: 0
  },
  durationDays: {
    type: Number,
    required: true,
    min: 1
  },
  payoutFrequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'annually', 'maturity'],
    default: 'maturity'
  },
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high'],
    required: true
  },
  earlyWithdrawalAllowed: {
    type: Boolean,
    default: false
  },
  earlyWithdrawalFee: {
    type: Number,
    default: 0,
    min: 0,
    max: 100 // Percentage
  },
  compounding: {
    type: Boolean,
    default: false
  },
  currency: {
    type: String,
    default: 'USD'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPromoted: {
    type: Boolean,
    default: false
  },
  tags: [String],
  category: {
    type: String,
    enum: ['fixed', 'variable', 'crypto', 'stocks', 'bonds', 'real_estate', 'commodity', 'mutual_fund'],
    default: 'fixed'
  },
  image: String,
  availableToNewUsers: {
    type: Boolean,
    default: true
  },
  kycRequired: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
investmentPlanSchema.index({ isActive: 1 });
investmentPlanSchema.index({ isPromoted: 1 });
investmentPlanSchema.index({ category: 1 });
investmentPlanSchema.index({ riskLevel: 1 });

const InvestmentPlan = mongoose.model('InvestmentPlan', investmentPlanSchema);

export default InvestmentPlan;

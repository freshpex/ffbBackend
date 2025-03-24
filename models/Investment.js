import mongoose from 'mongoose';

const InvestmentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    plan: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },
    weeklyROI: {
      type: Number,
      required: true,
    },
    totalEarned: {
      type: Number,
      default: 0,
    },
    lastPayout: {
      type: Date,
      default: null,
    },
    payoutHistory: [
      {
        amount: Number,
        date: Date,
        status: String,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('Investment', InvestmentSchema);

import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema(
  {
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    referee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    code: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'expired'],
      default: 'pending'
    },
    rewards: {
      referrerBonus: {
        type: Number,
        default: 0
      },
      refereeBonus: {
        type: Number,
        default: 0
      },
      currency: {
        type: String,
        default: 'USD'
      }
    },
    completedAt: {
      type: Date,
      default: null
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    }
  },
  {
    timestamps: true
  }
);

// Add index for faster queries
referralSchema.index({ referrer: 1 });
referralSchema.index({ referee: 1 });
referralSchema.index({ code: 1 });
referralSchema.index({ status: 1 });

const Referral = mongoose.model('Referral', referralSchema);

export default Referral;

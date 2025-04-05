import mongoose from 'mongoose';

const loginActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    ipAddress: {
      type: String,
      default: 'unknown'
    },
    device: {
      type: String,
      default: 'unknown'
    },
    browser: {
      type: String,
      default: 'unknown'
    },
    location: {
      type: String,
      default: 'unknown'
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success'
    },
    failureReason: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Add index for faster query
loginActivitySchema.index({ userId: 1, timestamp: -1 });

const LoginActivity = mongoose.model('LoginActivity', loginActivitySchema);

export default LoginActivity;

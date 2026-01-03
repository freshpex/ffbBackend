import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ["order", "combo", "deposit", "trading", "kyc", "referral", "social", "educational", "profile", "engagement", "shopping"],
      required: true,
    },
    reward: {
      type: Number,
      required: true,
      min: 0,
    },
    rewardType: {
      type: String,
      enum: ["cash", "bonus", "points", "discount"],
      default: "cash",
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard", "expert"],
      default: "medium",
    },
    requirements: {
      type: Object,
      default: {},
      // Structure depends on the task category:
      // For orders: { minAmount: 100, orderType: "market" }
      // For combos: { minPositions: 3, minDuration: 7 }
      // For trading: { minVolume: 1000, instruments: ["BTC/USD", "ETH/USD"] }
      // For referral: { minReferrals: 3 }
      // etc.
    },
    duration: {
      type: Number, // Duration in days
      default: 0, // 0 means no time limit
    },
    expiresAt: {
      type: Date,
      default: null, // null means no expiry
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    maxCompletions: {
      type: Number, // Maximum number of times a user can complete this task
      default: 1, // 1 means one-time, 0 means unlimited
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    image: String, // URL to task icon or image
    position: {
      type: Number, // For ordering tasks in the UI
      default: 0,
    },
    tags: [String],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes for faster lookups
taskSchema.index({ category: 1 });
taskSchema.index({ isActive: 1 });
taskSchema.index({ difficulty: 1 });
taskSchema.index({ position: 1 });

const Task = mongoose.model("Task", taskSchema);

export default Task;

import mongoose from "mongoose";

const userTaskSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    status: {
      type: String,
      enum: ["in_progress", "completed", "claimed", "expired", "failed"],
      default: "in_progress",
    },
    progress: {
      type: Number, // Progress percentage (0-100)
      default: 0,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
    claimedAt: {
      type: Date,
    },
    rewardAmount: {
      type: Number, // Actual reward amount (can be different based on performance)
    },
    rewardType: {
      type: String,
      enum: ["cash", "bonus", "points", "discount"],
    },
    relatedData: {
      type: Object, // Store related data like order IDs, transaction IDs, etc.
      default: {},
    },
    completionCount: {
      type: Number, // For recurring tasks, track how many times it's been completed
      default: 0,
    },
    expiresAt: {
      type: Date, // When this task attempt expires for the user
    },
    metadata: {
      type: Object,
      default: {},
    },
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
    },
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
userTaskSchema.index({ user: 1 });
userTaskSchema.index({ task: 1 });
userTaskSchema.index({ status: 1 });
userTaskSchema.index({ user: 1, task: 1 }, { unique: true }); // One task per user

const UserTask = mongoose.model("UserTask", userTaskSchema);

export default UserTask;

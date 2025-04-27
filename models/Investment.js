import mongoose from "mongoose";

const investmentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    planId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active",
    },
    returnRate: {
      type: Number,
      required: true,
    },
    duration: {
      // Duration in days
      type: Number,
      required: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: true,
    },
    lastPayout: {
      type: Date,
    },
    totalReturns: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

const Investment = mongoose.model("Investment", investmentSchema);

export default Investment;

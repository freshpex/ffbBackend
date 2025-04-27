import mongoose from "mongoose";

const priceAlertSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    symbol: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    condition: {
      type: String,
      required: true,
      enum: ["above", "below"],
      default: "above",
    },
    price: {
      type: Number,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    triggered: {
      type: Boolean,
      default: false,
    },
    triggeredAt: {
      type: Date,
      default: null,
    },
    repeatable: {
      type: Boolean,
      default: false,
    },
    notificationMethods: {
      app: {
        type: Boolean,
        default: true,
      },
      email: {
        type: Boolean,
        default: false,
      },
      sms: {
        type: Boolean,
        default: false,
      },
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Add indexes for faster queries
priceAlertSchema.index({ user: 1, active: 1 });
priceAlertSchema.index({ symbol: 1, active: 1 });

const PriceAlert = mongoose.model("PriceAlert", priceAlertSchema);

export default PriceAlert;

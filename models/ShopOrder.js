import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  externalProductId: {
    type: String, // For reference if product is deleted
  },
  title: {
    type: String,
    required: true,
  },
  thumbnail: String,
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1,
  },
  subtotal: {
    type: Number,
    required: true,
  },
});

const shopOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [orderItemSchema],
    // Pricing
    subtotal: {
      type: Number,
      required: true,
    },
    shippingFee: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "USD",
    },
    // Order status
    status: {
      type: String,
      enum: [
        "pending", // Order created, awaiting payment
        "paid", // Payment successful
        "processing", // Order being processed
        "shipped", // Order shipped
        "delivered", // Order delivered
        "cancelled", // Order cancelled
        "refunded", // Order refunded
      ],
      default: "pending",
      // status is part of a compound index below
    },
    // Payment details
    paymentMethod: {
      type: String,
      enum: ["balance", "bonus", "crypto", "card"],
      default: "balance",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    paidAt: {
      type: Date,
    },
    // Shipping details
    shippingAddress: {
      fullName: String,
      phone: String,
      addressLine1: String,
      addressLine2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },
    trackingNumber: {
      type: String,
    },
    carrier: {
      type: String,
    },
    shippedAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    rewardAmount: {
      type: Number,
      default: 0,
    },
    rewardStatus: {
      type: String,
      enum: ["pending", "credited", "cancelled"],
      default: "pending",
    },
    rewardCreditedAt: {
      type: Date,
    },
    // Notes
    customerNotes: {
      type: String,
    },
    adminNotes: {
      type: String,
    },
    // Cancellation
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

// Generate unique order number
shopOrderSchema.pre("save", async function (next) {
  if (!this.orderNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.orderNumber = `ORD-${timestamp}-${random}`;
  }
  next();
});

// Calculate reward amount (cashback rate of total)
shopOrderSchema.pre("save", function (next) {
  if (this.isNew || this.isModified("total")) {
    // Only reward purchases paid from main balance.
    const CASHBACK_RATE = 0.2; // 20%
    this.rewardAmount = this.paymentMethod === "balance" ? this.total * CASHBACK_RATE : 0;
  }
  next();
});

// Indexes
shopOrderSchema.index({ userId: 1, status: 1 });
shopOrderSchema.index({ createdAt: -1 });
const ShopOrder = mongoose.model("ShopOrder", shopOrderSchema);

export default ShopOrder;

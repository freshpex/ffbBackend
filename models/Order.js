import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    symbol: {
      type: String,
      required: true,
    },
    side: {
      type: String,
      enum: ["buy", "sell"],
      required: true,
    },
    type: {
      type: String,
      enum: ["market", "limit", "stop", "stop_limit"],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: function () {
        // Price is required for all order types except market orders
        return this.type !== "market";
      },
    },
    stopPrice: {
      type: Number,
      required: function () {
        return this.type === "stop" || this.type === "stop_limit";
      },
    },
    status: {
      type: String,
      enum: [
        "new",
        "partially_filled",
        "filled",
        "canceled",
        "rejected",
        "expired",
      ],
      default: "new",
    },
    executedQuantity: {
      type: Number,
      default: 0,
    },
    executionPrice: {
      type: Number,
    },
    fee: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      default: function () {
        return this.price ? this.price * this.quantity : 0;
      },
    },
    clientOrderId: {
      type: String,
      index: true,
    },
    processedAt: {
      type: Date,
    },
    canceledAt: {
      type: Date,
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

// Indexes for query optimization
OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ user: 1, symbol: 1, status: 1 });
OrderSchema.index({ status: 1, type: 1 });
OrderSchema.index({ processedAt: -1 });

export default mongoose.model("Order", OrderSchema);

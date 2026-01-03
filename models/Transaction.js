import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "deposit",
        "withdrawal",
        "transfer",
        "investment",
        "fee",
        "bonus",
        // shop-related transaction types
        "shop_purchase",
        "shop_reward",
        "shop_refund",
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "USD",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "rejected"],
      default: "pending",
    },
    method: {
      type: String,
      enum: [
        "bank_transfer",
        "credit_card",
        "cryptocurrency",
        "internal",
        "system",
        "fee",
        "paypal",
      ],
    },
    walletAddress: String,
    txHash: String,
    fee: {
      type: Number,
      default: 0,
    },
    reference: String,
    description: String,
    metadata: {
      type: Object,
    },
    processedAt: Date,
  },
  {
    timestamps: true,
  },
);

const Transaction = mongoose.model("Transaction", transactionSchema);

export default Transaction;

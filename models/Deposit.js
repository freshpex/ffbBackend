import mongoose from "mongoose";

const depositSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "USD",
    },
    method: {
      type: String,
      enum: [
        "bank_transfer",
        "credit_card",
        "debit_card",
        "crypto",
        "paypal",
        "other",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
        "refunded",
      ],
      default: "pending",
    },
    reference: {
      type: String,
    },
    details: {
      bankName: String,
      accountNumber: String,
      accountName: String,
      routingNumber: String,
      cardLast4: String,
      cryptoAddress: String,
      network: String,
      paymentMethod: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PaymentMethod",
      },
    },
    receiptUrl: String,
    proofOfPayment: String,
    notes: String,
    processingTime: {
      type: Number, // Time taken to process in minutes
      default: 0,
    },
    completedAt: Date,
    failureReason: String,
    fee: {
      type: Number,
      default: 0,
    },
    ipAddress: String,
    deviceInfo: String,
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
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
  },
);

// Indexes for faster lookups
depositSchema.index({ user: 1 });
depositSchema.index({ status: 1 });
depositSchema.index({ createdAt: -1 });
depositSchema.index({ method: 1 });

const Deposit = mongoose.model("Deposit", depositSchema);

export default Deposit;

import mongoose from "mongoose";

const kycRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    documentType: {
      type: String,
      enum: ["passport", "national_id", "drivers_license"],
      required: true,
    },
    documentNumber: {
      type: String,
      required: true,
    },
    frontImage: {
      type: String, // URL to stored image
      required: true,
    },
    backImage: {
      type: String, // URL to stored image
      default: null,
    },
    selfieImage: {
      type: String, // URL to stored selfie with ID
      required: true,
    },
    proofOfAddressImage: {
      type: String, // URL to stored proof of address
      required: true,
    },
    proofOfAddressType: {
      type: String,
      enum: ["utility_bill", "bank_statement", "government_letter"],
      required: true,
    },
    countryOfIssue: {
      type: String,
      required: true,
    },
    dateOfBirth: {
      type: Date,
      required: true,
    },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    adminNotes: {
      type: String,
      default: null,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Add index for faster queries
kycRequestSchema.index({ user: 1, status: 1 });
kycRequestSchema.index({ createdAt: -1 });

const KycRequest = mongoose.model("KycRequest", kycRequestSchema);

export default KycRequest;

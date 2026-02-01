import mongoose from "mongoose";

const impersonationLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      default: "",
    },
    tokenId: {
      type: String,
      required: true,
      index: true,
    },
    issuedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    adminIp: {
      type: String,
      default: "",
    },
    adminUserAgent: {
      type: String,
      default: "",
    },
    revoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    revokedAt: {
      type: Date,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

// Optional TTL index cleanup (Mongo will delete records after expiry)
// Only works if MongoDB TTL monitor is enabled (default).
impersonationLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // keep up to ~30 days past expiry

const ImpersonationLog = mongoose.model(
  "ImpersonationLog",
  impersonationLogSchema,
);

export default ImpersonationLog;

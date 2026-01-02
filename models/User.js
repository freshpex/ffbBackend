import mongoose from "mongoose";
import bcrypt from "bcrypt";
import crypto from "crypto";

const apiKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
  },
  secret: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
  permissions: [
    {
      type: String,
      enum: ["read", "trade", "withdraw"],
    },
  ],
  allowedIPs: [
    {
      type: String,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastUsed: {
    type: Date,
  },
});

const kycDocumentSchema = new mongoose.Schema({
  url: {
    type: String,
    required: function () {
      try {
        const parent = typeof this.parent === "function" ? this.parent() : null;
        return parent?.verified === true;
      } catch (e) {
        return false;
      }
    },
    default: "pending",
  },
  verified: {
    type: Boolean,
    default: false,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

const userSchema = new mongoose.Schema(
  {
    uid: {
      type: String,
      unique: true,
      sparse: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    username: {
      type: String,
      trim: true,
      default: "",
    },
    password: {
      type: String,
      required: function () {
        return this.authMethod === "local" || !this.authMethod;
      },
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    profileImage: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      default: "user",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    balance: {
      type: Number,
      default: 0,
    },
    kycVerified: {
      type: Boolean,
      default: false,
    },
    kycStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "not_submitted"],
      default: "not_submitted",
    },
    kycNotes: {
      type: String,
    },
    kycVerifiedAt: {
      type: Date,
    },
    kycVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    kycDocuments: {
      idCard: kycDocumentSchema,
      proofOfAddress: kycDocumentSchema,
    },
    phone: {
      type: String,
    },
    phoneNumber: {
      type: String,
    },
    country: {
      type: String,
    },
    dateOfBirth: {
      type: Date,
    },
    occupation: {
      type: String,
    },
    accountType: {
      type: String,
      enum: ["individual", "corporate", "joint", "retirement"],
      default: "individual",
    },
    address: {
      street: {
        type: String,
      },
      city: {
        type: String,
      },
      postalCode: {
        type: String,
      },
      country: {
        type: String,
      },
    },
    taxId: {
      type: String,
    },
    experienceLevel: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", "professional"],
      default: "beginner",
    },
    howDidYouHearAboutUs: {
      type: String,
    },
    tradingEnabled: {
      type: Boolean,
      default: true,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    referralStats: {
      totalEarnings: {
        type: Number,
        default: 0
      },
      totalReferrals: {
        type: Number,
        default: 0
      },
      activeReferrals: {
        type: Number,
        default: 0
      },
      pendingCommissions: {
        type: Number,
        default: 0
      },
      lastCommissionDate: {
        type: Date
      }
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lastLoginAt: {
      type: Date,
    },
    passwordResetToken: String,
    passwordResetExpires: Date,
    apiKeys: [apiKeySchema],
    settings: {
      theme: {
        type: String,
        default: "light",
      },
      notifications: {
        email: {
          type: Boolean,
          default: true,
        },
        app: {
          type: Boolean,
          default: true,
        },
      },
      twoFactorEnabled: {
        type: Boolean,
        default: false,
      },
    },
    authMethod: {
      type: String,
      enum: ["local", "google", "facebook"],
      default: "local",
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  const user = this;

  // Only hash if password is modified or new
  if (!user.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Generate referral code if not set
userSchema.pre("save", function (next) {
  const user = this;

  if (!user.referralCode) {
    // Generate a unique code based on user ID and timestamp
    const baseCode = user._id.toString().slice(-6).toUpperCase();
    user.referralCode = `${baseCode}${Math.floor(Math.random() * 1000)}`;
  }

  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (typeof candidatePassword !== "string" || candidatePassword.length === 0) {
    return false;
  }

  // Some legacy/Firebase-created accounts may not have a local password hash.
  if (typeof this.password !== "string" || this.password.length === 0) {
    return false;
  }

  return bcrypt.compare(candidatePassword, this.password);
};

// Generate API key pair
userSchema.methods.generateApiKey = function (name, permissions = ["read"]) {
  const key = crypto.randomBytes(16).toString("hex");
  const secret = crypto.randomBytes(32).toString("hex");

  this.apiKeys.push({
    key,
    secret,
    name,
    permissions,
    active: true,
    createdAt: new Date(),
  });

  return { key, secret };
};

// Generate password reset token
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Token expires in 1 hour
  this.passwordResetExpires = Date.now() + 3600000;

  return resetToken;
};

const User = mongoose.model("User", userSchema);

export default User;

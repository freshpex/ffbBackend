import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import crypto from "crypto";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendEmail } from "../services/emailService.js";

const WITHDRAWAL_OTP_EXPIRY_MINUTES = 10;
const WITHDRAWAL_OTP_RESEND_COOLDOWN_SECONDS = 60;
const MAX_WITHDRAWAL_OTP_ATTEMPTS = 5;

const createOtpCode = () =>
  `${Math.floor(100000 + Math.random() * 900000)}`;

const hashOtpCode = (code) =>
  crypto.createHash("sha256").update(String(code)).digest("hex");

const normalizeAccountNumber = (value) =>
  String(value || "")
    .replace(/\s+/g, "")
    .trim();

const getCompletedDepositTotal = async (userId, session) => {
  const matchUserId =
    typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

  const pipeline = [
    {
      $match: {
        user: matchUserId,
        type: "deposit",
        status: "completed",
        currency: { $in: ["USD", "USDT"] },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ];

  const query = Transaction.aggregate(pipeline);
  if (session) query.session(session);

  const agg = await query;
  return agg[0]?.total || 0;
};

// Get all withdrawals for a user
export const getUserWithdrawals = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = {
      user: req.user._id,
      type: "withdrawal",
    };

    if (status) {
      query.status = status;
    }

    // Execute query with pagination
    const total = await Transaction.countDocuments(query);
    const withdrawals = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        withdrawals,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching user withdrawals:", error);
    next(error);
  }
};

// Get withdrawal by ID
export const getWithdrawalById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const withdrawal = await Transaction.findOne({
      _id: id,
      user: req.user._id,
      type: "withdrawal",
    });

    if (!withdrawal) {
      throw new ApiError("Withdrawal not found", 404, "not_found");
    }

    res.status(200).json({
      success: true,
      data: withdrawal,
    });
  } catch (error) {
    logger.error(`Error fetching withdrawal ${req.params.id}:`, error);
    next(error);
  }
};

export const requestWithdrawalOtp = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      "+withdrawalPinHash +withdrawalOtp.codeHash withdrawalOtp.expiresAt withdrawalOtp.lastSentAt withdrawalOtp.attempts email firstName lastName",
    );

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    if (!user.withdrawalPinHash) {
      throw new ApiError(
        "Withdrawal PIN is not set. Please set it in Account Settings > Security.",
        400,
        "withdrawal_pin_not_set",
      );
    }

    const now = new Date();
    const lastSentAt = user.withdrawalOtp?.lastSentAt
      ? new Date(user.withdrawalOtp.lastSentAt)
      : null;

    if (lastSentAt) {
      const secondsSinceLastSend = Math.floor((now - lastSentAt) / 1000);
      if (secondsSinceLastSend < WITHDRAWAL_OTP_RESEND_COOLDOWN_SECONDS) {
        throw new ApiError(
          `Please wait ${WITHDRAWAL_OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastSend}s before requesting a new OTP`,
          429,
          "otp_cooldown",
        );
      }
    }

    const otpCode = createOtpCode();
    const expiresAt = new Date(
      now.getTime() + WITHDRAWAL_OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    user.withdrawalOtp = {
      codeHash: hashOtpCode(otpCode),
      expiresAt,
      attempts: 0,
      lastSentAt: now,
    };

    await user.save();

    await sendEmail({
      to: [{ email: user.email, name: `${user.firstName || ""} ${user.lastName || ""}`.trim() }],
      subject: "Your FFB Withdrawal Verification Code",
      html: `<p>Hello ${user.firstName || "there"},</p><p>Your withdrawal verification code is <strong>${otpCode}</strong>.</p><p>This code expires in ${WITHDRAWAL_OTP_EXPIRY_MINUTES} minutes.</p><p>If you did not request this, please secure your account immediately.</p>`,
      text: `Your withdrawal verification code is ${otpCode}. It expires in ${WITHDRAWAL_OTP_EXPIRY_MINUTES} minutes.`,
      customId: "event:withdrawal:otp",
    });

    res.status(200).json({
      success: true,
      message: "OTP sent to your email address",
      data: {
        expiresInSeconds: WITHDRAWAL_OTP_EXPIRY_MINUTES * 60,
      },
    });
  } catch (error) {
    logger.error("Error requesting withdrawal OTP:", error);
    next(error);
  }
};

// Create new withdrawal request
export const createWithdrawal = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      amount,
      method,
      currency = "USD",
      walletAddress,
      bankDetails,
      paypalEmail,
      cryptoType,
      description,
      otpCode,
      withdrawalPin,
    } = req.body;

    // Validate amount
    if (!amount || isNaN(amount) || amount <= 0) {
      throw new ApiError(
        "Valid withdrawal amount is required",
        400,
        "validation_error",
      );
    }

    // Validate method
    if (!method) {
      throw new ApiError(
        "Withdrawal method is required",
        400,
        "validation_error",
      );
    }

    // Check if crypto withdrawal requires wallet address
    if (
      ["cryptocurrency", "bitcoin", "ethereum", "usdt"].includes(
        method.toLowerCase(),
      )
    ) {
      if (!walletAddress) {
        throw new ApiError(
          "Wallet address is required for cryptocurrency withdrawals",
          400,
          "validation_error",
        );
      }
    }

    // Check if bank transfer requires bank details
    if (method.toLowerCase() === "bank_transfer" && !bankDetails) {
      throw new ApiError(
        "Bank details are required for bank transfer withdrawals",
        400,
        "validation_error",
      );
    }

    // Check if paypal requires email
    if (method.toLowerCase() === "paypal" && !paypalEmail) {
      throw new ApiError(
        "Email is required for PayPal withdrawals",
        400,
        "validation_error",
      );
    }

    // Check if user has sufficient balance
    const user = await User.findById(req.user._id).session(session);

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    // Reload with secure fields required for withdrawal verification
    const userSecurity = await User.findById(req.user._id)
      .select("+withdrawalPinHash +withdrawalOtp.codeHash withdrawalOtp.expiresAt withdrawalOtp.attempts")
      .session(session);

    if (!userSecurity?.withdrawalPinHash) {
      throw new ApiError(
        "Withdrawal PIN is not set. Please set it in Account Settings > Security.",
        400,
        "withdrawal_pin_not_set",
      );
    }

    if (!withdrawalPin) {
      throw new ApiError(
        "Withdrawal PIN is required",
        400,
        "withdrawal_pin_required",
      );
    }

    if (!otpCode) {
      throw new ApiError(
        "Email OTP is required",
        400,
        "withdrawal_otp_required",
      );
    }

    const isPinValid = await bcrypt.compare(
      String(withdrawalPin),
      userSecurity.withdrawalPinHash,
    );

    if (!isPinValid) {
      throw new ApiError("Invalid withdrawal PIN", 401, "invalid_withdrawal_pin");
    }

    const otpInfo = userSecurity.withdrawalOtp || {};
    const now = new Date();

    if (!otpInfo.codeHash || !otpInfo.expiresAt) {
      throw new ApiError(
        "No active OTP found. Please request a new verification code.",
        400,
        "otp_missing",
      );
    }

    if (new Date(otpInfo.expiresAt) < now) {
      throw new ApiError(
        "OTP has expired. Please request a new verification code.",
        400,
        "otp_expired",
      );
    }

    const nextAttempts = Number(otpInfo.attempts || 0) + 1;
    if (nextAttempts > MAX_WITHDRAWAL_OTP_ATTEMPTS) {
      await User.updateOne(
        { _id: userSecurity._id },
        {
          $set: {
            "withdrawalOtp.codeHash": null,
            "withdrawalOtp.expiresAt": null,
            "withdrawalOtp.attempts": 0,
          },
        },
        { session },
      );

      throw new ApiError(
        "Too many OTP attempts. Please request a new verification code.",
        429,
        "otp_attempts_exceeded",
      );
    }

    const providedOtpHash = hashOtpCode(otpCode);

    if (providedOtpHash !== otpInfo.codeHash) {
      await User.updateOne(
        { _id: userSecurity._id },
        { $set: { "withdrawalOtp.attempts": nextAttempts } },
        { session },
      );

      throw new ApiError("Invalid OTP code", 401, "invalid_otp");
    }

    // OTP used successfully; clear it
    await User.updateOne(
      { _id: userSecurity._id },
      {
        $set: {
          "withdrawalOtp.codeHash": null,
          "withdrawalOtp.expiresAt": null,
          "withdrawalOtp.attempts": 0,
        },
      },
      { session },
    );

    // Verify KYC status - only verified users can withdraw
    if (!user.kycVerified) {
      throw new ApiError(
        "KYC verification required to withdraw funds. Please complete KYC verification in Settings.",
        403,
        "kyc_required"
      );
    }

    // Check minimum deposit requirement (500 USDT)
    const MIN_DEPOSIT_FOR_WITHDRAWAL = 500;
    const depositTotal = await getCompletedDepositTotal(req.user._id);
    if (depositTotal < MIN_DEPOSIT_FOR_WITHDRAWAL) {
      throw new ApiError(
        `You must have at least ${MIN_DEPOSIT_FOR_WITHDRAWAL} USDT in completed deposits before withdrawing funds. Current deposits: ${depositTotal.toFixed(2)} USDT`,
        403,
        "insufficient_deposits"
      );
    }

    // Check minimum withdrawal amount
    const MIN_WITHDRAWAL_AMOUNT = 1000;
    if (amount < MIN_WITHDRAWAL_AMOUNT) {
      throw new ApiError(
        `Minimum withdrawal amount is ${MIN_WITHDRAWAL_AMOUNT} USDT`,
        400,
        "below_minimum"
      );
    }

    // Calculate fee (e.g., 1% of withdrawal amount)
    const feePercentage = 0.01;
    const fee = parseFloat((amount * feePercentage).toFixed(2));
    const totalAmount = parseFloat(amount) + fee;

    if (user.balance < totalAmount) {
      throw new ApiError(
        `Insufficient balance. You need ${totalAmount} (including ${fee} fee) but have ${user.balance}`,
        400,
        "insufficient_balance",
      );
    }

    // Deduct amount from user balance
    user.balance -= totalAmount;

    await User.updateOne(
      { _id: user._id },
      { $set: { balance: user.balance } },
      { session },
    );

    // Create withdrawal transaction
    const withdrawal = new Transaction({
      user: user._id,
      type: "withdrawal",
      amount: -parseFloat(amount),
      fee,
      currency,
      method,
      walletAddress,
      cryptoType,
      paypalEmail,
      bankDetails,
      status: "pending",
      description: description || `Withdrawal via ${method}`,
      createdAt: new Date(),
    });

    await withdrawal.save({ session });

    // Create fee transaction
    const feeTransaction = new Transaction({
      user: user._id,
      type: "fee",
      amount: -fee,
      currency,
      method: "system",
      status: "completed",
      description: "Withdrawal fee",
      reference: withdrawal._id.toString(),
      processedAt: new Date(),
    });

    await feeTransaction.save({ session });

    await session.commitTransaction();

    // Log the transaction
    logger.info(
      `User ${req.user.email} created withdrawal request for ${amount} ${currency} via ${method}`,
    );

    res.status(201).json({
      success: true,
      message: "Withdrawal request created successfully",
      data: withdrawal,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error creating withdrawal:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Internal transfer to another user by account number
export const createInternalTransfer = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const rawAccountNumber = req.body?.toAccountNumber || req.body?.accountNumber;
    const toAccountNumber = normalizeAccountNumber(rawAccountNumber);
    const amount = Number(req.body?.amount);
    const currency = req.body?.currency || "USD";
    const description = req.body?.description;

    if (!toAccountNumber) {
      throw new ApiError(
        "Recipient account number is required",
        400,
        "validation_error",
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError("Valid transfer amount is required", 400, "validation_error");
    }

    const sender = await User.findById(req.user._id)
      .select("balance kycVerified accountNumber email")
      .session(session);

    if (!sender) {
      throw new ApiError("User not found", 404, "not_found");
    }

    // Keep consistent with withdrawals: require KYC verified to move funds.
    if (!sender.kycVerified) {
      throw new ApiError(
        "KYC verification required to transfer funds. Please complete KYC verification in Settings.",
        403,
        "kyc_required",
      );
    }

    const recipient = await User.findOne({ accountNumber: toAccountNumber })
      .select("balance accountNumber email")
      .session(session);

    if (!recipient) {
      throw new ApiError("Recipient not found", 404, "recipient_not_found");
    }

    if (String(recipient._id) === String(sender._id)) {
      throw new ApiError("You cannot transfer to your own account", 400, "validation_error");
    }

    if (Number(sender.balance || 0) < amount) {
      throw new ApiError(
        `Insufficient balance. Required: $${amount.toFixed(2)}, Available: $${Number(sender.balance || 0).toFixed(2)}`,
        400,
        "insufficient_balance",
      );
    }

    // Debit sender with optimistic condition
    const senderUpdated = await User.findOneAndUpdate(
      { _id: sender._id, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { session, new: true },
    );

    if (!senderUpdated) {
      throw new ApiError("Insufficient balance", 400, "insufficient_balance");
    }

    // Credit recipient
    const recipientUpdated = await User.findByIdAndUpdate(
      recipient._id,
      { $inc: { balance: amount } },
      { session, new: true },
    );

    // Record transactions (one for sender, one for recipient)
    const now = new Date();
    const [senderTxn, recipientTxn] = await Transaction.create(
      [
        {
          user: sender._id,
          type: "transfer",
          amount: -amount,
          currency,
          status: "completed",
          method: "internal",
          description: description || `Transfer to ${toAccountNumber}`,
          processedAt: now,
          metadata: {
            direction: "out",
            toUser: recipient._id,
            toAccountNumber,
            fromAccountNumber: sender.accountNumber,
          },
        },
        {
          user: recipient._id,
          type: "transfer",
          amount,
          currency,
          status: "completed",
          method: "internal",
          description: `Transfer from ${sender.accountNumber || sender.email || "FFB User"}`,
          processedAt: now,
          metadata: {
            direction: "in",
            fromUser: sender._id,
            fromAccountNumber: sender.accountNumber,
            toAccountNumber,
          },
        },
      ],
      { session, ordered: true },
    );

    await session.commitTransaction();

    logger.info(
      `User ${req.user.email} transferred ${amount} ${currency} to account ${toAccountNumber}`,
    );

    res.status(201).json({
      success: true,
      message: "Transfer completed successfully",
      data: {
        amount,
        currency,
        toAccountNumber,
        senderBalance: senderUpdated.balance || 0,
        recipientAccountNumber: recipientUpdated?.accountNumber,
        transaction: senderTxn,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error creating internal transfer:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Cancel withdrawal request (only if pending)
export const cancelWithdrawal = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    const withdrawal = await Transaction.findOne({
      _id: id,
      user: req.user._id,
      type: "withdrawal",
      status: "pending",
    }).session(session);

    if (!withdrawal) {
      throw new ApiError("Pending withdrawal not found", 404, "not_found");
    }

    // Get the original amount and fee
    const originalAmount = Math.abs(withdrawal.amount);
    const fee = withdrawal.fee || 0;

    // Update withdrawal status
    withdrawal.status = "cancelled";
    withdrawal.updatedAt = new Date();

    await withdrawal.save({ session });

    // Refund the amount to user's balance (excluding fee)
    const user = await User.findById(req.user._id).session(session);

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    await User.updateOne(
      { _id: user._id },
      { $inc: { balance: originalAmount } },
      { session },
    );

    // Create refund transaction
    const refundTransaction = new Transaction({
      user: user._id,
      type: "deposit",
      amount: originalAmount,
      currency: withdrawal.currency,
      method: "system",
      status: "completed",
      description: "Refund for cancelled withdrawal",
      reference: withdrawal._id.toString(),
      processedAt: new Date(),
    });

    await refundTransaction.save({ session });

    await session.commitTransaction();

    logger.info(
      `User ${req.user.email} cancelled withdrawal request ${id}, ${originalAmount} refunded`,
    );

    res.status(200).json({
      success: true,
      message: "Withdrawal request cancelled successfully and funds refunded",
      data: withdrawal,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error cancelling withdrawal ${req.params.id}:`, error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Get withdrawal methods (available withdrawal methods)
export const getWithdrawalMethods = async (req, res, next) => {
  try {
    // These could be stored in a database in a real application
    const withdrawalMethods = [
      {
        id: "bank_transfer",
        name: "Bank Transfer",
        description: "Withdraw directly to your bank account",
        processingTime: "1-3 business days",
        minAmount: 1000,
        maxAmount: 50000,
        fee: "1%",
        status: "active",
        instructions: [
          "Enter your bank account details",
          "Confirm the withdrawal amount",
          "Funds will be transferred within 1-3 business days",
        ],
        fields: [
          {
            name: "accountName",
            label: "Account Holder Name",
            type: "text",
            required: true,
          },
          {
            name: "accountNumber",
            label: "Account Number",
            type: "text",
            required: true,
          },
          {
            name: "bankName",
            label: "Bank Name",
            type: "text",
            required: true,
          },
          {
            name: "routingNumber",
            label: "Routing Number / SWIFT Code",
            type: "text",
            required: true,
          },
        ],
      },
      {
        id: "cryptocurrency",
        name: "Cryptocurrency",
        description: "Withdraw via Bitcoin, Ethereum, or USDT",
        processingTime: "10-60 minutes",
        minAmount: 1500,
        maxAmount: 500000,
        fee: "1%",
        status: "active",
        instructions: [
          "Select your preferred cryptocurrency",
          "Enter your wallet address",
          "Confirm the withdrawal amount",
        ],
        fields: [
          {
            name: "cryptoType",
            label: "Cryptocurrency",
            type: "select",
            required: true,
            options: [
              { value: "BTC", label: "Bitcoin (BTC)" },
              { value: "ETH", label: "Ethereum (ETH)" },
              { value: "USDT", label: "Tether (USDT)" },
            ],
          },
          {
            name: "walletAddress",
            label: "Wallet Address",
            type: "text",
            required: true,
          },
        ],
      },
      {
        id: "paypal",
        name: "PayPal",
        description: "Withdraw to your PayPal account",
        processingTime: "1-24 hours",
        minAmount: 1000,
        maxAmount: 10000,
        fee: "1%",
        status: "active",
        instructions: [
          "Enter your PayPal email address",
          "Confirm the withdrawal amount",
          "Funds will be sent to your PayPal account",
        ],
        fields: [
          {
            name: "paypalEmail",
            label: "PayPal Email",
            type: "email",
            required: true,
          },
        ],
      },
    ];

    res.status(200).json({
      success: true,
      data: withdrawalMethods,
    });
  } catch (error) {
    logger.error("Error fetching withdrawal methods:", error);
    next(error);
  }
};

// Get withdrawal statistics for the user
export const getWithdrawalStats = async (req, res, next) => {
  try {
    // Total withdrawals
    const totalWithdrawals = await Transaction.countDocuments({
      user: req.user._id,
      type: "withdrawal",
    });

    // Pending withdrawals
    const pendingWithdrawals = await Transaction.countDocuments({
      user: req.user._id,
      type: "withdrawal",
      status: "pending",
    });

    // Completed withdrawals
    const completedWithdrawals = await Transaction.countDocuments({
      user: req.user._id,
      type: "withdrawal",
      status: "completed",
    });

    // Total withdrawal amount
    const withdrawalVolume = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user._id),
          type: "withdrawal",
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $abs: "$amount" } },
        },
      },
    ]);

    // Recent withdrawals
    const recentWithdrawals = await Transaction.find({
      user: req.user._id,
      type: "withdrawal",
    })
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        total: totalWithdrawals,
        pending: pendingWithdrawals,
        completed: completedWithdrawals,
        volume: withdrawalVolume[0]?.total || 0,
        recent: recentWithdrawals,
      },
    });
  } catch (error) {
    logger.error("Error fetching withdrawal statistics:", error);
    next(error);
  }
};

export default {
  getUserWithdrawals,
  getWithdrawalById,
  requestWithdrawalOtp,
  createWithdrawal,
  cancelWithdrawal,
  getWithdrawalMethods,
  getWithdrawalStats,
};

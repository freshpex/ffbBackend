import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

// Get all deposits for a user
export const getUserDeposits = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = {
      user: req.user._id,
      type: "deposit",
    };

    if (status) {
      query.status = status;
    }

    // Execute query with pagination
    const total = await Transaction.countDocuments(query);
    const deposits = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        deposits,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching user deposits:", error);
    next(error);
  }
};

// Get deposit by ID
export const getDepositById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const deposit = await Transaction.findOne({
      _id: id,
      user: req.user._id,
      type: "deposit",
    });

    if (!deposit) {
      throw new ApiError("Deposit not found", 404, "not_found");
    }

    res.status(200).json({
      success: true,
      data: deposit,
    });
  } catch (error) {
    logger.error(`Error fetching deposit ${req.params.id}:`, error);
    next(error);
  }
};

// Create new deposit request
export const createDeposit = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      amount,
      method,
      currency = "USD",
      transactionId,
      cryptoType,
      cryptoAddress,
      networkType,
      note,
    } = req.body;

    // Validate amount
    if (!amount || isNaN(amount) || amount <= 0) {
      throw new ApiError(
        "Valid deposit amount is required",
        400,
        "validation_error",
      );
    }

    // Validate method
    if (!method) {
      throw new ApiError("Payment method is required", 400, "validation_error");
    }

    // Validate method is allowed
    const validMethods = ["bank_transfer", "credit_card", "cryptocurrency"];
    if (!validMethods.includes(method)) {
      throw new ApiError(
        `Invalid payment method: ${method}. Must be one of: ${validMethods.join(", ")}`,
        400,
        "validation_error",
      );
    }

    // Validate transaction ID for crypto deposits
    if (method === "cryptocurrency" && !transactionId) {
      throw new ApiError(
        "Transaction ID is required for cryptocurrency deposits",
        400,
        "validation_error",
      );
    }

    // Create deposit transaction
    const deposit = new Transaction({
      user: req.user._id,
      type: "deposit",
      amount: parseFloat(amount),
      currency,
      method,
      status: "pending",
      txHash: transactionId, // Store blockchain transaction ID
      reference: `DEP-${Date.now().toString().slice(-6)}`,
      description: note || `Deposit via ${method}`,
      metadata: {
        cryptoType,
        cryptoAddress,
        networkType,
      },
      createdAt: new Date(),
    });

    await deposit.save({ session });

    // Commit transaction
    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: "Deposit request submitted successfully",
      data: deposit,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error creating deposit:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Cancel pending deposit
export const cancelDeposit = async (req, res, next) => {
  try {
    const { id } = req.params;

    const deposit = await Transaction.findOne({
      _id: id,
      user: req.user._id,
      type: "deposit",
      status: "pending",
    });

    if (!deposit) {
      throw new ApiError(
        "Deposit not found or cannot be cancelled",
        404,
        "not_found",
      );
    }

    deposit.status = "cancelled";
    deposit.description = `${deposit.description} | Cancelled by user`;
    await deposit.save();

    res.status(200).json({
      success: true,
      message: "Deposit cancelled successfully",
      data: deposit,
    });
  } catch (error) {
    logger.error(`Error cancelling deposit ${req.params.id}:`, error);
    next(error);
  }
};

// Get deposit methods
export const getDepositMethods = async (req, res, next) => {
  try {
    // This would normally come from the database
    const methods = [
      {
        id: "bank_transfer",
        name: "Bank Transfer",
        icon: "bank",
        minAmount: 100,
        maxAmount: 50000,
      },
      {
        id: "credit_card",
        name: "Credit/Debit Card",
        icon: "credit-card",
        minAmount: 50,
        maxAmount: 10000,
      },
      {
        id: "cryptocurrency",
        name: "Cryptocurrency",
        icon: "bitcoin",
        minAmount: 20,
        maxAmount: 100000,
        cryptoOptions: [
          {
            id: "bitcoin",
            name: "Bitcoin (BTC)",
            address: "3FZbgi29cpjq2GjdwV8eyHuJJnkLtktZc5",
            networkType: "Bitcoin Network",
            confirmations: 3,
          },
          {
            id: "ethereum",
            name: "Ethereum (ETH)",
            address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
            networkType: "ERC-20",
            confirmations: 12,
          },
          {
            id: "usdt",
            name: "Tether (USDT)",
            address: "TYW6A8Lfb9uLgtTU3dtjdtW7vCcEYyZJjp",
            networkType: "TRC-20",
            confirmations: 6,
          },
        ],
      },
    ];

    res.status(200).json({
      success: true,
      data: methods,
    });
  } catch (error) {
    logger.error("Error fetching deposit methods:", error);
    next(error);
  }
};

// Get deposit statistics
export const getDepositStats = async (req, res, next) => {
  try {
    // Total deposits
    const totalDeposits = await Transaction.countDocuments({
      user: req.user._id,
      type: "deposit",
    });

    // Pending deposits
    const pendingDeposits = await Transaction.countDocuments({
      user: req.user._id,
      type: "deposit",
      status: "pending",
    });

    // Completed deposits
    const completedDeposits = await Transaction.countDocuments({
      user: req.user._id,
      type: "deposit",
      status: "completed",
    });

    // Total deposit amount
    const depositVolume = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user._id),
          type: "deposit",
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    // Recent deposits
    const recentDeposits = await Transaction.find({
      user: req.user._id,
      type: "deposit",
    })
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        total: totalDeposits,
        pending: pendingDeposits,
        completed: completedDeposits,
        volume: depositVolume[0]?.total || 0,
        recent: recentDeposits,
      },
    });
  } catch (error) {
    logger.error("Error fetching deposit statistics:", error);
    next(error);
  }
};

// Admin functions
export const adminGetDeposits = async (req, res, next) => {
  try {
    // Verify admin privileges
    if (!req.user.isAdmin) {
      throw new ApiError("Unauthorized access", 403, "access_denied");
    }

    const { status, userId, method, page = 1, limit = 10 } = req.query;

    const query = { type: "deposit" };

    if (status) {
      query.status = status;
    }

    if (userId) {
      query.user = userId;
    }

    if (method) {
      query.method = method;
    }

    // Execute query with pagination
    const total = await Transaction.countDocuments(query);
    const deposits = await Transaction.find(query)
      .populate("user", "email firstName lastName")
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        deposits,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching admin deposits:", error);
    next(error);
  }
};

export const adminApproveDeposit = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Verify admin privileges
    if (!req.user.isAdmin) {
      throw new ApiError("Unauthorized access", 403, "access_denied");
    }

    const { id } = req.params;

    // Find the deposit
    const deposit = await Transaction.findOne({
      _id: id,
      type: "deposit",
      status: "pending",
    }).session(session);

    if (!deposit) {
      throw new ApiError(
        "Deposit not found or already processed",
        404,
        "not_found",
      );
    }

    // Update deposit status
    deposit.status = "completed";
    deposit.processedAt = new Date();
    deposit.processedBy = req.user._id;
    await deposit.save({ session });

    // Update user balance
    const user = await User.findById(deposit.user).session(session);
    user.balance += deposit.amount;
    await user.save({ session });

    // Commit transaction
    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Deposit approved and user balance updated",
      data: deposit,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error approving deposit ${req.params.id}:`, error);
    next(error);
  } finally {
    session.endSession();
  }
};

export const adminRejectDeposit = async (req, res, next) => {
  try {
    // Verify admin privileges
    if (!req.user.isAdmin) {
      throw new ApiError("Unauthorized access", 403, "access_denied");
    }

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      throw new ApiError(
        "Rejection reason is required",
        400,
        "validation_error",
      );
    }

    // Find the deposit
    const deposit = await Transaction.findOne({
      _id: id,
      type: "deposit",
      status: "pending",
    });

    if (!deposit) {
      throw new ApiError(
        "Deposit not found or already processed",
        404,
        "not_found",
      );
    }

    // Update deposit status
    deposit.status = "rejected";
    deposit.processedAt = new Date();
    deposit.processedBy = req.user._id;
    deposit.description = `${deposit.description} | Rejected: ${reason}`;

    await deposit.save();

    res.status(200).json({
      success: true,
      message: "Deposit rejected",
      data: deposit,
    });
  } catch (error) {
    logger.error(`Error rejecting deposit ${req.params.id}:`, error);
    next(error);
  }
};

export default {
  getUserDeposits,
  getDepositById,
  createDeposit,
  cancelDeposit,
  getDepositMethods,
  getDepositStats,
  adminGetDeposits,
  adminApproveDeposit,
  adminRejectDeposit,
};

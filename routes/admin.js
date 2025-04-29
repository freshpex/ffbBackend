import express from "express";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Investment from "../models/Investment.js";
import Order from "../models/Order.js";
import {
  verifyToken,
  requireAdmin,
  requireSuperAdmin,
} from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import logger from "../middleware/logger.js";
import ATMCardsController from "../controllers/ATMCardsController.js";
import jwt from "jsonwebtoken";
import {
  getAllTransactions,
  getTransactionById,
  processTransaction,
  getTransactionStats,
} from "../controllers/AdminTransactionController.js";
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserStats,
} from "../controllers/AdminUserController.js";
import {
  getAllKycRequests,
  getKycRequestById,
  approveKycRequest,
  rejectKycRequest,
  getKycStats,
} from "../controllers/AdminKycController.js";
import {
  getAdminNotifications,
  getNotificationById,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  createSystemNotification,
  getNotificationStats,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createAdminNotification,
  createNotification,
} from "../controllers/AdminNotificationController.js";
import AdminProfileController from "../controllers/AdminProfileController.js";
import AdminSettingsController from "../controllers/AdminSettingsController.js";
import AdminNotificationController from "../controllers/AdminNotificationController.js";
import { check } from "express-validator";

const router = express.Router();

// Admin login route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    logger.info(`Admin login attempt: ${email}`);

    if (!email || !password) {
      logger.warn(`Admin login failed: Missing email or password`);
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const admin = await User.findOne({
      email,
      role: { $in: ["admin", "superadmin"] },
    });

    if (!admin) {
      logger.warn(`Admin login failed: No admin found with email ${email}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await admin.comparePassword(password);

    if (!isMatch) {
      logger.warn(`Admin login failed: Invalid password for ${email}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        userId: admin._id,
        email: admin.email,
        role: admin.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    admin.lastLoginAt = new Date();
    await admin.save();

    logger.info(`Admin login successful: ${admin.email}`);

    res.status(200).json({
      success: true,
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        name: `${admin.firstName} ${admin.lastName}`,
        role: admin.role,
        permissions: admin.permissions || [],
      },
    });
  } catch (error) {
    logger.error("Admin login error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Apply authentication to all admin routes below this point
router.use(verifyToken);

// Verify admin token
router.get("/verify-token", (req, res, next) => {
  try {
    if (
      !req.user ||
      !req.user.role ||
      !["admin", "superadmin"].includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required",
      });
    }

    res.status(200).json({
      success: true,
      admin: {
        id: req.user._id,
        email: req.user.email,
        name: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim(),
        role: req.user.role,
        permissions: req.user.permissions || [],
      },
    });
  } catch (error) {
    logger.error("Error verifying admin token:", error);
    next(error);
  }
});

// === Admin User Management Routes ===

// Get all users with filtering and pagination
router.get("/users", requireAdmin, asyncHandler(getAllUsers));

// Get user statistics
router.get("/users/stats", requireAdmin, asyncHandler(getUserStats));

// Create a new user
router.post("/users", requireAdmin, asyncHandler(createUser));

// Get user by ID
router.get("/users/:id", requireAdmin, asyncHandler(getUserById));

// Update user
router.put("/users/:id", requireAdmin, asyncHandler(updateUser));

// Delete user
router.delete("/users/:id", requireSuperAdmin, asyncHandler(deleteUser));

// Get all users (admin only)
router.get(
  "/users",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search, status, role } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
      ];
    }

    if (status) {
      query.status = status;
    }

    if (role) {
      query.role = role;
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      select: "-password",
    };

    const users = await User.find(query)
      .select("-password -apiKeys.secret")
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .sort(options.sort);

    const total = await User.countDocuments(query);

    res.status(200).json({
      users,
      totalPages: Math.ceil(total / options.limit),
      currentPage: options.page,
      total,
    });
  }),
);

// Get user by ID (admin only)
router.get(
  "/users/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select(
      "-password -apiKeys.secret",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  }),
);

// Update user (admin only)
router.put(
  "/users/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const {
      firstName,
      lastName,
      role,
      status,
      balance,
      kycVerified,
      tradingEnabled,
    } = req.body;

    if (role === "superadmin" && req.user.role !== "superadmin") {
      return res
        .status(403)
        .json({ message: "Only superadmins can assign superadmin role" });
    }

    const allowedUpdates = {};
    if (firstName) allowedUpdates.firstName = firstName;
    if (lastName) allowedUpdates.lastName = lastName;
    if (status) allowedUpdates.status = status;
    if (kycVerified !== undefined) allowedUpdates.kycVerified = kycVerified;
    if (tradingEnabled !== undefined)
      allowedUpdates.tradingEnabled = tradingEnabled;

    if (role && req.user.role === "admin") {
      allowedUpdates.role = role;
    }

    if (balance !== undefined && req.user.role === "admin") {
      allowedUpdates.balance = balance;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: allowedUpdates },
      {
        new: true,
        runValidators: false,
        context: "query",
      },
    ).select("-password -apiKeys.secret");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    logger.info(`Admin ${req.user.email} updated user ${user.email}`);
    res.status(200).json(user);
  }),
);

// Delete user (superadmin only)
router.delete(
  "/users/:id",
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "superadmin") {
      return res
        .status(403)
        .json({ message: "Cannot delete a superadmin account" });
    }

    await User.deleteOne({ _id: req.params.id });

    logger.info(`Superadmin ${req.user.email} deleted user ${user.email}`);
    res.status(200).json({ message: "User deleted successfully" });
  }),
);

// Get system stats (admin only)
router.get(
  "/stats",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: "active" });
    const pendingKYC = await User.countDocuments({ kycVerified: false });

    const totalTransactions = await Transaction.countDocuments();
    const transactionVolume = await Transaction.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const totalInvestments = await Investment.countDocuments();
    const investmentVolume = await Investment.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const totalOrders = await Order.countDocuments();

    res.status(200).json({
      users: {
        total: totalUsers,
        active: activeUsers,
        pendingKYC,
      },
      transactions: {
        count: totalTransactions,
        volume: transactionVolume[0]?.total || 0,
      },
      investments: {
        count: totalInvestments,
        volume: investmentVolume[0]?.total || 0,
      },
      orders: {
        count: totalOrders,
      },
    });
  }),
);

// Get recent activity (admin only)
router.get(
  "/activity",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;

    const recentTransactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate("user", "email firstName lastName");

    const recentInvestments = await Investment.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate("user", "email firstName lastName");

    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate("user", "email firstName lastName");

    res.status(200).json({
      transactions: recentTransactions,
      investments: recentInvestments,
      orders: recentOrders,
    });
  }),
);

// Manual KYC verification (admin only)
router.put(
  "/kyc/:userId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status, notes } = req.body;

    if (!status || !["approved", "rejected", "pending"].includes(status)) {
      return res
        .status(400)
        .json({
          message: "Valid status required (approved, rejected, pending)",
        });
    }

    const user = await User.findById(req.params.userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.kycVerified = status === "approved";
    user.kycStatus = status;
    user.kycNotes = notes;
    user.kycVerifiedAt = status === "approved" ? new Date() : null;
    user.kycVerifiedBy = status === "approved" ? req.user.userId : null;

    await user.save();

    logger.info(
      `Admin ${req.user.email} updated KYC status for ${user.email} to ${status}`,
    );

    res.status(200).json({
      message: `KYC status updated to ${status}`,
      user: {
        id: user._id,
        email: user.email,
        kycVerified: user.kycVerified,
        kycStatus: user.kycStatus,
      },
    });
  }),
);

// === Admin KYC Routes ===

// Get all KYC requests
router.get("/kyc", requireAdmin, asyncHandler(getAllKycRequests));

// Get KYC statistics
router.get("/kyc/stats", requireAdmin, asyncHandler(getKycStats));

// Get KYC request by ID
router.get("/kyc/:id", requireAdmin, asyncHandler(getKycRequestById));

// Approve KYC request
router.put("/kyc/:id/approve", requireAdmin, asyncHandler(approveKycRequest));

// Reject KYC request
router.put("/kyc/:id/reject", requireAdmin, asyncHandler(rejectKycRequest));

// === Admin Transaction Routes ===

// Get all transactions with filtering and pagination
router.get("/transactions", requireAdmin, asyncHandler(getAllTransactions));

// Get transaction stats
router.get(
  "/transactions/stats",
  requireAdmin,
  asyncHandler(getTransactionStats),
);

// Get transaction by ID
router.get("/transactions/:id", requireAdmin, asyncHandler(getTransactionById));

// Process transaction (approve or reject)
router.put(
  "/transactions/:id/process",
  requireAdmin,
  asyncHandler(processTransaction),
);

// Admin Profile routes
router.get("/profile", asyncHandler(AdminProfileController.getAdminProfile));
router.put("/profile", asyncHandler(AdminProfileController.updateAdminProfile));
router.post(
  "/profile/image",
  AdminProfileController.upload.single("image"),
  asyncHandler(AdminProfileController.uploadAdminProfileImage),
);
router.put(
  "/profile/password",
  asyncHandler(AdminProfileController.changeAdminPassword),
);
router.get(
  "/profile/preferences",
  asyncHandler(AdminProfileController.getAdminPreferences),
);
router.put(
  "/profile/preferences",
  asyncHandler(AdminProfileController.updateAdminPreferences),
);

// System Settings routes
router.get("/settings", asyncHandler(AdminSettingsController.getAllSettings));
router.get(
  "/settings/category/:category",
  asyncHandler(AdminSettingsController.getSettingsByCategory),
);
router.get(
  "/settings/:key",
  asyncHandler(AdminSettingsController.getSettingByKey),
);
router.put("/settings", asyncHandler(AdminSettingsController.updateSettings));
router.post("/settings", asyncHandler(AdminSettingsController.createSetting));
router.delete(
  "/settings/:key",
  asyncHandler(AdminSettingsController.deleteSetting),
);
router.post(
  "/settings/reset",
  asyncHandler(AdminSettingsController.resetToDefaults),
);

// Notification routes
router.get(
  "/notifications",
  getAdminNotifications,
);
router.get(
  "/notifications/unread-count",
  requireAdmin,
  getUnreadCount,
);
router.put("/notifications/:id/read", requireAdmin, (req, res) => {
  markAsRead(req, res);
});
router.put("/notifications/read-all", requireAdmin, (req, res) => {
  markAllAsRead(req, res);
});
router.delete(
  "/notifications/:id",
  requireAdmin,
  deleteNotification,
);
router.post(
  "/notifications",
  requireAdmin,
  [
    check("title", "Title is required").not().isEmpty(),
    check("message", "Message is required").not().isEmpty(),
  ],
  createNotification,
);

router.get("/atm-cards/all", ATMCardsController.adminGetAllCards);
router.get("/atm-cards/:id", ATMCardsController.adminGetCardById);
router.post(
  "/atm-cards/:id/approve",
  ATMCardsController.adminApproveCardRequest,
);
router.post("/atm-cards/:id/reject", ATMCardsController.adminRejectCardRequest);
router.put("/atm-cards/:id/status", ATMCardsController.adminUpdateCardStatus);

export default router;

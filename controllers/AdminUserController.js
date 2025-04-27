import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";
import bcrypt from "bcrypt";

// Get all users with filtering and pagination
export const getAllUsers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status,
      role,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    // Apply filters
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

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Execute query with pagination
    const totalUsers = await User.countDocuments(query);
    const users = await User.find(query)
      .select("-password -apiKeys.secret")
      .sort(sort)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          total: totalUsers,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalUsers / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching users:", error);
    next(error);
  }
};

// Get user by ID
export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select("-password -apiKeys.secret");

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    // Get user's recent transactions
    const recentTransactions = await Transaction.find({ user: id })
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        user,
        recentActivity: {
          transactions: recentTransactions,
        },
      },
    });
  } catch (error) {
    logger.error(`Error fetching user ${req.params.id}:`, error);
    next(error);
  }
};

// Create new user
export const createUser = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      email,
      firstName,
      lastName,
      password,
      role = "user",
      status = "active",
      balance = 0,
    } = req.body;

    // Validate required fields
    if (!email || !firstName || !lastName || !password) {
      throw new ApiError(
        "Email, firstName, lastName and password are required",
        400,
        "validation_error",
      );
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      throw new ApiError("Email already in use", 400, "duplicate_email");
    }

    // Only superadmins can create admin users
    if (role === "admin" && req.user.role !== "superadmin") {
      throw new ApiError(
        "Only superadmins can create admin users",
        403,
        "forbidden",
      );
    }

    // Generate referral code
    const referralCode = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    // Generate a unique ID
    const uid = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = new User({
      email,
      firstName,
      lastName,
      password: hashedPassword,
      role,
      status,
      balance,
      referralCode,
      uid,
      kycDocuments: {
        idCard: { url: "placeholder" },
        proofOfAddress: { url: "placeholder" },
      },
    });

    await user.save({ session });

    // If balance is set, create a system deposit transaction
    if (balance > 0) {
      const transaction = new Transaction({
        user: user._id,
        type: "deposit",
        amount: balance,
        status: "completed",
        method: "system",
        description: "Initial balance set by admin",
        processedAt: new Date(),
        processedBy: req.user._id,
      });

      await transaction.save({ session });
    }

    await session.commitTransaction();

    // Return user without sensitive information
    const userData = user.toObject();
    delete userData.password;

    logger.info(`Admin ${req.user.email} created new user: ${email}`);

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: userData,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error creating user:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Update user
export const updateUser = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { firstName, lastName, email, role, status, balance, password } =
      req.body;

    const user = await User.findById(id);

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    // Only superadmins can update admin users
    if (user.role === "admin" && req.user.role !== "superadmin") {
      throw new ApiError(
        "Only superadmins can update admin users",
        403,
        "forbidden",
      );
    }

    const updateData = {};

    // Check if email is being changed and if it's already in use
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });

      if (existingUser) {
        throw new ApiError("Email already in use", 400, "duplicate_email");
      }

      updateData.email = email;
    }

    // Add fields to update data
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (status) updateData.status = status;

    // Only superadmins can change roles
    if (role && req.user.role === "superadmin") {
      updateData.role = role;
    }

    // Update password if provided
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    // Handle balance updates
    if (balance !== undefined && balance !== null) {
      const oldBalance = user.balance;
      const balanceDiff = balance - oldBalance;

      if (balanceDiff !== 0) {
        updateData.balance = balance;

        // Create a transaction record for the balance adjustment
        const transaction = new Transaction({
          user: user._id,
          type: balanceDiff > 0 ? "deposit" : "withdrawal",
          amount: Math.abs(balanceDiff),
          status: "completed",
          method: "system",
          description: `Balance adjustment by admin (${req.user.email})`,
          processedAt: new Date(),
          processedBy: req.user._id,
        });

        await transaction.save({ session });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, session },
    ).select("-password");

    await session.commitTransaction();

    logger.info(`Admin ${req.user.email} updated user: ${updatedUser.email}`);

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error updating user ${req.params.id}:`, error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Delete user
export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    // Only superadmins can delete users
    if (req.user.role !== "superadmin") {
      throw new ApiError("Only superadmins can delete users", 403, "forbidden");
    }

    // Prevent deleting other superadmins
    if (user.role === "superadmin") {
      throw new ApiError("Cannot delete superadmin users", 403, "forbidden");
    }

    await User.deleteOne({ _id: id });

    logger.info(`Admin ${req.user.email} deleted user: ${user.email}`);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    logger.error(`Error deleting user ${req.params.id}:`, error);
    next(error);
  }
};

// Get user statistics
export const getUserStats = async (req, res, next) => {
  try {
    // Count users by role
    const totalUsers = await User.countDocuments();
    const adminUsers = await User.countDocuments({ role: "admin" });
    const superAdminUsers = await User.countDocuments({ role: "superadmin" });
    const regularUsers = totalUsers - adminUsers - superAdminUsers;

    // Count users by status
    const activeUsers = await User.countDocuments({ status: "active" });
    const inactiveUsers = await User.countDocuments({ status: "inactive" });
    const suspendedUsers = await User.countDocuments({ status: "suspended" });

    // Count users by KYC status
    const kycVerifiedUsers = await User.countDocuments({ kycVerified: true });
    const kycPendingUsers = await User.countDocuments({ kycStatus: "pending" });
    const kycRejectedUsers = await User.countDocuments({
      kycStatus: "rejected",
    });

    // Recent users
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("-password -apiKeys.secret");

    res.status(200).json({
      success: true,
      data: {
        counts: {
          total: totalUsers,
          byRole: {
            regular: regularUsers,
            admin: adminUsers,
            superadmin: superAdminUsers,
          },
          byStatus: {
            active: activeUsers,
            inactive: inactiveUsers,
            suspended: suspendedUsers,
          },
          byKyc: {
            verified: kycVerifiedUsers,
            pending: kycPendingUsers,
            rejected: kycRejectedUsers,
          },
        },
        recentUsers,
      },
    });
  } catch (error) {
    logger.error("Error fetching user statistics:", error);
    next(error);
  }
};

export default {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserStats,
};

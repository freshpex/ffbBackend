import User from "../models/User.js";
import KycRequest from "../models/KycRequest.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";
import { createKycNotification } from "../services/notificationService.js";
import AdminNotification from "../models/AdminNotification.js";
import { syncKycTasksForUser } from "./TaskController.js";
import { sendTemplateEmail } from "../services/emailService.js";

const getFrontendUrl = () =>
  (process.env.FRONTEND_URL || "https://ffbroker.com").replace(/\/$/, "");

const getUserDisplayName = (user) =>
  `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
  user?.email ||
  "Customer";

// Get all KYC requests with filtering and pagination
export const getAllKycRequests = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    // Apply filters
    if (status) query.status = status;

    if (search) {
      const users = await User.find({
        $or: [
          { email: { $regex: search, $options: "i" } },
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const userIds = users.map((user) => user._id);

      if (userIds.length > 0) {
        query.user = { $in: userIds };
      } else {
        query.user = null;
      }
    }

    // Sort object
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const totalRequests = await KycRequest.countDocuments(query);
    const kycRequests = await KycRequest.find(query)
      .populate("user", "email firstName lastName")
      .sort(sort)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        kycRequests,
        pagination: {
          total: totalRequests,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalRequests / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching KYC requests:", error);
    next(error);
  }
};

// Get KYC request by ID
export const getKycRequestById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const kycRequest = await KycRequest.findById(id).populate(
      "user",
      "email firstName lastName profileImage",
    );

    if (!kycRequest) {
      throw new ApiError("KYC request not found", 404, "not_found");
    }

    res.status(200).json({
      success: true,
      data: kycRequest,
    });
  } catch (error) {
    logger.error(`Error fetching KYC request ${req.params.id}:`, error);
    next(error);
  }
};

// Approve KYC request
export const approveKycRequest = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { notes } = req.body;

    const kycRequest = await KycRequest.findById(id).session(session);

    if (!kycRequest) {
      throw new ApiError("KYC request not found", 404, "not_found");
    }

    if (kycRequest.status !== "pending") {
      throw new ApiError(
        `KYC request is already ${kycRequest.status}`,
        400,
        "invalid_status",
      );
    }

    // Update KYC request status
    kycRequest.status = "approved";
    kycRequest.adminNotes = notes;
    kycRequest.processedBy = req.user._id;
    kycRequest.processedAt = new Date();

    await kycRequest.save({ session });
    const user = await User.findByIdAndUpdate(
      kycRequest.user,
      {
        $set: {
          kycVerified: true,
          kycStatus: "approved",
          kycVerifiedAt: new Date(),
          kycVerifiedBy: req.user._id,
        },
      },
      { new: true, session, runValidators: true },
    );

    try {
      await syncKycTasksForUser(user._id, { session });
    } catch (e) {
      logger.warn(`KYC task sync warning: ${e.message}`);
    }
    await createKycNotification(kycRequest, user);
    await session.commitTransaction();

    try {
      await sendTemplateEmail({
        templateKey: "kyc_approved_user",
        to: [{ email: user.email, name: getUserDisplayName(user) }],
        variables: {
          name: getUserDisplayName(user),
          dashboardLink: `${getFrontendUrl()}/login/dashboardpage`,
          kycLink: `${getFrontendUrl()}/login/accountsettings`,
        },
        customId: `event:kyc-approved:${kycRequest._id}`,
      });
    } catch (emailError) {
      logger.warn(`KYC approval email warning: ${emailError.message}`);
    }

    // Log the action
    logger.info(
      `Admin ${req.user.email} approved KYC request for user ${user.email}`,
    );

    res.status(200).json({
      success: true,
      message: "KYC request approved successfully",
      data: kycRequest,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error approving KYC request ${req.params.id}:`, error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Reject KYC request
export const rejectKycRequest = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { reason, notes } = req.body;

    if (!reason) {
      throw new ApiError(
        "Rejection reason is required",
        400,
        "validation_error",
      );
    }

    const kycRequest = await KycRequest.findById(id).session(session);

    if (!kycRequest) {
      throw new ApiError("KYC request not found", 404, "not_found");
    }

    if (kycRequest.status !== "pending") {
      throw new ApiError(
        `KYC request is already ${kycRequest.status}`,
        400,
        "invalid_status",
      );
    }

    // Update KYC request status
    kycRequest.status = "rejected";
    kycRequest.rejectionReason = reason;
    kycRequest.adminNotes = notes;
    kycRequest.processedBy = req.user._id;
    kycRequest.processedAt = new Date();

    await kycRequest.save({ session });

    // Update user's KYC status
    const user = await User.findById(kycRequest.user).session(session);

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    user.kycVerified = false;
    user.kycStatus = "rejected";

    await user.save({ session });

    // Create notification
    await createKycNotification(kycRequest, user);

    await session.commitTransaction();

    try {
      await sendTemplateEmail({
        templateKey: "kyc_rejected_user",
        to: [{ email: user.email, name: getUserDisplayName(user) }],
        variables: {
          name: getUserDisplayName(user),
          reason,
          kycLink: `${getFrontendUrl()}/login/accountsettings`,
          dashboardLink: `${getFrontendUrl()}/login/dashboardpage`,
        },
        customId: `event:kyc-rejected:${kycRequest._id}`,
      });
    } catch (emailError) {
      logger.warn(`KYC rejection email warning: ${emailError.message}`);
    }

    // Log the action
    logger.info(
      `Admin ${req.user.email} rejected KYC request for user ${user.email}`,
    );

    res.status(200).json({
      success: true,
      message: "KYC request rejected successfully",
      data: kycRequest,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error rejecting KYC request ${req.params.id}:`, error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Get KYC statistics
export const getKycStats = async (req, res, next) => {
  try {
    const totalRequests = await KycRequest.countDocuments();
    const pendingRequests = await KycRequest.countDocuments({
      status: "pending",
    });
    const approvedRequests = await KycRequest.countDocuments({
      status: "approved",
    });
    const rejectedRequests = await KycRequest.countDocuments({
      status: "rejected",
    });

    // Get recent KYC requests
    const recentRequests = await KycRequest.find()
      .populate("user", "email firstName lastName")
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        counts: {
          total: totalRequests,
          pending: pendingRequests,
          approved: approvedRequests,
          rejected: rejectedRequests,
        },
        recentRequests,
      },
    });
  } catch (error) {
    logger.error("Error fetching KYC statistics:", error);
    next(error);
  }
};

export default {
  getAllKycRequests,
  getKycRequestById,
  approveKycRequest,
  rejectKycRequest,
  getKycStats,
};

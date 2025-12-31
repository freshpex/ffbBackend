import KycRequest from "../models/KycRequest.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";
import { uploadToS3 } from "../services/storageService.js";
import { createKycNotification } from "../services/notificationService.js";

// Submit KYC verification request
export const submitKyc = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user._id;
    const {
      firstName,
      lastName,
      dateOfBirth,
      address,
      city,
      postalCode,
      country,
      documentType,
    } = req.body;

    // Check if user already has a pending KYC request
    const existingRequest = await KycRequest.findOne({
      user: userId,
      status: "pending",
    });

    if (existingRequest) {
      throw new ApiError(
        "You already have a pending KYC verification request",
        400,
        "duplicate_request",
      );
    }

    // Validate required fields
    if (
      !firstName ||
      !lastName ||
      !dateOfBirth ||
      !address ||
      !city ||
      !country ||
      !documentType
    ) {
      throw new ApiError(
        "All required fields must be provided",
        400,
        "validation_error",
      );
    }

    // Validate document uploads
    if (!req.files || !req.files.idDocument) {
      throw new ApiError(
        "ID document is required",
        400,
        "validation_error",
      );
    }

    // Upload documents to S3
    const idDocumentUrl = await uploadToS3(
      req.files.idDocument[0],
      "kyc-documents",
    );
    
    // Optional proof of address
    let proofOfAddressUrl = null;
    if (req.files.proofOfAddress && req.files.proofOfAddress[0]) {
      proofOfAddressUrl = await uploadToS3(
        req.files.proofOfAddress[0],
        "kyc-documents",
      );
    }

    // Optional selfie
    let selfieUrl = null;
    if (req.files.selfie && req.files.selfie[0]) {
      selfieUrl = await uploadToS3(req.files.selfie[0], "kyc-documents");
    }

    // Create KYC request
    const kycRequest = new KycRequest({
      user: userId,
      information: {
        firstName,
        lastName,
        dateOfBirth,
        address,
        city,
        postalCode,
        country,
      },
      documents: [
        {
          type: documentType,
          url: idDocumentUrl,
          status: "pending",
        },
        {
          type: "proof_of_address",
          url: proofOfAddressUrl,
          status: "pending",
        },
      ],
      status: "pending",
      submittedAt: new Date(),
    });

    // Add selfie if provided
    if (selfieUrl) {
      kycRequest.documents.push({
        type: "selfie",
        url: selfieUrl,
        status: "pending",
      });
    }

    await kycRequest.save({ session });

    // Update user's KYC status
    const user = await User.findById(userId).session(session);
    user.kycStatus = "pending";
    await user.save({ session });

    // Create notification for admin
    await createKycNotification(kycRequest, user);

    await session.commitTransaction();

    logger.info(`User ${req.user.email} submitted KYC verification request`);

    res.status(201).json({
      success: true,
      message: "KYC verification request submitted successfully",
      data: kycRequest,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error submitting KYC verification:", error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Get user's KYC status
export const getKycStatus = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get the user's KYC status
    const user = await User.findById(userId).select(
      "kycStatus kycVerified kycApprovedAt",
    );

    // Get the latest KYC request
    const latestRequest = await KycRequest.findOne({ user: userId })
      .sort({ submittedAt: -1 })
      .select("status submittedAt notes");

    res.status(200).json({
      success: true,
      data: {
        kycStatus: user.kycStatus,
        kycVerified: user.kycVerified,
        kycApprovedAt: user.kycApprovedAt,
        latestRequest: latestRequest || null,
      },
    });
  } catch (error) {
    logger.error("Error getting KYC status:", error);
    next(error);
  }
};

export default {
  submitKyc,
  getKycStatus,
};

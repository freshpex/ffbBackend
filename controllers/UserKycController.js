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

  try {
    const userId = req.user._id;
    const {
      documentType,
      documentNumber,
      proofOfAddressType,
      countryOfIssue,
      dateOfBirth,
      street,
      city,
      state,
      postalCode,
      country,
    } = req.body;

    // Check if user already has a pending KYC request
    const existingRequest = await KycRequest.findOne({
      user: userId,
      status: "pending",
    });

    if (existingRequest) {
      try {
        await User.updateOne(
          { _id: userId },
          { $set: { kycStatus: "pending", kycVerified: false } },
          { timestamps: false },
        );
      } catch (e) {
        // best-effort only
      }

      throw new ApiError(
        "KYC already submitted and is pending review",
        400,
        "duplicate_request",
      );
    }

    // Start a transaction only once we know we intend to write.
    session.startTransaction();

    // Validate required fields (match KycRequest schema)
    if (
      !documentType ||
      !documentNumber ||
      !proofOfAddressType ||
      !countryOfIssue ||
      !dateOfBirth ||
      !street ||
      !city ||
      !state ||
      !postalCode ||
      !country
    ) {
      throw new ApiError(
        "All required fields must be provided",
        400,
        "validation_error",
      );
    }

    // Validate document uploads (match KycRequest schema)
    if (!req.files?.frontImage?.[0]) {
      throw new ApiError("Front ID image is required", 400, "validation_error");
    }
    if (!req.files?.selfieImage?.[0]) {
      throw new ApiError("Selfie image is required", 400, "validation_error");
    }
    if (!req.files?.proofOfAddressImage?.[0]) {
      throw new ApiError(
        "Proof of address image is required",
        400,
        "validation_error",
      );
    }

    // Upload documents to storage
    const frontImageUrl = await uploadToS3(
      req.files.frontImage[0],
      "kyc-documents",
    );

    const selfieImageUrl = await uploadToS3(
      req.files.selfieImage[0],
      "kyc-documents",
    );

    const proofOfAddressImageUrl = await uploadToS3(
      req.files.proofOfAddressImage[0],
      "kyc-documents",
    );

    let backImageUrl = null;
    if (req.files?.backImage?.[0]) {
      backImageUrl = await uploadToS3(
        req.files.backImage[0],
        "kyc-documents",
      );
    }

    // Create KYC request (schema-aligned)
    const kycRequest = new KycRequest({
      user: userId,
      status: "pending",
      documentType,
      documentNumber,
      frontImage: frontImageUrl,
      backImage: backImageUrl,
      selfieImage: selfieImageUrl,
      proofOfAddressImage: proofOfAddressImageUrl,
      proofOfAddressType,
      countryOfIssue,
      dateOfBirth: new Date(dateOfBirth),
      address: {
        street,
        city,
        state,
        postalCode,
        country,
      },
    });

    await kycRequest.save({ session });

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          kycStatus: "pending",
          kycVerified: false,
          kycDocuments: {
            idCard: {
              url: frontImageUrl,
              verified: false,
              uploadedAt: new Date(),
            },
            proofOfAddress: {
              url: proofOfAddressImageUrl,
              verified: false,
              uploadedAt: new Date(),
            },
          },
        },
      },
      { new: true, session, runValidators: true },
    ).select("firstName lastName email");

    // Create notification for admin
    const fullName =
      [updatedUser?.firstName, updatedUser?.lastName]
        .map((v) => (v || "").trim())
        .filter(Boolean)
        .join(" ") ||
      updatedUser?.email ||
      req.user?.email ||
      "User";

    await createKycNotification(kycRequest, {
      ...updatedUser?.toObject?.(),
      fullName,
    });

    await session.commitTransaction();

    logger.info(`User ${req.user.email} submitted KYC verification request`);

    res.status(201).json({
      success: true,
      message: "KYC verification request submitted successfully",
      data: kycRequest,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
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
      "kycStatus kycVerified kycVerifiedAt kycNotes",
    );

    // Get the latest KYC request
    const latestRequest = await KycRequest.findOne({ user: userId })
      .sort({ createdAt: -1 })
      .select("status createdAt processedAt rejectionReason adminNotes");

    res.status(200).json({
      success: true,
      data: {
        kycStatus: user.kycStatus,
        kycVerified: user.kycVerified,
        kycVerifiedAt: user.kycVerifiedAt,
        kycNotes: user.kycNotes,
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

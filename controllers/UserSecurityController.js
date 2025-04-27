import User from "../models/User.js";
import LoginActivity from "../models/LoginActivity.js";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

// Change password
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate inputs
    if (!currentPassword || !newPassword) {
      throw new ApiError(
        "Current password and new password are required",
        400,
        "validation_error",
      );
    }

    if (newPassword.length < 8) {
      throw new ApiError(
        "New password must be at least 8 characters long",
        400,
        "validation_error",
      );
    }

    // Get user with password
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isPasswordValid) {
      throw new ApiError(
        "Current password is incorrect",
        400,
        "invalid_password",
      );
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    // Log password change
    user.passwordChangedAt = new Date();

    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    logger.error("Error changing password:", error);
    next(error);
  }
};

// Setup 2FA
export const setup2FA = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    // Generate new secret
    const secret = speakeasy.generateSecret({
      length: 20,
      name: `FFB:${user.email}`,
    });

    // Store secret temporarily (not yet verified)
    user.twoFactorAuth = {
      ...(user.twoFactorAuth || {}),
      tempSecret: secret.base32,
      enabled: false,
    };

    await user.save();

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.status(200).json({
      success: true,
      data: {
        secret: secret.base32,
        qrCode: qrCodeUrl,
      },
    });
  } catch (error) {
    logger.error("Error setting up 2FA:", error);
    next(error);
  }
};

// Verify and enable 2FA
export const verify2FA = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      throw new ApiError(
        "Verification token is required",
        400,
        "validation_error",
      );
    }

    const user = await User.findById(req.user._id);

    if (!user || !user.twoFactorAuth || !user.twoFactorAuth.tempSecret) {
      throw new ApiError("2FA setup not initiated", 400, "invalid_state");
    }

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorAuth.tempSecret,
      encoding: "base32",
      token,
    });

    if (!verified) {
      throw new ApiError("Invalid verification token", 400, "invalid_token");
    }

    // Enable 2FA
    user.twoFactorAuth = {
      secret: user.twoFactorAuth.tempSecret,
      enabled: true,
      tempSecret: null,
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: "2FA has been enabled successfully",
    });
  } catch (error) {
    logger.error("Error verifying 2FA:", error);
    next(error);
  }
};

// Disable 2FA
export const disable2FA = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      throw new ApiError(
        "Verification token and password are required",
        400,
        "validation_error",
      );
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    if (!user.twoFactorAuth || !user.twoFactorAuth.enabled) {
      throw new ApiError("2FA is not enabled", 400, "invalid_state");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new ApiError("Password is incorrect", 400, "invalid_password");
    }

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorAuth.secret,
      encoding: "base32",
      token,
    });

    if (!verified) {
      throw new ApiError("Invalid verification token", 400, "invalid_token");
    }

    // Disable 2FA
    user.twoFactorAuth = {
      enabled: false,
      secret: null,
      tempSecret: null,
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: "2FA has been disabled successfully",
    });
  } catch (error) {
    logger.error("Error disabling 2FA:", error);
    next(error);
  }
};

// Get login activity
export const getLoginActivity = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const query = { userId: req.user._id };

    // Get total count
    const total = await LoginActivity.countDocuments(query);

    // Get paginated results
    const activities = await LoginActivity.find(query)
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        activities,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching login activity:", error);
    next(error);
  }
};

// Get security status
export const getSecurityStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      "twoFactorAuth passwordChangedAt email emailVerified phone phoneVerified",
    );

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    // Calculate security score
    let securityScore = 0;
    let maxScore = 100;

    // Has password - 20 points
    securityScore += 20;

    // Email verified - 20 points
    if (user.emailVerified) {
      securityScore += 20;
    }

    // Phone verified - 20 points
    if (user.phoneVerified) {
      securityScore += 20;
    }

    // 2FA enabled - 30 points
    if (user.twoFactorAuth && user.twoFactorAuth.enabled) {
      securityScore += 30;
    }

    // Recently changed password - 10 points
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    if (user.passwordChangedAt && user.passwordChangedAt > threeMonthsAgo) {
      securityScore += 10;
    }

    res.status(200).json({
      success: true,
      data: {
        securityScore,
        maxScore,
        twoFactorEnabled: user.twoFactorAuth && user.twoFactorAuth.enabled,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        lastPasswordChange: user.passwordChangedAt,
      },
    });
  } catch (error) {
    logger.error("Error fetching security status:", error);
    next(error);
  }
};

export default {
  changePassword,
  setup2FA,
  verify2FA,
  disable2FA,
  getLoginActivity,
  getSecurityStatus,
};

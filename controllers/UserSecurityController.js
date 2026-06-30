import User from "../models/User.js";
import LoginActivity from "../models/LoginActivity.js";
import bcrypt from "bcrypt";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getAdminRecipientEmails, sendTemplateEmail } from "../services/emailService.js";

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
    
    const hasLocalPassword = typeof user.password === "string" &&
      user.password.length > 0;

    let allowedWithoutVerification = false;

    if (hasLocalPassword) {
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

      if (!isPasswordValid) {
        
        logger.warn("Password mismatch on change attempt", {
          userId: user._id?.toString(),
          email: user.email,
          hasLocalPassword,
          uidPresent: !!user.uid,
          currentPasswordLength: currentPassword ? currentPassword.length : 0,
        });

        if (user.uid) {
          allowedWithoutVerification = true;
          logger.info(
            `User ${user.email} has an external UID (${user.uid}); allowing password set despite current password mismatch`,
          );
        } else {
          throw new ApiError("Current password is incorrect", 400, "invalid_password");
        }
      }
    } else {
      logger.info(
        `User ${user.email} has no local password; allowing password set via authenticated endpoint`,
      );
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    // Log password change
    user.passwordChangedAt = new Date();

    await user.save();

    // Email notifications (non-blocking)
    try {
      const time = new Date().toISOString();
      const ip = req.ip || req.headers["x-forwarded-for"] || "";
      const userAgent = req.headers["user-agent"] || "";

      // Notify user
      sendTemplateEmail({
        templateKey: "password_changed_user",
        to: [{ email: user.email, name: `${user.firstName || ""} ${user.lastName || ""}`.trim() }],
        variables: {
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Customer",
          email: user.email,
          userId: user._id?.toString(),
          time,
          ip,
          userAgent,
        },
        customId: "event:password-changed:user",
      }).catch((err) => {
        logger.error("Failed to send password changed email to user", {
          message: err?.message,
          userId: user._id?.toString(),
        });
      });

      // Notify admins
      const adminEmails = await getAdminRecipientEmails();
      if (adminEmails.length) {
        sendTemplateEmail({
          templateKey: "password_changed_admin",
          to: adminEmails,
          variables: {
            name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "(no name)",
            email: user.email,
            userId: user._id?.toString(),
            time,
            ip,
            userAgent,
          },
          customId: "event:password-changed:admin",
        }).catch((err) => {
          logger.error("Failed to send password changed admin email", {
            message: err?.message,
            userId: user._id?.toString(),
          });
        });
      }
    } catch (err) {
      logger.error("Password change email setup failed", {
        message: err?.message,
        userId: user._id?.toString(),
      });
    }

    // Indicate to client if we set the password without verifying the previous one
    res.status(200).json({
      success: true,
      message: "Password changed successfully",
      ...(allowedWithoutVerification && {
        note: "Password was set without verifying the previous password because account is linked to an external auth provider",
      }),
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

// Set or update withdrawal PIN
export const setWithdrawalPin = async (req, res, next) => {
  try {
    const { pin, confirmPin, currentPin } = req.body || {};

    if (!pin || !confirmPin) {
      throw new ApiError(
        "PIN and confirm PIN are required",
        400,
        "validation_error",
      );
    }

    if (pin !== confirmPin) {
      throw new ApiError("PIN values do not match", 400, "validation_error");
    }

    if (!/^\d{4,6}$/.test(String(pin))) {
      throw new ApiError(
        "Withdrawal PIN must be 4 to 6 digits",
        400,
        "validation_error",
      );
    }

    const user = await User.findById(req.user._id).select("+withdrawalPinHash email firstName lastName");

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    const hadExistingPin = !!user.withdrawalPinHash;

    if (hadExistingPin) {
      if (!currentPin) {
        throw new ApiError(
          "Current PIN is required to update withdrawal PIN",
          400,
          "current_pin_required",
        );
      }

      const isCurrentPinValid = await bcrypt.compare(
        String(currentPin),
        user.withdrawalPinHash,
      );

      if (!isCurrentPinValid) {
        throw new ApiError("Current PIN is incorrect", 400, "invalid_pin");
      }
    }

    const salt = await bcrypt.genSalt(10);
    user.withdrawalPinHash = await bcrypt.hash(String(pin), salt);

    // Clear any pending OTP when PIN changes
    user.withdrawalOtp = {
      codeHash: null,
      expiresAt: null,
      attempts: 0,
      lastSentAt: null,
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: hadExistingPin
        ? "Withdrawal PIN updated successfully"
        : "Withdrawal PIN set successfully",
      data: {
        hasWithdrawalPin: true,
      },
    });
  } catch (error) {
    logger.error("Error setting withdrawal PIN:", error);
    next(error);
  }
};

// Get withdrawal PIN status
export const getWithdrawalPinStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("+withdrawalPinHash");

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    res.status(200).json({
      success: true,
      data: {
        hasWithdrawalPin: !!user.withdrawalPinHash,
      },
    });
  } catch (error) {
    logger.error("Error fetching withdrawal PIN status:", error);
    next(error);
  }
};

export const verifyWithdrawalPin = async (req, res, next) => {
  try {
    const { pin } = req.body || {};

    if (!pin) {
      throw new ApiError("PIN is required", 400, "validation_error");
    }

    const user = await User.findById(req.user._id).select("+withdrawalPinHash");

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    if (!user.withdrawalPinHash) {
      throw new ApiError("Please set a card PIN before viewing card details", 400, "pin_not_set");
    }

    const isValid = await bcrypt.compare(String(pin), user.withdrawalPinHash);
    if (!isValid) {
      throw new ApiError("PIN is incorrect", 401, "invalid_pin");
    }

    res.status(200).json({
      success: true,
      message: "PIN verified",
    });
  } catch (error) {
    logger.error("Error verifying withdrawal PIN:", error);
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
  setWithdrawalPin,
  getWithdrawalPinStatus,
  verifyWithdrawalPin,
};

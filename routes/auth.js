import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import logger from "../middleware/logger.js";
import mongoose from "mongoose";
import LoginActivity from "../models/LoginActivity.js";
import { googleAuth } from "../controllers/authController.js";
import { initFirebaseAdmin } from "../services/firebaseAdmin.js";
import crypto from "crypto";
import { sendEmail } from "../services/emailService.js";
import { buildBrandedEmailHtml } from "../services/emailTemplates.js";

const router = express.Router();

// Register new user
router.post("/register", async (req, res) => {
  try {
    const {
      uid,
      email,
      firstName,
      lastName,
      phoneNumber,
      accountType,
      country,
      referralCode: enteredReferralCode,
      dateOfBirth,
      occupation,
      address,
      city,
      postalCode,
      taxId,
      howDidYouHearAboutUs,
      experienceLevel,
    } = req.body;

    logger.info(
      `User registration request: ${email} | Firebase UID: ${uid ? uid.substring(0, 8) + "..." : "not provided"}`,
    );

    // Validate required fields
    if (!uid || !email || !firstName || !lastName) {
      logger.warn(
        `Registration failed: Missing required user information | Email: ${email || "not provided"}`,
      );
      return res.status(400).json({
        success: false,
        message: "Missing required user information",
        requiredFields: ["uid", "email", "firstName", "lastName"],
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ uid }, { email }] });

    if (existingUser) {
      // If user exists with the same email but different UID, update the UID
      if (existingUser.email === email && existingUser.uid !== uid) {
        existingUser.uid = uid;
        await existingUser.save();
        logger.info(`Updated existing user with new Firebase UID: ${email}`);

        // Generate token for the user
        const token = jwt.sign(
          {
            userId: existingUser._id,
            email: existingUser.email,
            role: existingUser.role,
          },
          process.env.JWT_SECRET,
          { expiresIn: "24h" },
        );

        return res.status(200).json({
          success: true,
          message: "User updated successfully",
          token,
          user: {
            id: existingUser._id,
            uid: existingUser.uid,
            email: existingUser.email,
            firstName: existingUser.firstName,
            lastName: existingUser.lastName,
            role: existingUser.role,
            balance: existingUser.balance,
            referralCode: existingUser.referralCode,
            kycStatus: existingUser.kycStatus,
            createdAt: existingUser.createdAt,
          },
        });
      }

      logger.info(`User already exists: ${email}`);
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    // Generate a unique referral code
    const generatedReferralCode = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    // Generate a temporary password for new users (required by model)
    const tempPassword = Math.random().toString(36).substring(2, 15);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    // Process referral if code is provided
    let referrer = null;
    if (enteredReferralCode) {
      referrer = await User.findOne({ referralCode: enteredReferralCode });
    }

    // Create new user
    const newUser = new User({
      uid,
      email,
      firstName,
      lastName,
      phoneNumber,
      accountType: accountType || "individual",
      country,
      referralCode: generatedReferralCode,
      password: hashedPassword, // Required by model
      dateOfBirth,
      occupation,
      address: {
        street: address,
        city,
        postalCode,
        country,
      },
      taxId,
      referredBy: referrer ? referrer._id : null,
      kycStatus: "not_submitted",
      settings: {
        theme: "light",
        notifications: {
          email: true,
          app: true,
        },
      },
      kycDocuments: {
        idCard: { url: "placeholder" }, // Required by model
        proofOfAddress: { url: "placeholder" }, // Required by model
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Save additional profile information
    if (experienceLevel) {
      newUser.experienceLevel = experienceLevel;
    }

    if (howDidYouHearAboutUs) {
      newUser.howDidYouHearAboutUs = howDidYouHearAboutUs;
    }

    await newUser.save();
    logger.info(`New user registered successfully: ${email}`);

    // If there's a valid referrer, create referral record
    if (referrer) {
      logger.info(
        `Processing referral for user ${email} with referrer ${referrer.email}`,
      );

      try {
        const Referral = mongoose.model("Referral");
        const referral = new Referral({
          referrer: referrer._id,
          referee: newUser._id,
          status: "pending",
          createdAt: new Date(),
        });

        await referral.save();
        logger.info(`Referral record created for user ${email}`);
      } catch (referralError) {
        logger.error(
          `Error creating referral record: ${referralError.message}`,
        );
        // Don't fail registration if referral creation fails
      }
    }

    // Generate token for the new user
    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: {
        id: newUser._id,
        uid: newUser.uid,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        balance: newUser.balance,
        referralCode: newUser.referralCode,
        kycStatus: newUser.kycStatus,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error) {
    logger.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during registration",
      error: error.message,
    });
  }
});

// Login user - Firebase handles authentication, this endpoint validates and returns user data
router.post("/login", async (req, res) => {
  try {
    const { uid, firebaseToken } = req.body;

    if (!uid || !firebaseToken) {
      return res.status(400).json({ message: "A valid Firebase session is required" });
    }

    const firebaseAdmin = initFirebaseAdmin();
    if (!firebaseAdmin?.auth) {
      return res.status(503).json({ message: "Authentication service is temporarily unavailable" });
    }

    const decoded = await firebaseAdmin.auth().verifyIdToken(firebaseToken);
    if (decoded.uid !== uid) {
      return res.status(401).json({ message: "Firebase session does not match this account" });
    }

    const user = await User.findOne({ uid });
    if (!user) {
      return res
        .status(404)
        .json({
          message:
            "User not found in database. Please ensure your account is synchronized.",
        });
    }

    const now = new Date();
    user.lastLoginAt = now;
    await user.save();
    await LoginActivity.create({
      userId: user._id,
      timestamp: now,
      ipAddress: req.ip || req.socket?.remoteAddress || "unknown",
      device: req.get("user-agent") || "unknown",
      browser: req.get("user-agent") || "unknown",
      status: "success",
    });

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    logger.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Sync Firebase user with MongoDB
router.post("/sync", async (req, res) => {
  if (res.headersSent) {
    logger.warn("Attempted to process sync request after response was sent");
    return;
  }

  try {
    const { uid, email, displayName, firebaseToken } = req.body;

    logger.info(
      `User sync request: ${email} | Firebase UID: ${uid.substring(0, 8)}...`,
    );

    if (!uid || !email) {
      logger.warn(
        `Sync failed: Missing required user information | Email: ${email || "not provided"}`,
      );
      return res
        .status(400)
        .json({ message: "Missing required user information" });
    }

    // Find user by uid or email with error handling
    let user;
    try {
      user = await User.findOne({ $or: [{ uid }, { email }] });

      if (user) {
        logger.info(`User found for sync: ${email} | MongoDB ID: ${user._id}`);
      } else {
        logger.info(`User not found for sync, will create new user: ${email}`);
      }
    } catch (dbError) {
      logger.error("Database error during user lookup:", dbError);
      return res
        .status(500)
        .json({ message: "Database error during synchronization" });
    }

    if (user) {
      // Update existing user if needed
      let updated = false;

      // If found by email but uid doesn't match, update uid
      if (user.uid !== uid) {
        user.uid = uid;
        updated = true;
      }

      // If displayName is provided and doesn't match current name
      if (displayName && displayName.includes(" ")) {
        const [firstName, ...lastNameParts] = displayName.split(" ");
        const lastName = lastNameParts.join(" ");

        if (user.firstName !== firstName || user.lastName !== lastName) {
          user.firstName = firstName;
          user.lastName = lastName;
          updated = true;
        }
      }

      if (updated) {
        try {
          // Use updateOne to avoid validation on required fields
          await User.updateOne(
            { _id: user._id },
            {
              $set: { uid, firstName: user.firstName, lastName: user.lastName },
            },
          );
          logger.info(`User synchronized and updated: ${email}`);
        } catch (saveError) {
          logger.error("Error saving user updates:", saveError);
          return res
            .status(500)
            .json({ message: "Error updating user information" });
        }
      } else {
        logger.info(`User already synchronized: ${email}`);
      }

      return res.status(200).json({
        message: updated
          ? "User updated successfully"
          : "User already synchronized",
        userId: user._id,
      });
    }

    // User not found, create new user
    let firstName = "User";
    let lastName = "";

    if (displayName && displayName.includes(" ")) {
      const nameParts = displayName.split(" ");
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(" ");
    }

    // Generate referral code
    const referralCode = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    // Generate a temporary password for new users (required by model)
    const tempPassword = Math.random().toString(36).substring(2, 15);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    // Create new user with error handling
    try {
      const newUser = new User({
        uid,
        email,
        firstName,
        lastName,
        referralCode,
        password: hashedPassword, // Add the required password field
        kycDocuments: {
          idCard: { url: "placeholder" }, // Add placeholder to pass validation
          proofOfAddress: { url: "placeholder" }, // Add placeholder to pass validation
        },
      });

      await newUser.save();
      logger.info(`New user created during sync: ${email}`);

      return res.status(201).json({
        message: "User created successfully during synchronization",
        userId: newUser._id,
      });
    } catch (createError) {
      logger.error("Error creating new user during sync:", createError);
      return res.status(500).json({ message: "Error creating user" });
    }
  } catch (error) {
    logger.error("User sync error:", error);

    // Check if response has already been sent
    if (!res.headersSent) {
      return res
        .status(500)
        .json({ message: "Server error during synchronization" });
    }
  }
});

// Sync password from Firebase to local MongoDB
router.post("/sync-password", async (req, res) => {
  try {
    const { idToken, newPassword } = req.body;

    if (!idToken || !newPassword) {
      return res.status(400).json({ message: "idToken and newPassword are required" });
    }

    const firebaseAdmin = initFirebaseAdmin();
    if (!firebaseAdmin || !firebaseAdmin.auth) {
      logger.error('Firebase Admin SDK not initialized - cannot verify idToken');
      return res.status(500).json({ message: 'Server misconfiguration: Firebase Admin not available' });
    }

    // Verify idToken to ensure request is genuine
    const decoded = await firebaseAdmin.auth().verifyIdToken(idToken).catch(err => {
      logger.warn('Failed to verify idToken', err);
      return null;
    });

    if (!decoded) {
      return res.status(401).json({ message: 'Invalid or expired idToken' });
    }

    const uid = decoded.uid;
    const email = decoded.email;

    const user = await User.findOne({ $or: [{ uid }, { email }] });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Update local password - the pre-save hook will hash the password
    user.password = newPassword;
    await user.save();

    return res.json({ message: 'Password synchronized to local database' });
  } catch (err) {
    logger.error('Error syncing password:', err);
    return res.status(500).json({ message: 'Server error during password synchronization' });
  }
});

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const otpHash = (email, otp) =>
  crypto
    .createHash("sha256")
    .update(`${normalizeEmail(email)}:${otp}:${process.env.JWT_SECRET}`)
    .digest("hex");

router.post("/forgot-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    const user = await User.findOne({ email });
    const genericMessage = "If an account exists for that email, a verification code has been sent.";
    if (!user) return res.status(200).json({ message: genericMessage });

    const now = Date.now();
    if (
      user.passwordResetOtpLastSentAt &&
      now - user.passwordResetOtpLastSentAt.getTime() < 60_000
    ) {
      return res.status(429).json({ message: "Please wait one minute before requesting another code" });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    user.passwordResetOtpHash = otpHash(email, otp);
    user.passwordResetOtpExpires = new Date(now + 10 * 60_000);
    user.passwordResetOtpLastSentAt = new Date(now);
    user.passwordResetOtpAttempts = 0;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    const delivery = await sendEmail({
      to: { email: user.email, name: `${user.firstName || ""} ${user.lastName || ""}`.trim() },
      subject: "Your FFB password reset code",
      text: `Your FFB verification code is ${otp}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: buildBrandedEmailHtml({
        title: "Reset your password",
        message: `Use this verification code to continue:\n\n${otp}\n\nThis code expires in 10 minutes. If you did not request this, you can safely ignore this email.`,
      }),
      customId: "password-reset-otp",
    });

    if (!delivery.ok) {
      user.passwordResetOtpHash = undefined;
      user.passwordResetOtpExpires = undefined;
      await user.save();
      return res.status(503).json({ message: "We could not send the email right now. Please try again shortly." });
    }

    return res.status(200).json({ message: genericMessage, expiresInSeconds: 600 });
  } catch (error) {
    logger.error("Forgot password error:", error);
    return res.status(500).json({ message: "Unable to start password reset. Please try again." });
  }
});

router.post("/forgot-password/verify", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || "").trim();
    const user = await User.findOne({ email });
    const invalidMessage = "The code is incorrect or has expired. Request a new code and try again.";

    if (!user?.passwordResetOtpHash || !user.passwordResetOtpExpires || user.passwordResetOtpExpires < new Date()) {
      return res.status(400).json({ message: invalidMessage });
    }
    if ((user.passwordResetOtpAttempts || 0) >= 5) {
      return res.status(429).json({ message: "Too many incorrect attempts. Request a new code." });
    }

    const supplied = Buffer.from(otpHash(email, otp), "hex");
    const expected = Buffer.from(user.passwordResetOtpHash, "hex");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      user.passwordResetOtpAttempts = (user.passwordResetOtpAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: invalidMessage });
    }

    const resetToken = user.createPasswordResetToken();
    user.passwordResetExpires = new Date(Date.now() + 15 * 60_000);
    user.passwordResetOtpHash = undefined;
    user.passwordResetOtpExpires = undefined;
    user.passwordResetOtpAttempts = 0;
    await user.save();
    return res.status(200).json({ message: "Code verified", resetToken });
  } catch (error) {
    logger.error("Password reset verification error:", error);
    return res.status(500).json({ message: "Unable to verify the code. Please try again." });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const resetToken = String(req.body?.resetToken || "");
    const newPassword = String(req.body?.newPassword || "");
    if (newPassword.length < 8 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(400).json({ message: "Password must be at least 8 characters and include uppercase, lowercase, and a number" });
    }

    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const user = await User.findOne({
      email,
      passwordResetToken: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ message: "This reset session is invalid or has expired. Start again." });
    }

    const firebaseAdmin = initFirebaseAdmin();
    if (!firebaseAdmin?.auth || !user.uid) {
      return res.status(503).json({ message: "Password service is temporarily unavailable. Please try again shortly." });
    }
    await firebaseAdmin.auth().updateUser(user.uid, { password: newPassword });

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.passwordResetOtpLastSentAt = undefined;
    await user.save();

    return res.status(200).json({ message: "Your password has been changed. You can now sign in." });
  } catch (error) {
    logger.error("Reset password error:", error);
    return res.status(500).json({ message: "Unable to reset your password. Please try again." });
  }
});

router.post("/google-auth", googleAuth);

export default router;

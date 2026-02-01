import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import ImpersonationLog from "../models/ImpersonationLog.js";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

const getMasterKeyHash = () => {
  return (
    process.env.ADMIN_IMPERSONATION_MASTER_KEY_HASH ||
    process.env.MASTER_KEY_HASH ||
    ""
  );
};

const getImpersonationExpirySeconds = () => {
  const raw = process.env.IMPERSONATION_TOKEN_EXP_SECONDS;
  const n = raw ? Number(raw) : 900;
  if (!Number.isFinite(n) || n < 60) return 900;
  return Math.floor(n);
};

export const impersonateUser = async (req, res, next) => {
  try {
    const admin = req.user;
    logger.info(`Impersonation attempt by admin=${admin?._id || "unknown"} from ip=${req.ip} userAgent=${req.headers["user-agent"] || "n/a"}`);

    if (!admin || !["admin", "superadmin"].includes(admin.role)) {
      throw new ApiError("Admin privileges required", 403, "forbidden");
    }

    const { targetUserId, masterKey, reason } = req.body || {};

    if (!targetUserId) {
      throw new ApiError("targetUserId is required", 400, "validation_error");
    }

    const masterKeyHash = getMasterKeyHash();
    if (!masterKeyHash) {
      logger.warn("Admin impersonation attempted without master key configured");
      throw new ApiError(
        "Impersonation is not configured on the server",
        500,
        "server_error",
      );
    }

    if (!masterKey || typeof masterKey !== "string") {
      throw new ApiError("Master key is required", 401, "auth_error");
    }

    const ok = await bcrypt.compare(masterKey, masterKeyHash);
    if (!ok) {
      logger.warn(`Invalid master key attempt for admin=${admin?._id || "unknown"} target=${targetUserId}`);
      throw new ApiError("Invalid master key", 401, "auth_error");
    }

    const targetUser = await User.findById(targetUserId).select("-password");
    if (!targetUser) {
      throw new ApiError("Target user not found", 404, "not_found");
    }

    const expSeconds = getImpersonationExpirySeconds();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + expSeconds * 1000);
    const tokenId = crypto.randomBytes(16).toString("hex");

    const adminIp =
      req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
      req.ip ||
      "";

    const adminUserAgent = req.headers["user-agent"] || "";

    const log = await ImpersonationLog.create({
      admin: admin._id,
      user: targetUser._id,
      reason: typeof reason === "string" ? reason : "",
      tokenId,
      issuedAt,
      expiresAt,
      adminIp,
      adminUserAgent,
    });

    logger.info(`Impersonation granted: admin=${admin._id} -> user=${targetUser._id} log=${log._id} tokenId=${tokenId} expiresAt=${expiresAt.toISOString()}`);

    const payload = {
      userId: targetUser._id,
      email: targetUser.email,
      role: targetUser.role,
      impersonatedBy: admin._id.toString(),
      impersonationLogId: log._id.toString(),
      tokenId,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: expSeconds,
    });

    return res.status(200).json({
      success: true,
      token,
      expiresAt,
      logId: log._id,
      user: {
        id: targetUser._id,
        email: targetUser.email,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        role: targetUser.role,
        status: targetUser.status,
      },
    });
  } catch (err) {
    return next(err);
  }
};

export const revokeImpersonation = async (req, res, next) => {
  try {
    const admin = req.user;

    if (!admin || !["admin", "superadmin"].includes(admin.role)) {
      throw new ApiError("Admin privileges required", 403, "forbidden");
    }

    const { logId } = req.body || {};
    if (!logId) {
      throw new ApiError("logId is required", 400, "validation_error");
    }

    // Only superadmin can revoke any; admin can revoke ones they started.
    const query = { _id: logId };
    if (admin.role !== "superadmin") {
      query.admin = admin._id;
    }

    const log = await ImpersonationLog.findOne(query);
    if (!log) {
      throw new ApiError("Impersonation log not found", 404, "not_found");
    }

    if (log.revoked) {
      return res.status(200).json({ success: true, message: "Already revoked" });
    }

    log.revoked = true;
    log.revokedAt = new Date();
    log.revokedBy = admin._id;
    await log.save();

    return res.status(200).json({
      success: true,
      message: "Impersonation revoked",
    });
  } catch (err) {
    return next(err);
  }
};

export default {
  impersonateUser,
  revokeImpersonation,
};

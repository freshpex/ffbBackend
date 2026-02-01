import jwt from "jsonwebtoken";
import { ApiError } from "./errorHandler.js";
import User from "../models/User.js";
import logger from "./logger.js";
import ImpersonationLog from "../models/ImpersonationLog.js";

// Verify JWT token middleware
export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError("Access denied. No token provided", 401, "auth_error");
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      throw new ApiError("Invalid token format", 401, "auth_error");
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // If this is an impersonation token, validate it against the audit log (revocation + binding)
      if (decoded?.impersonationLogId && decoded?.tokenId) {
        const logDoc = await ImpersonationLog.findById(decoded.impersonationLogId)
          .select("admin user tokenId expiresAt revoked")
          .lean();

        const now = new Date();
        const isValid =
          !!logDoc &&
          !logDoc.revoked &&
          String(logDoc.tokenId) === String(decoded.tokenId) &&
          String(logDoc.user) === String(decoded.userId) &&
          (!logDoc.expiresAt || new Date(logDoc.expiresAt) > now);

        if (!isValid) {
          throw new ApiError("Invalid impersonation token", 401, "invalid_token");
        }

        req.impersonation = {
          impersonatedBy: decoded.impersonatedBy,
          impersonationLogId: decoded.impersonationLogId,
          tokenId: decoded.tokenId,
        };
      }

      // Attach user to request object
      const user = await User.findById(decoded.userId).select("-password");

      if (!user) {
        throw new ApiError("User not found", 401, "auth_error");
      }

      // Allow profile endpoint to pass through even for suspended/inactive users
      // This is needed so the frontend can fetch the user status and show the suspension modal
      const isProfileEndpoint = req.path === "/profile" || req.path.endsWith("/users/profile");
      
      // Check if account is suspended or inactive (skip check for profile endpoint)
      if (!isProfileEndpoint && user.status === "suspended") {
        throw new ApiError(
          "Your account has been suspended due to suspicious or fraudulent activities. Please contact support for more information.",
          403,
          "account_suspended"
        );
      }

      if (!isProfileEndpoint && user.status === "inactive") {
        throw new ApiError(
          "Your account is currently inactive. Please contact support to reactivate your account.",
          403,
          "account_inactive"
        );
      }

      req.user = user;
      req.user.userId = user._id;

      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new ApiError("Token expired", 401, "token_expired");
      } else if (error.name === "JsonWebTokenError") {
        throw new ApiError("Invalid token", 401, "invalid_token");
      } else {
        throw error;
      }
    }
  } catch (error) {
    // Ensure we're using the ApiError format for consistency
    if (!(error instanceof ApiError)) {
      error = new ApiError(
        error.message || "Authentication error",
        401,
        "auth_error",
      );
    }
    next(error);
  }
};

// Admin role verification middleware
export const verifyAdmin = (req, res, next) => {
  if (!req.user || !["admin", "superadmin"].includes(req.user.role)) {
    return next(
      new ApiError(
        "Access denied. Admin privileges required",
        403,
        "forbidden",
      ),
    );
  }
  next();
};

// Export verifyAdmin as requireAdmin (for compatibility)
export const requireAdmin = (req, res, next) => {
  if (!req.user || !["admin", "superadmin"].includes(req.user.role)) {
    return next(
      new ApiError(
        "Access denied. Admin privileges required",
        403,
        "forbidden",
      ),
    );
  }
  next();
};

// Add requireSuperAdmin middleware
export const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "superadmin") {
    return next(
      new ApiError(
        "Access denied. Superadmin privileges required",
        403,
        "forbidden",
      ),
    );
  }
  next();
};

// Check role utility function
export const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new ApiError(
          `Access denied. Required role: ${roles.join(" or ")}`,
          403,
          "forbidden",
        ),
      );
    }
    next();
  };
};

// Optional: Token refresh middleware
export const refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      throw new ApiError("Refresh token required", 401, "auth_error");
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      throw new ApiError("User not found", 401, "auth_error");
    }

    // Generate new access token
    const accessToken = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    res.status(200).json({
      success: true,
      accessToken,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  verifyToken,
  verifyAdmin,
  requireAdmin,
  requireSuperAdmin,
  checkRole,
  refreshToken,
};

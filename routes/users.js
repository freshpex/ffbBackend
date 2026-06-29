import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import UserProfileController, {
  getUserBalance,
  getUserProfile,
  getAccountSummary,
  getBonusConversionStatus,
  convertBonusBalance,
} from "../controllers/UserProfileController.js";
import UserSecurityController from "../controllers/UserSecurityController.js";
import UserPaymentMethodsController from "../controllers/UserPaymentMethodsController.js";

const router = express.Router();

// Protect all routes
router.use(verifyToken);

// User profile routes
router.get("/profile", asyncHandler(UserProfileController.getUserProfile));
router.put("/profile", asyncHandler(UserProfileController.updateUserProfile));

// Profile image upload route - Fixed to use the correctly exported upload middleware
router.post(
  "/profile/image",
  UserProfileController.upload.single("image"),
  asyncHandler(UserProfileController.uploadProfileImage),
);
router.get(
  "/preferences",
  asyncHandler(UserProfileController.getUserPreferences),
);
router.put(
  "/preferences",
  asyncHandler(UserProfileController.updateUserPreferences),
);

// Add route for user profile
router.get("/profile", verifyToken, asyncHandler(getUserProfile));

// Add route for account summary
router.get("/account-summary", verifyToken, asyncHandler(getAccountSummary));

// User security routes
router.put(
  "/security/password",
  asyncHandler(UserSecurityController.changePassword),
);
router.post(
  "/security/2fa/setup",
  asyncHandler(UserSecurityController.setup2FA),
);
router.post(
  "/security/2fa/verify",
  asyncHandler(UserSecurityController.verify2FA),
);
router.post(
  "/security/2fa/disable",
  asyncHandler(UserSecurityController.disable2FA),
);
router.get(
  "/security/login-activity",
  asyncHandler(UserSecurityController.getLoginActivity),
);
router.get(
  "/security/status",
  asyncHandler(UserSecurityController.getSecurityStatus),
);
router.get(
  "/security/withdrawal-pin/status",
  asyncHandler(UserSecurityController.getWithdrawalPinStatus),
);
router.post(
  "/security/withdrawal-pin/verify",
  asyncHandler(UserSecurityController.verifyWithdrawalPin),
);
router.post(
  "/security/withdrawal-pin",
  asyncHandler(UserSecurityController.setWithdrawalPin),
);

// User payment methods routes
router.get(
  "/payment-methods",
  asyncHandler(UserPaymentMethodsController.getUserPaymentMethods),
);
router.post(
  "/payment-methods",
  asyncHandler(UserPaymentMethodsController.addPaymentMethod),
); // Added generic payment method POST route
router.post(
  "/payment-methods/bank",
  asyncHandler(UserPaymentMethodsController.addBankAccount),
);
router.post(
  "/payment-methods/crypto",
  asyncHandler(UserPaymentMethodsController.addCryptoWallet),
);
router.post(
  "/payment-methods/card",
  asyncHandler(UserPaymentMethodsController.addCard),
);
router.put(
  "/payment-methods/:id",
  asyncHandler(UserPaymentMethodsController.updatePaymentMethod),
);
router.put(
  "/payment-methods/:id/default",
  asyncHandler(UserPaymentMethodsController.setDefaultPaymentMethod),
);
router.delete(
  "/payment-methods/:id",
  asyncHandler(UserPaymentMethodsController.deletePaymentMethod),
);
router.get("/balance", verifyToken, asyncHandler(getUserBalance));

// Bonus balance routes
router.get("/bonus/status", asyncHandler(getBonusConversionStatus));
router.post("/bonus/convert", asyncHandler(convertBonusBalance));

export default router;

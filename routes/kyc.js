import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import multer from "multer";
import UserKycController from "../controllers/UserKycController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Apply authentication middleware to all routes
router.use(verifyToken);

router.post(
  "/",
  upload.fields([
    { name: "frontImage", maxCount: 1 },
    { name: "backImage", maxCount: 1 },
    { name: "proofOfAddressImage", maxCount: 1 },
    { name: "selfieImage", maxCount: 1 },
  ]),
  asyncHandler(UserKycController.submitKyc),
);

// Get user's KYC status
router.get("/status", asyncHandler(UserKycController.getKycStatus));

export default router;

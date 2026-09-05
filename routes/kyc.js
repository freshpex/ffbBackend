import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { ApiError, asyncHandler } from "../middleware/errorHandler.js";
import multer from "multer";
import UserKycController from "../controllers/UserKycController.js";

const router = express.Router();
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, callback) => {
    if (!acceptedImageTypes.has(file.mimetype)) {
      callback(
        new ApiError(
          `${file.fieldname} must be a JPG, PNG, or WEBP image`,
          400,
          "invalid_file_type",
        ),
      );
      return;
    }
    callback(null, true);
  },
});

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

import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  getAllSupportTickets,
  getSupportTicketById,
  updateTicketStatus,
  addSupportTicketReply,
  getSupportTicketStats,
} from "../controllers/AdminSupportController.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);

// Get all support tickets
router.get("/", asyncHandler(getAllSupportTickets));

// Get support ticket statistics
router.get("/stats", asyncHandler(getSupportTicketStats));

// Get specific support ticket by ID
router.get("/:id", asyncHandler(getSupportTicketById));

// Update support ticket
router.put("/:id", asyncHandler(updateTicketStatus));

// Add a reply to a support ticket
router.post("/:id/reply", asyncHandler(addSupportTicketReply));

export default router;

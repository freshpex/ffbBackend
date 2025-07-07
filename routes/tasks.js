import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  getAllTasks,
  getTaskById,
  getUserTasks,
  startTask,
  updateTaskProgress,
  claimTaskReward,
  getTaskStatistics,
  createTask,
  updateTask,
  deleteTask,
} from "../controllers/TaskController.js";

const router = express.Router();

// Public routes (accessible without authentication)
router.get("/public", asyncHandler(getAllTasks)); // Get all active tasks

// Protected routes (require authentication)
router.use(verifyToken);

// User routes
router.get("/", asyncHandler(getAllTasks)); // Get all tasks with user progress
router.get("/user", asyncHandler(getUserTasks)); // Get user's tasks
router.get("/statistics", asyncHandler(getTaskStatistics)); // Get task statistics
router.get("/:id", asyncHandler(getTaskById)); // Get specific task
router.post("/:taskId/start", asyncHandler(startTask)); // Start a task
router.put("/:taskId/progress", asyncHandler(updateTaskProgress)); // Update task progress
router.post("/:taskId/claim", asyncHandler(claimTaskReward)); // Claim task reward

// Admin routes
router.post("/admin/create", asyncHandler(createTask)); // Create new task (admin only)
router.put("/admin/:id", asyncHandler(updateTask)); // Update task (admin only)
router.delete("/admin/:id", asyncHandler(deleteTask)); // Delete task (admin only)

export default router;

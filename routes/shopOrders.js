import express from "express";
import {
  createOrder,
  getUserOrders,
  getOrderById,
  cancelOrder,
  getOrderStats,
  getAllOrders,
  updateOrderStatus,
} from "../controllers/ShopOrderController.js";
import { verifyToken, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// User routes
router.post("/", verifyToken, createOrder);
router.get("/", verifyToken, getUserOrders);
router.get("/stats", verifyToken, getOrderStats);
router.get("/:orderId", verifyToken, getOrderById);
router.post("/:orderId/cancel", verifyToken, cancelOrder);

// Admin routes
router.get("/admin/all", verifyToken, requireAdmin, getAllOrders);
router.put("/admin/:orderId", verifyToken, requireAdmin, updateOrderStatus);

export default router;

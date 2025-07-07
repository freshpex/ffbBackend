import express from "express";
import {
  trackVisitor,
  trackPageView,
  trackExit,
  getVisitorAnalytics,
  getVisitorDetails,
  getAllVisitors
} from "../controllers/VisitorController.js";

const router = express.Router();

// Public routes for tracking
router.post("/visitor", trackVisitor);
router.post("/pageview", trackPageView);
router.post("/exit", trackExit);

// Admin-only routes
router.get("/analytics", getVisitorAnalytics);
router.get("/", getAllVisitors);
router.get("/:id", getVisitorDetails);

export default router;
import express from "express";
import {
  searchProducts,
  getProductById,
  getCachedProducts,
  getCategories,
  getTrendingProducts,
} from "../controllers/ProductController.js";

const router = express.Router();

// Public routes
router.get("/search", searchProducts);
router.get("/cached", getCachedProducts);
router.get("/categories", getCategories);
router.get("/trending", getTrendingProducts);
router.get("/:id", getProductById);

export default router;

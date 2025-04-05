import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getAllEducationContent,
  getEducationContentById,
  likeEducationContent,
  getFeaturedContent,
  getCategories
} from '../controllers/EducationController.js';

const router = express.Router();

// Public routes - no authentication needed
router.get('/categories', asyncHandler(getCategories));

// Apply authentication middleware to protected routes
router.use(verifyToken);

// Get all educational content
router.get('/', asyncHandler(getAllEducationContent));

// Get featured educational content
router.get('/featured', asyncHandler(getFeaturedContent));

// Get specific educational content by ID
router.get('/:id', asyncHandler(getEducationContentById));

// Like educational content
router.post('/:id/like', asyncHandler(likeEducationContent));

export default router;

import EducationContent from '../models/EducationContent.js';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';

// Get all educational content with filtering and pagination
export const getAllEducationContent = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      tag, 
      search,
      featured,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const query = { isPublished: true };
    
    // Apply filters
    if (category) query.category = category;
    if (tag) query.tags = tag;
    if (featured === 'true') query.featured = true;
    
    // Apply search
    if (search) {
      query.$text = { $search: search };
    }
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Execute query with pagination
    const totalContent = await EducationContent.countDocuments(query);
    const content = await EducationContent.find(query)
      .sort(sort)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      data: {
        content,
        pagination: {
          total: totalContent,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalContent / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching educational content:', error);
    next(error);
  }
};

// Get educational content by ID
export const getEducationContentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const content = await EducationContent.findOne({
      _id: id,
      isPublished: true
    });
    
    if (!content) {
      throw new ApiError('Educational content not found', 404, 'not_found');
    }
    
    // Increment view count
    content.views += 1;
    await content.save();
    
    res.status(200).json({
      success: true,
      data: content
    });
  } catch (error) {
    logger.error(`Error fetching educational content ${req.params.id}:`, error);
    next(error);
  }
};

// Like educational content
export const likeEducationContent = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const content = await EducationContent.findOne({
      _id: id,
      isPublished: true
    });
    
    if (!content) {
      throw new ApiError('Educational content not found', 404, 'not_found');
    }
    
    // Increment like count
    content.likes += 1;
    await content.save();
    
    res.status(200).json({
      success: true,
      message: 'Content liked successfully',
      data: content
    });
  } catch (error) {
    logger.error(`Error liking educational content ${req.params.id}:`, error);
    next(error);
  }
};

// Get featured educational content
export const getFeaturedContent = async (req, res, next) => {
  try {
    const featuredContent = await EducationContent.find({
      isPublished: true,
      featured: true
    })
    .sort({ createdAt: -1 })
    .limit(5);
    
    res.status(200).json({
      success: true,
      data: featuredContent
    });
  } catch (error) {
    logger.error('Error fetching featured educational content:', error);
    next(error);
  }
};

// Get all educational content categories
export const getCategories = async (req, res, next) => {
  try {
    const categories = [
      {
        id: 'beginner',
        name: 'Beginner',
        description: 'Fundamental concepts for those new to trading and investing',
        icon: 'graduation-cap'
      },
      {
        id: 'intermediate',
        name: 'Intermediate',
        description: 'More advanced concepts for those with some experience',
        icon: 'book'
      },
      {
        id: 'advanced',
        name: 'Advanced',
        description: 'Complex topics for experienced traders',
        icon: 'chart-line'
      },
      {
        id: 'market-analysis',
        name: 'Market Analysis',
        description: 'Tools and techniques for analyzing market trends',
        icon: 'search-dollar'
      },
      {
        id: 'trading-strategies',
        name: 'Trading Strategies',
        description: 'Various strategies for trading in different market conditions',
        icon: 'chess'
      },
      {
        id: 'risk-management',
        name: 'Risk Management',
        description: 'Methods to manage and mitigate risk in your portfolio',
        icon: 'shield-alt'
      }
    ];
    
    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Error fetching education categories:', error);
    next(error);
  }
};

export default {
  getAllEducationContent,
  getEducationContentById,
  likeEducationContent,
  getFeaturedContent,
  getCategories
};

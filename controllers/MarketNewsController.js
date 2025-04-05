import MarketNews from '../models/MarketNews.js';
import axios from 'axios';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';

// Get market news with filtering and pagination
export const getMarketNews = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      symbol, 
      search,
      sentiment,
      from,
      to
    } = req.query;
    
    const query = {};
    
    // Apply filters
    if (category) {
      query.categories = category;
    }
    
    if (symbol) {
      query.symbols = symbol.toUpperCase();
    }
    
    if (sentiment && ['positive', 'negative', 'neutral'].includes(sentiment)) {
      query.sentiment = sentiment;
    }
    
    // Date range filter
    if (from || to) {
      query.publishedAt = {};
      if (from) {
        query.publishedAt.$gte = new Date(from);
      }
      if (to) {
        query.publishedAt.$lte = new Date(to);
      }
    }
    
    // Text search
    if (search) {
      query.$text = { $search: search };
    }
    
    // Execute query with pagination
    const total = await MarketNews.countDocuments(query);
    const news = await MarketNews.find(query)
      .sort({ publishedAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      data: {
        news,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching market news:', error);
    next(error);
  }
};

// Get news by ID
export const getNewsById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const news = await MarketNews.findById(id);
    
    if (!news) {
      throw new ApiError('News article not found', 404, 'not_found');
    }
    
    res.status(200).json({
      success: true,
      data: news
    });
  } catch (error) {
    logger.error(`Error fetching news article ${req.params.id}:`, error);
    next(error);
  }
};

// Get latest market news (for dashboard)
export const getLatestNews = async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;
    
    const news = await MarketNews.find()
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      data: news
    });
  } catch (error) {
    logger.error('Error fetching latest news:', error);
    next(error);
  }
};

// Function to fetch and store news from external API (run via cron job)
export const fetchNewsFromExternalApi = async () => {
  try {
    // This would connect to a real financial news API
    // For now, we'll create some sample data
    
    const sampleNewsData = [
      {
        title: 'Federal Reserve Announces Interest Rate Decision',
        source: 'Financial Times',
        url: 'https://example.com/fed-interest-rate',
        imageUrl: 'https://example.com/images/fed.jpg',
        summary: 'The Federal Reserve announced its latest interest rate decision, impacting markets globally.',
        categories: ['monetary policy', 'economy'],
        symbols: ['SPY', 'QQQ', 'DIA'],
        sentiment: 'neutral',
        publishedAt: new Date()
      },
      {
        title: 'Tech Giant Exceeds Quarterly Earnings Expectations',
        source: 'Wall Street Journal',
        url: 'https://example.com/tech-earnings',
        imageUrl: 'https://example.com/images/tech.jpg',
        summary: 'Major technology company reports earnings well above analyst expectations, driving market optimism.',
        categories: ['technology', 'earnings'],
        symbols: ['AAPL', 'MSFT', 'GOOGL'],
        sentiment: 'positive',
        publishedAt: new Date(Date.now() - 1000 * 60 * 30) // 30 minutes ago
      },
      {
        title: 'Oil Prices Fall on Supply Concerns',
        source: 'Bloomberg',
        url: 'https://example.com/oil-prices',
        imageUrl: 'https://example.com/images/oil.jpg',
        summary: 'Crude oil prices declined sharply following reports of increased production and weakening demand.',
        categories: ['commodities', 'energy'],
        symbols: ['USO', 'XLE', 'CVX'],
        sentiment: 'negative',
        publishedAt: new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
      }
    ];
    
    // Check if news articles already exist
    const existingNews = await MarketNews.countDocuments();
    
    if (existingNews === 0) {
      // Only insert sample data if no news exists
      await MarketNews.insertMany(sampleNewsData);
      logger.info('Sample market news data inserted successfully');
    }
    
    // In a real implementation, we would:
    // 1. Fetch from external API
    // 2. Process and format the data
    // 3. Store in the database
    // 4. Remove old news articles
    
    return { success: true, message: 'News fetch operation completed' };
  } catch (error) {
    logger.error('Error fetching news from external API:', error);
    throw error;
  }
};

export default {
  getMarketNews,
  getNewsById,
  getLatestNews,
  fetchNewsFromExternalApi
};

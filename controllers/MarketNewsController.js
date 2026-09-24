import MarketNews from "../models/MarketNews.js";
import axios from "axios";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

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
      to,
    } = req.query;

    const query = {};

    // Apply filters
    if (category) {
      query.categories = category;
    }

    if (symbol) {
      query.symbols = symbol.toUpperCase();
    }

    if (sentiment && ["positive", "negative", "neutral"].includes(sentiment)) {
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
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching market news:", error);
    next(error);
  }
};

// Get news by ID
export const getNewsById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const news = await MarketNews.findById(id);

    if (!news) {
      throw new ApiError("News article not found", 404, "not_found");
    }

    res.status(200).json({
      success: true,
      data: news,
    });
  } catch (error) {
    logger.error(`Error fetching news article ${req.params.id}:`, error);
    next(error);
  }
};

// Get latest market news (for dashboard)
export const getLatestNews = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);

    const newest = await MarketNews.findOne().sort({ publishedAt: -1 }).select("publishedAt");
    const isStale = !newest || Date.now() - newest.publishedAt.getTime() > 10 * 60_000;
    if (isStale && process.env.ALPHA_VANTAGE_API_KEY) {
      try {
        await fetchNewsFromExternalApi();
      } catch (refreshError) {
        logger.warn(`Serving cached market news after provider refresh failed: ${refreshError.message}`);
      }
    }

    const news = await MarketNews.find()
      .sort({ publishedAt: -1 })
      .limit(limit);

    res.status(200).json({
      success: true,
      data: news,
    });
  } catch (error) {
    logger.error("Error fetching latest news:", error);
    next(error);
  }
};

// Function to fetch and store news from external API (run via cron job)
export const fetchNewsFromExternalApi = async () => {
  try {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) throw new Error("ALPHA_VANTAGE_API_KEY is not configured");

    const response = await axios.get("https://www.alphavantage.co/query", {
      params: {
        function: "NEWS_SENTIMENT",
        topics: "financial_markets,blockchain",
        sort: "LATEST",
        limit: 50,
        apikey: apiKey,
      },
      timeout: 10_000,
    });
    const feed = Array.isArray(response.data?.feed) ? response.data.feed : [];
    if (!feed.length) {
      const providerMessage = response.data?.Information || response.data?.Note || "No articles returned";
      throw new Error(`Alpha Vantage news unavailable: ${providerMessage}`);
    }

    const parsePublishedAt = (value) => {
      const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
      return match
        ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]))
        : new Date();
    };
    const sentiment = (label) => {
      const normalized = String(label || "").toLowerCase();
      if (normalized.includes("bullish")) return "positive";
      if (normalized.includes("bearish")) return "negative";
      return "neutral";
    };

    const operations = feed
      .filter((article) => article?.url && article?.title)
      .map((article) => ({
        updateOne: {
          filter: { url: article.url },
          update: {
            $set: {
              title: article.title,
              source: article.source || "Market news",
              url: article.url,
              imageUrl: article.banner_image || null,
              summary: article.summary || article.title,
              categories: (article.topics || []).map((topic) => topic.topic).filter(Boolean),
              symbols: (article.ticker_sentiment || []).map((ticker) => ticker.ticker).filter(Boolean),
              sentiment: sentiment(article.overall_sentiment_label),
              publishedAt: parsePublishedAt(article.time_published),
            },
          },
          upsert: true,
        },
      }));

    if (operations.length) await MarketNews.bulkWrite(operations, { ordered: false });
    await MarketNews.deleteMany({ publishedAt: { $lt: new Date(Date.now() - 45 * 24 * 60 * 60_000) } });
    logger.info(`Stored ${operations.length} market news articles from Alpha Vantage`);
    return { success: true, count: operations.length };
  } catch (error) {
    logger.error("Error fetching news from external API:", error);
    throw error;
  }
};

export default {
  getMarketNews,
  getNewsById,
  getLatestNews,
  fetchNewsFromExternalApi,
};

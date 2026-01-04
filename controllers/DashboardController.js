import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Investment from "../models/Investment.js";
import PriceAlert from "../models/PriceAlert.js";
import MarketNews from "../models/MarketNews.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

// Get account summary for dashboard
export const getAccountSummary = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    // Calculate total balance
    const totalBalance = user.balance;

    // Calculate total investments value
    const investments = await Investment.find({
      user: user._id,
      status: "active",
    });
    const totalInvestments = investments.reduce(
      (sum, investment) => sum + investment.amount,
      0,
    );

    // Calculate projected earnings
    const projectedEarnings = investments.reduce((sum, investment) => {
      const roi = investment.expectedReturn / 100;
      return sum + investment.amount * roi;
    }, 0);

    // Get total deposits
    const totalDeposits = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(user._id),
          type: "deposit",
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    // Get total withdrawals
    const totalWithdrawals = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(user._id),
          type: "withdrawal",
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    // Format data for response
    const accountSummary = {
      availableBalance: user.balance || "N/A",
      bonusBalance: user.bonusBalance || 0,
      totalInvestments,
      totalAssets: totalBalance + totalInvestments,
      projectedEarnings,
      totalDeposits: totalDeposits[0]?.total || 0,
      totalWithdrawals: totalWithdrawals[0]?.total || 0,
      bonusConversionEligible:
        (totalDeposits[0]?.total || 0) >= 300,
      bonusConversionMinDepositRequired: 300,
      currency: "USD",
      accountNumber: user.accountNumber || "N/A",
      accountType: user.accountType || "Standard",
    };

    res.status(200).json({
      success: true,
      data: accountSummary,
    });
  } catch (error) {
    logger.error("Error fetching account summary:", error);
    next(error);
  }
};

// Get recent transactions for dashboard
export const getRecentTransactions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit = 5 } = req.query;

    const transactions = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate("user", "firstName lastName email");

    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};

// Get financial highlights for dashboard
export const getFinancialHighlights = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get deposit total
    const depositTotal = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          type: "deposit",
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    // Get withdrawal total
    const withdrawalTotal = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          type: "withdrawal",
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    // Get investment stats
    const investments = await Investment.find({ user: userId });
    const activeInvestments = investments.filter(
      (inv) => inv.status === "active",
    );

    // Calculate profit/loss
    const investmentTotal = investments.reduce(
      (sum, inv) => sum + inv.amount,
      0,
    );
    const totalReturns = investments.reduce(
      (sum, inv) => sum + (inv.returns || 0),
      0,
    );

    const highlights = {
      depositTotal: depositTotal.length > 0 ? depositTotal[0].total : 0,
      withdrawalTotal:
        withdrawalTotal.length > 0 ? withdrawalTotal[0].total : 0,
      investmentTotal,
      totalReturns,
      activeInvestments: activeInvestments.length,
      profitLoss: totalReturns - investmentTotal,
      profitPercentage:
        investmentTotal > 0
          ? ((totalReturns - investmentTotal) / investmentTotal) * 100
          : 0,
    };

    res.status(200).json({
      success: true,
      data: highlights,
    });
  } catch (error) {
    next(error);
  }
};

// Get market overview data
export const getMarketOverview = async (req, res, next) => {
  try {
    // Fetch market data from external API or database
    const marketData = {
      indices: [
        { name: "S&P 500", value: 4580.25, change: 0.85, changePercent: 1.2 },
        {
          name: "Dow Jones",
          value: 36240.75,
          change: 145.8,
          changePercent: 0.4,
        },
        { name: "Nasdaq", value: 14350.5, change: -28.6, changePercent: -0.2 },
        {
          name: "Bitcoin",
          value: 48750.32,
          change: 1250.8,
          changePercent: 2.8,
        },
        { name: "Ethereum", value: 3290.15, change: 85.4, changePercent: 2.6 },
      ],
      currencies: [
        { pair: "EUR/USD", value: 1.0825, change: 0.0015, changePercent: 0.14 },
        {
          pair: "GBP/USD",
          value: 1.265,
          change: -0.0032,
          changePercent: -0.25,
        },
        { pair: "USD/JPY", value: 145.82, change: 0.76, changePercent: 0.52 },
      ],
      commodities: [
        { name: "Gold", value: 2080.5, change: 12.8, changePercent: 0.62 },
        { name: "Silver", value: 24.15, change: 0.35, changePercent: 1.45 },
        { name: "Oil (WTI)", value: 75.3, change: -1.25, changePercent: -1.63 },
      ],
    };

    res.status(200).json({
      success: true,
      data: marketData,
    });
  } catch (error) {
    next(error);
  }
};

// Get market pulse data (trends, sentiment, etc)
export const getMarketPulse = async (req, res, next) => {
  try {
    // Mock data for market pulse (in real app, fetch from API)
    const marketPulse = {
      sentiment: {
        overall: "bullish",
        score: 65,
        change: 5,
      },
      trends: [
        { sector: "Technology", sentiment: "bullish", strength: 72 },
        { sector: "Finance", sentiment: "neutral", strength: 52 },
        { sector: "Healthcare", sentiment: "bullish", strength: 68 },
        { sector: "Energy", sentiment: "bearish", strength: 35 },
        { sector: "Consumer Goods", sentiment: "neutral", strength: 48 },
      ],
      volatilityIndex: 18.5,
      marketCap: {
        total: 52.8, // in trillion $
        change: 1.2, // percentage
      },
    };

    res.status(200).json({
      success: true,
      data: marketPulse,
    });
  } catch (error) {
    next(error);
  }
};

// Get market news
export const getMarketNews = async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;

    // Fetch news from database or external API
    // Mock data for demonstration
    const news = [
      {
        id: "1",
        title: "Fed signals potential rate cuts as inflation eases",
        summary:
          "Federal Reserve hints at possible interest rate reductions in the coming months as inflation shows signs of cooling.",
        source: "Financial Times",
        imageUrl: "https://example.com/news1.jpg",
        url: "https://example.com/news/1",
        publishedAt: new Date(Date.now() - 3600000),
      },
      {
        id: "2",
        title: "Tech stocks rally on strong earnings reports",
        summary:
          "Major technology companies exceed quarterly earnings expectations, driving market gains.",
        source: "Bloomberg",
        imageUrl: "https://example.com/news2.jpg",
        url: "https://example.com/news/2",
        publishedAt: new Date(Date.now() - 7200000),
      },
      {
        id: "3",
        title: "Oil prices drop on increased supply concerns",
        summary:
          "Crude oil futures fell as OPEC+ considers production increases amid global economic uncertainty.",
        source: "Reuters",
        imageUrl: "https://example.com/news3.jpg",
        url: "https://example.com/news/3",
        publishedAt: new Date(Date.now() - 10800000),
      },
      {
        id: "4",
        title: "Cryptocurrency market sees renewed institutional interest",
        summary:
          "Major financial institutions announce new crypto investment products as regulatory clarity improves.",
        source: "CoinDesk",
        imageUrl: "https://example.com/news4.jpg",
        url: "https://example.com/news/4",
        publishedAt: new Date(Date.now() - 14400000),
      },
      {
        id: "5",
        title: "Housing market shows signs of cooling after record surge",
        summary:
          "Home prices begin to stabilize following unprecedented growth during the pandemic.",
        source: "Wall Street Journal",
        imageUrl: "https://example.com/news5.jpg",
        url: "https://example.com/news/5",
        publishedAt: new Date(Date.now() - 18000000),
      },
    ];

    res.status(200).json({
      success: true,
      data: news.slice(0, parseInt(limit)),
    });
  } catch (error) {
    next(error);
  }
};

// Get all dashboard data in a single request
export const getDashboardData = async (req, res, next) => {
  try {
    // Account summary
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new ApiError("User not found", 404, "not_found");
    }

    // Calculate total investments value
    const investments = await Investment.find({
      user: user._id,
      status: "active",
    });
    const totalInvestments = investments.reduce(
      (sum, investment) => sum + investment.amount,
      0,
    );

    const accountSummary = {
      availableBalance: user.balance || 0,
      totalInvestments,
      totalAssets: (user.balance || 0) + totalInvestments,
      projectedEarnings: investments.reduce((sum, investment) => {
        const roi = investment.expectedReturn / 100;
        return sum + investment.amount * roi;
      }, 0),
      currency: "USD",
      accountNumber: user.accountNumber || "N/A",
      accountType: user.accountType || "Standard",
    };

    // Recent transactions
    const recentTransactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5);

    // Price alerts
    const priceAlerts = await PriceAlert.find({
      user: req.user._id,
      active: true,
    })
      .sort({ createdAt: -1 })
      .limit(5);

    // Latest news
    const latestNews = await MarketNews.find()
      .sort({ publishedAt: -1 })
      .limit(5);

    // Assemble dashboard data
    const dashboardData = {
      accountSummary,
      recentTransactions,
      priceAlerts,
      latestNews,
    };

    res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    logger.error("Error fetching dashboard data:", error);
    next(error);
  }
};

// Get combined dashboard overview data
export const getDashboardOverview = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get user data
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Run multiple queries in parallel for better performance
    const [
      accountSummary,
      recentTransactions,
      financialHighlights,
      marketOverview,
      marketPulse,
      recentNews,
    ] = await Promise.all([
      // Get account summary
      (async () => {
        // Get investments count and total
        const investments = await Investment.find({ user: userId });
        const investmentTotal = investments.reduce(
          (sum, inv) => sum + inv.amount,
          0,
        );

        // Get transaction stats
        const deposits = await Transaction.find({
          user: userId,
          type: "deposit",
          status: "completed",
        });
        const withdrawals = await Transaction.find({
          user: userId,
          type: "withdrawal",
          status: "completed",
        });

        const depositTotal = deposits.reduce((sum, dep) => sum + dep.amount, 0);
        const withdrawalTotal = withdrawals.reduce(
          (sum, wit) => sum + wit.amount,
          0,
        );

        return {
          balance: user.balance || 0,
          investmentCount: investments.length,
          investmentTotal,
          depositTotal,
          withdrawalTotal,
          lastLogin: user.lastLoginAt,
          accountStatus: user.status,
          kycVerified: user.kycVerified,
        };
      })(),

      // Get recent transactions
      Transaction.find({ user: userId }).sort({ createdAt: -1 }).limit(5),

      // Get financial highlights (reuse existing function logic)
      (async () => {
        // Get deposit total
        const depositTotal = await Transaction.aggregate([
          {
            $match: {
              user: new mongoose.Types.ObjectId(userId),
              type: "deposit",
              status: "completed",
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
            },
          },
        ]);

        // Get withdrawal total
        const withdrawalTotal = await Transaction.aggregate([
          {
            $match: {
              user: new mongoose.Types.ObjectId(userId),
              type: "withdrawal",
              status: "completed",
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
            },
          },
        ]);

        // Get investment stats
        const investments = await Investment.find({ user: userId });
        const activeInvestments = investments.filter(
          (inv) => inv.status === "active",
        );

        // Calculate profit/loss
        const investmentTotal = investments.reduce(
          (sum, inv) => sum + inv.amount,
          0,
        );
        const totalReturns = investments.reduce(
          (sum, inv) => sum + (inv.returns || 0),
          0,
        );

        return {
          depositTotal: depositTotal.length > 0 ? depositTotal[0].total : 0,
          withdrawalTotal:
            withdrawalTotal.length > 0 ? withdrawalTotal[0].total : 0,
          investmentTotal,
          totalReturns,
          activeInvestments: activeInvestments.length,
          profitLoss: totalReturns - investmentTotal,
          profitPercentage:
            investmentTotal > 0
              ? ((totalReturns - investmentTotal) / investmentTotal) * 100
              : 0,
        };
      })(),

      // Get market overview data (reuse existing function logic)
      (async () => {
        return {
          indices: [
            {
              name: "S&P 500",
              value: 4580.25,
              change: 0.85,
              changePercent: 1.2,
            },
            {
              name: "Dow Jones",
              value: 36240.75,
              change: 145.8,
              changePercent: 0.4,
            },
            {
              name: "Nasdaq",
              value: 14350.5,
              change: -28.6,
              changePercent: -0.2,
            },
            {
              name: "Bitcoin",
              value: 48750.32,
              change: 1250.8,
              changePercent: 2.8,
            },
            {
              name: "Ethereum",
              value: 3290.15,
              change: 85.4,
              changePercent: 2.6,
            },
          ],
          currencies: [
            {
              pair: "EUR/USD",
              value: 1.0825,
              change: 0.0015,
              changePercent: 0.14,
            },
            {
              pair: "GBP/USD",
              value: 1.265,
              change: -0.0032,
              changePercent: -0.25,
            },
            {
              pair: "USD/JPY",
              value: 145.82,
              change: 0.76,
              changePercent: 0.52,
            },
          ],
          commodities: [
            { name: "Gold", value: 2080.5, change: 12.8, changePercent: 0.62 },
            { name: "Silver", value: 24.15, change: 0.35, changePercent: 1.45 },
            {
              name: "Oil (WTI)",
              value: 75.3,
              change: -1.25,
              changePercent: -1.63,
            },
          ],
        };
      })(),

      // Get market pulse data (reuse existing function logic)
      (async () => {
        return {
          sentiment: {
            overall: "bullish",
            score: 65,
            change: 5,
          },
          trends: [
            { sector: "Technology", sentiment: "bullish", strength: 72 },
            { sector: "Finance", sentiment: "neutral", strength: 52 },
            { sector: "Healthcare", sentiment: "bullish", strength: 68 },
            { sector: "Energy", sentiment: "bearish", strength: 35 },
            { sector: "Consumer Goods", sentiment: "neutral", strength: 48 },
          ],
          volatilityIndex: 18.5,
          marketCap: {
            total: 52.8, // in trillion $
            change: 1.2, // percentage
          },
        };
      })(),

      // Get market news (reuse existing function logic)
      (async () => {
        return [
          {
            id: "1",
            title: "Fed signals potential rate cuts as inflation eases",
            summary:
              "Federal Reserve hints at possible interest rate reductions in the coming months as inflation shows signs of cooling.",
            source: "Financial Times",
            imageUrl: "https://example.com/news1.jpg",
            url: "https://example.com/news/1",
            publishedAt: new Date(Date.now() - 3600000),
          },
          {
            id: "2",
            title: "Tech stocks rally on strong earnings reports",
            summary:
              "Major technology companies exceed quarterly earnings expectations, driving market gains.",
            source: "Bloomberg",
            imageUrl: "https://example.com/news2.jpg",
            url: "https://example.com/news/2",
            publishedAt: new Date(Date.now() - 7200000),
          },
          {
            id: "3",
            title: "Oil prices drop on increased supply concerns",
            summary:
              "Crude oil futures fell as OPEC+ considers production increases amid global economic uncertainty.",
            source: "Reuters",
            imageUrl: "https://example.com/news3.jpg",
            url: "https://example.com/news/3",
            publishedAt: new Date(Date.now() - 10800000),
          },
        ];
      })(),
    ]);

    // Combine all data into a single response
    const dashboardData = {
      accountSummary,
      recentTransactions,
      financialHighlights,
      marketOverview,
      marketPulse,
      recentNews,
    };

    res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getAccountSummary,
  getRecentTransactions,
  getFinancialHighlights,
  getMarketPulse,
  getDashboardData,
  getMarketOverview,
  getMarketNews,
  getDashboardOverview,
};

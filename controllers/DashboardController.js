import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Investment from '../models/Investment.js';
import PriceAlert from '../models/PriceAlert.js';
import MarketNews from '../models/MarketNews.js';
import mongoose from 'mongoose';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';

// Get account summary for dashboard
export const getAccountSummary = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      throw new ApiError('User not found', 404, 'not_found');
    }
    
    // Calculate total balance
    const totalBalance = user.balance || 0;
    
    // Calculate total investments value
    const investments = await Investment.find({ user: user._id, status: 'active' });
    const totalInvestments = investments.reduce((sum, investment) => sum + investment.amount, 0);
    
    // Calculate projected earnings
    const projectedEarnings = investments.reduce((sum, investment) => {
      const roi = investment.expectedReturn / 100;
      return sum + (investment.amount * roi);
    }, 0);
    
    // Get total deposits
    const totalDeposits = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(user._id),
          type: 'deposit',
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    // Get total withdrawals
    const totalWithdrawals = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(user._id),
          type: 'withdrawal',
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    // Format data for response
    const accountSummary = {
      availableBalance: totalBalance,
      totalInvestments,
      totalAssets: totalBalance + totalInvestments,
      projectedEarnings,
      totalDeposits: totalDeposits[0]?.total || 0,
      totalWithdrawals: totalWithdrawals[0]?.total || 0,
      currency: 'USD', // Assuming USD as default
      accountNumber: user.accountNumber || 'N/A',
      accountType: user.accountType || 'Standard'
    };
    
    res.status(200).json({
      success: true,
      data: accountSummary
    });
  } catch (error) {
    logger.error('Error fetching account summary:', error);
    next(error);
  }
};

// Get recent transactions for dashboard
export const getRecentTransactions = async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;
    
    const transactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      data: transactions
    });
  } catch (error) {
    logger.error('Error fetching recent transactions:', error);
    next(error);
  }
};

// Get financial highlights
export const getFinancialHighlights = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      throw new ApiError('User not found', 404, 'not_found');
    }
    
    // Calculate month-to-date statistics
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Get deposits this month
    const depositsThisMonth = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(user._id),
          type: 'deposit',
          status: 'completed',
          createdAt: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    // Get withdrawals this month
    const withdrawalsThisMonth = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(user._id),
          type: 'withdrawal',
          status: 'completed',
          createdAt: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    // Calculate profit/loss
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    
    // Get previous month's transactions (for comparison)
    const lastMonthTransactions = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(user._id),
          status: 'completed',
          createdAt: { 
            $gte: startOfLastMonth,
            $lte: endOfLastMonth
          }
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    // Process last month's data
    const lastMonthData = {};
    lastMonthTransactions.forEach(item => {
      lastMonthData[item._id] = item.total;
    });
    
    // Calculate trends (comparing to last month)
    const depositTrend = lastMonthData.deposit ? 
      ((depositsThisMonth[0]?.total || 0) - lastMonthData.deposit) / lastMonthData.deposit * 100 : 0;
    
    const withdrawalTrend = lastMonthData.withdrawal ? 
      ((withdrawalsThisMonth[0]?.total || 0) - lastMonthData.withdrawal) / lastMonthData.withdrawal * 100 : 0;
    
    // Create response data
    const highlights = {
      monthToDateDeposits: depositsThisMonth[0]?.total || 0,
      monthToDateWithdrawals: withdrawalsThisMonth[0]?.total || 0,
      netFlow: (depositsThisMonth[0]?.total || 0) - (withdrawalsThisMonth[0]?.total || 0),
      depositTrend: parseFloat(depositTrend.toFixed(2)),
      withdrawalTrend: parseFloat(withdrawalTrend.toFixed(2)),
      currency: 'USD',
      periodLabel: `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`
    };
    
    res.status(200).json({
      success: true,
      data: highlights
    });
  } catch (error) {
    logger.error('Error fetching financial highlights:', error);
    next(error);
  }
};

// Get market pulse data
export const getMarketPulse = async (req, res, next) => {
  try {
    // In a real application, this would fetch real-time market data
    // For demonstration, we'll return simulated market data
    
    // Sample market indices
    const indices = [
      {
        name: 'S&P 500',
        symbol: 'SPX',
        price: 4500 + (Math.random() * 100 - 50),
        change: (Math.random() * 2 - 1).toFixed(2),
        percentChange: (Math.random() * 4 - 2).toFixed(2)
      },
      {
        name: 'Dow Jones',
        symbol: 'DJI',
        price: 35000 + (Math.random() * 500 - 250),
        change: (Math.random() * 100 - 50).toFixed(2),
        percentChange: (Math.random() * 3 - 1.5).toFixed(2)
      },
      {
        name: 'Nasdaq',
        symbol: 'IXIC',
        price: 14000 + (Math.random() * 200 - 100),
        change: (Math.random() * 50 - 25).toFixed(2),
        percentChange: (Math.random() * 3.5 - 1.75).toFixed(2)
      },
      {
        name: 'Russell 2000',
        symbol: 'RUT',
        price: 2200 + (Math.random() * 50 - 25),
        change: (Math.random() * 15 - 7.5).toFixed(2),
        percentChange: (Math.random() * 3 - 1.5).toFixed(2)
      }
    ];
    
    // Sample trending assets
    const trendingAssets = [
      {
        name: 'Bitcoin',
        symbol: 'BTC/USD',
        price: 50000 + (Math.random() * 5000 - 2500),
        change: (Math.random() * 1000 - 500).toFixed(2),
        percentChange: (Math.random() * 8 - 4).toFixed(2)
      },
      {
        name: 'Ethereum',
        symbol: 'ETH/USD',
        price: 3000 + (Math.random() * 300 - 150),
        change: (Math.random() * 100 - 50).toFixed(2),
        percentChange: (Math.random() * 10 - 5).toFixed(2)
      },
      {
        name: 'Apple Inc.',
        symbol: 'AAPL',
        price: 150 + (Math.random() * 10 - 5),
        change: (Math.random() * 2 - 1).toFixed(2),
        percentChange: (Math.random() * 3 - 1.5).toFixed(2)
      },
      {
        name: 'Tesla Inc.',
        symbol: 'TSLA',
        price: 750 + (Math.random() * 50 - 25),
        change: (Math.random() * 15 - 7.5).toFixed(2),
        percentChange: (Math.random() * 5 - 2.5).toFixed(2)
      }
    ];
    
    // Market movers (biggest gainers and losers)
    const marketMovers = {
      gainers: [
        {
          name: 'Growth Tech Co',
          symbol: 'GTCH',
          price: 75.25 + (Math.random() * 5),
          change: (3 + Math.random() * 2).toFixed(2),
          percentChange: (5 + Math.random() * 10).toFixed(2)
        },
        {
          name: 'BioPharm Inc',
          symbol: 'BPHM',
          price: 120.80 + (Math.random() * 10),
          change: (4 + Math.random() * 3).toFixed(2),
          percentChange: (4 + Math.random() * 8).toFixed(2)
        },
        {
          name: 'Clean Energy Ltd',
          symbol: 'CLEN',
          price: 45.60 + (Math.random() * 3),
          change: (2 + Math.random()).toFixed(2),
          percentChange: (3 + Math.random() * 5).toFixed(2)
        }
      ],
      losers: [
        {
          name: 'Retail Chain Co',
          symbol: 'RETL',
          price: 30.40 - (Math.random() * 3),
          change: (-3 - Math.random() * 2).toFixed(2),
          percentChange: (-5 - Math.random() * 5).toFixed(2)
        },
        {
          name: 'Industrial Supplies',
          symbol: 'INDS',
          price: 85.20 - (Math.random() * 5),
          change: (-4 - Math.random() * 3).toFixed(2),
          percentChange: (-4 - Math.random() * 6).toFixed(2)
        },
        {
          name: 'Travel & Leisure Corp',
          symbol: 'TRVL',
          price: 55.70 - (Math.random() * 4),
          change: (-2 - Math.random() * 2).toFixed(2),
          percentChange: (-3 - Math.random() * 4).toFixed(2)
        }
      ]
    };
    
    // Market sentiment indicators
    const marketSentiment = {
      fearGreedIndex: Math.floor(Math.random() * 100),
      volatilityIndex: 15 + Math.floor(Math.random() * 30),
      marketBreadth: {
        advancing: 1800 + Math.floor(Math.random() * 600),
        declining: 1200 + Math.floor(Math.random() * 600),
        unchanged: 100 + Math.floor(Math.random() * 50)
      },
      tradingVolume: (Math.random() * 2 + 0.8).toFixed(2) + 'B',
      sentiment: ['bearish', 'neutral', 'bullish'][Math.floor(Math.random() * 3)]
    };
    
    // Assemble market pulse data
    const marketPulse = {
      indices,
      trendingAssets,
      marketMovers,
      marketSentiment,
      lastUpdated: new Date()
    };
    
    res.status(200).json({
      success: true,
      data: marketPulse
    });
  } catch (error) {
    logger.error('Error generating market pulse data:', error);
    next(error);
  }
};

// Get all dashboard data in a single request
export const getDashboardData = async (req, res, next) => {
  try {
    // Account summary
    const user = await User.findById(req.user._id);
    
    if (!user) {
      throw new ApiError('User not found', 404, 'not_found');
    }
    
    // Calculate total investments value
    const investments = await Investment.find({ user: user._id, status: 'active' });
    const totalInvestments = investments.reduce((sum, investment) => sum + investment.amount, 0);
    
    const accountSummary = {
      availableBalance: user.balance || 0,
      totalInvestments,
      totalAssets: (user.balance || 0) + totalInvestments,
      projectedEarnings: investments.reduce((sum, investment) => {
        const roi = investment.expectedReturn / 100;
        return sum + (investment.amount * roi);
      }, 0),
      currency: 'USD',
      accountNumber: user.accountNumber || 'N/A',
      accountType: user.accountType || 'Standard'
    };
    
    // Recent transactions
    const recentTransactions = await Transaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Price alerts
    const priceAlerts = await PriceAlert.find({ 
      user: req.user._id,
      active: true
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
      data: dashboardData
    });
  } catch (error) {
    logger.error('Error fetching dashboard data:', error);
    next(error);
  }
};

export default {
  getAccountSummary,
  getRecentTransactions,
  getFinancialHighlights,
  getMarketPulse,
  getDashboardData
};

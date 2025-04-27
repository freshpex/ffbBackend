import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Investment from "../models/Investment.js";
import KycRequest from "../models/KycRequest.js";
import SupportTicket from "../models/SupportTicket.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

// Get dashboard analytics overview
export const getAnalyticsOverview = async (req, res, next) => {
  try {
    // Ensure user is admin
    if (!["admin", "superadmin"].includes(req.user.role)) {
      throw new ApiError("Access denied", 403, "forbidden");
    }

    // Get today's date and calculate date ranges
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const startOfWeek = new Date();
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfPrevMonth = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    const endOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    // Run queries in parallel for better performance
    const [
      totalUsers,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
      newUsersPrevMonth,
      totalTransactions,
      transactionsToday,
      transactionsThisWeek,
      transactionsThisMonth,
      depositSum,
      withdrawalSum,
      pendingKyc,
      pendingTickets,
      totalInvestments,
      activeInvestments,
    ] = await Promise.all([
      // User stats
      User.countDocuments({ role: "user" }),
      User.countDocuments({
        role: "user",
        createdAt: { $gte: startOfDay },
      }),
      User.countDocuments({
        role: "user",
        createdAt: { $gte: startOfWeek },
      }),
      User.countDocuments({
        role: "user",
        createdAt: { $gte: startOfMonth },
      }),
      User.countDocuments({
        role: "user",
        createdAt: { $gte: startOfPrevMonth, $lt: startOfMonth },
      }),

      // Transaction stats
      Transaction.countDocuments({}),
      Transaction.countDocuments({ createdAt: { $gte: startOfDay } }),
      Transaction.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Transaction.countDocuments({ createdAt: { $gte: startOfMonth } }),

      // Financial stats
      Transaction.aggregate([
        {
          $match: {
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
      ]),
      Transaction.aggregate([
        {
          $match: {
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
      ]),

      // KYC and Support stats
      KycRequest.countDocuments({ status: "pending" }),
      SupportTicket.countDocuments({ status: "open" }),

      // Investment stats
      Investment.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]),
      Investment.aggregate([
        {
          $match: {
            status: "active",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    // Calculate user growth rate
    const userGrowthRate =
      newUsersPrevMonth > 0
        ? ((newUsersThisMonth - newUsersPrevMonth) / newUsersPrevMonth) * 100
        : 0;

    // Format response data
    const overview = {
      users: {
        total: totalUsers,
        today: newUsersToday,
        thisWeek: newUsersThisWeek,
        thisMonth: newUsersThisMonth,
        growthRate: parseFloat(userGrowthRate.toFixed(2)),
      },
      transactions: {
        total: totalTransactions,
        today: transactionsToday,
        thisWeek: transactionsThisWeek,
        thisMonth: transactionsThisMonth,
      },
      financial: {
        totalDeposits: depositSum.length > 0 ? depositSum[0].total : 0,
        totalWithdrawals: withdrawalSum.length > 0 ? withdrawalSum[0].total : 0,
        netBalance:
          (depositSum.length > 0 ? depositSum[0].total : 0) -
          (withdrawalSum.length > 0 ? withdrawalSum[0].total : 0),
      },
      investments: {
        total: totalInvestments.length > 0 ? totalInvestments[0].total : 0,
        active: activeInvestments.length > 0 ? activeInvestments[0].total : 0,
      },
      pending: {
        kycRequests: pendingKyc,
        supportTickets: pendingTickets,
      },
    };

    res.status(200).json({
      success: true,
      data: overview,
    });
  } catch (error) {
    logger.error("Error fetching analytics overview:", error);
    next(error);
  }
};

// Get user growth analytics
export const getUserGrowthAnalytics = async (req, res, next) => {
  try {
    // Ensure user is admin
    if (!["admin", "superadmin"].includes(req.user.role)) {
      throw new ApiError("Access denied", 403, "forbidden");
    }

    const { period = "month", start, end } = req.query;

    // Define time periods
    let timeGroup;
    let dateFormat;
    let startDate;
    let endDate;

    // Set current date as default end date if not specified
    endDate = end ? new Date(end) : new Date();

    // Set up date grouping based on period
    if (period === "day") {
      // For daily view (last 30 days by default)
      startDate = start
        ? new Date(start)
        : new Date(new Date().setDate(endDate.getDate() - 30));
      timeGroup = {
        $dateToString: {
          format: "%Y-%m-%d",
          date: "$createdAt",
        },
      };
      dateFormat = "day";
    } else if (period === "week") {
      // For weekly view (last 12 weeks by default)
      startDate = start
        ? new Date(start)
        : new Date(new Date().setDate(endDate.getDate() - 84)); // 12 weeks
      timeGroup = {
        $concat: [
          { $toString: { $year: "$createdAt" } },
          "-W",
          { $toString: { $week: "$createdAt" } },
        ],
      };
      dateFormat = "week";
    } else {
      // For monthly view (last 12 months by default)
      startDate = start
        ? new Date(start)
        : new Date(new Date().setMonth(endDate.getMonth() - 12));
      timeGroup = {
        $dateToString: {
          format: "%Y-%m",
          date: "$createdAt",
        },
      };
      dateFormat = "month";
    }

    // Aggregate user growth data
    const userGrowthData = await User.aggregate([
      {
        $match: {
          role: "user",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: timeGroup,
          count: { $sum: 1 },
          verified: {
            $sum: {
              $cond: ["$emailVerified", 1, 0],
            },
          },
          unverified: {
            $sum: {
              $cond: ["$emailVerified", 0, 1],
            },
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Calculate cumulative growth
    let cumulativeCount = 0;
    const userGrowthWithCumulative = userGrowthData.map((item) => {
      cumulativeCount += item.count;
      return {
        period: item._id,
        new: item.count,
        verified: item.verified,
        unverified: item.unverified,
        cumulative: cumulativeCount,
      };
    });

    // Count users by country
    const usersByCountry = await User.aggregate([
      {
        $match: {
          role: "user",
          "address.country": { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$address.country",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10,
      },
    ]);

    // Get user conversion stats
    const totalUsers = await User.countDocuments({ role: "user" });
    const verifiedUsers = await User.countDocuments({
      role: "user",
      emailVerified: true,
    });
    const kycSubmitted = await KycRequest.countDocuments();
    const kycApproved = await KycRequest.countDocuments({ status: "approved" });
    const usersWithDeposits = await Transaction.aggregate([
      {
        $match: {
          type: "deposit",
          status: "completed",
        },
      },
      {
        $group: {
          _id: "$user",
        },
      },
      {
        $count: "total",
      },
    ]);

    // Format response data
    const userAnalytics = {
      growthData: userGrowthWithCumulative,
      dateFormat,
      demographics: {
        byCountry: usersByCountry.map((item) => ({
          country: item._id,
          count: item.count,
        })),
      },
      conversion: {
        totalUsers,
        verifiedUsers,
        verificationRate:
          totalUsers > 0 ? (verifiedUsers / totalUsers) * 100 : 0,
        kycSubmissionRate:
          totalUsers > 0 ? (kycSubmitted / totalUsers) * 100 : 0,
        kycApprovalRate:
          kycSubmitted > 0 ? (kycApproved / kycSubmitted) * 100 : 0,
        depositConversionRate:
          totalUsers > 0
            ? ((usersWithDeposits[0]?.total || 0) / totalUsers) * 100
            : 0,
      },
    };

    res.status(200).json({
      success: true,
      data: userAnalytics,
    });
  } catch (error) {
    logger.error("Error fetching user growth analytics:", error);
    next(error);
  }
};

// Get financial analytics
export const getFinancialAnalytics = async (req, res, next) => {
  try {
    // Ensure user is admin
    if (!["admin", "superadmin"].includes(req.user.role)) {
      throw new ApiError("Access denied", 403, "forbidden");
    }

    const { period = "month", start, end, currency = "USD" } = req.query;

    // Define time periods
    let timeGroup;
    let dateFormat;
    let startDate;
    let endDate;

    // Set current date as default end date if not specified
    endDate = end ? new Date(end) : new Date();

    // Set up date grouping based on period
    if (period === "day") {
      // For daily view (last 30 days by default)
      startDate = start
        ? new Date(start)
        : new Date(new Date().setDate(endDate.getDate() - 30));
      timeGroup = {
        $dateToString: {
          format: "%Y-%m-%d",
          date: "$createdAt",
        },
      };
      dateFormat = "day";
    } else if (period === "week") {
      // For weekly view (last 12 weeks by default)
      startDate = start
        ? new Date(start)
        : new Date(new Date().setDate(endDate.getDate() - 84)); // 12 weeks
      timeGroup = {
        $concat: [
          { $toString: { $year: "$createdAt" } },
          "-W",
          { $toString: { $week: "$createdAt" } },
        ],
      };
      dateFormat = "week";
    } else {
      // For monthly view (last 12 months by default)
      startDate = start
        ? new Date(start)
        : new Date(new Date().setMonth(endDate.getMonth() - 12));
      timeGroup = {
        $dateToString: {
          format: "%Y-%m",
          date: "$createdAt",
        },
      };
      dateFormat = "month";
    }

    // Aggregate financial data by period and transaction type
    const financialData = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: "completed",
        },
      },
      {
        $group: {
          _id: {
            period: timeGroup,
            type: "$type",
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
          avgAmount: { $avg: "$amount" },
        },
      },
      {
        $sort: { "_id.period": 1 },
      },
    ]);

    // Process the data to create a structured response
    const periodsMap = {};

    financialData.forEach((item) => {
      const period = item._id.period;
      const type = item._id.type;

      if (!periodsMap[period]) {
        periodsMap[period] = {
          period,
          deposit: { total: 0, count: 0, avg: 0 },
          withdrawal: { total: 0, count: 0, avg: 0 },
          investment: { total: 0, count: 0, avg: 0 },
          revenue: 0,
        };
      }

      if (type) {
        periodsMap[period][type] = {
          total: parseFloat(item.total.toFixed(2)),
          count: item.count,
          avg: parseFloat(item.avgAmount.toFixed(2)),
        };

        // Calculate estimated revenue (assuming fee percentage or fixed model)
        // This is a simplified calculation and should be adjusted based on actual business model
        if (type === "deposit" || type === "withdrawal") {
          const feePercentage = type === "deposit" ? 0.01 : 0.02; // Example fee rates
          periodsMap[period].revenue += parseFloat(
            (item.total * feePercentage).toFixed(2),
          );
        }
      }
    });

    // Convert map to array for response
    const timeSeriesData = Object.values(periodsMap).sort((a, b) =>
      a.period.localeCompare(b.period),
    );

    // Get transaction success rates
    const [
      totalDeposits,
      successfulDeposits,
      totalWithdrawals,
      successfulWithdrawals,
      depositsByMethod,
      withdrawalsByMethod,
    ] = await Promise.all([
      Transaction.countDocuments({ type: "deposit" }),
      Transaction.countDocuments({ type: "deposit", status: "completed" }),
      Transaction.countDocuments({ type: "withdrawal" }),
      Transaction.countDocuments({ type: "withdrawal", status: "completed" }),
      Transaction.aggregate([
        {
          $match: {
            type: "deposit",
            status: "completed",
            method: { $exists: true },
          },
        },
        {
          $group: {
            _id: "$method",
            count: { $sum: 1 },
            total: { $sum: "$amount" },
          },
        },
        {
          $sort: { total: -1 },
        },
      ]),
      Transaction.aggregate([
        {
          $match: {
            type: "withdrawal",
            status: "completed",
            method: { $exists: true },
          },
        },
        {
          $group: {
            _id: "$method",
            count: { $sum: 1 },
            total: { $sum: "$amount" },
          },
        },
        {
          $sort: { total: -1 },
        },
      ]),
    ]);

    // Format response data
    const financialAnalytics = {
      timeSeriesData,
      dateFormat,
      currency,
      metrics: {
        depositSuccessRate:
          totalDeposits > 0 ? (successfulDeposits / totalDeposits) * 100 : 0,
        withdrawalSuccessRate:
          totalWithdrawals > 0
            ? (successfulWithdrawals / totalWithdrawals) * 100
            : 0,
        depositMethods: depositsByMethod.map((item) => ({
          method: item._id,
          count: item.count,
          total: parseFloat(item.total.toFixed(2)),
        })),
        withdrawalMethods: withdrawalsByMethod.map((item) => ({
          method: item._id,
          count: item.count,
          total: parseFloat(item.total.toFixed(2)),
        })),
      },
    };

    res.status(200).json({
      success: true,
      data: financialAnalytics,
    });
  } catch (error) {
    logger.error("Error fetching financial analytics:", error);
    next(error);
  }
};

// Get transaction analytics
export const getTransactionAnalytics = async (req, res, next) => {
  try {
    // Ensure user is admin
    if (!["admin", "superadmin"].includes(req.user.role)) {
      throw new ApiError("Access denied", 403, "forbidden");
    }

    const { period = "day", limit = 30 } = req.query;

    // Calculate date ranges based on period
    const now = new Date();
    let startDate;
    let groupFormat;

    if (period === "hour") {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
      groupFormat = "%Y-%m-%d %H:00";
    } else if (period === "day") {
      startDate = new Date(now.getTime() - limit * 24 * 60 * 60 * 1000); // Last X days
      groupFormat = "%Y-%m-%d";
    } else if (period === "week") {
      startDate = new Date(now.getTime() - limit * 7 * 24 * 60 * 60 * 1000); // Last X weeks
      groupFormat = "%Y-W%U";
    } else {
      startDate = new Date(now.getTime() - limit * 30 * 24 * 60 * 60 * 1000); // Last X months
      groupFormat = "%Y-%m";
    }

    // Aggregate transactions by time period and status
    const transactionsByPeriod = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            period: {
              $dateToString: { format: groupFormat, date: "$createdAt" },
            },
            status: "$status",
            type: "$type",
          },
          count: { $sum: 1 },
          volume: { $sum: "$amount" },
        },
      },
      {
        $sort: { "_id.period": 1 },
      },
    ]);

    // Process the data to create a structured response
    const periodMap = {};

    transactionsByPeriod.forEach((item) => {
      const period = item._id.period;
      const status = item._id.status;
      const type = item._id.type;

      if (!periodMap[period]) {
        periodMap[period] = {
          period,
          completed: 0,
          pending: 0,
          failed: 0,
          deposit: 0,
          withdrawal: 0,
          depositVolume: 0,
          withdrawalVolume: 0,
          totalVolume: 0,
        };
      }

      // Update status counts
      if (status) {
        periodMap[period][status] += item.count;
      }

      // Update type counts and volumes
      if (type) {
        periodMap[period][type] += item.count;
        periodMap[period][`${type}Volume`] += item.volume;
        periodMap[period].totalVolume += item.volume;
      }
    });

    // Convert map to array for response
    const timeSeriesData = Object.values(periodMap).sort((a, b) =>
      a.period.localeCompare(b.period),
    );

    // Get transaction distribution by status
    const statusDistribution = await Transaction.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          volume: { $sum: "$amount" },
        },
      },
    ]);

    // Get transaction distribution by type
    const typeDistribution = await Transaction.aggregate([
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          volume: { $sum: "$amount" },
        },
      },
    ]);

    // Get highest value transactions
    const highestTransactions = await Transaction.find()
      .sort({ amount: -1 })
      .limit(10)
      .populate("user", "firstName lastName email");

    // Format response data
    const transactionAnalytics = {
      timeSeriesData,
      periodType: period,
      distribution: {
        byStatus: statusDistribution.map((item) => ({
          status: item._id,
          count: item.count,
          volume: parseFloat(item.volume.toFixed(2)),
        })),
        byType: typeDistribution.map((item) => ({
          type: item._id,
          count: item.count,
          volume: parseFloat(item.volume.toFixed(2)),
        })),
      },
      highestTransactions: highestTransactions.map((tx) => ({
        id: tx._id,
        type: tx.type,
        amount: tx.amount,
        status: tx.status,
        date: tx.createdAt,
        user: tx.user
          ? {
              id: tx.user._id,
              name: `${tx.user.firstName} ${tx.user.lastName}`,
              email: tx.user.email,
            }
          : null,
      })),
    };

    res.status(200).json({
      success: true,
      data: transactionAnalytics,
    });
  } catch (error) {
    logger.error("Error fetching transaction analytics:", error);
    next(error);
  }
};

// Get performance analytics
export const getPerformanceAnalytics = async (req, res, next) => {
  try {
    // Ensure user is admin
    if (!["admin", "superadmin"].includes(req.user.role)) {
      throw new ApiError("Access denied", 403, "forbidden");
    }

    // Get current date and calculate date ranges
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Calculate performance metrics
    const [
      // User activity
      totalActiveUsers,
      activeUsersThirtyDays,
      activeUsersNinetyDays,
      averageSessionDuration,

      // KYC processing
      avgKycProcessingTime,

      // Support metrics
      avgTicketResponseTime,
      avgTicketResolutionTime,

      // System metrics (would typically come from a monitoring service)
      systemUptime = 99.98, // example value
      apiResponseTime = 145, // example value in ms
      errorRate = 0.05, // example value as percentage
    ] = await Promise.all([
      // Example query for active users (users with recent logins)
      User.countDocuments({
        lastLoginAt: { $gte: thirtyDaysAgo },
      }),
      User.countDocuments({
        lastLoginAt: { $gte: thirtyDaysAgo },
      }),
      User.countDocuments({
        lastLoginAt: { $gte: ninetyDaysAgo },
      }),
      5.2, // Example value in minutes - would come from analytics tracking

      // KYC processing time calculation
      KycRequest.aggregate([
        {
          $match: {
            status: "approved",
            updatedAt: { $exists: true },
          },
        },
        {
          $project: {
            processingTime: {
              $divide: [
                { $subtract: ["$updatedAt", "$createdAt"] },
                1000 * 60 * 60, // Convert to hours
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: "$processingTime" },
          },
        },
      ]),

      // Support ticket response time calculation
      SupportTicket.aggregate([
        {
          $match: {
            firstResponseAt: { $exists: true },
          },
        },
        {
          $project: {
            responseTime: {
              $divide: [
                { $subtract: ["$firstResponseAt", "$createdAt"] },
                1000 * 60, // Convert to minutes
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: "$responseTime" },
          },
        },
      ]),

      // Support ticket resolution time calculation
      SupportTicket.aggregate([
        {
          $match: {
            status: "closed",
          },
        },
        {
          $project: {
            resolutionTime: {
              $divide: [
                { $subtract: ["$updatedAt", "$createdAt"] },
                1000 * 60 * 60, // Convert to hours
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: "$resolutionTime" },
          },
        },
      ]),
    ]);

    // Get user retention rate (simplified example)
    const userRetentionAnalysis = await User.aggregate([
      {
        $match: {
          role: "user",
          createdAt: { $lt: thirtyDaysAgo }, // Users who signed up more than 30 days ago
        },
      },
      {
        $project: {
          retained: {
            $cond: [
              { $gte: ["$lastLoginAt", thirtyDaysAgo] }, // Considered retained if logged in within last 30 days
              1,
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          retainedUsers: { $sum: "$retained" },
        },
      },
    ]);

    const userRetentionRate =
      userRetentionAnalysis.length > 0
        ? (userRetentionAnalysis[0].retainedUsers /
            userRetentionAnalysis[0].totalUsers) *
          100
        : 0;

    // Format response data
    const performanceAnalytics = {
      userActivity: {
        totalActiveUsers,
        activeUsersLast30Days: activeUsersThirtyDays,
        activeUsersLast90Days: activeUsersNinetyDays,
        retentionRate: parseFloat(userRetentionRate.toFixed(2)),
        averageSessionDuration, // in minutes
      },
      operations: {
        kycProcessingTime:
          avgKycProcessingTime.length > 0
            ? parseFloat(avgKycProcessingTime[0].avgTime.toFixed(2))
            : 0, // in hours
        ticketResponseTime:
          avgTicketResponseTime.length > 0
            ? parseFloat(avgTicketResponseTime[0].avgTime.toFixed(2))
            : 0, // in minutes
        ticketResolutionTime:
          avgTicketResolutionTime.length > 0
            ? parseFloat(avgTicketResolutionTime[0].avgTime.toFixed(2))
            : 0, // in hours
      },
      system: {
        uptime: systemUptime, // percentage
        averageApiResponseTime: apiResponseTime, // in milliseconds
        errorRate, // percentage
      },
    };

    res.status(200).json({
      success: true,
      data: performanceAnalytics,
    });
  } catch (error) {
    logger.error("Error fetching performance analytics:", error);
    next(error);
  }
};

export default {
  getAnalyticsOverview,
  getUserGrowthAnalytics,
  getFinancialAnalytics,
  getTransactionAnalytics,
  getPerformanceAnalytics,
};

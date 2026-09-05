import logger from "../middleware/logger.js";
import Visitor from "../models/Visitor.js";
import User from "../models/User.js";
import jwt from "jsonwebtoken";

const getAuthenticatedUser = async (req) => {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findById(decoded.userId).select(
      "firstName lastName email accountNumber status role",
    );
  } catch {
    return null;
  }
};

const applyAuthenticatedIdentity = (visitor, user) => {
  if (!user) return;
  visitor.userId = user._id;
  visitor.convertedToUser = true;
};

// Track a new visitor or update an existing visitor's data
export const trackVisitor = async (req, res, next) => {
  try {
    const {
      visitorId,
      browserInfo,
      locationInfo,
      timestamp,
      path,
      referrer,
      sessionId
    } = req.body;

    if (!visitorId || !sessionId) {
      return res.status(400).json({ success: false, message: "Visitor and session IDs are required" });
    }

    const authenticatedUser = await getAuthenticatedUser(req);
    // One fingerprint remains one admin row across browser sessions.
    let visitor = await Visitor.findOne({ visitorId });

    if (visitor) {
      visitor.visits.push({
        timestamp,
        path,
        referrer
      });
      visitor.lastVisit = timestamp;
      visitor.totalVisits += 1;
      if (!(visitor.sessionIds || []).includes(sessionId)) {
        visitor.sessionIds.push(sessionId);
        visitor.totalSessions = visitor.sessionIds.length;
      }
      visitor.sessionId = sessionId;
      if (browserInfo) visitor.browserInfo = browserInfo;
      if (locationInfo && !locationInfo.error) visitor.locationInfo = locationInfo;
      applyAuthenticatedIdentity(visitor, authenticatedUser);
      await visitor.save();

      return res.status(200).json({ success: true, sessionId });
    } 
    
    // Create a new visitor record
    visitor = new Visitor({
      visitorId,
      sessionId,
      sessionIds: [sessionId],
      browserInfo,
      locationInfo,
      visits: [{ timestamp, path, referrer }],
      firstVisit: timestamp,
      lastVisit: timestamp
    });

    applyAuthenticatedIdentity(visitor, authenticatedUser);

    await visitor.save();
    return res.status(201).json({ success: true, sessionId });
  } catch (error) {
    logger.error("Error tracking visitor:", error);
    return res.status(500).json({ success: false, message: "Error tracking visitor" });
  }
};

// Track page views for SPA navigation
export const trackPageView = async (req, res, next) => {
  try {
    const { visitorId, sessionId, timestamp, path } = req.body;
    const authenticatedUser = await getAuthenticatedUser(req);

    const visitor = await Visitor.findOne({ visitorId });
    if (!visitor) {
      const newVisitor = new Visitor({
        visitorId,
        sessionId,
        sessionIds: [sessionId],
        visits: [{ timestamp, path }],
        firstVisit: timestamp,
        lastVisit: timestamp
      });
      applyAuthenticatedIdentity(newVisitor, authenticatedUser);
      await newVisitor.save();
      return res.status(201).json({ success: true });
    }

    visitor.visits.push({
      timestamp,
      path
    });
    visitor.lastVisit = timestamp;
    if (!(visitor.sessionIds || []).includes(sessionId)) {
      visitor.sessionIds.push(sessionId);
      visitor.totalSessions = visitor.sessionIds.length;
    }
    visitor.sessionId = sessionId;
    applyAuthenticatedIdentity(visitor, authenticatedUser);
    await visitor.save();

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Error tracking page view:", error);
    return res.status(500).json({ success: false });
  }
};

// Track page exit events
export const trackExit = async (req, res, next) => {
  try {
    const { visitorId, sessionId, timestamp, path, event } = req.body;
    await Visitor.findOneAndUpdate(
      { visitorId },
      { 
        $set: { lastVisit: timestamp },
        $push: { 
          visits: { 
            timestamp, 
            path,
            event: 'exit'
          } 
        }
      }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Error tracking exit:", error);
    return res.status(500).json({ success: false });
  }
};

// Get visitor analytics data for admin dashboard
export const getVisitorAnalytics = async (req, res, next) => {
  try {
    const { period = '30d', startDate, endDate } = req.query;
    
    let query = {};
    let dateFilter = {};
    
    if (startDate && endDate) {
      dateFilter = {
        lastVisit: { 
          $gte: new Date(startDate), 
          $lte: new Date(endDate) 
        }
      };
    } else {
      const now = new Date();
      let pastDate = new Date();
      
      switch(period) {
        case '24h':
          pastDate.setHours(pastDate.getHours() - 24);
          break;
        case '7d':
          pastDate.setDate(pastDate.getDate() - 7);
          break;
        case '30d':
          pastDate.setDate(pastDate.getDate() - 30);
          break;
        case '90d':
          pastDate.setDate(pastDate.getDate() - 90);
          break;
        case '1y':
          pastDate.setFullYear(pastDate.getFullYear() - 1);
          break;
        default:
          pastDate.setDate(pastDate.getDate() - 30);
      }
      
      dateFilter = { lastVisit: { $gte: pastDate } };
    }
    
    query = { ...dateFilter };
    
    const totalVisitors = await Visitor.countDocuments(query);
    
    // Count unique visitors (by visitorId)
    const uniqueVisitors = await Visitor.aggregate([
      { $match: query },
      { $group: { _id: "$visitorId" } },
      { $count: "count" }
    ]);
    
    // Get device type distribution
    const deviceDistribution = await Visitor.aggregate([
      { $match: query },
      { $group: { 
        _id: "$browserInfo.deviceType", 
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } }
    ]);
    
    // Get browser distribution
    const browserDistribution = await Visitor.aggregate([
      { $match: query },
      { $group: { 
        _id: "$browserInfo.browser", 
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } }
    ]);
    
    // Get OS distribution
    const osDistribution = await Visitor.aggregate([
      { $match: query },
      { $group: { 
        _id: "$browserInfo.os", 
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } }
    ]);
    
    // Get country distribution
    const countryDistribution = await Visitor.aggregate([
      { $match: query },
      { $group: { 
        _id: "$locationInfo.country", 
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Get most visited pages
    const topPages = await Visitor.aggregate([
      { $match: query },
      { $unwind: "$visits" },
      { $group: { 
        _id: "$visits.path", 
        visits: { $sum: 1 }
      }},
      { $sort: { visits: -1 } },
      { $limit: 10 }
    ]);
    
    // Get new vs returning visitors
    const newVisitors = await Visitor.countDocuments({
      ...query,
      totalVisits: 1
    });
    
    const returningVisitors = totalVisitors - newVisitors;
    
    // Get visitor trend over time (daily)
    const visitTrend = await Visitor.aggregate([
      { $match: query },
      { $unwind: "$visits" },
      { $match: { "visits.timestamp": { $gte: dateFilter.lastVisit.$gte } } },
      { $group: {
        _id: { 
          $dateToString: { 
            format: "%Y-%m-%d", 
            date: "$visits.timestamp" 
          }
        },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    // Prepare analytics data
    const analyticsData = {
      totalVisitors,
      uniqueVisitors: uniqueVisitors[0]?.count || 0,
      deviceDistribution,
      browserDistribution,
      osDistribution,
      countryDistribution,
      topPages,
      visitorTypes: {
        new: newVisitors,
        returning: returningVisitors
      },
      visitTrend
    };
    
    return res.status(200).json({
      success: true,
      data: analyticsData
    });
  } catch (error) {
    logger.error("Error fetching visitor analytics:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to fetch visitor analytics" 
    });
  }
};

// Get visitor details (for admin)
export const getVisitorDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const visitor = await Visitor.findById(id).populate(
      "userId",
      "firstName lastName email accountNumber status role createdAt lastLoginAt",
    );
    
    if (!visitor) {
      return res.status(404).json({ 
        success: false, 
        message: "Visitor not found" 
      });
    }
    
    return res.status(200).json({
      success: true,
      visitor
    });
  } catch (error) {
    logger.error("Error fetching visitor details:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Error fetching visitor details" 
    });
  }
};

// Get all visitors with pagination (for admin)
export const getAllVisitors = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, sort = 'lastVisit', order = 'desc' } = req.query;
    
    const sortField = sort === 'firstVisit' ? 'firstVisit' : 'lastVisit';
    const sortOrder = order === 'asc' ? 1 : -1;
    
    const skip = (page - 1) * limit;
    
    const visitors = await Visitor.find()
      .populate("userId", "firstName lastName email accountNumber status role")
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(Number(limit));
    
    const total = await Visitor.countDocuments();
    
    return res.status(200).json({
      success: true,
      visitors,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error("Error fetching visitors:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Error fetching visitors" 
    });
  }
};

import SupportTicket from '../models/SupportTicket.js';
import User from '../models/User.js';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';

// Get all support tickets with filtering and pagination
export const getAllSupportTickets = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      priority, 
      search 
    } = req.query;

    const query = {};

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query with pagination
    const totalTickets = await SupportTicket.countDocuments(query);
    const tickets = await SupportTicket.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('user', 'email firstName lastName');

    res.status(200).json({
      success: true,
      data: {
        tickets,
        pagination: {
          total: totalTickets,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalTickets / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching support tickets:', error);
    next(error);
  }
};

// Get support ticket by ID
export const getSupportTicketById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ticket = await SupportTicket.findById(id)
      .populate('user', 'email firstName lastName');

    if (!ticket) {
      throw new ApiError('Support ticket not found', 404, 'not_found');
    }

    res.status(200).json({
      success: true,
      data: ticket
    });
  } catch (error) {
    logger.error(`Error fetching support ticket ${req.params.id}:`, error);
    next(error);
  }
};

// Update support ticket status or priority
export const updateSupportTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, priority, adminNotes } = req.body;

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      throw new ApiError('Support ticket not found', 404, 'not_found');
    }

    if (status) ticket.status = status;
    if (priority) ticket.priority = priority;
    if (adminNotes) ticket.adminNotes = adminNotes;

    await ticket.save();

    res.status(200).json({
      success: true,
      message: 'Support ticket updated successfully',
      data: ticket
    });
  } catch (error) {
    logger.error(`Error updating support ticket ${req.params.id}:`, error);
    next(error);
  }
};

// Add a reply to a support ticket
export const addSupportTicketReply = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message) {
      throw new ApiError('Message is required', 400, 'validation_error');
    }

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      throw new ApiError('Support ticket not found', 404, 'not_found');
    }

    ticket.replies.push({
      message,
      sender: 'admin',
      createdAt: new Date()
    });

    await ticket.save();

    res.status(200).json({
      success: true,
      message: 'Reply added successfully',
      data: ticket
    });
  } catch (error) {
    logger.error(`Error adding reply to support ticket ${req.params.id}:`, error);
    next(error);
  }
};

// Get support ticket statistics
export const getSupportTicketStats = async (req, res, next) => {
  try {
    const totalTickets = await SupportTicket.countDocuments();
    const openTickets = await SupportTicket.countDocuments({ status: 'open' });
    const closedTickets = await SupportTicket.countDocuments({ status: 'closed' });
    const highPriorityTickets = await SupportTicket.countDocuments({ priority: 'high' });

    res.status(200).json({
      success: true,
      data: {
        totalTickets,
        openTickets,
        closedTickets,
        highPriorityTickets
      }
    });
  } catch (error) {
    logger.error('Error fetching support ticket statistics:', error);
    next(error);
  }
};

export default {
  getAllSupportTickets,
  getSupportTicketById,
  updateSupportTicket,
  addSupportTicketReply,
  getSupportTicketStats
};

import SupportTicket from '../models/SupportTicket.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';
import { createSupportTicketNotification } from '../services/notificationService.js';

// Get all support tickets with filtering and pagination
export const getAllSupportTickets = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10,
      status,
      priority,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc' 
    } = req.query;
    
    const query = {};
    
    // Apply filters
    if (status) query.status = status;
    if (priority) query.priority = priority;
    
    if (search) {
      const users = await User.find({
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      const userIds = users.map(user => user._id);
      
      query.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { ticketNumber: { $regex: search, $options: 'i' } },
        { userIds: { $in: userIds } }
      ];
    }
    
    // Sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    const totalTickets = await SupportTicket.countDocuments(query);
    const tickets = await SupportTicket.find(query)
      .populate('user', 'email firstName lastName')
      .populate('assignedTo', 'email firstName lastName')
      .sort(sort)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
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
      .populate('user', 'email firstName lastName profileImage')
      .populate('assignedTo', 'email firstName lastName profileImage')
      .populate('messages.author', 'email firstName lastName profileImage role');
    
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

// Respond to a support ticket
export const addSupportTicketReply = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { id } = req.params;
    const { message } = req.body;
    
    if (!message || !message.trim()) {
      throw new ApiError('Message content is required', 400, 'validation_error');
    }
    
    const ticket = await SupportTicket.findById(id).session(session);
    
    if (!ticket) {
      throw new ApiError('Support ticket not found', 404, 'not_found');
    }
    
    if (ticket.status === 'closed') {
      throw new ApiError('Cannot respond to a closed ticket', 400, 'invalid_status');
    }
    
    // Add admin response
    ticket.messages.push({
      content: message,
      author: req.user._id,
      isAdmin: true,
      createdAt: new Date()
    });
    
    // Update ticket status
    ticket.status = 'responded';
    ticket.lastUpdated = new Date();
    
    // If not assigned, assign to the responding admin
    if (!ticket.assignedTo) {
      ticket.assignedTo = req.user._id;
    }
    
    await ticket.save({ session });
    
    // Create notification for user
    await createSupportTicketNotification(ticket, req.user);
    
    await session.commitTransaction();
    
    logger.info(`Admin ${req.user.email} responded to ticket ${id}`);
    
    res.status(200).json({
      success: true,
      message: 'Response added successfully',
      data: ticket
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error responding to ticket ${req.params.id}:`, error);
    next(error);
  } finally {
    session.endSession();
  }
};

// Update ticket status
export const updateTicketStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!['open', 'in_progress', 'responded', 'resolved', 'closed'].includes(status)) {
      throw new ApiError('Invalid status value', 400, 'validation_error');
    }
    
    const ticket = await SupportTicket.findById(id);
    
    if (!ticket) {
      throw new ApiError('Support ticket not found', 404, 'not_found');
    }
    
    ticket.status = status;
    ticket.lastUpdated = new Date();
    
    if (status === 'resolved' || status === 'closed') {
      ticket.resolvedAt = new Date();
      ticket.resolvedBy = req.user._id;
    }
    
    if (notes) {
      ticket.adminNotes = notes;
    }
    
    await ticket.save();
    
    // Create notification for user if status changed to resolved or closed
    if (status === 'resolved' || status === 'closed') {
      await createSupportTicketNotification(ticket, req.user);
    }
    
    logger.info(`Admin ${req.user.email} updated ticket ${id} status to ${status}`);
    
    res.status(200).json({
      success: true,
      message: `Ticket status updated to ${status}`,
      data: ticket
    });
  } catch (error) {
    logger.error(`Error updating ticket ${req.params.id} status:`, error);
    next(error);
  }
};

// Assign ticket to admin
export const assignTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { adminId } = req.body;
    
    if (!adminId) {
      throw new ApiError('Admin ID is required', 400, 'validation_error');
    }
    
    const ticket = await SupportTicket.findById(id);
    
    if (!ticket) {
      throw new ApiError('Support ticket not found', 404, 'not_found');
    }
    
    ticket.assignedTo = adminId;
    ticket.lastUpdated = new Date();
    
    if (ticket.status === 'open') {
      ticket.status = 'in_progress';
    }
    
    await ticket.save();
    
    logger.info(`Admin ${req.user.email} assigned ticket ${id} to admin ${adminId}`);
    
    res.status(200).json({
      success: true,
      message: 'Ticket assigned successfully',
      data: ticket
    });
  } catch (error) {
    logger.error(`Error assigning ticket ${req.params.id}:`, error);
    next(error);
  }
};

// Get support ticket statistics
export const getSupportTicketStats = async (req, res, next) => {
  try {
    const totalTickets = await SupportTicket.countDocuments();
    const openTickets = await SupportTicket.countDocuments({ status: 'open' });
    const inProgressTickets = await SupportTicket.countDocuments({ status: 'in_progress' });
    const respondedTickets = await SupportTicket.countDocuments({ status: 'responded' });
    const resolvedTickets = await SupportTicket.countDocuments({ status: 'resolved' });
    const closedTickets = await SupportTicket.countDocuments({ status: 'closed' });
    
    // Get recent tickets
    const recentTickets = await SupportTicket.find()
      .populate('user', 'email firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.status(200).json({
      success: true,
      data: {
        counts: {
          total: totalTickets,
          open: openTickets,
          inProgress: inProgressTickets,
          responded: respondedTickets,
          resolved: resolvedTickets,
          closed: closedTickets
        },
        recentTickets
      }
    });
  } catch (error) {
    logger.error('Error fetching support statistics:', error);
    next(error);
  }
};

export default {
  getAllSupportTickets,
  getSupportTicketById,
  addSupportTicketReply,
  updateTicketStatus,
  assignTicket,
  getSupportTicketStats
};

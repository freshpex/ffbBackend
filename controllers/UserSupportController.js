import SupportTicket from '../models/SupportTicket.js';
import mongoose from 'mongoose';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';
import { uploadToS3 } from '../services/storageService.js';
import { createSupportTicketNotification } from '../services/notificationService.js';

// Get all user's support tickets
export const getUserTickets = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { limit = 10, offset = 0, status } = req.query;
    
    const query = { user: userId };
    
    if (status) {
      query.status = status;
    }
    
    const tickets = await SupportTicket.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));
    
    const totalTickets = await SupportTicket.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        tickets,
        pagination: {
          total: totalTickets,
          offset: parseInt(offset),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching user tickets:', error);
    next(error);
  }
};

// Get a specific support ticket by ID
export const getTicketById = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    
    const ticket = await SupportTicket.findOne({
      _id: id,
      user: userId
    }).populate('messages.author', 'firstName lastName email profileImage role');
    
    if (!ticket) {
      throw new ApiError('Support ticket not found', 404, 'not_found');
    }
    
    res.status(200).json({
      success: true,
      data: ticket
    });
  } catch (error) {
    logger.error(`Error fetching ticket ${req.params.id}:`, error);
    next(error);
  }
};

// Create a new support ticket
export const createTicket = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { subject, message, category, priority = 'medium' } = req.body;
    
    // Validate required fields
    if (!subject || !message || !category) {
      throw new ApiError('Subject, message, and category are required', 400, 'validation_error');
    }
    
    // Generate a unique ticket number
    const ticketNumber = `TKT-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 1000)}`;
    
    // Process and upload any attached files
    let attachments = [];
    if (req.files && req.files.length > 0) {
      attachments = await Promise.all(
        req.files.map(async (file) => {
          const fileUrl = await uploadToS3(file, 'support-attachments');
          return {
            name: file.originalname,
            url: fileUrl,
            type: file.mimetype
          };
        })
      );
    }
    
    // Create the ticket
    const newTicket = new SupportTicket({
      user: userId,
      subject,
      ticketNumber,
      category,
      priority,
      messages: [
        {
          content: message,
          author: userId,
          isAdmin: false,
          attachments,
          createdAt: new Date()
        }
      ],
      status: 'open',
      createdAt: new Date(),
      lastUpdated: new Date()
    });
    
    await newTicket.save();
    
    // Create notification for admin
    await createSupportTicketNotification(newTicket, req.user);
    
    logger.info(`User ${req.user.email} created support ticket ${newTicket._id}`);
    
    res.status(201).json({
      success: true,
      message: 'Support ticket created successfully',
      data: newTicket
    });
  } catch (error) {
    logger.error('Error creating support ticket:', error);
    next(error);
  }
};

// Reply to an existing support ticket
export const replyToTicket = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { message } = req.body;
    
    if (!message) {
      throw new ApiError('Message content is required', 400, 'validation_error');
    }
    
    const ticket = await SupportTicket.findOne({
      _id: id,
      user: userId
    });
    
    if (!ticket) {
      throw new ApiError('Support ticket not found', 404, 'not_found');
    }
    
    if (ticket.status === 'closed') {
      throw new ApiError('Cannot reply to a closed ticket', 400, 'invalid_status');
    }
    
    // Process and upload any attached files
    let attachments = [];
    if (req.files && req.files.length > 0) {
      attachments = await Promise.all(
        req.files.map(async (file) => {
          const fileUrl = await uploadToS3(file, 'support-attachments');
          return {
            name: file.originalname,
            url: fileUrl,
            type: file.mimetype
          };
        })
      );
    }
    
    // Add user's reply
    ticket.messages.push({
      content: message,
      author: userId,
      isAdmin: false,
      attachments,
      createdAt: new Date()
    });
    
    // Update ticket status if it was previously responded to by admin
    if (ticket.status === 'responded') {
      ticket.status = 'in_progress';
    }
    
    ticket.lastUpdated = new Date();
    
    await ticket.save();
    
    // Create notification for admin
    await createSupportTicketNotification(ticket, req.user);
    
    logger.info(`User ${req.user.email} replied to ticket ${id}`);
    
    res.status(200).json({
      success: true,
      message: 'Reply added successfully',
      data: ticket
    });
  } catch (error) {
    logger.error(`Error replying to ticket ${req.params.id}:`, error);
    next(error);
  }
};

// Close a support ticket
export const closeTicket = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { reason } = req.body;
    
    const ticket = await SupportTicket.findOne({
      _id: id,
      user: userId
    });
    
    if (!ticket) {
      throw new ApiError('Support ticket not found', 404, 'not_found');
    }
    
    if (ticket.status === 'closed') {
      throw new ApiError('Ticket is already closed', 400, 'already_closed');
    }
    
    // Add closure message if provided
    if (reason) {
      ticket.messages.push({
        content: `Ticket closed by user. Reason: ${reason}`,
        author: userId,
        isAdmin: false,
        createdAt: new Date()
      });
    }
    
    ticket.status = 'closed';
    ticket.closedAt = new Date();
    ticket.closedBy = userId;
    ticket.lastUpdated = new Date();
    
    await ticket.save();
    
    logger.info(`User ${req.user.email} closed ticket ${id}`);
    
    res.status(200).json({
      success: true,
      message: 'Support ticket closed successfully',
      data: ticket
    });
  } catch (error) {
    logger.error(`Error closing ticket ${req.params.id}:`, error);
    next(error);
  }
};

// Reopen a closed ticket
export const reopenTicket = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    
    const ticket = await SupportTicket.findOne({
      _id: id,
      user: userId
    });
    
    if (!ticket) {
      throw new ApiError('Support ticket not found', 404, 'not_found');
    }
    
    if (ticket.status !== 'closed') {
      throw new ApiError('Only closed tickets can be reopened', 400, 'invalid_status');
    }
    
    ticket.messages.push({
      content: 'Ticket reopened by user',
      author: userId,
      isAdmin: false,
      createdAt: new Date()
    });
    
    ticket.status = 'open';
    ticket.lastUpdated = new Date();
    
    await ticket.save();
    
    // Create notification for admin
    await createSupportTicketNotification(ticket, req.user);
    
    logger.info(`User ${req.user.email} reopened ticket ${id}`);
    
    res.status(200).json({
      success: true,
      message: 'Support ticket reopened successfully',
      data: ticket
    });
  } catch (error) {
    logger.error(`Error reopening ticket ${req.params.id}:`, error);
    next(error);
  }
};

export default {
  getUserTickets,
  getTicketById,
  createTicket,
  replyToTicket,
  closeTicket,
  reopenTicket
};

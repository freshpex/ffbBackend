import ATMCard from '../models/ATMCard.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';
import pkg from 'uuid';
const { v4: uuidv4 } = pkg;

// Helper functions for card generation
function generateCardNumber() {
  // Generate a 16-digit card number starting with 4 (like Visa)
  return '4' + Array(15).fill(0).map(() => Math.floor(Math.random() * 10)).join('');
}

function getExpiryDate() {
  // Set expiry date to 3 years from now
  const date = new Date();
  date.setFullYear(date.getFullYear() + 3);
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(2)}`;
}

function generateCVV() {
  // Generate a 3-digit CVV
  return Math.floor(100 + Math.random() * 900).toString();
}

// Get all cards for authenticated user
export const getAllCards = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    const cards = await ATMCard.find({ user: userId });
    
    res.status(200).json({
      success: true,
      data: cards
    });
  } catch (error) {
    logger.error('Error fetching user cards:', error);
    next(error);
  }
};

// Get card by ID for authenticated user
export const getCardById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const card = await ATMCard.findOne({ _id: id, user: userId });
    
    if (!card) {
      throw new ApiError('Card not found', 404, 'not_found');
    }
    
    res.status(200).json({
      success: true,
      data: card
    });
  } catch (error) {
    logger.error(`Error fetching card ${req.params.id}:`, error);
    next(error);
  }
};

// Request a new ATM card
export const requestCard = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { cardType = 'virtual', shippingAddress } = req.body;
    
    // Check if user has reached card limit
    const userCardCount = await ATMCard.countDocuments({ user: userId });
    const cardLimit = 3; // Maximum 3 cards per user
    
    if (userCardCount >= cardLimit) {
      throw new ApiError(`You have reached the limit of ${cardLimit} cards`, 400, 'limit_reached');
    }
    
    // For physical cards, shipping address is required
    if (cardType === 'physical' && !shippingAddress) {
      throw new ApiError('Shipping address is required for physical cards', 400, 'validation_error');
    }
    
    // Create new card request
    const newCard = new ATMCard({
      user: userId,
      cardType,
      status: 'pending',
      requestId: uuidv4(),
      shippingAddress: cardType === 'physical' ? shippingAddress : undefined
    });
    
    await newCard.save();
    
    res.status(201).json({
      success: true,
      message: `Your ${cardType} card request has been submitted and is pending approval`,
      data: newCard
    });
  } catch (error) {
    logger.error('Error requesting new card:', error);
    next(error);
  }
};

// Cancel card request
export const cancelCardRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const card = await ATMCard.findOne({ _id: id, user: userId });
    
    if (!card) {
      throw new ApiError('Card not found', 404, 'not_found');
    }
    
    if (card.status !== 'pending') {
      throw new ApiError(`Cannot cancel card in ${card.status} status`, 400, 'invalid_status');
    }
    
    card.status = 'cancelled';
    await card.save();
    
    res.status(200).json({
      success: true,
      message: 'Card request cancelled successfully',
      data: card
    });
  } catch (error) {
    logger.error(`Error cancelling card request ${req.params.id}:`, error);
    next(error);
  }
};

// Freeze card
export const freezeCard = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const card = await ATMCard.findOne({ _id: id, user: userId });
    
    if (!card) {
      throw new ApiError('Card not found', 404, 'not_found');
    }
    
    if (card.status !== 'active') {
      throw new ApiError(`Cannot freeze card in ${card.status} status`, 400, 'invalid_status');
    }
    
    card.status = 'frozen';
    card.frozenAt = new Date();
    await card.save();
    
    res.status(200).json({
      success: true,
      message: 'Card frozen successfully',
      data: card
    });
  } catch (error) {
    logger.error(`Error freezing card ${req.params.id}:`, error);
    next(error);
  }
};

// Unfreeze card
export const unfreezeCard = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const card = await ATMCard.findOne({ _id: id, user: userId });
    
    if (!card) {
      throw new ApiError('Card not found', 404, 'not_found');
    }
    
    if (card.status !== 'frozen') {
      throw new ApiError(`Card is not frozen`, 400, 'invalid_status');
    }
    
    card.status = 'active';
    card.frozenAt = null;
    await card.save();
    
    res.status(200).json({
      success: true,
      message: 'Card unfrozen successfully',
      data: card
    });
  } catch (error) {
    logger.error(`Error unfreezing card ${req.params.id}:`, error);
    next(error);
  }
};

// Update card limits
export const updateCardLimits = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { dailyLimit, monthlyLimit } = req.body;
    
    if (!dailyLimit && !monthlyLimit) {
      throw new ApiError('At least one limit must be specified', 400, 'validation_error');
    }
    
    const card = await ATMCard.findOne({ _id: id, user: userId });
    
    if (!card) {
      throw new ApiError('Card not found', 404, 'not_found');
    }
    
    if (card.status !== 'active' && card.status !== 'frozen') {
      throw new ApiError(`Cannot update limits for card in ${card.status} status`, 400, 'invalid_status');
    }
    
    if (dailyLimit) card.limits.daily = dailyLimit;
    if (monthlyLimit) card.limits.monthly = monthlyLimit;
    
    await card.save();
    
    res.status(200).json({
      success: true,
      message: 'Card limits updated successfully',
      data: card
    });
  } catch (error) {
    logger.error(`Error updating card limits ${req.params.id}:`, error);
    next(error);
  }
};

// Get card transactions
export const getCardTransactions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const card = await ATMCard.findOne({ _id: id, user: userId });
    
    if (!card) {
      throw new ApiError('Card not found', 404, 'not_found');
    }
    
    const transactions = await Transaction.find({ 
      cardId: id, 
      user: userId 
    }).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: transactions
    });
  } catch (error) {
    logger.error(`Error fetching card transactions ${req.params.id}:`, error);
    next(error);
  }
};

// ADMIN METHODS

// Admin: Get all cards
export const adminGetAllCards = async (req, res, next) => {
  try {
    // Check admin permissions
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      throw new ApiError('Unauthorized access', 403, 'forbidden');
    }
    
    const { 
      status, 
      cardType, 
      page = 1, 
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc' 
    } = req.query;
    
    // Build query
    const query = {};
    if (status) query.status = status;
    if (cardType) query.cardType = cardType;
    
    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    const totalCards = await ATMCard.countDocuments(query);
    const cards = await ATMCard.find(query)
      .populate('user', 'email firstName lastName')
      .sort(sort)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      data: {
        cards,
        pagination: {
          total: totalCards,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalCards / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching all cards (admin):', error);
    next(error);
  }
};

// Admin: Get card by ID
export const adminGetCardById = async (req, res, next) => {
  try {
    // Check admin permissions
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      throw new ApiError('Unauthorized access', 403, 'forbidden');
    }
    
    const { id } = req.params;
    
    const card = await ATMCard.findById(id)
      .populate('user', 'email firstName lastName');
    
    if (!card) {
      throw new ApiError('Card not found', 404, 'not_found');
    }
    
    res.status(200).json({
      success: true,
      data: card
    });
  } catch (error) {
    logger.error(`Error fetching card ${req.params.id} (admin):`, error);
    next(error);
  }
};

// Admin: Approve card request
export const adminApproveCardRequest = async (req, res, next) => {
  try {
    // Check admin permissions
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      throw new ApiError('Unauthorized access', 403, 'forbidden');
    }
    
    const { id } = req.params;
    
    const card = await ATMCard.findById(id);
    
    if (!card) {
      throw new ApiError('Card not found', 404, 'not_found');
    }
    
    if (card.status !== 'pending') {
      throw new ApiError(`Cannot approve card in ${card.status} status`, 400, 'invalid_status');
    }
    
    // Generate card details
    const cardNumber = generateCardNumber();
    const expiryDate = getExpiryDate();
    const cvv = generateCVV();
    
    // Update card with details
    card.status = 'active';
    card.cardNumber = cardNumber;
    card.expiryDate = expiryDate;
    card.cvv = cvv;
    card.approvedBy = req.user._id;
    card.approvedAt = new Date();
    
    if (card.cardType === 'physical') {
      card.status = 'processing'; // Physical cards need to be issued
      card.processingMessage = 'Your card has been approved and is being processed for shipping';
    }
    
    await card.save();
    
    // TODO: Send notification to user
    
    res.status(200).json({
      success: true,
      message: `Card request approved successfully. Card is now ${card.status}.`,
      data: card
    });
  } catch (error) {
    logger.error(`Error approving card request ${req.params.id} (admin):`, error);
    next(error);
  }
};

// Admin: Reject card request
export const adminRejectCardRequest = async (req, res, next) => {
  try {
    // Check admin permissions
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      throw new ApiError('Unauthorized access', 403, 'forbidden');
    }
    
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
      throw new ApiError('Rejection reason is required', 400, 'validation_error');
    }
    
    const card = await ATMCard.findById(id);
    
    if (!card) {
      throw new ApiError('Card not found', 404, 'not_found');
    }
    
    if (card.status !== 'pending') {
      throw new ApiError(`Cannot reject card in ${card.status} status`, 400, 'invalid_status');
    }
    
    // Update card status
    card.status = 'rejected';
    card.rejectionReason = reason;
    card.processedBy = req.user._id;
    card.processedAt = new Date();
    
    await card.save();
    
    // TODO: Send notification to user
    
    res.status(200).json({
      success: true,
      message: 'Card request rejected successfully',
      data: card
    });
  } catch (error) {
    logger.error(`Error rejecting card request ${req.params.id} (admin):`, error);
    next(error);
  }
};

// Admin: Update card status
export const adminUpdateCardStatus = async (req, res, next) => {
  try {
    // Check admin permissions
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      throw new ApiError('Unauthorized access', 403, 'forbidden');
    }
    
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!status) {
      throw new ApiError('Status is required', 400, 'validation_error');
    }
    
    const validStatuses = ['active', 'frozen', 'suspended', 'cancelled', 'expired', 'processing', 'shipped'];
    if (!validStatuses.includes(status)) {
      throw new ApiError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400, 'validation_error');
    }
    
    const card = await ATMCard.findById(id);
    
    if (!card) {
      throw new ApiError('Card not found', 404, 'not_found');
    }
    
    // Update card status
    card.status = status;
    
    if (notes) {
      card.adminNotes = notes;
    }
    
    if (status === 'shipped') {
      card.shippedAt = new Date();
    }
    
    await card.save();
    
    // TODO: Send notification to user
    
    res.status(200).json({
      success: true,
      message: `Card status updated to ${status} successfully`,
      data: card
    });
  } catch (error) {
    logger.error(`Error updating card status ${req.params.id} (admin):`, error);
    next(error);
  }
};

export default {
  // User methods
  getAllCards,
  getCardById,
  requestCard,
  cancelCardRequest,
  freezeCard,
  unfreezeCard,
  updateCardLimits,
  getCardTransactions,
  
  // Admin methods
  adminGetAllCards,
  adminGetCardById,
  adminApproveCardRequest,
  adminRejectCardRequest,
  adminUpdateCardStatus
};

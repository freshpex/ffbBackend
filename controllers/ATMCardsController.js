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
    const { 
      type = 'virtual-debit', 
      name = `${req.user.firstName} ${req.user.lastName}`,
      shippingAddress, 
      billingAddress 
    } = req.body;
    
    // Check if user has reached card limit
    const userCardCount = await ATMCard.countDocuments({ user: userId });
    const cardLimit = 3; // Maximum 3 cards per user
    
    if (userCardCount >= cardLimit) {
      throw new ApiError(`You have reached the limit of ${cardLimit} cards`, 400, 'limit_reached');
    }
    
    // Validate card type
    if (!['virtual-debit', 'standard-debit', 'premium-debit'].includes(type)) {
      throw new ApiError('Invalid card type. Must be virtual-debit, standard-debit, or premium-debit', 400, 'validation_error');
    }
    
    // For physical cards, shipping address is required
    if (['standard-debit', 'premium-debit'].includes(type) && !shippingAddress) {
      throw new ApiError('Shipping address is required for physical cards', 400, 'validation_error');
    }
    
    // Generate card details
    const cardNumber = generateCardNumber();
    const expiryDate = getExpiryDate();
    const cvv = generateCVV();
    
    // Create new card request
    const newCard = new ATMCard({
      user: userId,
      cardNumber,
      name,
      type,
      status: 'pending',
      expiryDate,
      cvv,
      currency: 'USD',
      shippingAddress: shippingAddress || {},
      billingAddress: billingAddress || {}
    });
    
    await newCard.save();
    
    res.status(201).json({
      success: true,
      message: `Your ${type} card request has been submitted and is pending approval`,
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
    const { page = 1, limit = 10, category, type, startDate, endDate } = req.query;
    
    const card = await ATMCard.findOne({ _id: id, user: userId });
    
    if (!card) {
      throw new ApiError('Card not found', 404, 'not_found');
    }
    
    // Build query
    const query = { 
      cardId: id, 
      user: userId 
    };
    
    // Add optional filters
    if (category) query.category = category;
    if (type) query.type = type;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get transactions count
    const total = await Transaction.countDocuments(query);
    
    // Get transactions
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error(`Error fetching card transactions ${req.params.id}:`, error);
    next(error);
  }
};

// Create a card transaction
export const createCardTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { 
      amount, 
      merchantName, 
      merchantId,
      category,
      type = 'purchase',
      description
    } = req.body;
    
    // Validate required fields
    if (!amount || amount <= 0) {
      throw new ApiError('Valid transaction amount is required', 400, 'validation_error');
    }
    
    if (!merchantName) {
      throw new ApiError('Merchant name is required', 400, 'validation_error');
    }
    
    // Validate transaction type
    const validTypes = ['purchase', 'refund', 'withdrawal', 'deposit'];
    if (!validTypes.includes(type)) {
      throw new ApiError(`Invalid transaction type. Must be one of: ${validTypes.join(', ')}`, 400, 'validation_error');
    }
    
    // Find the card
    const card = await ATMCard.findOne({ _id: id, user: userId });
    
    if (!card) {
      throw new ApiError('Card not found', 404, 'not_found');
    }
    
    // Check card status
    if (card.status !== 'active') {
      throw new ApiError(`Cannot create transaction with card in ${card.status} status`, 400, 'invalid_card_status');
    }
    
    // For purchase and withdrawal, check balance and limits
    if (type === 'purchase' || type === 'withdrawal') {
      // Check card balance
      if (card.balance < amount) {
        throw new ApiError('Insufficient card balance', 400, 'insufficient_funds');
      }
      
      // Check daily limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayTransactions = await Transaction.find({
        cardId: id,
        user: userId,
        type: { $in: ['purchase', 'withdrawal'] },
        createdAt: { $gte: today }
      });
      
      const todaySpent = todayTransactions.reduce((total, tx) => total + tx.amount, 0);
      
      if (todaySpent + amount > card.limits.daily) {
        throw new ApiError('Transaction exceeds daily limit', 400, 'limit_exceeded');
      }
      
      // Check monthly limit
      const firstDayOfMonth = new Date();
      firstDayOfMonth.setDate(1);
      firstDayOfMonth.setHours(0, 0, 0, 0);
      
      const monthTransactions = await Transaction.find({
        cardId: id,
        user: userId,
        type: { $in: ['purchase', 'withdrawal'] },
        createdAt: { $gte: firstDayOfMonth }
      });
      
      const monthSpent = monthTransactions.reduce((total, tx) => total + tx.amount, 0);
      
      if (monthSpent + amount > card.limits.monthly) {
        throw new ApiError('Transaction exceeds monthly limit', 400, 'limit_exceeded');
      }
    }
    
    // Create transaction
    const transaction = new Transaction({
      transactionId: uuidv4(),
      user: userId,
      cardId: id,
      amount,
      merchantName,
      merchantId: merchantId || `merchant_${Date.now()}`,
      category: category || 'other',
      type,
      description: description || `${type} at ${merchantName}`,
      status: 'completed',
      currency: card.currency || 'USD',
      date: new Date()
    });
    
    await transaction.save();
    
    // Update card balance for purchase/withdrawal
    if (type === 'purchase' || type === 'withdrawal') {
      card.balance -= amount;
      
      // Update daily and monthly usage
      card.limits.dailyUsed = (card.limits.dailyUsed || 0) + amount;
      card.limits.monthlyUsed = (card.limits.monthlyUsed || 0) + amount;
      
      await card.save();
      
      // Update user's main balance as well
      const user = await User.findById(userId);
      if (user) {
        user.balance -= amount;
        await user.save();
      }
    } 
    // Handle refunds/deposits
    else if (type === 'refund' || type === 'deposit') {
      card.balance += amount;
      await card.save();
      
      // Update user's main balance for deposits
      if (type === 'deposit') {
        const user = await User.findById(userId);
        if (user) {
          user.balance += amount;
          await user.save();
        }
      }
    }
    
    res.status(201).json({
      success: true,
      message: `Card transaction created successfully`,
      transaction
    });
  } catch (error) {
    logger.error(`Error creating card transaction for card ${req.params.id}:`, error);
    next(error);
  }
};

export const fundCardFromBalance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      throw new ApiError('Valid amount is required', 400, 'validation_error');
    }
    
    const card = await ATMCard.findOne({ _id: id, user: userId });
    
    if (!card) {
      throw new ApiError('Card not found', 404, 'not_found');
    }
    
    // Check card status
    if (card.status !== 'active') {
      throw new ApiError(`Cannot fund card in ${card.status} status`, 400, 'invalid_card_status');
    }
    
    // Find user and check balance
    const user = await User.findById(userId);
    
    if (!user) {
      throw new ApiError('User not found', 404, 'not_found');
    }
    
    if (user.balance < amount) {
      throw new ApiError('Insufficient balance in your account', 400, 'insufficient_funds');
    }
    
    // Create transaction to record the funding
    const transaction = new Transaction({
      transactionId: uuidv4(),
      user: userId,
      cardId: id,
      amount: amount,
      merchantName: 'FFB Self-Funding',
      merchantId: `ffb_fund_${Date.now()}`,
      category: 'transfer',
      type: 'deposit',
      description: 'Card funding from account balance',
      status: 'completed',
      currency: card.currency || 'USD',
      date: new Date()
    });
    
    await transaction.save();
    
    // Update card balance
    card.balance += amount;
    await card.save();
    
    // Update user's main balance
    user.balance -= amount;
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Card funded successfully',
      data: {
        card: {
          id: card._id,
          balance: card.balance
        },
        transaction: transaction,
        userBalance: user.balance
      }
    });
  } catch (error) {
    logger.error(`Error funding card ${req.params.id}:`, error);
    next(error);
  }
};

// ADMIN METHODS

// Admin: Get all cards
export const adminGetAllCards = async (req, res, next) => {
  try {
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
  createCardTransaction,
  fundCardFromBalance,
  
  // Admin methods
  adminGetAllCards,
  adminGetCardById,
  adminApproveCardRequest,
  adminRejectCardRequest,
  adminUpdateCardStatus
};

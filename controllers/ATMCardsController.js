import ATMCard from '../models/ATMCard.js';
import mongoose from 'mongoose';
import logger from '../middleware/logger.js';
import { ApiError } from '../middleware/errorHandler.js';
import { createCardRequestNotification } from '../services/notificationService.js';

// Get all ATM cards for a user
export const getUserATMCards = async (req, res, next) => {
  try {
    const cards = await ATMCard.find({ user: req.user._id });
    res.status(200).json({
      success: true,
      data: cards
    });
  } catch (error) {
    logger.error('Error fetching ATM cards:', error);
    next(error);
  }
};

// Get ATM card details by ID
export const getATMCardById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const card = await ATMCard.findOne({ _id: id, user: req.user._id });

    if (!card) {
      throw new ApiError('ATM card not found', 404, 'not_found');
    }

    res.status(200).json({
      success: true,
      data: card
    });
  } catch (error) {
    logger.error(`Error fetching ATM card ${req.params.id}:`, error);
    next(error);
  }
};

// Create a new ATM card request
export const createATMCardRequest = async (req, res, next) => {
  try {
    const { cardType, deliveryAddress } = req.body;

    if (!cardType || !deliveryAddress) {
      throw new ApiError('Card type and delivery address are required', 400, 'validation_error');
    }

    const newCard = new ATMCard({
      user: req.user._id,
      cardType,
      deliveryAddress,
      status: 'pending',
      createdAt: new Date()
    });

    await newCard.save();

    // After successfully creating the card request, send notification
    if (newCard) {
      await createCardRequestNotification(newCard, req.user);
    }

    res.status(201).json({
      success: true,
      message: 'ATM card request created successfully',
      data: newCard
    });
  } catch (error) {
    logger.error('Error creating ATM card request:', error);
    next(error);
  }
};

// Update ATM card limits
export const updateATMCardLimits = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { dailyLimit, monthlyLimit } = req.body;

    const card = await ATMCard.findOne({ _id: id, user: req.user._id });

    if (!card) {
      throw new ApiError('ATM card not found', 404, 'not_found');
    }

    card.dailyLimit = dailyLimit || card.dailyLimit;
    card.monthlyLimit = monthlyLimit || card.monthlyLimit;

    await card.save();

    res.status(200).json({
      success: true,
      message: 'ATM card limits updated successfully',
      data: card
    });
  } catch (error) {
    logger.error(`Error updating ATM card limits for ${req.params.id}:`, error);
    next(error);
  }
};

// Cancel ATM card request
export const cancelATMCardRequest = async (req, res, next) => {
  try {
    const { id } = req.params;

    const card = await ATMCard.findOne({ _id: id, user: req.user._id, status: 'pending' });

    if (!card) {
      throw new ApiError('Pending ATM card request not found', 404, 'not_found');
    }

    card.status = 'cancelled';
    await card.save();

    res.status(200).json({
      success: true,
      message: 'ATM card request cancelled successfully',
      data: card
    });
  } catch (error) {
    logger.error(`Error cancelling ATM card request ${req.params.id}:`, error);
    next(error);
  }
};

// Get ATM card requests
export const getATMCardRequests = async (req, res, next) => {
  try {
    const { status } = req.query;

    const query = { user: req.user._id };
    if (status) query.status = status;

    const requests = await ATMCard.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: requests
    });
  } catch (error) {
    logger.error('Error fetching ATM card requests:', error);
    next(error);
  }
};

export default {
  getUserATMCards,
  getATMCardById,
  createATMCardRequest,
  updateATMCardLimits,
  cancelATMCardRequest,
  getATMCardRequests
};

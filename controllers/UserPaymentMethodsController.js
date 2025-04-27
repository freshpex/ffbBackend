import User from "../models/User.js";
import PaymentMethod from "../models/PaymentMethod.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

// Get user payment methods
export const getUserPaymentMethods = async (req, res, next) => {
  try {
    const paymentMethods = await PaymentMethod.find({ user: req.user._id });

    res.status(200).json({
      success: true,
      data: paymentMethods,
    });
  } catch (error) {
    logger.error("Error fetching payment methods:", error);
    next(error);
  }
};

// Add new bank account
export const addBankAccount = async (req, res, next) => {
  try {
    const {
      accountName,
      accountNumber,
      bankName,
      routingNumber,
      bankAddress,
      swiftCode,
      nickname,
    } = req.body;

    // Validate required fields
    if (!accountName || !accountNumber || !bankName) {
      throw new ApiError(
        "Account name, account number, and bank name are required",
        400,
        "validation_error",
      );
    }

    const bankAccount = new PaymentMethod({
      user: req.user._id,
      type: "bank_account",
      nickname: nickname || `${bankName} Account`,
      details: {
        accountName,
        accountNumber,
        bankName,
        routingNumber,
        bankAddress,
        swiftCode,
      },
      isDefault: false, // Will set as default if it's the first one
      addedAt: new Date(),
    });

    // Check if this is the first payment method and set as default if so
    const existingMethods = await PaymentMethod.countDocuments({
      user: req.user._id,
    });
    if (existingMethods === 0) {
      bankAccount.isDefault = true;
    }

    await bankAccount.save();

    res.status(201).json({
      success: true,
      message: "Bank account added successfully",
      data: bankAccount,
    });
  } catch (error) {
    logger.error("Error adding bank account:", error);
    next(error);
  }
};

// Add new cryptocurrency wallet
export const addCryptoWallet = async (req, res, next) => {
  try {
    const { cryptocurrency, walletAddress, network, nickname } = req.body;

    // Validate required fields
    if (!cryptocurrency || !walletAddress) {
      throw new ApiError(
        "Cryptocurrency type and wallet address are required",
        400,
        "validation_error",
      );
    }

    const cryptoWallet = new PaymentMethod({
      user: req.user._id,
      type: "crypto_wallet",
      nickname: nickname || `${cryptocurrency} Wallet`,
      details: {
        cryptocurrency,
        walletAddress,
        network: network || "mainnet",
      },
      isDefault: false, // Will set as default if it's the first one
      addedAt: new Date(),
    });

    // Check if this is the first payment method and set as default if so
    const existingMethods = await PaymentMethod.countDocuments({
      user: req.user._id,
    });
    if (existingMethods === 0) {
      cryptoWallet.isDefault = true;
    }

    await cryptoWallet.save();

    res.status(201).json({
      success: true,
      message: "Cryptocurrency wallet added successfully",
      data: cryptoWallet,
    });
  } catch (error) {
    logger.error("Error adding cryptocurrency wallet:", error);
    next(error);
  }
};

// Add new card (placeholder - in real app would integrate with payment processor)
export const addCard = async (req, res, next) => {
  try {
    const {
      cardholderName,
      cardNumber,
      expiryMonth,
      expiryYear,
      expiryDate,
      nickname,
    } = req.body;

    let month, year;

    if (expiryDate) {
      const parts = expiryDate.split("/");
      if (parts.length === 2) {
        month = parts[0].trim();
        year = parts[1].trim();
        if (year.length === 2) {
          year = `20${year}`;
        }
      }
    } else {
      month = expiryMonth;
      year = expiryYear;
    }

    // Validate required fields
    if (!cardholderName || !cardNumber || !month || !year) {
      throw new ApiError(
        "Cardholder name, card number, and expiry date are required",
        400,
        "validation_error",
      );
    }

    if (cardNumber.replace(/\s/g, "").length < 13) {
      throw new ApiError("Invalid card number", 400, "validation_error");
    }

    // Mask card number for storage (keep only last 4 digits)
    const maskedCardNumber = `**** **** **** ${cardNumber.slice(-4)}`;

    const card = new PaymentMethod({
      user: req.user._id,
      type: "card",
      nickname: nickname || `Card ending in ${cardNumber.slice(-4)}`,
      details: {
        cardholderName,
        cardNumber: maskedCardNumber,
        expiryMonth: month,
        expiryYear: year,
      },
      isDefault: false, // Will set as default if it's the first one
      addedAt: new Date(),
    });

    const existingMethods = await PaymentMethod.countDocuments({
      user: req.user._id,
    });
    if (existingMethods === 0) {
      card.isDefault = true;
    }

    await card.save();

    res.status(201).json({
      success: true,
      message: "Card added successfully",
      data: card,
    });
  } catch (error) {
    logger.error("Error adding card:", error);
    next(error);
  }
};

// Update payment method nickname
export const updatePaymentMethod = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nickname } = req.body;

    const paymentMethod = await PaymentMethod.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!paymentMethod) {
      throw new ApiError("Payment method not found", 404, "not_found");
    }

    if (nickname) {
      paymentMethod.nickname = nickname;
    }

    await paymentMethod.save();

    res.status(200).json({
      success: true,
      message: "Payment method updated successfully",
      data: paymentMethod,
    });
  } catch (error) {
    logger.error(`Error updating payment method ${req.params.id}:`, error);
    next(error);
  }
};

// Set default payment method
export const setDefaultPaymentMethod = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    // Find the payment method to set as default
    const paymentMethod = await PaymentMethod.findOne({
      _id: id,
      user: req.user._id,
    }).session(session);

    if (!paymentMethod) {
      throw new ApiError("Payment method not found", 404, "not_found");
    }

    // Unset default on all other payment methods
    await PaymentMethod.updateMany(
      { user: req.user._id, _id: { $ne: id } },
      { isDefault: false },
    ).session(session);

    // Set this one as default
    paymentMethod.isDefault = true;
    await paymentMethod.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Default payment method updated successfully",
      data: paymentMethod,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(
      `Error setting default payment method ${req.params.id}:`,
      error,
    );
    next(error);
  } finally {
    session.endSession();
  }
};

// Delete payment method
export const deletePaymentMethod = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    // Find the payment method to delete
    const paymentMethod = await PaymentMethod.findOne({
      _id: id,
      user: req.user._id,
    }).session(session);

    if (!paymentMethod) {
      throw new ApiError("Payment method not found", 404, "not_found");
    }

    if (paymentMethod.isDefault) {
      const anotherPaymentMethod = await PaymentMethod.findOne({
        user: req.user._id,
        _id: { $ne: id },
      }).session(session);

      if (anotherPaymentMethod) {
        anotherPaymentMethod.isDefault = true;
        await anotherPaymentMethod.save({ session });
      }
    }

    // Delete the payment method
    await PaymentMethod.deleteOne({ _id: id }).session(session);

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Payment method deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error deleting payment method ${req.params.id}:`, error);
    next(error);
  } finally {
    session.endSession();
  }
};

export default {
  getUserPaymentMethods,
  addBankAccount,
  addCryptoWallet,
  addCard,
  updatePaymentMethod,
  setDefaultPaymentMethod,
  deletePaymentMethod,
};

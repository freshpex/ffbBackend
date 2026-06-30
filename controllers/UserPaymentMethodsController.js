import User from "../models/User.js";
import PaymentMethod from "../models/PaymentMethod.js";
import mongoose from "mongoose";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

const toNumberOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const getLast4 = (maskedOrFull) => {
  if (!maskedOrFull) return undefined;
  const digits = String(maskedOrFull).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : undefined;
};

const maskAccountNumber = (accountNumber) => {
  if (!accountNumber) return undefined;
  const digits = String(accountNumber).replace(/\s/g, "");
  const last4 = digits.slice(-4);
  return `****${last4}`;
};

const normalizePaymentMethod = (pm) => {
  if (!pm) return pm;

  const details = pm.details || {};

  // Base fields
  const normalized = {
    id: pm.id || pm._id,
    type: pm.type,
    name: pm.nickname,
    nickname: pm.nickname,
    isDefault: !!pm.isDefault,
    status: pm.status,
    addedAt: pm.addedAt,
    createdAt: pm.createdAt,
    updatedAt: pm.updatedAt,
  };

  if (pm.type === "card") {
    const expiryMonth = toNumberOrNull(details.expiryMonth);
    const expiryYear = toNumberOrNull(details.expiryYear);
    const cardNumberMasked = details.cardNumber;

    return {
      ...normalized,
      cardholderName: details.cardholderName,
      last4: getLast4(cardNumberMasked),
      expiryMonth: expiryMonth ?? undefined,
      expiryYear: expiryYear ?? undefined,
      cardNumberMasked,
      cardBrand: details.cardBrand,
      stripePaymentMethodId: details.stripePaymentMethodId,
      stripeCustomerId: details.stripeCustomerId,
    };
  }

  if (pm.type === "bank_account") {
    const accountNumberMasked = maskAccountNumber(details.accountNumber);
    return {
      ...normalized,
      bankName: details.bankName,
      accountName: details.accountName,
      last4: getLast4(details.accountNumber),
      routingNumber: details.routingNumber,
      bankAddress: details.bankAddress,
      swiftCode: details.swiftCode,
      accountNumberMasked,
    };
  }

  if (pm.type === "crypto_wallet") {
    return {
      ...normalized,
      walletType: details.cryptocurrency,
      walletAddress: details.walletAddress,
      network: details.network,
    };
  }

  return normalized;
};

// Get user payment methods
export const getUserPaymentMethods = async (req, res, next) => {
  try {
    const paymentMethods = await PaymentMethod.find({ user: req.user._id });

    res.status(200).json({
      success: true,
      data: paymentMethods.map(normalizePaymentMethod),
    });
  } catch (error) {
    logger.error("Error fetching payment methods:", error);
    next(error);
  }
};

// Add payment method (generic route used by frontend)
export const addPaymentMethod = async (req, res, next) => {
  try {
    const { type } = req.body;

    if (!type) {
      throw new ApiError("Payment method type is required", 400, "validation_error");
    }

    if (type === "card") {
      return addCard(req, res, next);
    }
    if (type === "bank_account") {
      return addBankAccount(req, res, next);
    }
    if (type === "crypto_wallet") {
      return addCryptoWallet(req, res, next);
    }

    throw new ApiError("Unsupported payment method type", 400, "validation_error");
  } catch (error) {
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
      isDefault,
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
      isDefault: !!isDefault,
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
      data: normalizePaymentMethod(bankAccount),
    });
  } catch (error) {
    logger.error("Error adding bank account:", error);
    next(error);
  }
};

// Add new cryptocurrency wallet
export const addCryptoWallet = async (req, res, next) => {
  try {
    const { cryptocurrency, walletAddress, network, nickname, isDefault } = req.body;

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
      isDefault: !!isDefault,
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
      data: normalizePaymentMethod(cryptoWallet),
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
      isDefault,
      stripePaymentMethodId,
      stripeCustomerId,
      cardBrand,
      cvv,
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

    const monthNum = Number(month);
    const yearNum = Number(year);

    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      throw new ApiError("Invalid expiry month", 400, "validation_error");
    }

    if (!Number.isInteger(yearNum) || yearNum < 2020 || yearNum > 2100) {
      throw new ApiError("Invalid expiry year", 400, "validation_error");
    }

    // Mask card number for storage (keep only last 4 digits)
    const maskedCardNumber = `**** **** **** ${cardNumber.slice(-4)}`;

    const card = new PaymentMethod({
      user: req.user._id,
      type: "card",
      nickname: nickname || `Card ending in ${cardNumber.slice(-4)}`,
      details: {
        cardholderName: String(cardholderName).trim(),
        cardNumber: maskedCardNumber,
        expiryMonth: monthNum,
        expiryYear: yearNum,
        cardBrand: cardBrand || undefined,
        stripePaymentMethodId: stripePaymentMethodId || undefined,
        stripeCustomerId: stripeCustomerId || undefined,
        cvvProvided: !!cvv,
      },
      isDefault: !!isDefault,addedAt: new Date(),
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
      data: normalizePaymentMethod(card),
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
    const {
      nickname,
      // card
      cardholderName,
      expiryMonth,
      expiryYear,
      // bank
      accountName,
      bankName,
      routingNumber,
      bankAddress,
      swiftCode,
      // crypto
      walletType,
      walletAddress,
      network,
      // future Stripe linkage
      stripePaymentMethodId,
      stripeCustomerId,
      cardBrand,
      // explicitly disallow sensitive fields
      cardNumber,
      cvv,
      accountNumber,
    } = req.body;

    const paymentMethod = await PaymentMethod.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!paymentMethod) {
      throw new ApiError("Payment method not found", 404, "not_found");
    }

    if (cardNumber || cvv || accountNumber) {
      throw new ApiError(
        "Updating full card/account numbers or CVV is not supported",
        400,
        "validation_error",
      );
    }

    if (nickname) {
      paymentMethod.nickname = nickname;
    }

    // Update allowed details by type
    if (!paymentMethod.details || typeof paymentMethod.details !== "object") {
      paymentMethod.details = {};
    }

    if (paymentMethod.type === "card") {
      if (cardholderName) paymentMethod.details.cardholderName = cardholderName;
      if (expiryMonth) paymentMethod.details.expiryMonth = Number(expiryMonth);
      if (expiryYear) paymentMethod.details.expiryYear = Number(expiryYear);
      if (cardBrand) paymentMethod.details.cardBrand = cardBrand;
      if (stripePaymentMethodId) {
        paymentMethod.details.stripePaymentMethodId = stripePaymentMethodId;
      }
      if (stripeCustomerId) {
        paymentMethod.details.stripeCustomerId = stripeCustomerId;
      }
    }

    if (paymentMethod.type === "bank_account") {
      if (accountName) paymentMethod.details.accountName = accountName;
      if (bankName) paymentMethod.details.bankName = bankName;
      if (routingNumber) paymentMethod.details.routingNumber = routingNumber;
      if (bankAddress) paymentMethod.details.bankAddress = bankAddress;
      if (swiftCode) paymentMethod.details.swiftCode = swiftCode;
    }

    if (paymentMethod.type === "crypto_wallet") {
      if (walletType) paymentMethod.details.cryptocurrency = walletType;
      if (walletAddress) paymentMethod.details.walletAddress = walletAddress;
      if (network) paymentMethod.details.network = network;
    }

    paymentMethod.markModified("details");

    await paymentMethod.save();

    res.status(200).json({
      success: true,
      message: "Payment method updated successfully",
      data: normalizePaymentMethod(paymentMethod),
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
      data: normalizePaymentMethod(paymentMethod),
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
  addPaymentMethod,
  addBankAccount,
  addCryptoWallet,
  addCard,
  updatePaymentMethod,
  setDefaultPaymentMethod,
  deletePaymentMethod,
};

import PriceAlert from "../models/PriceAlert.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import logger from "../middleware/logger.js";
import { ApiError } from "../middleware/errorHandler.js";
import nodemailer from "nodemailer";
import mongoose from "mongoose";

// Get user price alerts
export const getUserPriceAlerts = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const alerts = await PriceAlert.find({ user: userId }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    logger.error("Error fetching price alerts:", error);
    next(error);
  }
};

// Create price alert
export const createPriceAlert = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { symbol, price, condition, repeatable, notificationMethods } =
      req.body;

    const validationErrors = [];

    if (!symbol) {
      validationErrors.push("Symbol is required");
    }

    if (price === undefined || price === null) {
      validationErrors.push("Price is required");
    } else if (isNaN(price) || price <= 0) {
      validationErrors.push("Price must be a positive number");
    }

    if (!condition) {
      validationErrors.push("Condition is required");
    } else if (!["above", "below"].includes(condition)) {
      validationErrors.push('Condition must be either "above" or "below"');
    }

    if (validationErrors.length > 0) {
      if (!symbol && (price === undefined || price === null) && !condition) {
        throw new ApiError("Symbol, price and condition are required", 400);
      } else {
        throw new ApiError(validationErrors.join(". "), 400);
      }
    }

    // Create alert
    const newAlert = await PriceAlert.create({
      user: userId,
      symbol,
      price,
      condition,
      repeatable: repeatable || false,
      notificationMethods: notificationMethods || {
        app: true,
        email: false,
        sms: false,
      },
    });

    res.status(201).json({
      success: true,
      message: "Price alert created successfully",
      data: newAlert,
    });
  } catch (error) {
    logger.error("Error creating price alert:", error);
    next(error);
  }
};

// Update price alert
export const updatePriceAlert = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const alertId = req.params.id;
    const {
      symbol,
      price,
      condition,
      repeatable,
      active,
      notificationMethods,
    } = req.body;

    // Validate the alert ID
    if (!mongoose.Types.ObjectId.isValid(alertId)) {
      throw new ApiError("Invalid alert ID format", 400);
    }

    const alert = await PriceAlert.findById(alertId);

    if (!alert) {
      throw new ApiError("Price alert not found", 404);
    }

    // Check if alert belongs to user
    if (alert.user.toString() !== userId.toString()) {
      throw new ApiError("Unauthorized access to this alert", 403);
    }

    // Validate fields if provided
    const validationErrors = [];

    if (symbol === "") {
      validationErrors.push("Symbol cannot be empty");
    }

    if (price !== undefined) {
      if (isNaN(price) || price <= 0) {
        validationErrors.push("Price must be a positive number");
      }
    }

    if (condition && !["above", "below"].includes(condition)) {
      validationErrors.push('Condition must be either "above" or "below"');
    }

    // If any validation errors exist, throw an error with all messages
    if (validationErrors.length > 0) {
      throw new ApiError(validationErrors.join(". "), 400);
    }

    // Update fields if provided
    if (symbol) alert.symbol = symbol;
    if (price !== undefined) alert.price = price;
    if (condition) alert.condition = condition;
    if (repeatable !== undefined) alert.repeatable = repeatable;
    if (active !== undefined) alert.active = active;
    if (notificationMethods) alert.notificationMethods = notificationMethods;

    // Reset triggered status if price or condition changed
    if (price !== undefined || condition !== undefined) {
      alert.triggered = false;
      alert.triggeredAt = null;
    }

    try {
      await alert.validate();
    } catch (validationError) {
      const errorMessages = Object.values(validationError.errors).map(
        (err) => err.message,
      );
      throw new ApiError(`Validation failed: ${errorMessages.join(". ")}`, 400);
    }

    await alert.save();

    res.status(200).json({
      success: true,
      message: "Price alert updated successfully",
      data: alert,
    });
  } catch (error) {
    logger.error("Error updating price alert:", error);
    next(error);
  }
};

// Delete price alert
export const deletePriceAlert = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const alertId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(alertId)) {
      throw new ApiError("Invalid alert ID format", 400);
    }

    const alert = await PriceAlert.findById(alertId);

    // Check if alert exists
    if (!alert) {
      throw new ApiError("Price alert not found", 404);
    }

    // Check if alert belongs to user
    if (alert.user.toString() !== userId.toString()) {
      throw new ApiError("Unauthorized access to this alert", 403);
    }

    // Delete alert
    await PriceAlert.findByIdAndDelete(alertId);

    res.status(200).json({
      success: true,
      message: "Price alert deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting price alert:", error);
    next(error);
  }
};

// Check price alerts against current market data
export const checkPriceAlerts = async (marketData) => {
  try {
    // Find all active alerts
    const activeAlerts = await PriceAlert.find({
      active: true,
      triggered: false,
      symbol: { $in: Object.keys(marketData) },
    });

    if (activeAlerts.length === 0) {
      return { processed: 0, triggered: 0 };
    }

    let triggeredCount = 0;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Process each alert
      for (const alert of activeAlerts) {
        const currentPrice = marketData[alert.symbol];

        if (!currentPrice) continue;

        let isTriggered = false;

        // Check if condition is met
        if (alert.condition === "above" && currentPrice >= alert.price) {
          isTriggered = true;
        } else if (alert.condition === "below" && currentPrice <= alert.price) {
          isTriggered = true;
        }

        if (isTriggered) {
          triggeredCount++;

          // Mark as triggered if not repeatable
          if (!alert.repeatable) {
            alert.triggered = true;
            alert.triggeredAt = new Date();
            await alert.save({ session });
          }

          // Get user for notification
          const user = await User.findById(alert.user);
          if (!user) continue;

          // Create in-app notification if enabled
          if (alert.notificationMethods.app) {
            await createAlertNotification(
              user._id,
              alert,
              currentPrice,
              session,
            );
          }

          // Send email notification if enabled
          if (alert.notificationMethods.email) {
            await sendEmailNotification(user, alert, currentPrice);
          }

          // SMS notification would be implemented here if enabled
        }
      }

      await session.commitTransaction();
      logger.info(
        `Processed ${activeAlerts.length} alerts, triggered ${triggeredCount}`,
      );
      return { processed: activeAlerts.length, triggered: triggeredCount };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    logger.error("Error checking price alerts:", error);
    throw error;
  }
};

// Create in-app notification for triggered alert
const createAlertNotification = async (
  userId,
  alert,
  currentPrice,
  session,
) => {
  try {
    const notification = new Notification({
      user: userId,
      type: "price_alert",
      title: `Price Alert: ${alert.symbol}`,
      message: `${alert.symbol} is now ${alert.condition === "above" ? "above" : "below"} your target price of ${alert.price}. Current price: ${currentPrice}`,
      data: {
        symbol: alert.symbol,
        alertId: alert._id,
        condition: alert.condition,
        targetPrice: alert.price,
        currentPrice: currentPrice,
      },
      read: false,
    });

    await notification.save({ session });
    return notification;
  } catch (error) {
    logger.error("Error creating alert notification:", error);
    throw error;
  }
};

// Send email notification for triggered alert
const sendEmailNotification = async (user, alert, currentPrice) => {
  try {
    // Create mail transporter
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // Email content
    const mailOptions = {
      from: `"FFB Alerts" <${process.env.EMAIL_FROM}>`,
      to: user.email,
      subject: `Price Alert: ${alert.symbol} ${alert.condition === "above" ? "Above" : "Below"} ${alert.price}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Price Alert Notification</h2>
          <p>Hello ${user.firstName},</p>
          <p>Your price alert has been triggered:</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Symbol:</strong> ${alert.symbol}</p>
            <p><strong>Condition:</strong> ${alert.condition === "above" ? "Above" : "Below"} ${alert.price}</p>
            <p><strong>Current Price:</strong> ${currentPrice}</p>
            <p><strong>Triggered at:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p>Login to your account to view more details or modify your alerts.</p>
          <p>Thank you for using FFB!</p>
        </div>
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Price alert email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error("Error sending email notification:", error);
    // Continue even if email fails
    return null;
  }
};

export default {
  getUserPriceAlerts,
  createPriceAlert,
  updatePriceAlert,
  deletePriceAlert,
  checkPriceAlerts,
};

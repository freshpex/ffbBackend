import mongoose from "mongoose";
import ShopOrder from "../models/ShopOrder.js";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Task from "../models/Task.js";
import UserTask from "../models/UserTask.js";
import logger from "../middleware/logger.js";

/**
 * Create order from cart
 */
export const createOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (process.env.NODE_ENV !== "production") {
      logger.info(`Shop createOrder request body: ${JSON.stringify(req.body)}`);
    }
    const userId = req.user._id;
    const { shippingAddress, customerNotes, paymentMethod = "balance" } =
      req.body;

    // Validate shipping address
    if (
      !shippingAddress ||
      !shippingAddress.fullName ||
      !shippingAddress.addressLine1 ||
      !shippingAddress.city ||
      !shippingAddress.country
    ) {
      logger.warn(`createOrder validation failed: incomplete shippingAddress for user ${userId}`, { shippingAddress });
      return res.status(400).json({
        success: false,
        message: "Complete shipping address is required",
      });
    }

    // Get user's cart
    const cart = await Cart.findOne({ userId })
      .populate("items.productId")
      .session(session);
    if (!cart || !cart.items || cart.items.length === 0) {
      logger.warn(`createOrder validation failed: cart empty for user ${userId}`, { cart });
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    // Validate all products are in stock
    for (const item of cart.items) {
      if (!item.productId || !item.productId.inStock) {
        logger.warn(`createOrder validation failed: product out of stock. user=${userId} product=${item.productId?._id}`, { item });
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Product "${item.productId?.title || "Unknown"}" is out of stock`,
        });
      }
    }

    // Calculate order totals
    let subtotal = 0;
    const orderItems = cart.items.map((item) => {
      const itemSubtotal = item.productId.price * item.quantity;
      subtotal += itemSubtotal;

      return {
        productId: item.productId._id,
        externalProductId: item.productId.externalId,
        title: item.productId.title,
        thumbnail: item.productId.thumbnail,
        price: item.productId.price,
        quantity: item.quantity,
        subtotal: itemSubtotal,
      };
    });

    const shippingFee = subtotal > 100 ? 0 : 10; // Free shipping over $100
    const tax = subtotal * 0.08; // 8% tax
    const total = subtotal + shippingFee + tax;

    // Get user and check balance
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (paymentMethod === "balance") {
      if (user.balance < total) {
        logger.warn(`createOrder validation failed: insufficient balance for user ${userId}`, { required: total, available: user.balance });
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Insufficient balance. Required: $${total.toFixed(2)}, Available: $${user.balance.toFixed(2)}`,
        });
      }
    }

    // Create order
    // Generate an order number here
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderNumber = `ORD-${timestamp}-${random}`;
    const rewardAmount = total * 2;

    logger.info(`Creating shop order for user ${userId} orderNumber=${orderNumber} total=${total}`);

    const order = await ShopOrder.create(
      [
        {
          userId,
          orderNumber,
          items: orderItems,
          subtotal,
          shippingFee,
          tax,
          total,
          rewardAmount,
          currency: "USD",
          paymentMethod,
          shippingAddress,
          customerNotes,
          status: "pending",
          paymentStatus: "pending",
        },
      ],
      { session },
    );

    // Process payment if using balance
    if (paymentMethod === "balance") {
      const updatedAfterDebit = await User.findByIdAndUpdate(
        userId,
        { $inc: { balance: -total } },
        { session, new: true },
      );

      if (!updatedAfterDebit) {
        await session.abortTransaction();
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Create transaction record for purchase
      await Transaction.create(
        [
          {
            user: userId,
            type: "shop_purchase",
            amount: total,
            currency: "USD",
            status: "completed",
            description: `Shop order ${order[0].orderNumber}`,
            metadata: {
              orderId: order[0]._id,
              orderNumber: order[0].orderNumber,
              itemCount: orderItems.length,
            },
          },
        ],
        { session },
      );

      // Update order payment status
      order[0].paymentStatus = "completed";
      order[0].paidAt = new Date();
      order[0].status = "paid";
      await order[0].save({ session });

      // Credit 200% reward immediately using atomic update
      const credited = await User.findByIdAndUpdate(
        userId,
        { $inc: { balance: rewardAmount } },
        { session, new: true },
      );

      // Create reward transaction
      await Transaction.create(
        [
          {
            user: userId,
            type: "shop_reward",
            amount: rewardAmount,
            currency: "USD",
            status: "completed",
            description: `200% cashback for order ${order[0].orderNumber}`,
            metadata: {
              orderId: order[0]._id,
              orderNumber: order[0].orderNumber,
              orderTotal: total,
              rewardPercentage: 200,
            },
          },
        ],
        { session },
      );

      // Update order reward status
      order[0].rewardStatus = "credited";
      order[0].rewardCreditedAt = new Date();
      await order[0].save({ session });

      // Use the latest user balance for response
      user.balance = credited ? credited.balance : updatedAfterDebit.balance;
    }

    // Update product purchase counts
    for (const item of cart.items) {
      await Product.findByIdAndUpdate(
        item.productId._id,
        { $inc: { purchaseCount: item.quantity } },
        { session },
      );
    }

    // Update shopping-related tasks progress for this user
    try {
      const shoppingTasks = await Task.find({ category: "shopping", isActive: true }).session(session);

      for (const task of shoppingTasks) {
        let userTask = await UserTask.findOne({ user: userId, task: task._id }).session(session);

        if (!userTask) {
          userTask = new UserTask({ user: userId, task: task._id, status: "in_progress", progress: 0, startedAt: new Date() });
        }

        // Determine progress/completion based on task requirements
        const reqs = task.requirements || {};

        let becameCompleted = false;

        // Helper: calculate total quantity ordered in this order
        const orderQuantity = orderItems.reduce((s, it) => s + (it.quantity || 0), 0);

        // 1) minAmount requirement
        if (reqs.minAmount) {
          if (total >= reqs.minAmount) {
            userTask.progress = 100;
            userTask.status = "completed";
            userTask.completedAt = new Date();
            userTask.relatedData = { ...(userTask.relatedData || {}), lastOrderId: order[0]._id };
            becameCompleted = true;
          } else {
            // partial progress relative to required amount
            userTask.progress = Math.min(100, Math.round((total / reqs.minAmount) * 100));
            if (userTask.status !== "in_progress") userTask.status = "in_progress";
          }
        }

        // 2) orderCount requirement (e.g., place N orders)
        if (reqs.orderCount && !becameCompleted) {
          const userOrdersCount = await ShopOrder.countDocuments({ userId, status: { $ne: "cancelled" } }).session(session);
          const progress = Math.min(100, Math.round((userOrdersCount / reqs.orderCount) * 100));
          userTask.progress = Math.max(userTask.progress || 0, progress);
          if (userOrdersCount >= reqs.orderCount) {
            userTask.status = "completed";
            userTask.completedAt = new Date();
            userTask.relatedData = { ...(userTask.relatedData || {}), orderCount: userOrdersCount };
            becameCompleted = true;
          } else {
            if (userTask.status !== "in_progress") userTask.status = "in_progress";
          }
        }

        // 3) minItems requirement
        if (reqs.minItems && !becameCompleted) {
          if (orderQuantity >= reqs.minItems) {
            userTask.progress = 100;
            userTask.status = "completed";
            userTask.completedAt = new Date();
            userTask.relatedData = { ...(userTask.relatedData || {}), lastOrderId: order[0]._id };
            becameCompleted = true;
          } else {
            userTask.progress = Math.min(100, Math.round((orderQuantity / reqs.minItems) * 100));
            if (userTask.status !== "in_progress") userTask.status = "in_progress";
          }
        }

        // 4) first_order requirement
        if (reqs.first_order && !becameCompleted) {
          // Check how many completed orders user had before this order
          const priorOrders = await ShopOrder.countDocuments({ userId, createdAt: { $lt: order[0].createdAt }, status: { $ne: "cancelled" } }).session(session);
          if (priorOrders === 0) {
            userTask.progress = 100;
            userTask.status = "completed";
            userTask.completedAt = new Date();
            userTask.relatedData = { ...(userTask.relatedData || {}), firstOrderId: order[0]._id };
            becameCompleted = true;
          } else {
            userTask.progress = 100; // already had orders before; treat as completed or leave at 100
            userTask.status = "completed";
            userTask.completedAt = new Date();
          }
        }

        // Save or update userTask
        if (becameCompleted) {
          userTask.completionCount = (userTask.completionCount || 0) + 1;
        }

        await userTask.save({ session });
      }
    } catch (taskErr) {
      // If task updating fails, log and continue — do not abort order creation
      console.error("Error updating shopping tasks:", taskErr);
    }
    // Clear cart
    cart.items = [];
    await cart.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: `Order created successfully! You've earned $${(total * 2).toFixed(2)} (200% cashback) credited to your account!`,
      data: {
        order: order[0],
        rewardAmount: total * 2,
        newBalance: user.balance,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error("Error in createOrder:", { message: error.message, stack: error.stack });
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * Get user's orders
 */
export const getUserOrders = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;

    const filter = { userId };
    if (status) {
      filter.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      ShopOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ShopOrder.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        orders,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get order by ID
 */
export const getOrderById = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;

    const order = await ShopOrder.findOne({
      _id: orderId,
      userId,
    }).populate("items.productId");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel order (only if pending or paid, not shipped)
 */
export const cancelOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user._id;
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await ShopOrder.findOne({
      _id: orderId,
      userId,
    }).session(session);

    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order can be cancelled
    if (!["pending", "paid"].includes(order.status)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status: ${order.status}`,
      });
    }

    const user = await User.findById(userId).session(session);

    // Refund if order was paid
    if (order.paymentStatus === "completed") {
      user.balance += order.total;

      // Reverse the reward
      if (order.rewardStatus === "credited") {
        user.balance -= order.rewardAmount;
      }

      await user.save({ session });

      // Create refund transaction
      await Transaction.create(
        [
          {
            user: userId,
            type: "shop_refund",
            amount: order.total,
            currency: "USD",
            status: "completed",
            description: `Refund for cancelled order ${order.orderNumber}`,
            metadata: {
              orderId: order._id,
              orderNumber: order.orderNumber,
              cancellationReason: reason,
            },
          },
        ],
        { session },
      );

      order.paymentStatus = "refunded";
    }

    // Update order
    order.status = "cancelled";
    order.cancelledAt = new Date();
    order.cancellationReason = reason;
    order.cancelledBy = userId;
    order.rewardStatus = "cancelled";

    await order.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: "Order cancelled successfully",
      data: {
        order,
        refundedAmount: order.paymentStatus === "refunded" ? order.total : 0,
        newBalance: user.balance,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

/**
 * Get order statistics
 */
export const getOrderStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const stats = await ShopOrder.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$total" },
          totalRewards: { $sum: "$rewardAmount" },
        },
      },
    ]);

    const totalOrders = await ShopOrder.countDocuments({ userId });
    const totalSpent = await ShopOrder.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), status: { $ne: "cancelled" } } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]);

    const totalRewardsEarned = await ShopOrder.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          rewardStatus: "credited",
        },
      },
      { $group: { _id: null, total: { $sum: "$rewardAmount" } } },
    ]);

    res.json({
      success: true,
      data: {
        totalOrders,
        totalSpent: totalSpent[0]?.total || 0,
        totalRewardsEarned: totalRewardsEarned[0]?.total || 0,
        byStatus: stats,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Admin functions

/**
 * Get all orders (admin)
 */
export const getAllOrders = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20, userId } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      ShopOrder.find(filter)
        .populate("userId", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ShopOrder.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        orders,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update order status (admin)
 */
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status, trackingNumber, carrier, adminNotes } = req.body;

    const order = await ShopOrder.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    order.status = status || order.status;

    if (trackingNumber) order.trackingNumber = trackingNumber;
    if (carrier) order.carrier = carrier;
    if (adminNotes) order.adminNotes = adminNotes;

    if (status === "shipped" && !order.shippedAt) {
      order.shippedAt = new Date();
    }

    if (status === "delivered" && !order.deliveredAt) {
      order.deliveredAt = new Date();
    }

    await order.save();

    res.json({
      success: true,
      message: "Order updated successfully",
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

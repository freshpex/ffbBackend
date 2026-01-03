import Cart from "../models/Cart.js";
import Product from "../models/Product.js";

/**
 * Get user's cart
 */
export const getCart = async (req, res, next) => {
  try {
    const userId = req.user._id;

    let cart = await Cart.findOne({ userId }).populate("items.productId");

    if (!cart) {
      cart = await Cart.create({ userId, items: [] });
    }

    // Calculate totals
    const cartWithTotals = calculateCartTotals(cart);

    res.json({
      success: true,
      data: cartWithTotals,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add item to cart
 */
export const addToCart = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { productId, quantity = 1 } = req.body;

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (!product.inStock) {
      return res.status(400).json({
        success: false,
        message: "Product is out of stock",
      });
    }

    // Find or create cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = await Cart.create({ userId, items: [] });
    }

    // Check if item already in cart
    const existingItemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId,
    );

    if (existingItemIndex > -1) {
      // Update quantity
      cart.items[existingItemIndex].quantity += parseInt(quantity);
    } else {
      // Add new item
      cart.items.push({
        productId,
        quantity: parseInt(quantity),
      });
    }

    await cart.save();
    cart = await cart.populate("items.productId");

    const cartWithTotals = calculateCartTotals(cart);

    res.json({
      success: true,
      message: "Item added to cart",
      data: cartWithTotals,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update cart item quantity
 */
export const updateCartItem = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { productId, quantity } = req.body;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId,
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    if (quantity <= 0) {
      // Remove item if quantity is 0 or negative
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = parseInt(quantity);
    }

    await cart.save();
    await cart.populate("items.productId");

    const cartWithTotals = calculateCartTotals(cart);

    res.json({
      success: true,
      message: "Cart updated",
      data: cartWithTotals,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove item from cart
 */
export const removeFromCart = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    cart.items = cart.items.filter(
      (item) => item.productId.toString() !== productId,
    );

    await cart.save();
    await cart.populate("items.productId");

    const cartWithTotals = calculateCartTotals(cart);

    res.json({
      success: true,
      message: "Item removed from cart",
      data: cartWithTotals,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear cart
 */
export const clearCart = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    cart.items = [];
    await cart.save();

    res.json({
      success: true,
      message: "Cart cleared",
      data: cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Calculate cart totals
 */
function calculateCartTotals(cart) {
  let subtotal = 0;
  let itemCount = 0;

  const itemsWithTotals = cart.items.map((item) => {
    const product = item.productId;
    const itemTotal = product ? product.price * item.quantity : 0;
    subtotal += itemTotal;
    itemCount += item.quantity;

    return {
      ...item.toObject(),
      itemTotal,
    };
  });

  const shippingFee = subtotal > 100 ? 0 : 10; // Free shipping over $100
  const tax = subtotal * 0.08; // 8% tax
  const total = subtotal + shippingFee + tax;

  // Calculate potential reward (200% cashback)
  const potentialReward = total * 2;

  return {
    ...cart.toObject(),
    items: itemsWithTotals,
    summary: {
      itemCount,
      subtotal: parseFloat(subtotal.toFixed(2)),
      shippingFee: parseFloat(shippingFee.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      potentialReward: parseFloat(potentialReward.toFixed(2)),
    },
  };
}

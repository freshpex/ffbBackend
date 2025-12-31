// Utility helpers for calculating portfolio positions from filled orders.
// Keeps controller logic small and makes behavior testable.

export const toFiniteNumber = (value) => {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

const getOrderTimestampMs = (order) => {
  const t = order?.processedAt || order?.updatedAt || order?.createdAt;
  const ms = t instanceof Date ? t.getTime() : Date.parse(t);
  return Number.isFinite(ms) ? ms : 0;
};

const normalizeExecutedQuantity = (order) => {
  const executed = toFiniteNumber(order?.executedQuantity);
  if (executed && executed > 0) return executed;

  // Repair: if an order is marked filled but executedQuantity was not stored,
  // we can fall back to the requested quantity.
  const qty = toFiniteNumber(order?.quantity);
  return qty && qty > 0 ? qty : null;
};

const normalizeExecutionPrice = (order, executedQty) => {
  const executionPrice = toFiniteNumber(order?.executionPrice);
  if (executionPrice && executionPrice > 0) return executionPrice;

  // Repair: for filled limit orders, `price` is the best available cost basis.
  const limitPrice = toFiniteNumber(order?.price);
  if (limitPrice && limitPrice > 0) return limitPrice;

  // If total is present, derive an average execution price.
  const total = toFiniteNumber(order?.total);
  if (total && total > 0 && executedQty && executedQty > 0) {
    const derived = total / executedQty;
    return Number.isFinite(derived) && derived > 0 ? derived : null;
  }

  return null;
};

export const calculatePositionsFromFilledOrders = (filledOrders) => {
  const warnings = [];
  const patches = [];
  const positionsBySymbol = {};

  const orders = Array.isArray(filledOrders) ? [...filledOrders] : [];
  orders.sort((a, b) => getOrderTimestampMs(a) - getOrderTimestampMs(b));

  for (const order of orders) {
    const symbol = order?.symbol;
    const side = order?.side;
    if (!symbol || (side !== 'buy' && side !== 'sell')) {
      warnings.push({
        type: 'invalid_order',
        orderId: order?._id?.toString?.() ?? String(order?._id ?? ''),
        message: 'Order missing symbol or side'
      });
      continue;
    }

    const executedQty = normalizeExecutedQuantity(order);
    if (!executedQty || executedQty <= 0) {
      warnings.push({
        type: 'invalid_order',
        orderId: order?._id?.toString?.() ?? String(order?._id ?? ''),
        symbol,
        message: 'Order has no executed quantity'
      });
      continue;
    }

    const execPrice = normalizeExecutionPrice(order, executedQty);
    if (!execPrice || execPrice <= 0) {
      warnings.push({
        type: 'invalid_order',
        orderId: order?._id?.toString?.() ?? String(order?._id ?? ''),
        symbol,
        message: 'Order has no execution price'
      });
      continue;
    }

    // If the database order is missing these values, record a patch to self-heal.
    if (toFiniteNumber(order?.executedQuantity) !== executedQty) {
      patches.push({
        updateOne: {
          filter: { _id: order._id },
          update: { $set: { executedQuantity: executedQty } }
        }
      });
    }
    if (toFiniteNumber(order?.executionPrice) !== execPrice) {
      patches.push({
        updateOne: {
          filter: { _id: order._id },
          update: { $set: { executionPrice: execPrice } }
        }
      });
    }

    if (!positionsBySymbol[symbol]) {
      positionsBySymbol[symbol] = {
        symbol,
        quantity: 0,
        totalInvested: 0,
        lastTradeTimestamp: null,
      };
    }

    const position = positionsBySymbol[symbol];
    const fee = toFiniteNumber(order?.fee) ?? 0;

    const orderTime = getOrderTimestampMs(order);
    if (!position.lastTradeTimestamp || position.lastTradeTimestamp < orderTime) {
      position.lastTradeTimestamp = orderTime;
    }

    if (side === 'buy') {
      position.quantity += executedQty;
      position.totalInvested += executedQty * execPrice + fee;
      continue;
    }

    // side === 'sell'
    if (position.quantity <= 0 || position.totalInvested <= 0) {
      warnings.push({
        type: 'position_inconsistency',
        symbol,
        message: 'Sell encountered before any valid buys; ignoring sell for cost basis'
      });
      continue;
    }

    if (executedQty > position.quantity) {
      warnings.push({
        type: 'position_inconsistency',
        symbol,
        message: `Sell quantity (${executedQty}) exceeds position quantity (${position.quantity}); closing position`
      });
      position.quantity = 0;
      position.totalInvested = 0;
      continue;
    }

    const avgCostBeforeSell = position.totalInvested / position.quantity;
    const costReduction = avgCostBeforeSell * executedQty;

    position.quantity -= executedQty;
    position.totalInvested -= costReduction;

    // Floating-point cleanup
    if (position.quantity < 1e-12) {
      position.quantity = 0;
      position.totalInvested = 0;
    }

    if (position.totalInvested < 0) {
      warnings.push({
        type: 'position_inconsistency',
        symbol,
        message: 'Cost basis became negative after sell; clamping to zero'
      });
      position.totalInvested = 0;
    }
  }

  const positions = Object.values(positionsBySymbol).filter(
    (p) => toFiniteNumber(p.quantity) && p.quantity > 0
  );

  return { positions, warnings, patches };
};

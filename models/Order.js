import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    symbol: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['market', 'limit', 'stop_loss', 'take_profit'],
      required: true,
    },
    side: {
      type: String,
      enum: ['buy', 'sell'],
      required: true,
    },
    price: {
      type: Number,
    },
    stopPrice: {
      type: Number,
    },
    quantity: {
      type: Number,
      required: true,
    },
    executedQuantity: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['new', 'filled', 'partially_filled', 'canceled', 'rejected', 'expired'],
      default: 'new',
    },
    timeInForce: {
      type: String,
      enum: ['GTC', 'IOC', 'FOK'],
      default: 'GTC',
    },
    isIsolated: {
      type: Boolean,
      default: false,
    },
    fees: {
      type: Number,
      default: 0,
    },
    feesCurrency: {
      type: String,
      default: 'BNB',
    },
    externalOrderId: String,
    txHash: String,
  },
  { timestamps: true }
);

export default mongoose.model('Order', OrderSchema);

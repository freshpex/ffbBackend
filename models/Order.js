import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['market', 'limit', 'stop', 'stop_limit'],
    default: 'market'
  },
  side: {
    type: String,
    enum: ['buy', 'sell'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  price: {
    type: Number
  },
  stopPrice: {
    type: Number
  },
  status: {
    type: String,
    enum: ['new', 'partially_filled', 'filled', 'canceled', 'rejected', 'expired'],
    default: 'new'
  },
  filledQuantity: {
    type: Number,
    default: 0
  },
  averagePrice: {
    type: Number
  },
  totalFilled: {
    type: Number,
    default: 0
  },
  commission: {
    type: Number,
    default: 0
  },
  clientOrderId: {
    type: String
  },
  exchange: {
    type: String,
    default: 'binance'
  },
  metadata: {
    type: Object
  }
}, {
  timestamps: true
});

const Order = mongoose.model('Order', orderSchema);

export default Order;

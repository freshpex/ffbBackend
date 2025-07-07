import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import TradingController from "../controllers/TradingController.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(verifyToken);

// Market data endpoints
router.get("/market/price", asyncHandler(TradingController.getMarketPrice));
router.get("/market/prices", asyncHandler(TradingController.getAllMarketPrices));
router.get("/market/orderbook/:baseAsset/:quoteAsset", asyncHandler(TradingController.getOrderbook));
router.get("/market/orderbook", asyncHandler(TradingController.getOrderbook));
router.get("/market/candlesticks", asyncHandler(TradingController.getCandlesticks));
router.get("/market/pairs", asyncHandler(TradingController.getTradingPairs));
router.get("/market/trades", asyncHandler(TradingController.getRecentTrades));

// Order endpoints
router.post("/orders", asyncHandler(TradingController.placeOrder));
router.get("/orders", asyncHandler(TradingController.getUserOrders));
router.get("/orders/:id", asyncHandler(TradingController.getOrderById));
router.delete("/orders/:id", asyncHandler(TradingController.cancelOrder));

// Portfolio endpoints
router.get("/positions", asyncHandler(TradingController.getUserPositions));

export default router;
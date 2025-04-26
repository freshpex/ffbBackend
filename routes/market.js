import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import marketController from '../controllers/MarketController.js';

const router = express.Router();

// Get current price for a symbol
router.get('/price', asyncHandler(marketController.getCurrentPrice));

router.get('/data', asyncHandler(marketController.getMarketData));

// Get historical price data for charts
router.get('/history', asyncHandler(marketController.getHistoricalPrices));

// Get klines (candlesticks) for charts - Added for TradingDashboard
router.get('/klines', asyncHandler(marketController.getHistoricalPrices));

// Get order book for a symbol
router.get('/orderbook', asyncHandler(marketController.getOrderBook));

// Get recent trades for a symbol
router.get('/trades', asyncHandler(marketController.getRecentTrades));

// Get top cryptocurrencies
router.get('/top-crypto', asyncHandler(marketController.getTopCryptocurrencies));

// Get forex rates
router.get('/forex-rates', asyncHandler(marketController.getForexRates));

// Search for tradeable symbols
router.get('/search', asyncHandler(marketController.searchSymbols));

// Get available data sources
router.get('/sources', asyncHandler(marketController.getAvailableDataSources));

export default router;

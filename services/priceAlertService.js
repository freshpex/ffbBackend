import axios from "axios";
import PriceAlertController from "../controllers/PriceAlertController.js";
import logger from "../middleware/logger.js";
import config from "../config/config.js";

class PriceAlertService {
  constructor() {
    this.isRunning = false;
    this.checkInterval = null;
    this.marketData = {};
    this.initialized = false;
  }

  /**
   * Start the price alert checking service
   * @param {number} interval - Interval in milliseconds between price checks
   */
  start(interval = 60000) {
    // Default check interval: 1 minute
    if (this.isRunning) {
      logger.warn("Price alert service is already running");
      return false;
    }

    logger.info(
      `Starting price alert checking service with interval: ${interval}ms`,
    );
    this.isRunning = true;
    this.initialized = true;

    // Run an immediate check
    this.checkAlerts().catch((err) => {
      logger.error("Error in initial price alert check:", err);
    });

    // Set interval for future checks
    this.checkInterval = setInterval(() => {
      this.checkAlerts().catch((err) => {
        logger.error("Error in scheduled price alert check:", err);
      });
    }, interval);

    return true;
  }

  /**
   * Stop the price alert checking service
   */
  stop() {
    if (!this.isRunning) {
      logger.warn("Price alert service is not running");
      return false;
    }

    clearInterval(this.checkInterval);
    this.checkInterval = null;
    this.isRunning = false;
    logger.info("Price alert checking service stopped");
    return true;
  }

  /**
   * Fetch current market prices for relevant symbols
   */
  async fetchMarketPrices() {
    try {
      // You can replace this with your preferred price data source
      // Example using CryptoCompare API
      const apiKey = config.crypto?.cryptocompareApiKey;

      // Get unique symbols from active price alerts
      const response = await axios.get(
        "https://min-api.cryptocompare.com/data/pricemulti",
        {
          params: {
            fsyms: "BTC,ETH,BNB,SOL,ADA,DOT,DOGE,XRP,AVAX,MATIC", // Default common symbols
            tsyms: "USD",
            api_key: apiKey || "", // Fallback to empty string if no API key
          },
          timeout: 10000, // 10 second timeout
        },
      );

      // Process response
      if (response.data && !response.data.Response) {
        // Transform data to our format
        const prices = {};
        for (const symbol in response.data) {
          prices[symbol] = response.data[symbol].USD;
        }
        this.marketData = prices;
        return prices;
      } else {
        throw new Error("Invalid response from price API");
      }
    } catch (error) {
      logger.error("Error fetching market prices:", error.message);
      return {};
    }
  }

  /**
   * Check all active price alerts against current market data
   */
  async checkAlerts() {
    try {
      // Fetch latest prices
      const marketData = await this.fetchMarketPrices();

      // Skip if no price data available
      if (Object.keys(marketData).length === 0) {
        logger.warn("No market data available, skipping price alert check");
        return;
      }

      // Process all active alerts
      const result = await PriceAlertController.checkPriceAlerts(marketData);
      logger.info(
        `Price alert check completed: ${result.processed} processed, ${result.triggered} triggered`,
      );
    } catch (error) {
      logger.error("Error during price alert check:", error);
      throw error; // Re-throw to be caught by the caller
    }
  }
}

// Create singleton instance
const priceAlertService = new PriceAlertService();

export default priceAlertService;

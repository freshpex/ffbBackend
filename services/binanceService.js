import axios from "axios";
import crypto from "crypto";
import logger from "../middleware/logger.js";
import config from "../config/config.js";

const getMockPriceForSymbol = (symbol) => {
  const normalized = (symbol || "").replace("/", "").toUpperCase();
  const baseAsset = normalized.replace("USDT", "").replace("USD", "");

  const basePrices = {
    BTC: 108000,
    ETH: 3200,
    BNB: 410,
    SOL: 100,
    XRP: 0.5,
    ADA: 0.45,
    DOT: 6.8,
    DOGE: 0.14,
    AVAX: 28,
    MATIC: 0.8,
  };

  const base = basePrices[baseAsset] ?? 100;
  const variance = base * 0.01; // ±1%
  const randomFactor = (Math.random() * 2 - 1) * variance;
  return base + randomFactor;
};

const formatSymbol = (symbol) => (symbol || "").replace("/", "").toUpperCase();

/**
 * Binance service for market data and trading
 */
const binanceService = {
  /**
   * True when API keys exist for signed endpoints (orders/account)
   */
  isConfigured: () => {
    return !!process.env.BINANCE_API_KEY && !!process.env.BINANCE_API_SECRET;
  },

  /**
   * Public request (no auth required). Always uses mainnet baseUrl for market data.
   */
  makePublicRequest: async (path, params = {}) => {
    const baseUrl = config.binance.baseUrl;
    const url = `${baseUrl}${path}`;

    try {
      const response = await axios.get(url, {
        params,
        timeout: 5000,
      });
      return response.data;
    } catch (error) {
      logger.error(`Error making public request to ${path}:`, {
        message: error?.message,
        code: error?.code,
        status: error?.response?.status,
        data: error?.response?.data,
        params,
      });
      throw new Error(`Binance API Error: ${error?.response?.data?.msg || error?.message}`);
    }
  },

  /**
   * Signed request (requires API key + secret).
   */
  makeAuthenticatedRequest: async (method, path, params = {}) => {
    try {
      if (!binanceService.isConfigured()) {
        throw new Error("Binance API is not configured");
      }

      const timestamp = Date.now();
      const queryParams = {
        ...params,
        timestamp,
      };

      const queryString = Object.keys(queryParams)
        .map((key) => `${key}=${queryParams[key]}`)
        .join("&");

      const signature = crypto
        .createHmac("sha256", process.env.BINANCE_API_SECRET)
        .update(queryString)
        .digest("hex");

      const signedParams = { ...queryParams, signature };

      const baseUrl = config.binance.useTestnet
        ? config.binance.testnetUrl
        : config.binance.baseUrl;

      const url = `${baseUrl}${path}`;
      const headers = { "X-MBX-APIKEY": process.env.BINANCE_API_KEY };

      if (method === "GET") {
        const response = await axios.get(url, {
          params: signedParams,
          headers,
          timeout: 10000,
        });
        return response.data;
      }

      if (method === "POST") {
        const response = await axios.post(url, null, {
          params: signedParams,
          headers,
          timeout: 10000,
        });
        return response.data;
      }

      if (method === "DELETE") {
        const response = await axios.delete(url, {
          params: signedParams,
          headers,
          timeout: 10000,
        });
        return response.data;
      }

      throw new Error(`Unsupported HTTP method: ${method}`);
    } catch (error) {
      logger.error(`Error making authenticated request to ${path}:`, {
        message: error?.message,
        code: error?.code,
        status: error?.response?.status,
        data: error?.response?.data,
        params,
      });
      throw new Error(`Binance API Error: ${error?.response?.data?.msg || error?.message}`);
    }
  },

  getPrice: async (symbol) => {
    const formattedSymbol = formatSymbol(symbol);
    return binanceService.makePublicRequest("/api/v3/ticker/price", {
      symbol: formattedSymbol,
    });
  },

  getDepth: async (symbol, limit = 100) => {
    const formattedSymbol = formatSymbol(symbol);
    return binanceService.makePublicRequest("/api/v3/depth", {
      symbol: formattedSymbol,
      limit,
    });
  },

  getKlines: async ({ symbol, interval = "1h", limit = 500, startTime, endTime }) => {
    const formattedSymbol = formatSymbol(symbol);
    const params = { symbol: formattedSymbol, interval, limit };
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;
    return binanceService.makePublicRequest("/api/v3/klines", params);
  },

  getExchangeInfo: async () => {
    return binanceService.makePublicRequest("/api/v3/exchangeInfo", {});
  },

  getTrades: async (symbol, limit = 50) => {
    const formattedSymbol = formatSymbol(symbol);
    return binanceService.makePublicRequest("/api/v3/trades", { symbol: formattedSymbol, limit });
  },

  getAccountInfo: async () => {
    return binanceService.makeAuthenticatedRequest("GET", "/api/v3/account", {});
  },

  createOrder: async (orderParams) => {
    try {
      if (!orderParams || !orderParams.symbol) {
        throw new Error("Invalid order parameters: symbol is required");
      }

      const formatted = { ...orderParams, symbol: formatSymbol(orderParams.symbol) };

      if (typeof formatted.quantity === "number") {
        formatted.quantity = formatted.quantity.toString();
      }

      if (formatted.price && typeof formatted.price === "number") {
        formatted.price = formatted.price.toString();
      }

      return await binanceService.makeAuthenticatedRequest("POST", "/api/v3/order", formatted);
    } catch (error) {
      // Only allow mock order creation when mock mode is explicitly enabled.
      if (config.marketData?.useMockData) {
        logger.warn(`Using mock order creation for ${orderParams?.symbol || "unknown"}: ${error.message}`);
        return {
          symbol: formatSymbol(orderParams?.symbol || "BTCUSDT"),
          orderId: Math.floor(Math.random() * 1000000000),
          clientOrderId: `mock_${Date.now()}`,
          transactTime: Date.now(),
          price: orderParams?.price ? String(orderParams.price) : "0.00",
          origQty: orderParams?.quantity ? String(orderParams.quantity) : "0.00",
          executedQty: "0.00",
          cummulativeQuoteQty: "0.00",
          status: "NEW",
          timeInForce: orderParams?.timeInForce || "GTC",
          type: orderParams?.type || "LIMIT",
          side: orderParams?.side || "BUY",
          fills: [],
          mockPrice: getMockPriceForSymbol(orderParams?.symbol || "BTCUSDT").toFixed(2),
        };
      }

      throw error;
    }
  },

  cancelOrder: async (symbol, orderId) => {
    return binanceService.makeAuthenticatedRequest("DELETE", "/api/v3/order", {
      symbol: formatSymbol(symbol),
      orderId,
    });
  },

  getOpenOrders: async (symbol) => {
    const params = symbol ? { symbol: formatSymbol(symbol) } : {};
    return binanceService.makeAuthenticatedRequest("GET", "/api/v3/openOrders", params);
  },

  getOrder: async (symbol, orderId) => {
    return binanceService.makeAuthenticatedRequest("GET", "/api/v3/order", {
      symbol: formatSymbol(symbol),
      orderId,
    });
  },

  getAllOrders: async (symbol, limit = 500) => {
    return binanceService.makeAuthenticatedRequest("GET", "/api/v3/allOrders", {
      symbol: formatSymbol(symbol),
      limit,
    });
  },
};

export default binanceService;

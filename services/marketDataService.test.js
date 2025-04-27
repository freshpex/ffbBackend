import marketDataService from "./marketDataService.js";
import binanceService from "./binanceService.js";
import alphaVantageService from "./alphaVantageService.js";
import cryptoCompareService from "./cryptoCompareService.js";

// Mock the dependencies
jest.mock("./binanceService.js");
jest.mock("./alphaVantageService.js");
jest.mock("./cryptoCompareService.js");
jest.mock("../middleware/logger.js", () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

describe("marketDataService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getCurrentPrice", () => {
    test("should get price for crypto symbol from Binance", async () => {
      binanceService.getTickerPrice.mockResolvedValue({ price: "45000.50" });

      const result = await marketDataService.getCurrentPrice("BTCUSDT");

      expect(binanceService.getTickerPrice).toHaveBeenCalledWith("BTCUSDT");
      expect(result).toEqual({
        symbol: "BTCUSDT",
        price: 45000.5,
        source: "binance",
        timestamp: expect.any(Number),
      });
    });

    test("should fallback to CryptoCompare when Binance fails", async () => {
      binanceService.getTickerPrice.mockRejectedValue(new Error("API error"));
      cryptoCompareService.getPrice.mockResolvedValue({ USD: 45000.5 });

      const result = await marketDataService.getCurrentPrice("BTCUSDT");

      expect(binanceService.getTickerPrice).toHaveBeenCalledWith("BTCUSDT");
      expect(cryptoCompareService.getPrice).toHaveBeenCalledWith("BTC", "USD");
      expect(result).toEqual({
        symbol: "BTCUSDT",
        price: 45000.5,
        source: "cryptocompare",
        timestamp: expect.any(Number),
      });
    });

    test("should get price for stock symbol from AlphaVantage", async () => {
      alphaVantageService.getQuote.mockResolvedValue({ price: 150.75 });

      const result = await marketDataService.getCurrentPrice("AAPL");

      expect(alphaVantageService.getQuote).toHaveBeenCalledWith("AAPL");
      expect(result).toEqual({
        symbol: "AAPL",
        price: 150.75,
        source: "alphavantage",
        timestamp: expect.any(Number),
      });
    });

    test("should throw error when all services fail", async () => {
      binanceService.getTickerPrice.mockRejectedValue(
        new Error("Binance API error"),
      );
      cryptoCompareService.getPrice.mockRejectedValue(
        new Error("CryptoCompare API error"),
      );

      await expect(
        marketDataService.getCurrentPrice("BTCUSDT"),
      ).rejects.toThrow("Could not fetch price for BTCUSDT");
    });
  });

  describe("getMarketData", () => {
    test("should get data for multiple symbols", async () => {
      binanceService.getTickerPrice.mockResolvedValue({ price: "45000.50" });
      alphaVantageService.getQuote.mockResolvedValue({ price: 150.75 });

      const result = await marketDataService.getMarketData(["BTCUSDT", "AAPL"]);

      expect(result).toEqual({
        BTCUSDT: {
          symbol: "BTCUSDT",
          price: 45000.5,
          source: "binance",
          timestamp: expect.any(Number),
        },
        AAPL: {
          symbol: "AAPL",
          price: 150.75,
          source: "alphavantage",
          timestamp: expect.any(Number),
        },
      });
    });

    test("should use default symbols when none provided", async () => {
      binanceService.getTickerPrice.mockResolvedValue({ price: "45000.50" });

      await marketDataService.getMarketData();

      expect(binanceService.getTickerPrice).toHaveBeenCalledTimes(6); // Default has 6 symbols
    });

    test("should handle errors for individual symbols", async () => {
      binanceService.getTickerPrice.mockResolvedValueOnce({
        price: "45000.50",
      });
      binanceService.getTickerPrice.mockRejectedValueOnce(
        new Error("API error"),
      );
      cryptoCompareService.getPrice.mockRejectedValueOnce(
        new Error("API error"),
      );

      const result = await marketDataService.getMarketData([
        "BTCUSDT",
        "ETHUSDT",
      ]);

      expect(result.BTCUSDT).toHaveProperty("price");
      expect(result.ETHUSDT).toHaveProperty("error");
    });
  });

  describe("getOHLCV", () => {
    test("should get OHLCV data for crypto from Binance", async () => {
      binanceService.getKlines.mockResolvedValue([
        [1625097600000, "35000", "36000", "34500", "35800", "1000"],
      ]);

      const result = await marketDataService.getOHLCV({
        symbol: "BTCUSDT",
        interval: "1h",
        limit: 10,
      });

      expect(binanceService.getKlines).toHaveBeenCalledWith({
        symbol: "BTCUSDT",
        interval: "1h",
        limit: 10,
      });
      expect(result).toEqual([
        {
          timestamp: 1625097600000,
          open: 35000,
          high: 36000,
          low: 34500,
          close: 35800,
          volume: 1000,
        },
      ]);
    });

    test("should fallback to CryptoCompare when Binance fails", async () => {
      binanceService.getKlines.mockRejectedValue(new Error("API error"));
      cryptoCompareService.getHistoricalDailyData.mockResolvedValue([
        {
          time: 1625097600,
          open: 35000,
          high: 36000,
          low: 34500,
          close: 35800,
          volumeto: 1000,
        },
      ]);

      const result = await marketDataService.getOHLCV({
        symbol: "BTCUSDT",
        interval: "1h",
        limit: 10,
      });

      expect(cryptoCompareService.getHistoricalDailyData).toHaveBeenCalledWith(
        "BTC",
        "USD",
        10,
      );
      expect(result[0]).toEqual({
        timestamp: 1625097600000,
        open: 35000,
        high: 36000,
        low: 34500,
        close: 35800,
        volume: 1000,
      });
    });

    test("should get OHLCV data for stocks from AlphaVantage", async () => {
      alphaVantageService.getTimeSeries.mockResolvedValue([
        {
          date: "2023-01-01",
          open: "150",
          high: "155",
          low: "148",
          close: "152",
          volume: "1000000",
        },
      ]);

      const result = await marketDataService.getOHLCV({
        symbol: "AAPL",
        interval: "1d",
        limit: 10,
      });

      expect(alphaVantageService.getTimeSeries).toHaveBeenCalledWith(
        "AAPL",
        "daily",
        10,
      );
      expect(result[0]).toHaveProperty("timestamp");
      expect(result[0].open).toBe(150);
    });
  });

  describe("getOrderBook", () => {
    test("should get order book for crypto symbol", async () => {
      binanceService.getDepth.mockResolvedValue({
        bids: [
          ["35000", "0.5"],
          ["34900", "1.2"],
        ],
        asks: [
          ["35100", "0.3"],
          ["35200", "0.8"],
        ],
      });

      const result = await marketDataService.getOrderBook("BTCUSDT", 5);

      expect(binanceService.getDepth).toHaveBeenCalledWith("BTCUSDT", 5);
      expect(result).toEqual({
        symbol: "BTCUSDT",
        timestamp: expect.any(Number),
        bids: [
          [35000, 0.5],
          [34900, 1.2],
        ],
        asks: [
          [35100, 0.3],
          [35200, 0.8],
        ],
      });
    });

    test("should throw error for non-crypto symbols", async () => {
      await expect(marketDataService.getOrderBook("AAPL")).rejects.toThrow(
        "Order book unavailable for AAPL",
      );
    });
  });

  describe("getMarketStats", () => {
    test("should get market stats for crypto from Binance", async () => {
      binanceService.get24hrTicker.mockResolvedValue({
        symbol: "BTCUSDT",
        priceChange: "1000",
        priceChangePercent: "2.5",
        lastPrice: "41000",
        highPrice: "42000",
        lowPrice: "40000",
        volume: "1000",
        quoteVolume: "41000000",
        closeTime: 1625097600000,
      });

      const result = await marketDataService.getMarketStats("BTCUSDT");

      expect(binanceService.get24hrTicker).toHaveBeenCalledWith("BTCUSDT");
      expect(result.symbol).toBe("BTCUSDT");
      expect(result.priceChange).toBe(1000);
    });

    test("should get market stats for stocks from AlphaVantage", async () => {
      alphaVantageService.getQuote.mockResolvedValue({
        price: 150,
        previousClose: 145,
        high: 152,
        low: 148,
        volume: 10000000,
      });

      const result = await marketDataService.getMarketStats("AAPL");

      expect(alphaVantageService.getQuote).toHaveBeenCalledWith("AAPL");
      expect(result.symbol).toBe("AAPL");
      expect(result.priceChange).toBe(5);
    });
  });
});

import axios from "axios";
import crypto from "crypto";
import binanceService from "./binanceService.js";

jest.mock("axios");
jest.mock("crypto");
jest.mock("../middleware/logger.js", () => ({
  error: jest.fn(),
  info: jest.fn(),
}));

// Mock environment variables
const originalEnv = process.env;
beforeEach(() => {
  jest.resetAllMocks();
  process.env = {
    ...originalEnv,
    BINANCE_API_KEY: "test-api-key",
    BINANCE_API_SECRET: "test-api-secret",
    BINANCE_API_URL: "https://test.binance.com/api/v3",
  };
});

afterEach(() => {
  process.env = originalEnv;
});

describe("Utility functions", () => {
  test("isConfigured returns true when API keys are set", () => {
    expect(binanceService.isConfigured()).toBe(true);
  });

  test("isConfigured returns false when API keys are not set", () => {
    delete process.env.BINANCE_API_KEY;
    delete process.env.BINANCE_API_SECRET;
    expect(binanceService.isConfigured()).toBe(false);
  });
});

describe("Public API methods", () => {
  test("get24hrTicker returns ticker data for a symbol", async () => {
    const mockResponse = { price: "50000", volume: "100" };
    axios.get.mockResolvedValue({ data: mockResponse });

    const result = await binanceService.get24hrTicker("BTCUSDT");
    expect(result).toEqual(mockResponse);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/ticker/24hr?symbol=BTCUSDT"),
      expect.any(Object),
    );
  });

  test("getTickerPrice returns price data for a symbol", async () => {
    const mockResponse = { price: "50000" };
    axios.get.mockResolvedValue({ data: mockResponse });

    const result = await binanceService.getTickerPrice("BTCUSDT");
    expect(result).toEqual(mockResponse);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/ticker/price?symbol=BTCUSDT"),
      expect.any(Object),
    );
  });

  test("getKlines returns kline data with required parameters", async () => {
    const mockResponse = [
      [1617667200000, "56000", "58000", "55900", "57500", "1000"],
    ];
    axios.get.mockResolvedValue({ data: mockResponse });

    const result = await binanceService.getKlines({
      symbol: "BTCUSDT",
      interval: "1h",
      limit: 10,
    });
    expect(result).toEqual(mockResponse);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/klines?symbol=BTCUSDT&interval=1h&limit=10"),
      expect.any(Object),
    );
  });

  test("getExchangeInfo returns exchange information", async () => {
    const mockResponse = { timezone: "UTC", serverTime: 1617667200000 };
    axios.get.mockResolvedValue({ data: mockResponse });

    const result = await binanceService.getExchangeInfo();
    expect(result).toEqual(mockResponse);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/exchangeInfo"),
      expect.any(Object),
    );
  });

  test("getDepth returns order book data for a symbol", async () => {
    const mockResponse = { bids: [], asks: [] };
    axios.get.mockResolvedValue({ data: mockResponse });

    const result = await binanceService.getDepth("BTCUSDT", 10);
    expect(result).toEqual(mockResponse);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/depth?symbol=BTCUSDT&limit=10"),
      expect.any(Object),
    );
  });

  test("getTrades returns recent trades for a symbol", async () => {
    const mockResponse = [{ id: 1, price: "50000", qty: "0.1" }];
    axios.get.mockResolvedValue({ data: mockResponse });

    const result = await binanceService.getTrades("BTCUSDT", 5);
    expect(result).toEqual(mockResponse);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/trades?symbol=BTCUSDT&limit=5"),
      expect.any(Object),
    );
  });

  test("makePublicRequest handles API errors properly", async () => {
    const mockError = {
      response: { data: { msg: "Invalid symbol" } },
      message: "Request failed with status code 400",
    };
    axios.get.mockRejectedValue(mockError);

    await expect(binanceService.getTickerPrice("INVALID")).rejects.toThrow(
      "Binance API Error: Invalid symbol",
    );
  });
});

describe("Authenticated API methods", () => {
  beforeEach(() => {
    // Mock the HMAC function for signature
    crypto.createHmac = jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue("mocked-signature"),
    }));
  });

  test("getAccountInfo returns account data", async () => {
    const mockResponse = {
      makerCommission: 10,
      takerCommission: 10,
      balances: [],
    };
    axios.get.mockResolvedValue({ data: mockResponse });

    const result = await binanceService.getAccountInfo();
    expect(result).toEqual(mockResponse);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/account?"),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-MBX-APIKEY": "test-api-key" }),
      }),
    );
  });

  test("placeOrder creates a new order correctly", async () => {
    const mockResponse = { orderId: 1234, symbol: "BTCUSDT", status: "NEW" };
    axios.post.mockResolvedValue({ data: mockResponse });

    const orderParams = {
      symbol: "BTCUSDT",
      side: "buy",
      type: "LIMIT",
      quantity: 0.1,
      price: 50000,
    };

    const result = await binanceService.placeOrder(orderParams);
    expect(result).toEqual(mockResponse);
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/order"),
      expect.stringContaining(
        "symbol=BTCUSDT&side=BUY&type=LIMIT&quantity=0.1&price=50000",
      ),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-MBX-APIKEY": "test-api-key" }),
      }),
    );
  });

  test("cancelOrder cancels an existing order", async () => {
    const mockResponse = {
      orderId: 1234,
      symbol: "BTCUSDT",
      status: "CANCELED",
    };
    axios.delete.mockResolvedValue({ data: mockResponse });

    const result = await binanceService.cancelOrder("BTCUSDT", 1234);
    expect(result).toEqual(mockResponse);
    expect(axios.delete).toHaveBeenCalledWith(
      expect.stringContaining("/order"),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-MBX-APIKEY": "test-api-key" }),
        params: expect.objectContaining({ symbol: "BTCUSDT", orderId: 1234 }),
      }),
    );
  });

  test("getOpenOrders returns all open orders", async () => {
    const mockResponse = [{ orderId: 1234, symbol: "BTCUSDT", status: "NEW" }];
    axios.get.mockResolvedValue({ data: mockResponse });

    const result = await binanceService.getOpenOrders("BTCUSDT");
    expect(result).toEqual(mockResponse);
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining("/openOrders?symbol=BTCUSDT"),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-MBX-APIKEY": "test-api-key" }),
      }),
    );
  });

  test("makeAuthenticatedRequest handles API errors properly", async () => {
    const mockError = {
      response: { data: { msg: "Invalid API key" } },
      message: "Request failed with status code 401",
    };
    axios.get.mockRejectedValue(mockError);

    await expect(binanceService.getAccountInfo()).rejects.toThrow(
      "Binance API Error: Invalid API key",
    );
  });
});

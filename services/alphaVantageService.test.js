import axios from "axios";
import alphaVantageService from "./alphaVantageService.js";
import logger from "../middleware/logger.js";

// Mock axios and logger
jest.mock("axios");
jest.mock("../middleware/logger.js", () => ({
  error: jest.fn(),
  warn: jest.fn(),
}));

describe("Alpha Vantage Service", () => {
  const mockApiKey = "test-api-key";
  const originalEnv = process.env;

  beforeEach(() => {
    process.env.ALPHA_VANTAGE_API_KEY = mockApiKey;
    jest.resetAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("getStockQuote", () => {
    it("should fetch stock quote correctly", async () => {
      const mockResponse = {
        data: {
          "Global Quote": {
            "01. symbol": "AAPL",
            "05. price": "150.00",
          },
        },
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      const result = await alphaVantageService.getStockQuote("AAPL");

      expect(axios.get).toHaveBeenCalledWith(
        "https://www.alphavantage.co/query",
        {
          params: {
            function: "GLOBAL_QUOTE",
            symbol: "AAPL",
            apikey: mockApiKey,
          },
        },
      );
      expect(result).toEqual(mockResponse.data["Global Quote"]);
    });
  });

  describe("getDailyTimeSeries", () => {
    it("should fetch daily time series with compact output by default", async () => {
      const mockResponse = { data: { "Time Series (Daily)": {} } };
      axios.get.mockResolvedValueOnce(mockResponse);

      await alphaVantageService.getDailyTimeSeries("MSFT");

      expect(axios.get).toHaveBeenCalledWith(
        "https://www.alphavantage.co/query",
        {
          params: {
            function: "TIME_SERIES_DAILY",
            symbol: "MSFT",
            outputsize: "compact",
            apikey: mockApiKey,
          },
        },
      );
    });

    it("should fetch full daily time series when specified", async () => {
      const mockResponse = { data: { "Time Series (Daily)": {} } };
      axios.get.mockResolvedValueOnce(mockResponse);

      await alphaVantageService.getDailyTimeSeries("MSFT", true);

      expect(axios.get).toHaveBeenCalledWith(
        "https://www.alphavantage.co/query",
        {
          params: {
            function: "TIME_SERIES_DAILY",
            symbol: "MSFT",
            outputsize: "full",
            apikey: mockApiKey,
          },
        },
      );
    });
  });

  describe("getWeeklyTimeSeries", () => {
    it("should fetch weekly time series correctly", async () => {
      const mockResponse = { data: { "Weekly Time Series": {} } };
      axios.get.mockResolvedValueOnce(mockResponse);

      await alphaVantageService.getWeeklyTimeSeries("GOOGL");

      expect(axios.get).toHaveBeenCalledWith(
        "https://www.alphavantage.co/query",
        {
          params: {
            function: "TIME_SERIES_WEEKLY",
            symbol: "GOOGL",
            apikey: mockApiKey,
          },
        },
      );
    });
  });

  describe("getExchangeRate", () => {
    it("should fetch exchange rate correctly", async () => {
      const mockResponse = {
        data: {
          "Realtime Currency Exchange Rate": {
            "5. Exchange Rate": "1.2",
          },
        },
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      const result = await alphaVantageService.getExchangeRate("USD", "EUR");

      expect(axios.get).toHaveBeenCalledWith(
        "https://www.alphavantage.co/query",
        {
          params: {
            function: "CURRENCY_EXCHANGE_RATE",
            from_currency: "USD",
            to_currency: "EUR",
            apikey: mockApiKey,
          },
        },
      );
      expect(result).toEqual(
        mockResponse.data["Realtime Currency Exchange Rate"],
      );
    });
  });

  describe("searchSymbols", () => {
    it("should search symbols correctly", async () => {
      const mockResponse = {
        data: {
          bestMatches: [{ "1. symbol": "AAPL", "2. name": "Apple Inc" }],
        },
      };
      axios.get.mockResolvedValueOnce(mockResponse);

      const result = await alphaVantageService.searchSymbols("apple");

      expect(axios.get).toHaveBeenCalledWith(
        "https://www.alphavantage.co/query",
        {
          params: {
            function: "SYMBOL_SEARCH",
            keywords: "apple",
            apikey: mockApiKey,
          },
        },
      );
      expect(result).toEqual(mockResponse.data.bestMatches);
    });
  });

  describe("error handling", () => {
    it("should handle API error messages", async () => {
      axios.get.mockResolvedValueOnce({
        data: { "Error Message": "Invalid API call" },
      });

      await expect(
        alphaVantageService.getStockQuote("INVALID"),
      ).rejects.toThrow("Invalid API call");
      expect(logger.error).toHaveBeenCalled();
    });

    it("should log warnings for API information messages", async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          Information: "API call frequency limit reached",
          "Global Quote": {},
        },
      });

      await alphaVantageService.getStockQuote("AAPL");
      expect(logger.warn).toHaveBeenCalledWith(
        "Alpha Vantage API message: API call frequency limit reached",
      );
    });

    it("should handle network errors", async () => {
      axios.get.mockRejectedValueOnce(new Error("Network error"));

      await expect(alphaVantageService.getStockQuote("AAPL")).rejects.toThrow(
        "Network error",
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("isConfigured", () => {
    it("should return true when API key is configured", () => {
      expect(alphaVantageService.isConfigured()).toBe(true);
    });

    it("should return false when API key is not configured", () => {
      delete process.env.ALPHA_VANTAGE_API_KEY;
      expect(alphaVantageService.isConfigured()).toBe(false);
    });
  });
});

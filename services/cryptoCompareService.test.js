import axios from 'axios';
import cryptoCompareService from './cryptoCompareService.js';
import { callWithRetry } from '../utils/apiHelper.js';
import logger from '../middleware/logger.js';

// Mock dependencies
jest.mock('axios');
jest.mock('../utils/apiHelper.js');
jest.mock('../middleware/logger.js', () => {
  return {
    __esModule: true,
    default: {
      error: jest.fn(),
      info: jest.fn()
    }
  };
});

describe('CryptoCompare Service', () => {
  // Save original env and reset after tests
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.CRYPTOCOMPARE_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Configuration', () => {
    test('isConfigured returns true when API key is set', () => {
      expect(cryptoCompareService.isConfigured()).toBe(true);
    });

    test('isConfigured returns false when API key is not set', () => {
      delete process.env.CRYPTOCOMPARE_API_KEY;
      expect(cryptoCompareService.isConfigured()).toBe(false);
    });

    test('getApiKey returns the API key from env', () => {
      expect(cryptoCompareService.getApiKey()).toBe('test-api-key');
    });
  });

  describe('executeRequest', () => {
    test('throws error when API key is not configured', async () => {
      delete process.env.CRYPTOCOMPARE_API_KEY;
      await expect(cryptoCompareService.executeRequest('test-endpoint')).rejects.toThrow('CryptoCompare API key is not configured');
    });

    test('calls API with correct parameters', async () => {
      const mockData = { data: { result: 'success' } };
      callWithRetry.mockResolvedValue(mockData);

      await cryptoCompareService.executeRequest('endpoint', { param: 'value' });
      
      expect(callWithRetry).toHaveBeenCalled();
      const apiCallFn = callWithRetry.mock.calls[0][0];
      
      // Test that axios is called with expected params
      await apiCallFn();
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('https://min-api.cryptocompare.com/data/endpoint?param=value'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'authorization': 'Apikey test-api-key'
          })
        })
      );
    });

    test('handles API error responses', async () => {
      const errorResponse = { data: { Response: 'Error', Message: 'API Error' } };
      callWithRetry.mockResolvedValue(errorResponse);
      
      await expect(cryptoCompareService.executeRequest('endpoint')).rejects.toThrow('API Error');
      expect(logger.error).toHaveBeenCalled();
    });
    
    test('handles network errors', async () => {
      const error = new Error('Network error');
      callWithRetry.mockRejectedValue(error);
      
      await expect(cryptoCompareService.executeRequest('endpoint')).rejects.toThrow('Network error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('API methods', () => {
    beforeEach(() => {
      // Mock executeRequest for all API methods
      cryptoCompareService.executeRequest = jest.fn().mockResolvedValue({ success: true });
    });

    test('getCurrentPrice calls executeRequest with correct parameters', async () => {
      await cryptoCompareService.getCurrentPrice('BTC', 'USD');
      expect(cryptoCompareService.executeRequest).toHaveBeenCalledWith(
        'price', { fsym: 'BTC', tsyms: 'USD' }
      );
    });

    test('getCurrentPrice handles array of symbols', async () => {
      await cryptoCompareService.getCurrentPrice('BTC', ['USD', 'EUR']);
      expect(cryptoCompareService.executeRequest).toHaveBeenCalledWith(
        'price', { fsym: 'BTC', tsyms: 'USD,EUR' }
      );
    });

    test('getMultipleCurrentPrices calls executeRequest with correct parameters', async () => {
      await cryptoCompareService.getMultipleCurrentPrices(['BTC', 'ETH'], ['USD', 'EUR']);
      expect(cryptoCompareService.executeRequest).toHaveBeenCalledWith(
        'pricemulti', { fsyms: 'BTC,ETH', tsyms: 'USD,EUR' }
      );
    });

    test('getPriceWithFullData calls executeRequest with correct parameters', async () => {
      await cryptoCompareService.getPriceWithFullData('BTC', 'USD');
      expect(cryptoCompareService.executeRequest).toHaveBeenCalledWith(
        'pricemultifull', { fsyms: 'BTC', tsyms: 'USD' }
      );
    });

    test('getHistoricalDailyData uses default limit when not provided', async () => {
      await cryptoCompareService.getHistoricalDailyData('BTC', 'USD');
      expect(cryptoCompareService.executeRequest).toHaveBeenCalledWith(
        'histoday', { fsym: 'BTC', tsym: 'USD', limit: 30 }
      );
    });

    test('getHistoricalHourlyData calls executeRequest with correct parameters', async () => {
      await cryptoCompareService.getHistoricalHourlyData('BTC', 'USD', 12);
      expect(cryptoCompareService.executeRequest).toHaveBeenCalledWith(
        'histohour', { fsym: 'BTC', tsym: 'USD', limit: 12 }
      );
    });

    test('getHistoricalMinuteData calls executeRequest with correct parameters', async () => {
      await cryptoCompareService.getHistoricalMinuteData('BTC', 'USD', 60, 5);
      expect(cryptoCompareService.executeRequest).toHaveBeenCalledWith(
        'histominute', { fsym: 'BTC', tsym: 'USD', limit: 60, aggregate: 5 }
      );
    });

    test('getTopCryptocurrencies calls executeRequest with correct parameters', async () => {
      await cryptoCompareService.getTopCryptocurrencies(20, 'EUR');
      expect(cryptoCompareService.executeRequest).toHaveBeenCalledWith(
        'top/mktcapfull', { limit: 20, tsym: 'EUR' }
      );
    });

    test('getNews calls executeRequest with correct parameters', async () => {
      // Mock Date.now to get consistent timestamp
      const realDateNow = Date.now;
      const mockedTimestamp = 1609459200000; // 2021-01-01 00:00:00
      global.Date.now = jest.fn(() => mockedTimestamp);
      
      await cryptoCompareService.getNews('BTC,ETH', 15);
      
      expect(cryptoCompareService.executeRequest).toHaveBeenCalledWith(
        'v2/news/', {
          categories: 'BTC,ETH',
          lTs: Math.floor(mockedTimestamp / 1000) - (86400 * 7),
          sortOrder: 'popular',
          lang: 'EN',
          extraParams: 'FinancialFreedomBroker'
        }
      );
      
      // Restore Date.now
      global.Date.now = realDateNow;
    });
  });
});
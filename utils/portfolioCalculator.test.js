import { calculatePositionsFromFilledOrders } from './portfolioCalculator.js';

describe('calculatePositionsFromFilledOrders', () => {
  test('repairs missing executionPrice using limit price and computes average cost after sells', () => {
    const orders = [
      {
        _id: '1',
        symbol: 'ETH/USDT',
        side: 'buy',
        status: 'filled',
        quantity: 10,
        executedQuantity: 10,
        price: 100,
        executionPrice: null,
        fee: 1,
        processedAt: new Date('2025-01-01T00:00:00Z'),
      },
      {
        _id: '2',
        symbol: 'ETH/USDT',
        side: 'sell',
        status: 'filled',
        quantity: 5,
        executedQuantity: 5,
        price: 110,
        executionPrice: null,
        fee: 0.5,
        processedAt: new Date('2025-01-02T00:00:00Z'),
      },
    ];

    const { positions, warnings, patches } = calculatePositionsFromFilledOrders(orders);

    expect(warnings).toEqual([]);
    expect(patches.length).toBeGreaterThan(0);

    expect(positions).toHaveLength(1);
    const pos = positions[0];

    // After buying 10 and selling 5, remaining qty is 5
    expect(pos.symbol).toBe('ETH/USDT');
    expect(pos.quantity).toBeCloseTo(5, 8);

    // Cost basis includes buy fee and is reduced by avg cost on sell.
    // Buy cost basis: 10*100 + 1 = 1001
    // Avg cost before sell: 1001/10 = 100.1
    // Reduce by 5*100.1 = 500.5 -> remaining cost basis 500.5
    expect(pos.totalInvested).toBeCloseTo(500.5, 8);
  });

  test('handles sell before buy without throwing and produces warning', () => {
    const orders = [
      {
        _id: '1',
        symbol: 'BTC/USDT',
        side: 'sell',
        status: 'filled',
        quantity: 1,
        executedQuantity: 1,
        price: 50000,
        executionPrice: null,
        processedAt: new Date('2025-01-01T00:00:00Z'),
      },
      {
        _id: '2',
        symbol: 'BTC/USDT',
        side: 'buy',
        status: 'filled',
        quantity: 1,
        executedQuantity: 1,
        price: 49000,
        executionPrice: null,
        processedAt: new Date('2025-01-02T00:00:00Z'),
      },
    ];

    const { positions, warnings } = calculatePositionsFromFilledOrders(orders);

    expect(warnings.some((w) => w.type === 'position_inconsistency')).toBe(true);
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe('BTC/USDT');
    expect(positions[0].quantity).toBeCloseTo(1, 8);
    expect(positions[0].totalInvested).toBeCloseTo(49000, 8);
  });
});

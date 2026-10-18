import test from 'node:test';
import assert from 'node:assert/strict';
import { runBacktest } from './backtest.ts';
import { generateSyntheticHistory, resampleCandles } from './marketData.ts';

test('runBacktest runs chronological backtest without errors and produces valid reports', () => {
  const m5Candles = generateSyntheticHistory('XAU/USD', 2650, 5, 300, 0.0002);
  const m15Candles = resampleCandles(m5Candles, 15, 5);
  const h1Candles = resampleCandles(m5Candles, 60, 5);

  const report = runBacktest({
    symbol: 'XAU/USD',
    initialBalance: 100000,
    m5Candles,
    m15Candles,
    h1Candles,
  });

  assert.equal(report.initialDeposit, 100000);
  assert.ok(typeof report.netProfitUSD === 'number');
  assert.ok(typeof report.winRatePercent === 'number');
  assert.ok(report.equityCurve.length > 0);
  assert.equal(report.monteCarlo.simulationsCount, 1000);
  assert.ok(typeof report.monteCarlo.percentile95MaxDrawdownPercent === 'number');
});

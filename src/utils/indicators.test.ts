import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSMA,
  calculateEMA,
  calculateSMMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
  calculateADX,
  calculatePivotPoints,
  calculateFibonacciRetracement,
  analyzeMarketStructure,
  detectCandlestickPattern,
} from './indicators.ts';
import type { Candle } from './indicators.ts';

test('calculateSMA computes correct values', () => {
  const prices = [10, 20, 30, 40, 50];
  const sma3 = calculateSMA(prices, 3);
  assert.equal(sma3[0], null);
  assert.equal(sma3[1], null);
  assert.equal(sma3[2], 20); // (10+20+30)/3
  assert.equal(sma3[3], 30); // (20+30+40)/3
  assert.equal(sma3[4], 40); // (30+40+50)/3
});

test('calculateEMA smooths prices properly', () => {
  const prices = [10, 11, 12, 13, 14, 15, 16];
  const ema3 = calculateEMA(prices, 3);
  assert.equal(ema3[0], null);
  assert.equal(ema3[1], null);
  assert.equal(ema3[2], 11); // Initial SMA = (10+11+12)/3 = 11
  // Multiplier = 2 / (3 + 1) = 0.5
  // EMA(3) = (13 - 11) * 0.5 + 11 = 12
  assert.equal(ema3[3], 12);
  // EMA(4) = (14 - 12) * 0.5 + 12 = 13
  assert.equal(ema3[4], 13);
});

test('calculateSMMA applies Wilder smoothing correctly', () => {
  const prices = [10, 20, 30, 40, 50];
  const smma3 = calculateSMMA(prices, 3);
  assert.equal(smma3[0], null);
  assert.equal(smma3[1], null);
  assert.equal(smma3[2], 20); // First SMMA = SMA(3) = (10+20+30)/3 = 20
  // SMMA(3) = (20 * 2 + 40) / 3 = 80 / 3 = 26.6666...
  assert.ok(Math.abs(smma3[3]! - 26.6666) < 0.001);
});

test('calculateRSI stays within 0 and 100 bounds', () => {
  // Upward trending prices
  const prices = [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128, 130];
  const rsi = calculateRSI(prices, 14);
  const lastRSI = rsi[rsi.length - 1];
  assert.ok(lastRSI !== null);
  assert.ok(lastRSI! >= 70 && lastRSI! <= 100, `RSI for uptrend should be high, got ${lastRSI}`);
});

test('calculateMACD produces valid macd, signal and histogram lines', () => {
  const prices = Array.from({ length: 40 }, (_, i) => 100 + i * 1.5 + Math.sin(i) * 2);
  const macd = calculateMACD(prices, 12, 26, 9);
  assert.equal(macd.macd.length, 40);
  assert.equal(macd.signal.length, 40);
  assert.equal(macd.histogram.length, 40);
  // After 35 periods, histogram should be a valid number
  assert.ok(typeof macd.histogram[38] === 'number');
});

test('calculateBollingerBands returns middle, upper and lower bands', () => {
  const prices = Array.from({ length: 30 }, () => 100);
  const bb = calculateBollingerBands(prices, 20, 2);
  const lastIndex = prices.length - 1;
  assert.equal(bb.middle[lastIndex], 100);
  assert.equal(bb.upper[lastIndex], 100); // 0 variance
  assert.equal(bb.lower[lastIndex], 100);
});

test('calculatePivotPoints returns correct classic levels', () => {
  const pp = calculatePivotPoints(2660, 2640, 2650);
  assert.equal(pp.pivot, 2650);
  assert.equal(pp.r1, 2 * 2650 - 2640); // 2660
  assert.equal(pp.s1, 2 * 2650 - 2660); // 2640
});

test('calculateFibonacciRetracement generates correct ratios', () => {
  const fib = calculateFibonacciRetracement(2700, 2600, 'UP');
  assert.equal(fib.levels.length, 7);
  // 50% level should be 2650
  const level50 = fib.levels.find((l) => l.ratio === 0.5);
  assert.ok(level50);
  assert.equal(level50!.price, 2650);
});

test('detectCandlestickPattern recognizes Hammer and Doji', () => {
  const dojiCandle: Candle = { time: 1, open: 2650.0, high: 2655.0, low: 2645.0, close: 2650.1, volume: 100 };
  const dojiPattern = detectCandlestickPattern(dojiCandle);
  assert.ok(dojiPattern);
  assert.equal(dojiPattern!.name, 'Doji');

  const hammerCandle: Candle = { time: 2, open: 2652, high: 2653, low: 2635, close: 2652.5, volume: 100 };
  const hammerPattern = detectCandlestickPattern(hammerCandle);
  assert.ok(hammerPattern);
  assert.ok(hammerPattern!.name.includes('Hammer'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSyntheticHistory,
  updateOrAppendLiveCandle,
  resampleCandles,
  getActiveMarketSession,
} from './marketData.ts';
import type { Candle } from './indicators.ts';

test('generateSyntheticHistory generates correct count with base price anchored', () => {
  const candles = generateSyntheticHistory('EUR/USD', 1.0850, 5, 50);
  assert.equal(candles.length, 50);
  const last = candles[candles.length - 1];
  assert.equal(last.close, 1.0850);
  assert.ok(last.high >= last.close);
  assert.ok(last.low <= last.close);
});

test('updateOrAppendLiveCandle updates high, low, close during same period', () => {
  const initialCandles: Candle[] = [
    { time: 1000, open: 1.0800, high: 1.0820, low: 1.0790, close: 1.0810, volume: 10 },
  ];

  // Tick up to 1.0830 within same period (time 1000, timeframe 5min => period 1000-1300)
  const updated = updateOrAppendLiveCandle(initialCandles, 1.0830, 5, 1050);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].close, 1.0830);
  assert.equal(updated[0].high, 1.0830);
  assert.equal(updated[0].volume, 11);

  // Tick down to 1.0780
  const updated2 = updateOrAppendLiveCandle(updated, 1.0780, 5, 1060);
  assert.equal(updated2.length, 1);
  assert.equal(updated2[0].close, 1.0780);
  assert.equal(updated2[0].low, 1.0780);
  assert.equal(updated2[0].high, 1.0830);
});

test('updateOrAppendLiveCandle appends new candle when period elapses', () => {
  const initialCandles: Candle[] = [
    { time: 300, open: 1.0800, high: 1.0820, low: 1.0790, close: 1.0810, volume: 10 },
  ];

  // At time 600 (second 5-minute period)
  const nextBars = updateOrAppendLiveCandle(initialCandles, 1.0825, 5, 600);
  assert.equal(nextBars.length, 2);
  assert.equal(nextBars[1].time, 600);
  assert.equal(nextBars[1].open, 1.0810); // Opened at previous close
  assert.equal(nextBars[1].close, 1.0825);
  assert.equal(nextBars[1].volume, 1);
});

test('getActiveMarketSession returns UTC+2 time string', () => {
  const session = getActiveMarketSession(new Date('2026-10-18T10:00:00Z'));
  assert.ok(session.currentTimeUTC2.includes('UTC+2'));
  // 10:00 UTC + 2h = 12:00
  assert.ok(session.currentTimeUTC2.startsWith('12:00'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectFairValueGaps,
  detectLiquiditySweeps,
  detectDisplacement,
  detectOrderBlocks,
  calculateVolumeProfile,
} from './indicators.ts';
import type { Candle } from './indicators.ts';
import { generateTradingSignal, DEFAULT_BOT_SETTINGS } from './strategy.ts';
import { DEFAULT_RISK_CONFIG, evaluateBreakevenUpdate } from './risk.ts';
import type { AccountState } from './risk.ts';
import { generateSyntheticHistory, resampleCandles } from './marketData.ts';

function makeCandles(count: number, base = 2650): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    time: 1700000000 + i * 300,
    open: base + i * 0.2,
    high: base + i * 0.2 + 0.8,
    low: base + i * 0.2 - 0.5,
    close: base + i * 0.2 + 0.4,
    volume: 100 + i * 5,
  }));
}

test('detectFairValueGaps finds bullish 3-candle imbalance', () => {
  const candles = makeCandles(20, 2600);
  // Force a large bullish gap at index 17..19: c[17].high < c[19].low
  candles[17] = { time: 1700005100, open: 2605, high: 2606, low: 2604, close: 2605.5, volume: 120 };
  candles[18] = { time: 1700005400, open: 2605.5, high: 2616, low: 2605.5, close: 2615.5, volume: 500 };
  candles[19] = { time: 1700005700, open: 2615.5, high: 2620, low: 2612, close: 2619, volume: 300 };

  const gaps = detectFairValueGaps(candles, 0.1);
  const bull = gaps.find((g) => g.type === 'BULLISH' && g.endIndex === 19);
  assert.ok(bull, 'Expected bullish FVG to be detected');
  assert.equal(bull!.bottom, 2606);
  assert.equal(bull!.top, 2612);
  assert.equal(bull!.mitigated, false);
});

test('detectDisplacement and detectOrderBlocks find strong breakout and demand OB', () => {
  const candles = makeCandles(25, 2600);
  candles[21] = { time: 1700006300, open: 2606, high: 2606.5, low: 2603.5, close: 2604, volume: 200 }; // bearish OB candle
  candles[22] = { time: 1700006600, open: 2604, high: 2618, low: 2603.8, close: 2617.5, volume: 900 }; // huge bullish displacement

  const disp = detectDisplacement(candles, 1.3);
  assert.ok(disp.some((d) => d.index === 22 && d.type === 'BULLISH'));

  const obs = detectOrderBlocks(candles);
  assert.ok(obs.some((ob) => ob.type === 'DEMAND' && ob.index === 21));
});

test('detectLiquiditySweeps identifies stop hunt reversal', () => {
  const candles = makeCandles(30, 2650);
  // Prior low around 2649.5; index 28 sweeps below 2645 and closes back above 2653 with long lower wick
  candles[28] = { time: 1700008400, open: 2654, high: 2656, low: 2642, close: 2655, volume: 650 };
  const sweeps = detectLiquiditySweeps(candles, 20);
  assert.ok(sweeps.some((s) => s.type === 'BULLISH_SWEEP' && s.index === 28));
});

test('calculateVolumeProfile returns POC, VAH, VAL, and high-volume nodes', () => {
  const candles = makeCandles(40, 2640);
  // Concentrate heavy volume near 2645
  for (let i = 10; i < 20; i++) {
    candles[i] = { ...candles[i], low: 2644.5, high: 2645.5, volume: 2500 };
  }
  const vp = calculateVolumeProfile(candles, 20);
  assert.ok(vp.poc >= 2640 && vp.poc <= 2660);
  assert.ok(vp.vah >= vp.poc && vp.val <= vp.poc);
  assert.ok(vp.highVolumeNodes.length >= 1);
});

test('evaluateBreakevenUpdate moves SL to entry+buffer at +1.0R', () => {
  const res = evaluateBreakevenUpdate({
    side: 'LONG',
    entryPrice: 2650,
    stopLoss: 2640, // risk = 10
    currentPrice: 2660.5, // > +1.0R
    triggerR: 1.0,
    spreadPoints: 0.4,
    alreadyMoved: false,
  });
  assert.equal(res.shouldMove, true);
  assert.ok(res.newStopLoss >= 2650);
});

test('generateTradingSignal supports both CLASSIC and BRAIN modes with SMC context', () => {
  const m5 = generateSyntheticHistory('XAU/USD', 2650, 5, 800, 0.0002);
  const m15 = resampleCandles(m5, 15, 5);
  const h1 = resampleCandles(m5, 60, 5);

  const account: AccountState = {
    initialBalance: 100000,
    balance: 100000,
    equity: 100000,
    usedMargin: 0,
    freeMargin: 100000,
    dailyRealizedPnL: 0,
    dailyUnrealizedPnL: 0,
    totalRealizedPnL: 0,
    peakEquity: 100000,
    consecutiveLosses: 0,
    openPositionCount: 0,
  };

  const classicSig = generateTradingSignal(
    { symbol: 'XAU/USD', m5, m15, h1 },
    account,
    DEFAULT_RISK_CONFIG,
    { ...DEFAULT_BOT_SETTINGS, mode: 'CLASSIC' }
  );
  assert.equal(classicSig.botMode, 'CLASSIC');
  assert.ok(classicSig.ruleChecks.some((r) => r.id === 'C2_SMMA_5_50'));

  const brainSig = generateTradingSignal(
    { symbol: 'XAU/USD', m5, m15, h1 },
    account,
    DEFAULT_RISK_CONFIG,
    { ...DEFAULT_BOT_SETTINGS, mode: 'BRAIN' }
  );
  assert.equal(brainSig.botMode, 'BRAIN');
  assert.ok(brainSig.ruleChecks.some((r) => r.id === 'B3_FVG'));
  assert.ok(brainSig.ruleChecks.some((r) => r.id === 'B7_VOLUME_PROFILE'));
  assert.ok(typeof brainSig.smcContext.volumeProfile.poc === 'number');
});

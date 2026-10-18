import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateOrderRisk,
  DEFAULT_RISK_CONFIG,
  INSTRUMENT_SPECS,
} from './risk.ts';
import type { AccountState, TradeOrderCandidate } from './risk.ts';

const baseAccount: AccountState = {
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

test('evaluateOrderRisk sizes position correctly for 0.5% risk on Gold', () => {
  // Risk = 0.5% of 100,000 = $500
  // Entry = 2650, Stop = 2645 (distance = $5.00)
  // Gold lotSize = 100 oz -> Risk per 1 lot = $5.00 * 100 = $500
  // Recommended lots should be 1.00 lot
  const order: TradeOrderCandidate = {
    symbol: 'XAU/USD',
    side: 'LONG',
    entryPrice: 2650,
    stopLoss: 2645,
    takeProfit: 2660, // RR = 10 / 5 = 2.0R
  };

  const result = evaluateOrderRisk(order, baseAccount, DEFAULT_RISK_CONFIG);
  assert.equal(result.allowed, true);
  assert.equal(result.recommendedLots, 1.0);
  assert.equal(result.riskAmountUSD, 500);
  assert.equal(result.dollarRisk, 500);
  assert.equal(result.rewardToRiskRatio, 2.0);
});

test('evaluateOrderRisk rejects order when kill switch is active', () => {
  const order: TradeOrderCandidate = {
    symbol: 'XAU/USD',
    side: 'LONG',
    entryPrice: 2650,
    stopLoss: 2645,
    takeProfit: 2660,
  };

  const configWithKillSwitch = { ...DEFAULT_RISK_CONFIG, killSwitchActive: true };
  const result = evaluateOrderRisk(order, baseAccount, configWithKillSwitch);
  assert.equal(result.allowed, false);
  assert.ok(result.rejectReason?.includes('Kill Switch'));
});

test('evaluateOrderRisk rejects order when daily loss limit is breached', () => {
  const badAccount: AccountState = {
    ...baseAccount,
    dailyRealizedPnL: -2100, // Exceeds 2% of 100k ($2000)
  };

  const order: TradeOrderCandidate = {
    symbol: 'XAU/USD',
    side: 'LONG',
    entryPrice: 2650,
    stopLoss: 2645,
    takeProfit: 2660,
  };

  const result = evaluateOrderRisk(order, badAccount, DEFAULT_RISK_CONFIG);
  assert.equal(result.allowed, false);
  assert.ok(result.rejectReason?.includes('daily loss limit'));
});

test('evaluateOrderRisk rejects order when consecutive losses reach circuit breaker', () => {
  const badAccount: AccountState = {
    ...baseAccount,
    consecutiveLosses: 3, // Default circuit breaker is 3
  };

  const order: TradeOrderCandidate = {
    symbol: 'XAU/USD',
    side: 'LONG',
    entryPrice: 2650,
    stopLoss: 2645,
    takeProfit: 2660,
  };

  const result = evaluateOrderRisk(order, badAccount, DEFAULT_RISK_CONFIG);
  assert.equal(result.allowed, false);
  assert.ok(result.rejectReason?.includes('circuit breaker'));
});

test('evaluateOrderRisk rejects order with reward-to-risk ratio below minimum threshold', () => {
  const order: TradeOrderCandidate = {
    symbol: 'XAU/USD',
    side: 'LONG',
    entryPrice: 2650,
    stopLoss: 2645, // Risk = 5
    takeProfit: 2655, // Reward = 5 -> RR = 1.0R (below 1.5R default)
  };

  const result = evaluateOrderRisk(order, baseAccount, DEFAULT_RISK_CONFIG);
  assert.equal(result.allowed, false);
  assert.ok(result.rejectReason?.includes('Reward-to-Risk ratio'));
});

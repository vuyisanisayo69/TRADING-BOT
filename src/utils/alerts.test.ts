import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAlertTrigger,
  calculateAlertDistance,
  formatTimeUTC2,
} from './alerts.ts';
import type { PriceAlert } from './alerts.ts';

test('evaluateAlertTrigger triggers CROSSES_ABOVE when price moves up through target', () => {
  const alert: PriceAlert = {
    id: 'a1',
    symbol: 'XAU/USD',
    targetPrice: 2655.0,
    condition: 'CROSSES_ABOVE',
    status: 'ACTIVE',
    note: 'Resistance test',
    createdAt: 1000,
    oneShot: true,
  };

  // Case 1: Below target, stays below -> No trigger
  assert.equal(evaluateAlertTrigger(alert, 2654.5, 2654.0).triggered, false);

  // Case 2: Crossed from 2654.8 to 2655.2 -> Triggers!
  const res = evaluateAlertTrigger(alert, 2655.2, 2654.8);
  assert.equal(res.triggered, true);
  assert.ok(res.reason?.includes('crossed above'));
});

test('evaluateAlertTrigger triggers CROSSES_BELOW when price drops through target', () => {
  const alert: PriceAlert = {
    id: 'a2',
    symbol: 'EUR/USD',
    targetPrice: 1.0850,
    condition: 'CROSSES_BELOW',
    status: 'ACTIVE',
    note: 'Support break',
    createdAt: 1000,
    oneShot: true,
  };

  // Crosses from 1.0852 down to 1.0848
  const res = evaluateAlertTrigger(alert, 1.0848, 1.0852);
  assert.equal(res.triggered, true);
  assert.ok(res.reason?.includes('crossed below'));
});

test('evaluateAlertTrigger does not trigger if alert is DISABLED or TRIGGERED', () => {
  const alert: PriceAlert = {
    id: 'a3',
    symbol: 'BTC/USD',
    targetPrice: 68500,
    condition: 'CROSSES_ABOVE',
    status: 'DISABLED',
    note: 'Paused alert',
    createdAt: 1000,
    oneShot: true,
  };

  assert.equal(evaluateAlertTrigger(alert, 68600, 68400).triggered, false);
});

test('calculateAlertDistance computes accurate distance and pips', () => {
  // EUR/USD pipSize = 0.0001
  // Current: 1.0840, Target: 1.0860 -> Distance = 0.0020, 20 pips
  const dist = calculateAlertDistance(1.0840, 1.0860, 0.0001);
  assert.equal(dist.distancePoints, 0.002);
  assert.equal(dist.distancePips, 20);
  assert.equal(dist.isAbove, true);
});

test('formatTimeUTC2 correctly adds 2 hours to UTC time', () => {
  // Unix timestamp 0 is 1970-01-01 00:00:00 UTC
  // In UTC+2 it should be 02:00
  const formatted = formatTimeUTC2(0);
  assert.ok(formatted.startsWith('02:00'));
  assert.ok(formatted.includes('UTC+2'));
});

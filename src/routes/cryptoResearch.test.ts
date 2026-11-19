import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOrderBookMetrics, sanitizeCoinSymbol } from './cryptoResearch.ts';

test('sanitizeCoinSymbol normalizes valid perp symbols and rejects empty/long values', () => {
  assert.equal(sanitizeCoinSymbol(' btc '), 'BTC');
  assert.equal(sanitizeCoinSymbol('eth'), 'ETH');
  assert.equal(sanitizeCoinSymbol(''), null);
  assert.equal(sanitizeCoinSymbol('TOOLONGSYMBOLNAMEHERE'), null);
});

test('computeOrderBookMetrics calculates spread, mid, bps, and depth bands accurately', () => {
  const levels: [any[], any[]] = [
    [
      { px: '100.00', sz: '10', n: 2 }, // notional 1000, -5 bps from 100.05 is 99.9999
      { px: '99.90', sz: '20', n: 3 }, // notional 1998 (~15 bps)
      { px: '99.70', sz: '50', n: 5 }, // notional 4985 (~35 bps)
    ],
    [
      { px: '100.10', sz: '12', n: 2 }, // notional 1201.2 (~5 bps)
      { px: '100.20', sz: '25', n: 4 }, // notional 2505 (~15 bps)
      { px: '100.40', sz: '40', n: 6 }, // notional 4016 (~35 bps)
    ],
  ];

  const metrics = computeOrderBookMetrics(levels, 100.05);
  assert.equal(metrics.bestBid, 100.0);
  assert.equal(metrics.bestAsk, 100.1);
  assert.equal(metrics.spreadUSD, 0.1);
  assert.ok(metrics.spreadBps !== null && Math.abs(metrics.spreadBps - 10) < 0.05);
  assert.equal(metrics.depthBands.length, 3);
  const band25 = metrics.depthBands.find((b) => b.bps === 25)!;
  assert.equal(band25.bidReachesBand, true);
  assert.equal(band25.askReachesBand, true);
  assert.ok(band25.bidNotionalUSD > 2900);
});

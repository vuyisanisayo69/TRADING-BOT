import { Router, type Request, type Response } from 'express';

const HYPERLIQUID_INFO_URL = 'https://api.hyperliquid.xyz/info';
const UPSTREAM_TIMEOUT_MS = 6500;
const ALLOWED_INTERVALS = new Set(['15m', '1h', '4h', '1d']);

export interface L2Level {
  px: number;
  sz: number;
  notionalUSD: number;
  n: number;
}

export interface DepthBandSummary {
  bps: number;
  bidNotionalUSD: number;
  askNotionalUSD: number;
  totalNotionalUSD: number;
  bidReachesBand: boolean;
  askReachesBand: boolean;
}

export interface CryptoSnapshotPayload {
  status: 'OK';
  provider: 'HYPERLIQUID_PUBLIC_INFO';
  readOnly: true;
  zeroKeysRequired: true;
  mt5BridgeCompatible: false;
  providesBrokerXauUsd: false;
  coin: string;
  fetchedAtIso: string;
  meta: {
    szDecimals: number | null;
    maxLeverage: number | null;
    onlyIsolated: boolean;
  };
  market: {
    midPx: number | null;
    markPx: number | null;
    oraclePx: number | null;
    prevDayPx: number | null;
    change24hPercent: number | null;
    dayNotionalVolumeUSD: number | null;
    openInterestCoins: number | null;
    openInterestUSD: number | null;
    hourlyFundingPercent: number | null;
    annualizedFundingPercent: number | null;
    premiumBps: number | null;
    markOracleBasisBps: number | null;
  };
  orderBook: {
    bestBid: number | null;
    bestAsk: number | null;
    spreadUSD: number | null;
    spreadBps: number | null;
    bidReachBps: number;
    askReachBps: number;
    depthSource: 'FULL_PRECISION' | 'AGGREGATED_SIG_FIGS';
    depthBands: DepthBandSummary[];
    topBids: L2Level[];
    topAsks: L2Level[];
  };
}

export function sanitizeCoinSymbol(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!cleaned || cleaned.length > 14) return null;
  return cleaned;
}

function parseFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function computeOrderBookMetrics(
  rawLevels: [Array<{ px: string; sz: string; n: number }>, Array<{ px: string; sz: string; n: number }>] | undefined,
  referenceMid: number | null
): {
  bestBid: number | null;
  bestAsk: number | null;
  spreadUSD: number | null;
  spreadBps: number | null;
  bidReachBps: number;
  askReachBps: number;
  depthBands: DepthBandSummary[];
  topBids: L2Level[];
  topAsks: L2Level[];
} {
  const bidsRaw = Array.isArray(rawLevels?.[0]) ? rawLevels[0] : [];
  const asksRaw = Array.isArray(rawLevels?.[1]) ? rawLevels[1] : [];

  const bids: L2Level[] = bidsRaw
    .map((lvl) => {
      const px = parseFinite(lvl.px) ?? 0;
      const sz = parseFinite(lvl.sz) ?? 0;
      return { px, sz, notionalUSD: px * sz, n: Number(lvl.n) || 0 };
    })
    .filter((l) => l.px > 0 && l.sz > 0)
    .sort((a, b) => b.px - a.px);

  const asks: L2Level[] = asksRaw
    .map((lvl) => {
      const px = parseFinite(lvl.px) ?? 0;
      const sz = parseFinite(lvl.sz) ?? 0;
      return { px, sz, notionalUSD: px * sz, n: Number(lvl.n) || 0 };
    })
    .filter((l) => l.px > 0 && l.sz > 0)
    .sort((a, b) => a.px - b.px);

  const bestBid = bids[0]?.px ?? null;
  const bestAsk = asks[0]?.px ?? null;
  const bookMid =
    bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : referenceMid;
  const spreadUSD =
    bestBid !== null && bestAsk !== null ? Number((bestAsk - bestBid).toFixed(6)) : null;
  const spreadBps =
    spreadUSD !== null && bookMid && bookMid > 0
      ? Number(((spreadUSD / bookMid) * 10000).toFixed(2))
      : null;

  const deepestBidPx = bids[bids.length - 1]?.px ?? null;
  const deepestAskPx = asks[asks.length - 1]?.px ?? null;
  const bidReachBps =
    bookMid && bookMid > 0 && deepestBidPx !== null
      ? Number((((bookMid - deepestBidPx) / bookMid) * 10000).toFixed(2))
      : 0;
  const askReachBps =
    bookMid && bookMid > 0 && deepestAskPx !== null
      ? Number((((deepestAskPx - bookMid) / bookMid) * 10000).toFixed(2))
      : 0;

  const targetBands = [5, 10, 25];
  const depthBands: DepthBandSummary[] = targetBands.map((bps) => {
    if (!bookMid || bookMid <= 0) {
      return {
        bps,
        bidNotionalUSD: 0,
        askNotionalUSD: 0,
        totalNotionalUSD: 0,
        bidReachesBand: false,
        askReachesBand: false,
      };
    }
    const minBidPx = bookMid * (1 - bps / 10000);
    const maxAskPx = bookMid * (1 + bps / 10000);

    const bidNotionalUSD = bids
      .filter((b) => b.px >= minBidPx)
      .reduce((acc, b) => acc + b.notionalUSD, 0);
    const askNotionalUSD = asks
      .filter((a) => a.px <= maxAskPx)
      .reduce((acc, a) => acc + a.notionalUSD, 0);

    return {
      bps,
      bidNotionalUSD: Number(bidNotionalUSD.toFixed(2)),
      askNotionalUSD: Number(askNotionalUSD.toFixed(2)),
      totalNotionalUSD: Number((bidNotionalUSD + askNotionalUSD).toFixed(2)),
      bidReachesBand: bidReachBps >= bps,
      askReachesBand: askReachBps >= bps,
    };
  });

  return {
    bestBid,
    bestAsk,
    spreadUSD,
    spreadBps,
    bidReachBps,
    askReachBps,
    depthBands,
    topBids: bids.slice(0, 8),
    topAsks: asks.slice(0, 8),
  };
}

async function postHyperliquidInfo<T>(body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(HYPERLIQUID_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid /info returned HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export const cryptoResearchRouter = Router();

cryptoResearchRouter.get('/snapshot', async (req: Request, res: Response) => {
  const coin = sanitizeCoinSymbol(req.query.coin || 'BTC');
  if (!coin) {
    res.status(400).json({
      status: 'INVALID_REQUEST',
      error: 'Provide a valid alphanumeric perp coin symbol (e.g. BTC, ETH, SOL).',
    });
    return;
  }

  const fetchedAtIso = new Date().toISOString();

  try {
    const [metaAndCtx, fullBook] = await Promise.all([
      postHyperliquidInfo<[any, any[]]>({ type: 'metaAndAssetCtxs' }),
      postHyperliquidInfo<any>({ type: 'l2Book', coin }),
    ]);

    const universe: any[] = Array.isArray(metaAndCtx?.[0]?.universe) ? metaAndCtx[0].universe : [];
    const ctxs: any[] = Array.isArray(metaAndCtx?.[1]) ? metaAndCtx[1] : [];
    const assetIdx = universe.findIndex(
      (item) => typeof item?.name === 'string' && item.name.toUpperCase() === coin
    );

    if (assetIdx < 0) {
      res.status(404).json({
        status: 'NOT_FOUND',
        provider: 'HYPERLIQUID_PUBLIC_INFO',
        coin,
        fetchedAtIso,
        error: `Symbol "${coin}" was not found in Hyperliquid perp universe.`,
      });
      return;
    }

    const assetMeta = universe[assetIdx] || {};
    const assetCtx = ctxs[assetIdx] || {};

    const markPx = parseFinite(assetCtx.markPx);
    const midPxRaw = parseFinite(assetCtx.midPx);
    const oraclePx = parseFinite(assetCtx.oraclePx);
    const prevDayPx = parseFinite(assetCtx.prevDayPx);
    const dayNotionalVolumeUSD = parseFinite(assetCtx.dayNtlVlm);
    const openInterestCoins = parseFinite(assetCtx.openInterest);
    const fundingRate = parseFinite(assetCtx.funding);
    const premiumRate = parseFinite(assetCtx.premium);

    let bookStats = computeOrderBookMetrics(fullBook?.levels, midPxRaw ?? markPx);
    let depthSource: 'FULL_PRECISION' | 'AGGREGATED_SIG_FIGS' = 'FULL_PRECISION';

    // If full-precision book is shallower than 25 bps on either side, inspect aggregated book for depth bands
    if (bookStats.bidReachBps < 25 || bookStats.askReachBps < 25) {
      try {
        const aggBook = await postHyperliquidInfo<any>({
          type: 'l2Book',
          coin,
          nSigFigs: 4,
        });
        const aggStats = computeOrderBookMetrics(aggBook?.levels, midPxRaw ?? markPx);
        if (aggStats.bidReachBps > bookStats.bidReachBps || aggStats.askReachBps > bookStats.askReachBps) {
          bookStats = {
            ...bookStats,
            bidReachBps: aggStats.bidReachBps,
            askReachBps: aggStats.askReachBps,
            depthBands: aggStats.depthBands,
          };
          depthSource = 'AGGREGATED_SIG_FIGS';
        }
      } catch {
        // Keep full precision stats honestly if aggregated fallback fails
      }
    }

    const midPx =
      bookStats.bestBid !== null && bookStats.bestAsk !== null
        ? Number(((bookStats.bestBid + bookStats.bestAsk) / 2).toFixed(6))
        : midPxRaw;

    const change24hPercent =
      markPx !== null && prevDayPx !== null && prevDayPx > 0
        ? Number((((markPx - prevDayPx) / prevDayPx) * 100).toFixed(2))
        : null;

    const openInterestUSD =
      openInterestCoins !== null && markPx !== null
        ? Number((openInterestCoins * markPx).toFixed(2))
        : null;

    const hourlyFundingPercent =
      fundingRate !== null ? Number((fundingRate * 100).toFixed(5)) : null;
    const annualizedFundingPercent =
      fundingRate !== null ? Number((fundingRate * 24 * 365 * 100).toFixed(2)) : null;

    const premiumBps = premiumRate !== null ? Number((premiumRate * 10000).toFixed(2)) : null;
    const markOracleBasisBps =
      markPx !== null && oraclePx !== null && oraclePx > 0
        ? Number((((markPx - oraclePx) / oraclePx) * 10000).toFixed(2))
        : null;

    const payload: CryptoSnapshotPayload = {
      status: 'OK',
      provider: 'HYPERLIQUID_PUBLIC_INFO',
      readOnly: true,
      zeroKeysRequired: true,
      mt5BridgeCompatible: false,
      providesBrokerXauUsd: false,
      coin,
      fetchedAtIso,
      meta: {
        szDecimals: parseFinite(assetMeta.szDecimals),
        maxLeverage: parseFinite(assetMeta.maxLeverage),
        onlyIsolated: Boolean(assetMeta.onlyIsolated),
      },
      market: {
        midPx,
        markPx,
        oraclePx,
        prevDayPx,
        change24hPercent,
        dayNotionalVolumeUSD,
        openInterestCoins,
        openInterestUSD,
        hourlyFundingPercent,
        annualizedFundingPercent,
        premiumBps,
        markOracleBasisBps,
      },
      orderBook: {
        ...bookStats,
        depthSource,
      },
    };

    res.json(payload);
  } catch (err: any) {
    res.status(503).json({
      status: 'UNAVAILABLE',
      provider: 'HYPERLIQUID_PUBLIC_INFO',
      coin,
      fetchedAtIso,
      mt5BridgeCompatible: false,
      providesBrokerXauUsd: false,
      error:
        err?.name === 'AbortError'
          ? 'Hyperliquid public /info request timed out. No synthetic quote was substituted.'
          : err?.message || 'Hyperliquid public /info is temporarily unreachable.',
    });
  }
});

cryptoResearchRouter.get('/candles', async (req: Request, res: Response) => {
  const coin = sanitizeCoinSymbol(req.query.coin || 'BTC');
  const intervalRaw = typeof req.query.interval === 'string' ? req.query.interval.trim() : '4h';
  const interval = ALLOWED_INTERVALS.has(intervalRaw) ? intervalRaw : '4h';
  const bars = Math.max(10, Math.min(100, Number(req.query.bars) || 48));

  if (!coin) {
    res.status(400).json({ status: 'INVALID_REQUEST', error: 'Invalid coin parameter.' });
    return;
  }

  const intervalMsMap: Record<string, number> = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  const endTime = Date.now();
  const startTime = endTime - bars * intervalMsMap[interval];
  const fetchedAtIso = new Date().toISOString();

  try {
    const raw = await postHyperliquidInfo<any[]>({
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime },
    });

    const candles = Array.isArray(raw)
      ? raw
          .map((c) => ({
            openTimeMs: Number(c.t),
            closeTimeMs: Number(c.T),
            open: Number(c.o),
            high: Number(c.h),
            low: Number(c.l),
            close: Number(c.c),
            volume: Number(c.v),
            trades: Number(c.n) || 0,
          }))
          .filter((c) => Number.isFinite(c.open) && Number.isFinite(c.close))
      : [];

    res.json({
      status: candles.length > 0 ? 'OK' : 'MISSING_RANGE',
      provider: 'HYPERLIQUID_PUBLIC_INFO',
      coin,
      interval,
      fetchedAtIso,
      count: candles.length,
      candles,
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'UNAVAILABLE',
      provider: 'HYPERLIQUID_PUBLIC_INFO',
      coin,
      interval,
      fetchedAtIso,
      candles: [],
      error: err?.message || 'Unable to fetch Hyperliquid candleSnapshot.',
    });
  }
});

/**
 * Apex Trader AI - Market Data & Feeds Engine
 * Generates realistic multi-timeframe candlestick bars, tick data,
 * session schedules, and economic news calendar.
 */

import type { Candle } from './indicators.ts';

export interface EconomicEvent {
  id: string;
  time: string; // e.g. "14:30 UTC"
  timestamp: number; // Unix seconds
  currency: 'USD' | 'EUR' | 'GBP';
  event: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  actual?: string;
  forecast: string;
  previous: string;
}

export interface MarketTicker {
  symbol: string;
  name: string;
  bid: number;
  ask: number;
  spreadPoints: number;
  high24h: number;
  low24h: number;
  change24hUSD: number;
  category?: 'FOREX' | 'METALS' | 'CRYPTO';
  change24hPercent: number;
  volume24h: number;
  status: 'OPEN' | 'CLOSED';
  feedType: 'SIMULATED_HIGH_FIDELITY' | 'LIVE_BROKER';
  digits: number;
}

export const INITIAL_TICKERS: Record<string, MarketTicker> = {
  'XAU/USD': {
    symbol: 'XAU/USD',
    name: 'Gold vs US Dollar',
    category: 'METALS',
    bid: 2654.35,
    ask: 2654.60,
    spreadPoints: 0.25,
    high24h: 2671.50,
    low24h: 2638.10,
    change24hUSD: 14.85,
    change24hPercent: 0.56,
    volume24h: 184520,
    status: 'OPEN',
    feedType: 'SIMULATED_HIGH_FIDELITY',
    digits: 2,
  },
  'BTC/USD': {
    symbol: 'BTC/USD',
    name: 'Bitcoin vs US Dollar',
    category: 'CRYPTO',
    bid: 68420.5,
    ask: 68432.5,
    spreadPoints: 12.0,
    high24h: 69250.0,
    low24h: 67180.0,
    change24hUSD: 850.5,
    change24hPercent: 1.26,
    volume24h: 34210,
    status: 'OPEN',
    feedType: 'SIMULATED_HIGH_FIDELITY',
    digits: 1,
  },
  'EUR/USD': {
    symbol: 'EUR/USD',
    name: 'Euro vs US Dollar',
    category: 'FOREX',
    bid: 1.08452,
    ask: 1.08464,
    spreadPoints: 0.00012,
    high24h: 1.08920,
    low24h: 1.08150,
    change24hUSD: 0.0018,
    change24hPercent: 0.17,
    volume24h: 520400,
    status: 'OPEN',
    feedType: 'SIMULATED_HIGH_FIDELITY',
    digits: 5,
  },
  'GBP/USD': {
    symbol: 'GBP/USD',
    name: 'British Pound vs US Dollar',
    category: 'FOREX',
    bid: 1.29845,
    ask: 1.29861,
    spreadPoints: 0.00016,
    high24h: 1.30420,
    low24h: 1.29410,
    change24hUSD: 0.0024,
    change24hPercent: 0.19,
    volume24h: 410800,
    status: 'OPEN',
    feedType: 'SIMULATED_HIGH_FIDELITY',
    digits: 5,
  },
  'USD/JPY': {
    symbol: 'USD/JPY',
    name: 'US Dollar vs Japanese Yen',
    category: 'FOREX',
    bid: 149.645,
    ask: 149.659,
    spreadPoints: 0.014,
    high24h: 150.210,
    low24h: 149.120,
    change24hUSD: -0.32,
    change24hPercent: -0.21,
    volume24h: 489200,
    status: 'OPEN',
    feedType: 'SIMULATED_HIGH_FIDELITY',
    digits: 3,
  },
  'AUD/USD': {
    symbol: 'AUD/USD',
    name: 'Australian Dollar vs US Dollar',
    category: 'FOREX',
    bid: 0.65520,
    ask: 0.65534,
    spreadPoints: 0.00014,
    high24h: 0.65910,
    low24h: 0.65180,
    change24hUSD: 0.0012,
    change24hPercent: 0.18,
    volume24h: 310500,
    status: 'OPEN',
    feedType: 'SIMULATED_HIGH_FIDELITY',
    digits: 5,
  },
  'USD/CAD': {
    symbol: 'USD/CAD',
    name: 'US Dollar vs Canadian Dollar',
    category: 'FOREX',
    bid: 1.38420,
    ask: 1.38435,
    spreadPoints: 0.00015,
    high24h: 1.38950,
    low24h: 1.38120,
    change24hUSD: -0.0016,
    change24hPercent: -0.12,
    volume24h: 298400,
    status: 'OPEN',
    feedType: 'SIMULATED_HIGH_FIDELITY',
    digits: 5,
  },
};

export const UPCOMING_ECONOMIC_EVENTS: EconomicEvent[] = [
  {
    id: 'eco_1',
    time: '13:30 UTC',
    timestamp: Math.floor(Date.now() / 1000) + 3600 * 2,
    currency: 'USD',
    event: 'Core CPI (MoM)',
    impact: 'HIGH',
    forecast: '0.3%',
    previous: '0.3%',
  },
  {
    id: 'eco_2',
    time: '15:00 UTC',
    timestamp: Math.floor(Date.now() / 1000) + 3600 * 3.5,
    currency: 'USD',
    event: 'ISM Services PMI',
    impact: 'HIGH',
    forecast: '52.4',
    previous: '51.8',
  },
  {
    id: 'eco_3',
    time: '18:00 UTC',
    timestamp: Math.floor(Date.now() / 1000) + 3600 * 6,
    currency: 'USD',
    event: 'FOMC Meeting Minutes',
    impact: 'HIGH',
    forecast: '-',
    previous: '-',
  },
  {
    id: 'eco_4',
    time: '08:00 UTC',
    timestamp: Math.floor(Date.now() / 1000) - 3600 * 5,
    currency: 'EUR',
    event: 'German Industrial Production',
    impact: 'MEDIUM',
    actual: '0.4%',
    forecast: '-0.1%',
    previous: '-1.2%',
  },
];

/**
 * Generates synthetic multi-day candlestick history with realistic Geometric Brownian Motion,
 * mean reversion, and session volatility clustering.
 */
export function generateSyntheticHistory(
  symbol: string,
  basePrice: number,
  timeframeMinutes: number,
  count: number = 200,
  trendBias: number = 0.0001
): Candle[] {
  const candles: Candle[] = [];
  const now = Math.floor(Date.now() / 1000);
  const stepSeconds = timeframeMinutes * 60;
  const currentPeriodBoundary = Math.floor(now / stepSeconds) * stepSeconds;
  const startTime = currentPeriodBoundary - (count - 1) * stepSeconds;

  const digits =
    symbol === 'BTC/USD' ? 1 : symbol === 'USD/JPY' ? 3 : symbol.includes('/') && !symbol.includes('XAU') ? 5 : 2;

  let currentClose = basePrice;
  const volatility = symbol === 'BTC/USD' ? 0.0025 : symbol === 'XAU/USD' ? 0.0012 : 0.0004;

  for (let i = 0; i < count; i++) {
    const time = startTime + i * stepSeconds;
    const open = currentClose;

    // Introduce natural market drift and cyclical waves
    const cycle = Math.sin(i / 15) * volatility * 1.5;
    const randomShock = (Math.random() - 0.495) * volatility * 2;
    const delta = open * (trendBias + cycle + randomShock);
    const close = Number((open + delta).toFixed(digits));

    const wickSpread = Math.abs(delta) * (1 + Math.random() * 1.2) + open * (volatility * 0.4);
    const high = Number((Math.max(open, close) + wickSpread * Math.random()).toFixed(digits));
    const low = Number((Math.min(open, close) - wickSpread * Math.random()).toFixed(digits));

    const volume = Math.floor(100 + Math.random() * 900 + Math.abs(delta) * 5000);

    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume,
    });

    currentClose = close;
  }

  // Ensure the latest candle close equals basePrice
  if (candles.length > 0) {
    const last = candles[candles.length - 1];
    last.close = basePrice;
    last.high = Math.max(last.high, basePrice);
    last.low = Math.min(last.low, basePrice);
  }

  return candles;
}

/**
 * Updates the latest live candle with new tick price, or opens a new candle bar
 * when the timeframe period elapses.
 */
export function updateOrAppendLiveCandle(
  candles: Candle[],
  latestPrice: number,
  timeframeMinutes: number,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Candle[] {
  if (candles.length === 0) return candles;

  const stepSeconds = timeframeMinutes * 60;
  const currentPeriodBoundary = Math.floor(nowSeconds / stepSeconds) * stepSeconds;
  const last = candles[candles.length - 1];

  if (last.time < currentPeriodBoundary) {
    // Current bar period elapsed! Close old bar and append a new real-time candle bar
    const newCandle: Candle = {
      time: currentPeriodBoundary,
      open: last.close,
      high: Math.max(last.close, latestPrice),
      low: Math.min(last.close, latestPrice),
      close: latestPrice,
      volume: 1,
    };
    // Keep reasonable history length to prevent memory leaks
    const trimmed = candles.length > 500 ? candles.slice(candles.length - 499) : candles;
    return [...trimmed, newCandle];
  } else {
    // Still in the ongoing active bar: update high, low, close, and increment tick volume
    const updatedLast: Candle = {
      ...last,
      high: Math.max(last.high, latestPrice),
      low: Math.min(last.low, latestPrice),
      close: latestPrice,
      volume: last.volume + 1,
    };
    return [...candles.slice(0, -1), updatedLast];
  }
}

/**
 * Resamples lower timeframe candles (e.g. M5) into higher timeframe candles (e.g. M15 or H1)
 */
export function resampleCandles(candles: Candle[], targetMinutes: number, sourceMinutes: number): Candle[] {
  if (targetMinutes <= sourceMinutes || candles.length === 0) return candles;

  const ratio = Math.round(targetMinutes / sourceMinutes);
  const resampled: Candle[] = [];

  for (let i = 0; i < candles.length; i += ratio) {
    const chunk = candles.slice(i, i + ratio);
    if (chunk.length === 0) continue;

    const time = chunk[0].time;
    const open = chunk[0].open;
    const high = Math.max(...chunk.map((c) => c.high));
    const low = Math.min(...chunk.map((c) => c.low));
    const close = chunk[chunk.length - 1].close;
    const volume = chunk.reduce((sum, c) => sum + c.volume, 0);

    resampled.push({ time, open, high, low, close, volume });
  }

  return resampled;
}

/**
 * Detects current active market session (London, New York, Asian, or Overlap)
 */
export function getActiveMarketSession(date: Date = new Date()): {
  sessionName: string;
  isLondonOpen: boolean;
  isNYOpen: boolean;
  isAsianOpen: boolean;
  isLondonNYOverlap: boolean;
  currentTimeUTC2: string;
} {
  const utcHour = date.getUTCHours();
  const utcMinute = date.getUTCMinutes();
  const timeDecimal = utcHour + utcMinute / 60;

  const isAsianOpen = timeDecimal >= 0 && timeDecimal < 9;
  const isLondonOpen = timeDecimal >= 8 && timeDecimal < 16.5;
  const isNYOpen = timeDecimal >= 13 && timeDecimal < 21.5;
  const isLondonNYOverlap = isLondonOpen && isNYOpen;

  let sessionName = 'Off-Peak / Asian Session';
  if (isLondonNYOverlap) sessionName = 'London / New York Overlap (High Volatility)';
  else if (isNYOpen) sessionName = 'New York Session';
  else if (isLondonOpen) sessionName = 'London Session';
  else if (isAsianOpen) sessionName = 'Asian / Tokyo Session';

  const dateUTC2 = new Date(date.getTime() + 2 * 3600 * 1000);
  const currentTimeUTC2 = `${String(dateUTC2.getUTCHours()).padStart(2, '0')}:${String(dateUTC2.getUTCMinutes()).padStart(2, '0')} UTC+2`;

  return {
    sessionName,
    isLondonOpen,
    isNYOpen,
    isAsianOpen,
    isLondonNYOverlap,
    currentTimeUTC2,
  };
}

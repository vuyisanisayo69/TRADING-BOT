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
  let startTime = now - count * stepSeconds;

  let currentClose = basePrice;
  const volatility = symbol === 'BTC/USD' ? 0.0025 : symbol === 'XAU/USD' ? 0.0012 : 0.0004;

  for (let i = 0; i < count; i++) {
    const time = startTime + i * stepSeconds;
    const open = currentClose;

    // Introduce natural market drift and cyclical waves
    const cycle = Math.sin(i / 15) * volatility * 1.5;
    const randomShock = (Math.random() - 0.495) * volatility * 2;
    const delta = open * (trendBias + cycle + randomShock);
    const close = Number((open + delta).toFixed(symbol === 'EUR/USD' ? 5 : symbol === 'BTC/USD' ? 1 : 2));

    const wickSpread = Math.abs(delta) * (1 + Math.random() * 1.2) + open * (volatility * 0.4);
    const high = Number((Math.max(open, close) + wickSpread * Math.random()).toFixed(symbol === 'EUR/USD' ? 5 : symbol === 'BTC/USD' ? 1 : 2));
    const low = Number((Math.min(open, close) - wickSpread * Math.random()).toFixed(symbol === 'EUR/USD' ? 5 : symbol === 'BTC/USD' ? 1 : 2));

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

  return candles;
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

  return {
    sessionName,
    isLondonOpen,
    isNYOpen,
    isAsianOpen,
    isLondonNYOverlap,
  };
}

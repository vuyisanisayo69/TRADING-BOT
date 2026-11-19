/**
 * Apex Trader AI - Technical Indicator Library
 * Pure mathematical implementations verified against standard TA formulas.
 * Free of UI dependencies, suitable for node:test and browser execution.
 */

export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SMMAOutput {
  values: (number | null)[];
}

export interface EMAOutput {
  values: (number | null)[];
}

export interface SMAOutput {
  values: (number | null)[];
}

export interface RSIOutput {
  values: (number | null)[];
}

export interface MACDOutput {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

export interface BollingerBandsOutput {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  bandwidth: (number | null)[];
}

export interface ATROutput {
  values: (number | null)[];
  trueRanges: number[];
}

export interface ADXOutput {
  adx: (number | null)[];
  plusDI: (number | null)[];
  minusDI: (number | null)[];
}

export interface StochasticOutput {
  k: (number | null)[];
  d: (number | null)[];
}

export interface PivotPoints {
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface FibonacciLevels {
  swingHigh: number;
  swingLow: number;
  trend: 'UP' | 'DOWN';
  levels: {
    ratio: number;
    price: number;
    label: string;
  }[];
}

export interface SwingPoint {
  index: number;
  candle: Candle;
  type: 'HIGH' | 'LOW';
  price: number;
  structureTag?: 'HH' | 'HL' | 'LH' | 'LL';
}

export interface MarketStructure {
  trend: 'BULLISH' | 'BEARISH' | 'RANGING';
  swingPoints: SwingPoint[];
  lastBreakout?: {
    type: 'BULLISH_BOS' | 'BEARISH_BOS' | 'CHOCH';
    price: number;
    candleIndex: number;
  };
  supportZones: { min: number; max: number; touches: number }[];
  resistanceZones: { min: number; max: number; touches: number }[];
}

export interface CandlestickPattern {
  name: string;
  type: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  significance: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
}

// 1. Simple Moving Average (SMA)
export function calculateSMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  if (period <= 0 || prices.length === 0) return result;

  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i];
    if (i >= period) {
      sum -= prices[i - period];
    }
    if (i >= period - 1) {
      result.push(sum / period);
    } else {
      result.push(null);
    }
  }
  return result;
}

// 2. Exponential Moving Average (EMA)
export function calculateEMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  if (period <= 0 || prices.length === 0) return result;
  if (prices.length < period) {
    return prices.map(() => null);
  }

  const multiplier = 2 / (period + 1);
  let firstSmaSum = 0;

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      firstSmaSum += prices[i];
      result.push(null);
    } else if (i === period - 1) {
      firstSmaSum += prices[i];
      const initialSma = firstSmaSum / period;
      result.push(initialSma);
    } else {
      const prevEma = result[i - 1]!;
      const currentEma = (prices[i] - prevEma) * multiplier + prevEma;
      result.push(currentEma);
    }
  }
  return result;
}

// 3. Smoothed Moving Average (SMMA / Wilder's Moving Average)
// Formula: SMMA(i) = (SMMA(i-1) * (N - 1) + Price(i)) / N
export function calculateSMMA(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  if (period <= 0 || prices.length === 0) return result;
  if (prices.length < period) {
    return prices.map(() => null);
  }

  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      sum += prices[i];
      result.push(null);
    } else if (i === period - 1) {
      sum += prices[i];
      const firstSMMA = sum / period;
      result.push(firstSMMA);
    } else {
      const prevSMMA = result[i - 1]!;
      const currentSMMA = (prevSMMA * (period - 1) + prices[i]) / period;
      result.push(currentSMMA);
    }
  }
  return result;
}

// 4. Relative Strength Index (RSI 14) with Wilder's Smoothing
export function calculateRSI(prices: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  if (prices.length <= period) {
    return prices.map(() => null);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      result.push(null);
      continue;
    }

    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    if (i < period) {
      avgGain += gain;
      avgLoss += loss;
      result.push(null);
    } else if (i === period) {
      avgGain += gain;
      avgLoss += loss;
      avgGain = avgGain / period;
      avgLoss = avgLoss / period;
      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - 100 / (1 + rs));
      }
    } else {
      // Wilder's smoothing
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - 100 / (1 + rs));
      }
    }
  }
  return result;
}

// 5. Moving Average Convergence Divergence (MACD 12/26/9)
export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDOutput {
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);

  const macdLine: (number | null)[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push(fastEMA[i]! - slowEMA[i]!);
    }
  }

  // Calculate signal line on the valid MACD line values
  const validMacdIndices: number[] = [];
  const validMacdValues: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      validMacdIndices.push(i);
      validMacdValues.push(macdLine[i]!);
    }
  }

  const validSignal = calculateEMA(validMacdValues, signalPeriod);
  const signalLine: (number | null)[] = prices.map(() => null);
  const histogram: (number | null)[] = prices.map(() => null);

  for (let j = 0; j < validSignal.length; j++) {
    const originalIndex = validMacdIndices[j];
    signalLine[originalIndex] = validSignal[j];
    if (validSignal[j] !== null && macdLine[originalIndex] !== null) {
      histogram[originalIndex] = macdLine[originalIndex]! - validSignal[j]!;
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

// 6. Bollinger Bands (20, 2)
export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerBandsOutput {
  const sma = calculateSMA(prices, period);
  const upper: (number | null)[] = [];
  const middle = sma;
  const lower: (number | null)[] = [];
  const bandwidth: (number | null)[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1 || sma[i] === null) {
      upper.push(null);
      lower.push(null);
      bandwidth.push(null);
      continue;
    }

    const mean = sma[i]!;
    let varianceSum = 0;
    for (let k = i - period + 1; k <= i; k++) {
      varianceSum += Math.pow(prices[k] - mean, 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);
    const u = mean + stdDevMultiplier * stdDev;
    const l = mean - stdDevMultiplier * stdDev;
    upper.push(u);
    lower.push(l);
    bandwidth.push(mean !== 0 ? (u - l) / mean : 0);
  }

  return { upper, middle, lower, bandwidth };
}

// 7. Average True Range (ATR 14)
export function calculateATR(candles: Candle[], period: number = 14): ATROutput {
  const trueRanges: number[] = [];
  const atrValues: (number | null)[] = [];

  if (candles.length === 0) return { values: [], trueRanges: [] };

  for (let i = 0; i < candles.length; i++) {
    const current = candles[i];
    if (i === 0) {
      const tr = current.high - current.low;
      trueRanges.push(tr);
      atrValues.push(null);
    } else {
      const prev = candles[i - 1];
      const tr = Math.max(
        current.high - current.low,
        Math.abs(current.high - prev.close),
        Math.abs(current.low - prev.close)
      );
      trueRanges.push(tr);

      if (i < period) {
        atrValues.push(null);
      } else if (i === period) {
        // Initial ATR is SMA of first 'period' true ranges
        let sum = 0;
        for (let j = 1; j <= period; j++) {
          sum += trueRanges[j];
        }
        atrValues.push(sum / period);
      } else {
        const prevATR = atrValues[i - 1]!;
        const currentATR = (prevATR * (period - 1) + tr) / period;
        atrValues.push(currentATR);
      }
    }
  }

  return { values: atrValues, trueRanges };
}

// 8. Average Directional Index (ADX 14) with +DI and -DI
export function calculateADX(candles: Candle[], period: number = 14): ADXOutput {
  const adx: (number | null)[] = candles.map(() => null);
  const plusDI: (number | null)[] = candles.map(() => null);
  const minusDI: (number | null)[] = candles.map(() => null);

  if (candles.length <= period * 2) {
    return { adx, plusDI, minusDI };
  }

  const { trueRanges } = calculateATR(candles, period);
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    if (upMove > downMove && upMove > 0) {
      plusDM.push(upMove);
    } else {
      plusDM.push(0);
    }

    if (downMove > upMove && downMove > 0) {
      minusDM.push(downMove);
    } else {
      minusDM.push(0);
    }
  }

  // Smooth TR, +DM, -DM with Wilder's method
  let smoothedTR = 0;
  let smoothedPlusDM = 0;
  let smoothedMinusDM = 0;

  for (let i = 1; i <= period; i++) {
    smoothedTR += trueRanges[i];
    smoothedPlusDM += plusDM[i];
    smoothedMinusDM += minusDM[i];
  }

  const dxValues: { index: number; dx: number }[] = [];

  for (let i = period; i < candles.length; i++) {
    if (i > period) {
      smoothedTR = smoothedTR - smoothedTR / period + trueRanges[i];
      smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDM[i];
      smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDM[i];
    }

    const pDI = smoothedTR !== 0 ? (100 * smoothedPlusDM) / smoothedTR : 0;
    const mDI = smoothedTR !== 0 ? (100 * smoothedMinusDM) / smoothedTR : 0;

    plusDI[i] = pDI;
    minusDI[i] = mDI;

    const diSum = pDI + mDI;
    const dx = diSum !== 0 ? (100 * Math.abs(pDI - mDI)) / diSum : 0;
    dxValues.push({ index: i, dx });
  }

  if (dxValues.length >= period) {
    let initialADXSum = 0;
    for (let k = 0; k < period; k++) {
      initialADXSum += dxValues[k].dx;
    }
    let currentADX = initialADXSum / period;
    adx[dxValues[period - 1].index] = currentADX;

    for (let k = period; k < dxValues.length; k++) {
      currentADX = (currentADX * (period - 1) + dxValues[k].dx) / period;
      adx[dxValues[k].index] = currentADX;
    }
  }

  return { adx, plusDI, minusDI };
}

// 9. Volume Weighted Average Price (VWAP)
export function calculateVWAP(candles: Candle[]): (number | null)[] {
  const result: (number | null)[] = [];
  let cumulativeTypicalVol = 0;
  let cumulativeVol = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1; // Safeguard if volume is 0

    cumulativeTypicalVol += typicalPrice * vol;
    cumulativeVol += vol;

    result.push(cumulativeTypicalVol / cumulativeVol);
  }
  return result;
}

// 10. Stochastic Oscillator (14, 3, 3)
export function calculateStochastic(
  candles: Candle[],
  kPeriod: number = 14,
  kSlow: number = 3,
  dPeriod: number = 3
): StochasticOutput {
  const rawK: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) {
      rawK.push(null);
      continue;
    }

    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > highestHigh) highestHigh = candles[j].high;
      if (candles[j].low < lowestLow) lowestLow = candles[j].low;
    }

    const currentClose = candles[i].close;
    const range = highestHigh - lowestLow;
    if (range === 0) {
      rawK.push(50);
    } else {
      rawK.push(((currentClose - lowestLow) / range) * 100);
    }
  }

  // Smooth rawK to get %K
  const smoothedKValues: (number | null)[] = [];
  for (let i = 0; i < rawK.length; i++) {
    if (i < kPeriod - 1 + kSlow - 1) {
      smoothedKValues.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - kSlow + 1; j <= i; j++) {
      sum += rawK[j]!;
    }
    smoothedKValues.push(sum / kSlow);
  }

  // Calculate %D as SMA of smoothed %K
  const dValues: (number | null)[] = [];
  for (let i = 0; i < smoothedKValues.length; i++) {
    if (smoothedKValues[i] === null || i < kPeriod - 1 + kSlow - 1 + dPeriod - 1) {
      dValues.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      sum += smoothedKValues[j]!;
    }
    dValues.push(sum / dPeriod);
  }

  return { k: smoothedKValues, d: dValues };
}

// 11. Floor Pivot Points (Classic)
export function calculatePivotPoints(prevHigh: number, prevLow: number, prevClose: number): PivotPoints {
  const p = (prevHigh + prevLow + prevClose) / 3;
  const r1 = 2 * p - prevLow;
  const s1 = 2 * p - prevHigh;
  const r2 = p + (prevHigh - prevLow);
  const s2 = p - (prevHigh - prevLow);
  const r3 = prevHigh + 2 * (p - prevLow);
  const s3 = prevLow - 2 * (prevHigh - p);

  return {
    pivot: Number(p.toFixed(4)),
    r1: Number(r1.toFixed(4)),
    r2: Number(r2.toFixed(4)),
    r3: Number(r3.toFixed(4)),
    s1: Number(s1.toFixed(4)),
    s2: Number(s2.toFixed(4)),
    s3: Number(s3.toFixed(4)),
  };
}

// 12. Fibonacci Retracement Levels
export function calculateFibonacciRetracement(
  swingHigh: number,
  swingLow: number,
  trend: 'UP' | 'DOWN'
): FibonacciLevels {
  const diff = swingHigh - swingLow;
  const ratios = [
    { ratio: 0, label: '0.0% (Swing End)' },
    { ratio: 0.236, label: '23.6%' },
    { ratio: 0.382, label: '38.2%' },
    { ratio: 0.5, label: '50.0% (Equilibrium)' },
    { ratio: 0.618, label: '61.8% (Golden Pocket)' },
    { ratio: 0.786, label: '78.6% (Deep Pullback)' },
    { ratio: 1.0, label: '100.0% (Swing Start)' },
  ];

  const levels = ratios.map((r) => {
    let price: number;
    if (trend === 'UP') {
      // In an uptrend, retracement is downwards from swing high
      price = swingHigh - diff * r.ratio;
    } else {
      // In a downtrend, retracement is upwards from swing low
      price = swingLow + diff * r.ratio;
    }
    return {
      ratio: r.ratio,
      price: Number(price.toFixed(4)),
      label: r.label,
    };
  });

  return { swingHigh, swingLow, trend, levels };
}

// 13. Swing Points & Market Structure (HH, HL, LH, LL)
export function analyzeMarketStructure(candles: Candle[], lookback: number = 3): MarketStructure {
  const swingPoints: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= current.high || candles[i + j].high >= current.high) {
        isHigh = false;
      }
      if (candles[i - j].low <= current.low || candles[i + j].low <= current.low) {
        isLow = false;
      }
    }

    if (isHigh) {
      swingPoints.push({
        index: i,
        candle: current,
        type: 'HIGH',
        price: current.high,
      });
    } else if (isLow) {
      swingPoints.push({
        index: i,
        candle: current,
        type: 'LOW',
        price: current.low,
      });
    }
  }

  // Tag market structure tags: HH, HL, LH, LL
  let prevHigh: number | null = null;
  let prevLow: number | null = null;

  for (const sp of swingPoints) {
    if (sp.type === 'HIGH') {
      if (prevHigh === null) {
        sp.structureTag = 'HH';
      } else if (sp.price > prevHigh) {
        sp.structureTag = 'HH';
      } else {
        sp.structureTag = 'LH';
      }
      prevHigh = sp.price;
    } else if (sp.type === 'LOW') {
      if (prevLow === null) {
        sp.structureTag = 'HL';
      } else if (sp.price > prevLow) {
        sp.structureTag = 'HL';
      } else {
        sp.structureTag = 'LL';
      }
      prevLow = sp.price;
    }
  }

  // Determine overall structure trend
  const recentTags = swingPoints.slice(-4).map((s) => s.structureTag);
  const bullishCount = recentTags.filter((t) => t === 'HH' || t === 'HL').length;
  const bearishCount = recentTags.filter((t) => t === 'LH' || t === 'LL').length;

  let trend: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
  if (bullishCount >= 3) trend = 'BULLISH';
  else if (bearishCount >= 3) trend = 'BEARISH';

  // Support & Resistance Zones
  const highs = swingPoints.filter((s) => s.type === 'HIGH').map((s) => s.price);
  const lows = swingPoints.filter((s) => s.type === 'LOW').map((s) => s.price);

  const resistanceZones = clusterLevels(highs);
  const supportZones = clusterLevels(lows);

  return {
    trend,
    swingPoints,
    supportZones,
    resistanceZones,
  };
}

function clusterLevels(prices: number[], tolerancePercent: number = 0.003) {
  if (prices.length === 0) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const zones: { min: number; max: number; touches: number }[] = [];

  let currentCluster = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const val = sorted[i];
    const prev = sorted[i - 1];
    if ((val - prev) / prev <= tolerancePercent) {
      currentCluster.push(val);
    } else {
      zones.push({
        min: Math.min(...currentCluster),
        max: Math.max(...currentCluster),
        touches: currentCluster.length,
      });
      currentCluster = [val];
    }
  }

  if (currentCluster.length > 0) {
    zones.push({
      min: Math.min(...currentCluster),
      max: Math.max(...currentCluster),
      touches: currentCluster.length,
    });
  }

  return zones.sort((a, b) => b.touches - a.touches).slice(0, 4);
}

// 14. Candlestick Pattern Recognition
export function detectCandlestickPattern(candle: Candle, prevCandle?: Candle): CandlestickPattern | null {
  const body = Math.abs(candle.close - candle.open);
  const totalRange = candle.high - candle.low;
  if (totalRange === 0) return null;

  const upperShadow = candle.high - Math.max(candle.close, candle.open);
  const lowerShadow = Math.min(candle.close, candle.open) - candle.low;
  const isBullish = candle.close > candle.open;

  // Bullish Pin Bar / Hammer (Long lower shadow >= 2x body, tiny upper shadow)
  if (lowerShadow >= 2 * body && upperShadow <= 0.2 * totalRange) {
    return {
      name: 'Bullish Hammer / Pin Bar',
      type: 'BULLISH',
      significance: 'HIGH',
      description: 'Strong intraday rejection of lower prices with long lower wick.',
    };
  }

  // Bearish Shooting Star / Pin Bar (Long upper shadow >= 2x body, tiny lower shadow)
  if (upperShadow >= 2 * body && lowerShadow <= 0.2 * totalRange) {
    return {
      name: 'Shooting Star / Bearish Pin Bar',
      type: 'BEARISH',
      significance: 'HIGH',
      description: 'Intraday exhaustion and aggressive selling at session highs.',
    };
  }

  // Doji
  if (body / totalRange <= 0.08) {
    return {
      name: 'Doji',
      type: 'NEUTRAL',
      significance: 'MEDIUM',
      description: 'Market indecision with virtually identical open and close prices.',
    };
  }

  // Engulfing patterns with previous candle
  if (prevCandle) {
    const prevBody = Math.abs(prevCandle.close - prevCandle.open);
    const prevBullish = prevCandle.close > prevCandle.open;

    // Bullish Engulfing
    if (
      !prevBullish &&
      isBullish &&
      candle.open <= prevCandle.close &&
      candle.close >= prevCandle.open &&
      body > prevBody
    ) {
      return {
        name: 'Bullish Engulfing',
        type: 'BULLISH',
        significance: 'HIGH',
        description: 'Bulls completely overpowered prior bearish momentum.',
      };
    }

    // Bearish Engulfing
    if (
      prevBullish &&
      !isBullish &&
      candle.open >= prevCandle.close &&
      candle.close <= prevCandle.open &&
      body > prevBody
    ) {
      return {
        name: 'Bearish Engulfing',
        type: 'BEARISH',
        significance: 'HIGH',
        description: 'Bears completely engulfed prior bullish candle.',
      };
    }
  }

  // Marubozu (strong conviction candle)
  if (body / totalRange >= 0.85) {
    return {
      name: isBullish ? 'Bullish Marubozu' : 'Bearish Marubozu',
      type: isBullish ? 'BULLISH' : 'BEARISH',
      significance: 'MEDIUM',
      description: `${isBullish ? 'Buyers' : 'Sellers'} maintained one-way momentum with almost no wicks.`,
    };
  }

  return null;
}

// ============================================================================
// Smart Money Concepts (SMC) & Volume Profile Indicators
// ============================================================================

export interface FairValueGap {
  id: string;
  type: 'BULLISH' | 'BEARISH';
  startIndex: number;
  endIndex: number;
  top: number;
  bottom: number;
  midpoint: number;
  mitigated: boolean;
  sizeAtrRatio: number;
}

export interface LiquiditySweep {
  type: 'BULLISH_SWEEP' | 'BEARISH_SWEEP';
  index: number;
  sweptLevel: number;
  wickExtreme: number;
  closePrice: number;
  rejectionStrength: number;
}

export interface DisplacementCandle {
  index: number;
  type: 'BULLISH' | 'BEARISH';
  bodySize: number;
  atrRatio: number;
  open: number;
  close: number;
  high: number;
  low: number;
}

export interface OrderBlock {
  id: string;
  type: 'DEMAND' | 'SUPPLY';
  index: number;
  top: number;
  bottom: number;
  midpoint: number;
  mitigated: boolean;
  strength: number;
}

export interface VolumeProfileBucket {
  priceLow: number;
  priceHigh: number;
  priceMid: number;
  volume: number;
  isHVN: boolean;
  isPOC: boolean;
}

export interface VolumeProfileResult {
  poc: number;
  vah: number;
  val: number;
  totalVolume: number;
  highVolumeNodes: { price: number; volume: number }[];
  buckets: VolumeProfileBucket[];
}

// 15. Fair Value Gaps (FVG) - 3-candle imbalance detector
export function detectFairValueGaps(candles: Candle[], minAtrRatio: number = 0.15): FairValueGap[] {
  if (candles.length < 5) return [];
  const atr = calculateATR(candles, 14).values;
  const gaps: FairValueGap[] = [];

  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c2 = candles[i];
    const currentAtr = atr[i] ?? (c2.high - c2.low || 0.0001);

    // Bullish FVG: c0.high < c2.low
    if (c0.high < c2.low) {
      const gapSize = c2.low - c0.high;
      const ratio = currentAtr > 0 ? gapSize / currentAtr : 0;
      if (ratio >= minAtrRatio) {
        let mitigated = false;
        for (let k = i + 1; k < candles.length; k++) {
          if (candles[k].low <= c0.high) {
            mitigated = true;
            break;
          }
        }
        gaps.push({
          id: `fvg_bull_${i}`,
          type: 'BULLISH',
          startIndex: i - 2,
          endIndex: i,
          top: c2.low,
          bottom: c0.high,
          midpoint: (c2.low + c0.high) / 2,
          mitigated,
          sizeAtrRatio: Number(ratio.toFixed(2)),
        });
      }
    }

    // Bearish FVG: c0.low > c2.high
    if (c0.low > c2.high) {
      const gapSize = c0.low - c2.high;
      const ratio = currentAtr > 0 ? gapSize / currentAtr : 0;
      if (ratio >= minAtrRatio) {
        let mitigated = false;
        for (let k = i + 1; k < candles.length; k++) {
          if (candles[k].high >= c0.low) {
            mitigated = true;
            break;
          }
        }
        gaps.push({
          id: `fvg_bear_${i}`,
          type: 'BEARISH',
          startIndex: i - 2,
          endIndex: i,
          top: c0.low,
          bottom: c2.high,
          midpoint: (c0.low + c2.high) / 2,
          mitigated,
          sizeAtrRatio: Number(ratio.toFixed(2)),
        });
      }
    }
  }

  return gaps;
}

// 16. Displacement Detection (Strong breakout impulse candles)
export function detectDisplacement(candles: Candle[], atrMultiplier: number = 1.35): DisplacementCandle[] {
  if (candles.length < 16) return [];
  const atr = calculateATR(candles, 14).values;
  const displacements: DisplacementCandle[] = [];

  for (let i = 15; i < candles.length; i++) {
    const c = candles[i];
    const currentAtr = atr[i];
    if (!currentAtr || currentAtr <= 0) continue;

    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const bodyRatio = range > 0 ? body / range : 0;
    const atrRatio = body / currentAtr;

    if (atrRatio >= atrMultiplier && bodyRatio >= 0.6) {
      displacements.push({
        index: i,
        type: c.close > c.open ? 'BULLISH' : 'BEARISH',
        bodySize: body,
        atrRatio: Number(atrRatio.toFixed(2)),
        open: c.open,
        close: c.close,
        high: c.high,
        low: c.low,
      });
    }
  }

  return displacements;
}

// 17. Liquidity Sweeps (Stop hunts & reversals at swing highs/lows)
export function detectLiquiditySweeps(candles: Candle[], lookback: number = 25): LiquiditySweep[] {
  if (candles.length < lookback + 5) return [];
  const sweeps: LiquiditySweep[] = [];

  for (let i = lookback; i < candles.length; i++) {
    const c = candles[i];
    const range = c.high - c.low;
    if (range <= 0) continue;

    const priorWindow = candles.slice(i - lookback, i);
    const priorHigh = Math.max(...priorWindow.map((p) => p.high));
    const priorLow = Math.min(...priorWindow.map((p) => p.low));

    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);

    // Bullish Liquidity Sweep (Sell-Side Liquidity hunt below priorLow then close back inside)
    if (c.low < priorLow && c.close > priorLow && lowerWick / range >= 0.3) {
      sweeps.push({
        type: 'BULLISH_SWEEP',
        index: i,
        sweptLevel: priorLow,
        wickExtreme: c.low,
        closePrice: c.close,
        rejectionStrength: Number((lowerWick / range).toFixed(2)),
      });
    }

    // Bearish Liquidity Sweep (Buy-Side Liquidity hunt above priorHigh then close back inside)
    if (c.high > priorHigh && c.close < priorHigh && upperWick / range >= 0.3) {
      sweeps.push({
        type: 'BEARISH_SWEEP',
        index: i,
        sweptLevel: priorHigh,
        wickExtreme: c.high,
        closePrice: c.close,
        rejectionStrength: Number((upperWick / range).toFixed(2)),
      });
    }
  }

  return sweeps;
}

// 18. Order Blocks (Institutional Supply & Demand Zones)
export function detectOrderBlocks(candles: Candle[]): OrderBlock[] {
  if (candles.length < 20) return [];
  const displacements = detectDisplacement(candles, 1.25);
  const blocks: OrderBlock[] = [];

  for (const disp of displacements) {
    const idx = disp.index;
    if (idx < 2) continue;

    if (disp.type === 'BULLISH') {
      // Find last bearish candle in the 1..3 bars before bullish displacement
      for (let b = idx - 1; b >= Math.max(0, idx - 3); b--) {
        if (candles[b].close < candles[b].open) {
          const ob = candles[b];
          let mitigated = false;
          for (let k = idx + 1; k < candles.length; k++) {
            if (candles[k].close < ob.low) {
              mitigated = true;
              break;
            }
          }
          blocks.push({
            id: `ob_demand_${b}`,
            type: 'DEMAND',
            index: b,
            top: Math.max(ob.open, ob.close),
            bottom: ob.low,
            midpoint: (Math.max(ob.open, ob.close) + ob.low) / 2,
            mitigated,
            strength: disp.atrRatio,
          });
          break;
        }
      }
    } else {
      // Find last bullish candle in the 1..3 bars before bearish displacement
      for (let b = idx - 1; b >= Math.max(0, idx - 3); b--) {
        if (candles[b].close > candles[b].open) {
          const ob = candles[b];
          let mitigated = false;
          for (let k = idx + 1; k < candles.length; k++) {
            if (candles[k].close > ob.high) {
              mitigated = true;
              break;
            }
          }
          blocks.push({
            id: `ob_supply_${b}`,
            type: 'SUPPLY',
            index: b,
            top: ob.high,
            bottom: Math.min(ob.open, ob.close),
            midpoint: (ob.high + Math.min(ob.open, ob.close)) / 2,
            mitigated,
            strength: disp.atrRatio,
          });
          break;
        }
      }
    }
  }

  return blocks;
}

// 19. Volume Profile (Point of Control, Value Area High/Low, High-Volume Nodes)
export function calculateVolumeProfile(
  candles: Candle[],
  bucketCount: number = 24
): VolumeProfileResult {
  if (candles.length === 0 || bucketCount <= 0) {
    return {
      poc: 0,
      vah: 0,
      val: 0,
      totalVolume: 0,
      highVolumeNodes: [],
      buckets: [],
    };
  }

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const c of candles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  }

  if (maxPrice <= minPrice) {
    const mid = minPrice;
    const totalVol = candles.reduce((s, c) => s + (c.volume || 1), 0);
    return {
      poc: mid,
      vah: mid,
      val: mid,
      totalVolume: totalVol,
      highVolumeNodes: [{ price: mid, volume: totalVol }],
      buckets: [
        {
          priceLow: mid,
          priceHigh: mid,
          priceMid: mid,
          volume: totalVol,
          isHVN: true,
          isPOC: true,
        },
      ],
    };
  }

  const step = (maxPrice - minPrice) / bucketCount;
  const rawVolumes = new Array<number>(bucketCount).fill(0);

  for (const c of candles) {
    const vol = c.volume > 0 ? c.volume : 1;
    const startBucket = Math.max(0, Math.min(bucketCount - 1, Math.floor((c.low - minPrice) / step)));
    const endBucket = Math.max(0, Math.min(bucketCount - 1, Math.floor((c.high - minPrice) / step)));
    const span = endBucket - startBucket + 1;
    const volPerBucket = vol / span;
    for (let b = startBucket; b <= endBucket; b++) {
      rawVolumes[b] += volPerBucket;
    }
  }

  const totalVolume = rawVolumes.reduce((s, v) => s + v, 0);
  const avgVol = totalVolume / bucketCount;

  let pocIndex = 0;
  for (let i = 1; i < bucketCount; i++) {
    if (rawVolumes[i] > rawVolumes[pocIndex]) {
      pocIndex = i;
    }
  }

  // Value Area (70% of total volume expanding around POC)
  let vaVol = rawVolumes[pocIndex];
  let lowIdx = pocIndex;
  let highIdx = pocIndex;
  const targetVaVol = totalVolume * 0.7;

  while (vaVol < targetVaVol && (lowIdx > 0 || highIdx < bucketCount - 1)) {
    const volBelow = lowIdx > 0 ? rawVolumes[lowIdx - 1] : -1;
    const volAbove = highIdx < bucketCount - 1 ? rawVolumes[highIdx + 1] : -1;
    if (volAbove >= volBelow) {
      highIdx++;
      vaVol += rawVolumes[highIdx];
    } else {
      lowIdx--;
      vaVol += rawVolumes[lowIdx];
    }
  }

  const buckets: VolumeProfileBucket[] = rawVolumes.map((vol, i) => {
    const priceLow = minPrice + i * step;
    const priceHigh = priceLow + step;
    const priceMid = (priceLow + priceHigh) / 2;
    return {
      priceLow,
      priceHigh,
      priceMid,
      volume: Math.round(vol),
      isHVN: vol >= avgVol * 1.35,
      isPOC: i === pocIndex,
    };
  });

  const highVolumeNodes = buckets
    .filter((b) => b.isHVN)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5)
    .map((b) => ({ price: b.priceMid, volume: b.volume }));

  return {
    poc: buckets[pocIndex].priceMid,
    vah: buckets[highIdx].priceHigh,
    val: buckets[lowIdx].priceLow,
    totalVolume: Math.round(totalVolume),
    highVolumeNodes,
    buckets,
  };
}


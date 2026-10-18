/**
 * Apex Trader AI - Rules-Based Strategy & Signal Engine
 * Implements multi-timeframe trend-pullback analysis, scoring,
 * strict invalidation checks, and NO TRADE defaults.
 */

import {
  calculateSMMA,
  calculateEMA,
  calculateSMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateBollingerBands,
  calculateADX,
  analyzeMarketStructure,
  detectCandlestickPattern,
} from './indicators.ts';
import type { Candle, MarketStructure } from './indicators.ts';
import {
  evaluateOrderRisk,
  INSTRUMENT_SPECS,
} from './risk.ts';
import type {
  AccountState,
  RiskConfig,
  PositionSizeResult,
} from './risk.ts';

export type SignalAction = 'LONG' | 'SHORT' | 'NO_TRADE';

export interface SignalRuleCheck {
  id: string;
  name: string;
  weight: number;
  passed: boolean;
  scoreAwarded: number;
  details: string;
}

export interface TradingSignal {
  id: string;
  symbol: string;
  timeframe: string;
  timestamp: number;
  action: SignalAction;
  status: 'PENDING_CONFIRMATION' | 'ACTIVE' | 'INVALIDATED' | 'TARGET_REACHED' | 'STOPPED_OUT' | 'NO_SETUP';
  qualityScore: number; // 0 - 100 rules-based point score
  entryZone: { min: number; max: number; recommended: number };
  stopLoss: number;
  takeProfit1: number; // 1.5R - 2.0R
  takeProfit2: number; // Major structural target / 3.0R
  rewardToRiskRatio: number;
  positionSizing: PositionSizeResult;
  ruleChecks: SignalRuleCheck[];
  supportingReasons: string[];
  invalidationConditions: string[];
  marketContext: {
    h1Trend: 'BULLISH' | 'BEARISH' | 'RANGING';
    m15Structure: 'BULLISH' | 'BEARISH' | 'RANGING';
    m5Pattern?: string;
    rsiValue: number;
    macdHistogram: number;
    adxTrendStrength: number;
    atrValue: number;
    currentSpread: number;
    smma5: number;
    smma50: number;
  };
  explanation?: string;
}

export interface MultiTimeframeCandleSet {
  symbol: string;
  m5: Candle[];
  m15: Candle[];
  h1: Candle[];
  currentSpread?: number;
  economicRiskNearby?: boolean;
  upcomingEventTitle?: string;
}

/**
 * Analyzes market data across M5, M15, and H1 timeframes using
 * the 10-step Trend-Pullback and Market Structure strategy.
 */
export function generateTradingSignal(
  data: MultiTimeframeCandleSet,
  account: AccountState,
  riskConfig: RiskConfig
): TradingSignal {
  const { symbol, m5, m15, h1 } = data;
  const spec = INSTRUMENT_SPECS[symbol] || INSTRUMENT_SPECS['XAU/USD'];
  const spread = data.currentSpread ?? spec.typicalSpreadPoints;

  // Edge cases: insufficient data
  if (!h1 || h1.length < 50 || !m15 || m15.length < 50 || !m5 || m5.length < 50) {
    return createNoTradeSignal(
      symbol,
      'M5',
      Date.now(),
      'Insufficient candle history across required timeframes (H1, M15, M5) to compute indicators reliably.'
    );
  }

  // 1. Higher Timeframe Trend (H1)
  const h1Closes = h1.map((c) => c.close);
  const h1Ema50 = calculateEMA(h1Closes, 50);
  const h1Ema200 = calculateEMA(h1Closes, 200);
  const h1Structure = analyzeMarketStructure(h1, 3);
  const h1CurrentClose = h1[h1.length - 1].close;

  const h1LastEma50 = h1Ema50[h1Ema50.length - 1] ?? h1CurrentClose;
  const h1LastEma200 = h1Ema200[h1Ema200.length - 1] ?? h1CurrentClose;

  let h1Trend: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
  if (h1CurrentClose > h1LastEma50 && h1LastEma50 > h1LastEma200 && h1Structure.trend === 'BULLISH') {
    h1Trend = 'BULLISH';
  } else if (h1CurrentClose < h1LastEma50 && h1LastEma50 < h1LastEma200 && h1Structure.trend === 'BEARISH') {
    h1Trend = 'BEARISH';
  } else if (h1CurrentClose > h1LastEma50 && h1Structure.trend === 'BULLISH') {
    h1Trend = 'BULLISH';
  } else if (h1CurrentClose < h1LastEma50 && h1Structure.trend === 'BEARISH') {
    h1Trend = 'BEARISH';
  }

  // 2. Intermediate Market Structure (M15)
  const m15Closes = m15.map((c) => c.close);
  const m15Structure = analyzeMarketStructure(m15, 3);
  const m15Smma5 = calculateSMMA(m15Closes, 5);
  const m15Smma50 = calculateSMMA(m15Closes, 50);
  const lastM15Smma5 = m15Smma5[m15Smma5.length - 1] ?? m15Closes[m15Closes.length - 1];
  const lastM15Smma50 = m15Smma50[m15Smma50.length - 1] ?? m15Closes[m15Closes.length - 1];

  // 3. Lower Timeframe Execution Indicators (M5)
  const m5Closes = m5.map((c) => c.close);
  const m5Rsi = calculateRSI(m5Closes, 14);
  const m5Macd = calculateMACD(m5Closes, 12, 26, 9);
  const m5Atr = calculateATR(m5, 14);
  const m5Adx = calculateADX(m5, 14);
  const m5BB = calculateBollingerBands(m5Closes, 20, 2);

  const lastM5Candle = m5[m5.length - 1];
  const prevM5Candle = m5[m5.length - 2];
  const currentPrice = lastM5Candle.close;

  const currentRsi = m5Rsi[m5Rsi.length - 1] ?? 50;
  const currentMacdHist = m5Macd.histogram[m5Macd.histogram.length - 1] ?? 0;
  const prevMacdHist = m5Macd.histogram[m5Macd.histogram.length - 2] ?? 0;
  const currentAtr = m5Atr.values[m5Atr.values.length - 1] ?? (currentPrice * 0.003);
  const currentAdx = m5Adx.adx[m5Adx.adx.length - 1] ?? 20;

  const lastCandlePattern = detectCandlestickPattern(lastM5Candle, prevM5Candle);

  // Initialize Rule Checks
  const ruleChecks: SignalRuleCheck[] = [];
  const supportingReasons: string[] = [];
  const invalidationConditions: string[] = [];

  // Evaluate candidate direction based on H1 trend & M15 structure
  let candidateAction: SignalAction = 'NO_TRADE';

  if (h1Trend === 'BULLISH' && (m15Structure.trend === 'BULLISH' || lastM15Smma5 > lastM15Smma50)) {
    candidateAction = 'LONG';
  } else if (h1Trend === 'BEARISH' && (m15Structure.trend === 'BEARISH' || lastM15Smma5 < lastM15Smma50)) {
    candidateAction = 'SHORT';
  } else {
    candidateAction = 'NO_TRADE';
  }

  // --- Rule 1: Higher Timeframe Trend Alignment (Weight: 20 pts) ---
  const trendAligned = candidateAction === 'LONG' ? h1Trend === 'BULLISH' : candidateAction === 'SHORT' ? h1Trend === 'BEARISH' : false;
  ruleChecks.push({
    id: 'R1_HTF_TREND',
    name: 'Higher-Timeframe Trend Alignment (H1)',
    weight: 20,
    passed: trendAligned,
    scoreAwarded: trendAligned ? 20 : 0,
    details: `H1 trend is ${h1Trend} (Price vs EMA 50/200). Setup requires trading exclusively in direction of prevailing flow.`,
  });
  if (trendAligned) supportingReasons.push(`H1 prevailing trend is solidly ${h1Trend}.`);
  else invalidationConditions.push(`Higher-timeframe H1 trend is not aligned or ranging.`);

  // --- Rule 2: Market Structure Confirmation (Weight: 15 pts) ---
  const structureAligned = candidateAction === 'LONG'
    ? m15Structure.trend === 'BULLISH'
    : candidateAction === 'SHORT'
    ? m15Structure.trend === 'BEARISH'
    : false;
  ruleChecks.push({
    id: 'R2_STRUCTURE',
    name: 'Market Structure Confirmation (M15)',
    weight: 15,
    passed: structureAligned,
    scoreAwarded: structureAligned ? 15 : 0,
    details: `M15 market structure is forming ${m15Structure.trend === 'BULLISH' ? 'Higher Highs & Higher Lows' : m15Structure.trend === 'BEARISH' ? 'Lower Highs & Lower Lows' : 'Ranging chop'}.`,
  });
  if (structureAligned) supportingReasons.push(`M15 structure confirmed ${m15Structure.trend} swing sequence.`);
  else invalidationConditions.push(`M15 market structure does not show clean directional sequence.`);

  // --- Rule 3: SMMA 5 / SMMA 50 Dynamic Support/Resistance & Pullback (Weight: 15 pts) ---
  let smmaPullbackValid = false;
  if (candidateAction === 'LONG') {
    // Bullish alignment: SMMA 5 > SMMA 50 and price tested near SMMA 5 or between 5 and 50
    const distanceToSmma5 = Math.abs(currentPrice - lastM15Smma5);
    smmaPullbackValid = lastM15Smma5 >= lastM15Smma50 && distanceToSmma5 <= currentAtr * 1.5;
  } else if (candidateAction === 'SHORT') {
    const distanceToSmma5 = Math.abs(currentPrice - lastM15Smma5);
    smmaPullbackValid = lastM15Smma5 <= lastM15Smma50 && distanceToSmma5 <= currentAtr * 1.5;
  }
  ruleChecks.push({
    id: 'R3_SMMA_CONTEXT',
    name: 'SMMA 5 / SMMA 50 Pullback Geometry',
    weight: 15,
    passed: smmaPullbackValid,
    scoreAwarded: smmaPullbackValid ? 15 : 0,
    details: `SMMA 5 (${lastM15Smma5.toFixed(2)}) vs SMMA 50 (${lastM15Smma50.toFixed(2)}) dynamically holding pullback zone within ATR tolerance.`,
  });
  if (smmaPullbackValid) supportingReasons.push(`Price is in ideal retest zone against SMMA 5/50 dynamic baseline.`);
  else invalidationConditions.push(`Price is overextended away from SMMA 5/50 moving average baseline.`);

  // --- Rule 4: Momentum Confirmation (RSI & MACD) (Weight: 15 pts) ---
  let momentumValid = false;
  if (candidateAction === 'LONG') {
    // RSI between 40 and 65 (healthy pullback, not overbought > 70) and MACD histogram turning upward
    momentumValid = currentRsi >= 38 && currentRsi <= 68 && currentMacdHist >= prevMacdHist;
  } else if (candidateAction === 'SHORT') {
    momentumValid = currentRsi <= 62 && currentRsi >= 32 && currentMacdHist <= prevMacdHist;
  }
  ruleChecks.push({
    id: 'R4_MOMENTUM',
    name: 'Momentum Filter (RSI 14 & MACD 12/26/9)',
    weight: 15,
    passed: momentumValid,
    scoreAwarded: momentumValid ? 15 : 0,
    details: `RSI is ${currentRsi.toFixed(1)} (optimal non-exhausted zone), MACD histogram momentum delta is ${currentMacdHist >= prevMacdHist ? 'positive' : 'negative'}.`,
  });
  if (momentumValid) supportingReasons.push(`Momentum indicators (RSI ${currentRsi.toFixed(1)} & MACD slope) confirm resumption of flow.`);
  else invalidationConditions.push(`Momentum indicator shows exhaustion, divergence, or unfavorable RSI extremes.`);

  // --- Rule 5: Volatility & Trend Strength (ADX & ATR) (Weight: 10 pts) ---
  const adxValid = currentAdx >= 20; // Trending market
  ruleChecks.push({
    id: 'R5_VOLATILITY',
    name: 'Trend Strength (ADX 14 >= 20)',
    weight: 10,
    passed: adxValid,
    scoreAwarded: adxValid ? 10 : 0,
    details: `ADX at ${currentAdx.toFixed(1)}. Requires active trending regime (>= 20) rather than dead compression.`,
  });
  if (adxValid) supportingReasons.push(`ADX reading (${currentAdx.toFixed(1)}) indicates adequate directional momentum.`);
  else invalidationConditions.push(`ADX is below 20 indicating stagnant, directionless compression.`);

  // --- Rule 6: Execution Trigger & Closed Candle Confirmation (Weight: 15 pts) ---
  let triggerValid = false;
  let triggerDescription = 'None';
  if (candidateAction === 'LONG') {
    if (lastCandlePattern?.type === 'BULLISH') {
      triggerValid = true;
      triggerDescription = lastCandlePattern.name;
    } else if (lastM5Candle.close > lastM5Candle.open && lastM5Candle.close > prevM5Candle.high) {
      triggerValid = true;
      triggerDescription = 'M5 Bullish Breakout Close above prior candle high';
    }
  } else if (candidateAction === 'SHORT') {
    if (lastCandlePattern?.type === 'BEARISH') {
      triggerValid = true;
      triggerDescription = lastCandlePattern.name;
    } else if (lastM5Candle.close < lastM5Candle.open && lastM5Candle.close < prevM5Candle.low) {
      triggerValid = true;
      triggerDescription = 'M5 Bearish Breakdown Close below prior candle low';
    }
  }
  ruleChecks.push({
    id: 'R6_CANDLE_TRIGGER',
    name: 'Candle Confirmation & Trigger (Closed Bar)',
    weight: 15,
    passed: triggerValid,
    scoreAwarded: triggerValid ? 15 : 0,
    details: `Trigger: ${triggerDescription}. Validated on fully closed candle to prevent repainting.`,
  });
  if (triggerValid) supportingReasons.push(`Closed candle confirmation: ${triggerDescription}.`);
  else invalidationConditions.push(`Lack of confirmed rejection or reversal candle trigger on M5.`);

  // --- Rule 7: Spread & News Risk Filter (Weight: 10 pts) ---
  const spreadAcceptable = spread <= riskConfig.maxAllowedSpreadPoints;
  const noHighImpactNews = !data.economicRiskNearby;
  const executionClean = spreadAcceptable && noHighImpactNews;
  ruleChecks.push({
    id: 'R7_EXECUTION_CONDITIONS',
    name: 'Execution Friction & News Filter',
    weight: 10,
    passed: executionClean,
    scoreAwarded: executionClean ? 10 : 0,
    details: `Spread: ${spread.toFixed(2)} pts (Max: ${riskConfig.maxAllowedSpreadPoints}). News Risk Nearby: ${data.economicRiskNearby ? `HIGH (${data.upcomingEventTitle})` : 'Clear'}.`,
  });
  if (executionClean) supportingReasons.push(`Low spread (${spread.toFixed(2)}) and clean economic calendar window.`);
  else {
    if (!spreadAcceptable) invalidationConditions.push(`Current spread (${spread.toFixed(2)}) exceeds maximum threshold of ${riskConfig.maxAllowedSpreadPoints}.`);
    if (data.economicRiskNearby) invalidationConditions.push(`Imminent high-impact macro news event: ${data.upcomingEventTitle}.`);
  }

  // Calculate Total Rule Score
  const qualityScore = ruleChecks.reduce((sum, r) => sum + r.scoreAwarded, 0);

  // Invalidation conditions: Stop Loss & Target calculation
  let entryPrice = currentPrice;
  let stopLossPrice = 0;
  let takeProfit1Price = 0;
  let takeProfit2Price = 0;

  const stopBuffer = Math.max(currentAtr * 1.5, spread * 4);

  if (candidateAction === 'LONG') {
    // Find recent swing low in M5 or ATR buffer
    const recentLows = m5.slice(-10).map((c) => c.low);
    const swingLow = Math.min(...recentLows);
    stopLossPrice = Number((Math.min(swingLow, currentPrice - stopBuffer)).toFixed(spec.pipSize < 0.1 ? 4 : 2));
    const riskDistance = currentPrice - stopLossPrice;
    takeProfit1Price = Number((currentPrice + riskDistance * 1.8).toFixed(spec.pipSize < 0.1 ? 4 : 2));
    takeProfit2Price = Number((currentPrice + riskDistance * 3.0).toFixed(spec.pipSize < 0.1 ? 4 : 2));
  } else if (candidateAction === 'SHORT') {
    const recentHighs = m5.slice(-10).map((c) => c.high);
    const swingHigh = Math.max(...recentHighs);
    stopLossPrice = Number((Math.max(swingHigh, currentPrice + stopBuffer)).toFixed(spec.pipSize < 0.1 ? 4 : 2));
    const riskDistance = stopLossPrice - currentPrice;
    takeProfit1Price = Number((currentPrice - riskDistance * 1.8).toFixed(spec.pipSize < 0.1 ? 4 : 2));
    takeProfit2Price = Number((currentPrice - riskDistance * 3.0).toFixed(spec.pipSize < 0.1 ? 4 : 2));
  }

  // Evaluate Risk Engine
  const sizing = evaluateOrderRisk(
    {
      symbol,
      side: candidateAction === 'LONG' ? 'LONG' : 'SHORT',
      entryPrice,
      stopLoss: stopLossPrice,
      takeProfit: takeProfit1Price,
      spreadPoints: spread,
    },
    account,
    riskConfig,
    spec
  );

  // Filter: Minimum quality score required is 70, AND sizing.allowed must be true
  const isHighConfidenceSignal = qualityScore >= 70 && candidateAction !== 'NO_TRADE' && sizing.allowed;

  const finalAction: SignalAction = isHighConfidenceSignal ? candidateAction : 'NO_TRADE';
  const finalStatus = isHighConfidenceSignal ? 'ACTIVE' : 'NO_SETUP';

  if (!sizing.allowed && sizing.rejectReason) {
    invalidationConditions.push(`Risk Engine Rejection: ${sizing.rejectReason}`);
  }

  if (qualityScore < 70) {
    invalidationConditions.push(`Total rule score (${qualityScore}/100) below required setup threshold of 70.`);
  }

  // Construct structured explanation
  let explanation = '';
  if (finalAction === 'NO_TRADE') {
    explanation = `Market conditions on ${symbol} fail strict execution rules. Score: ${qualityScore}/100. Key block: ${
      invalidationConditions[0] || 'Unclear directional bias or risk parameters violated.'
    } Apex Trader AI defaults to capital preservation.`;
  } else {
    explanation = `Confirmed ${finalAction} opportunity on ${symbol} (Score: ${qualityScore}/100). Setup features H1 ${h1Trend} trend alignment, M15 structure confirmation, and dynamic SMMA support. Entry zone: ${entryPrice.toFixed(2)}, Stop: ${stopLossPrice.toFixed(2)}, TP1: ${takeProfit1Price.toFixed(2)} (RR: ${sizing.rewardToRiskRatio}R). Risk budgeted at ${riskConfig.riskPercentagePerTrade}% ($${sizing.riskAmountUSD.toFixed(2)}) for ${sizing.recommendedLots} lots.`;
  }

  return {
    id: `sig_${symbol}_${Date.now()}`,
    symbol,
    timeframe: 'M5 / M15 Confirmation',
    timestamp: Date.now(),
    action: finalAction,
    status: finalStatus,
    qualityScore,
    entryZone: {
      min: Number((entryPrice - spread).toFixed(2)),
      max: Number((entryPrice + spread).toFixed(2)),
      recommended: entryPrice,
    },
    stopLoss: stopLossPrice,
    takeProfit1: takeProfit1Price,
    takeProfit2: takeProfit2Price,
    rewardToRiskRatio: sizing.rewardToRiskRatio,
    positionSizing: sizing,
    ruleChecks,
    supportingReasons,
    invalidationConditions,
    marketContext: {
      h1Trend,
      m15Structure: m15Structure.trend,
      m5Pattern: lastCandlePattern?.name,
      rsiValue: Number(currentRsi.toFixed(1)),
      macdHistogram: Number(currentMacdHist.toFixed(4)),
      adxTrendStrength: Number(currentAdx.toFixed(1)),
      atrValue: Number(currentAtr.toFixed(4)),
      currentSpread: spread,
      smma5: Number(lastM15Smma5.toFixed(2)),
      smma50: Number(lastM15Smma50.toFixed(2)),
    },
    explanation,
  };
}

function createNoTradeSignal(
  symbol: string,
  timeframe: string,
  timestamp: number,
  reason: string
): TradingSignal {
  return {
    id: `sig_${symbol}_${timestamp}`,
    symbol,
    timeframe,
    timestamp,
    action: 'NO_TRADE',
    status: 'NO_SETUP',
    qualityScore: 0,
    entryZone: { min: 0, max: 0, recommended: 0 },
    stopLoss: 0,
    takeProfit1: 0,
    takeProfit2: 0,
    rewardToRiskRatio: 0,
    positionSizing: {
      allowed: false,
      rejectReason: reason,
      recommendedLots: 0,
      riskAmountUSD: 0,
      dollarRisk: 0,
      stopDistance: 0,
      rewardDistance: 0,
      rewardToRiskRatio: 0,
      estimatedCommissionUSD: 0,
      estimatedSpreadCostUSD: 0,
      estimatedSlippageUSD: 0,
      totalTransactionCostUSD: 0,
    },
    ruleChecks: [],
    supportingReasons: [],
    invalidationConditions: [reason],
    marketContext: {
      h1Trend: 'RANGING',
      m15Structure: 'RANGING',
      rsiValue: 50,
      macdHistogram: 0,
      adxTrendStrength: 0,
      atrValue: 0,
      currentSpread: 0,
      smma5: 0,
      smma50: 0,
    },
    explanation: `NO TRADE on ${symbol}: ${reason}`,
  };
}

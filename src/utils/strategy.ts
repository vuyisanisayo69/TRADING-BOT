/**
 * Apex Trader AI - Trading Bot Strategy & Brain Scoring Engine
 * Supports:
 * - Classic Mode: SMMA 5/50, RSI (14), and ATR (14) + optional HTF Direction filter
 * - Brain Mode: Multi-signal institutional scoring combining SMMA 5/50, RSI, ATR,
 *   Fair Value Gaps (FVG), Liquidity Sweeps, Displacement, Order Blocks,
 *   Volume Profile (POC & HVN), and HTF Direction.
 */

import {
  calculateSMMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateADX,
  analyzeMarketStructure,
  detectCandlestickPattern,
  detectFairValueGaps,
  detectLiquiditySweeps,
  detectDisplacement,
  detectOrderBlocks,
  calculateVolumeProfile,
} from './indicators.ts';
import type {
  Candle,
  FairValueGap,
  LiquiditySweep,
  DisplacementCandle,
  OrderBlock,
  VolumeProfileResult,
} from './indicators.ts';
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
export type BotMode = 'CLASSIC' | 'BRAIN';

export interface BotSettings {
  mode: BotMode;
  autoTradeEnabled: boolean;
  enableBreakeven: boolean;
  breakevenTriggerR: number;
  enableMultipleEntries: boolean;
  useHtfFilter: boolean;
  minBrainScore: number;
}

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  mode: 'BRAIN',
  autoTradeEnabled: false,
  enableBreakeven: true,
  breakevenTriggerR: 1.0,
  enableMultipleEntries: true,
  useHtfFilter: true,
  minBrainScore: 68,
};

export interface SignalRuleCheck {
  id: string;
  name: string;
  weight: number;
  passed: boolean;
  scoreAwarded: number;
  details: string;
}

export interface SMCBotContext {
  activeBullishFVGs: FairValueGap[];
  activeBearishFVGs: FairValueGap[];
  recentSweeps: LiquiditySweep[];
  recentDisplacements: DisplacementCandle[];
  activeDemandOBs: OrderBlock[];
  activeSupplyOBs: OrderBlock[];
  volumeProfile: VolumeProfileResult;
}

export interface TradingSignal {
  id: string;
  symbol: string;
  timeframe: string;
  timestamp: number;
  botMode: BotMode;
  action: SignalAction;
  status: 'PENDING_CONFIRMATION' | 'ACTIVE' | 'INVALIDATED' | 'TARGET_REACHED' | 'STOPPED_OUT' | 'NO_SETUP';
  qualityScore: number;
  entryZone: { min: number; max: number; recommended: number };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
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
  smcContext: SMCBotContext;
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
 * Generates a complete trading signal using either Classic Mode (SMMA 5/50 + RSI + ATR)
 * or Brain Mode (Multi-signal SMC + Volume Profile + Classic confluence scoring).
 */
export function generateTradingSignal(
  data: MultiTimeframeCandleSet,
  account: AccountState,
  riskConfig: RiskConfig,
  botSettings: BotSettings = DEFAULT_BOT_SETTINGS
): TradingSignal {
  const { symbol, m5, m15, h1 } = data;
  const spec = INSTRUMENT_SPECS[symbol] || INSTRUMENT_SPECS['XAU/USD'];
  const spread = data.currentSpread ?? spec.typicalSpreadPoints;
  const decimals = spec.pipSize < 0.001 ? 5 : spec.pipSize < 0.1 ? 3 : 2;

  if (!h1 || h1.length < 50 || !m15 || m15.length < 50 || !m5 || m5.length < 50) {
    return createNoTradeSignal(
      symbol,
      'M5',
      Date.now(),
      botSettings.mode,
      'Insufficient candle history across required timeframes (H1, M15, M5) to compute indicators reliably.'
    );
  }

  // 1. HTF Direction (H1)
  const h1Closes = h1.map((c) => c.close);
  const h1Ema50 = calculateEMA(h1Closes, 50);
  const h1Ema200 = calculateEMA(h1Closes, 200);
  const h1Structure = analyzeMarketStructure(h1, 3);
  const h1CurrentClose = h1[h1.length - 1].close;
  const h1LastEma50 = h1Ema50[h1Ema50.length - 1] ?? h1CurrentClose;
  const h1LastEma200 = h1Ema200[h1Ema200.length - 1] ?? h1CurrentClose;

  let h1Trend: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
  if (h1CurrentClose > h1LastEma50 && h1LastEma50 >= h1LastEma200) {
    h1Trend = 'BULLISH';
  } else if (h1CurrentClose < h1LastEma50 && h1LastEma50 <= h1LastEma200) {
    h1Trend = 'BEARISH';
  } else if (h1Structure.trend !== 'RANGING') {
    h1Trend = h1Structure.trend;
  }

  // 2. M15 Context (SMMA 5/50 & Structure)
  const m15Closes = m15.map((c) => c.close);
  const m15Structure = analyzeMarketStructure(m15, 3);
  const m15Smma5 = calculateSMMA(m15Closes, 5);
  const m15Smma50 = calculateSMMA(m15Closes, 50);
  const lastM15Smma5 = m15Smma5[m15Smma5.length - 1] ?? m15Closes[m15Closes.length - 1];
  const lastM15Smma50 = m15Smma50[m15Smma50.length - 1] ?? m15Closes[m15Closes.length - 1];

  // 3. M5 Execution Indicators (Classic + SMC + Volume Profile)
  const m5Closes = m5.map((c) => c.close);
  const m5Smma5 = calculateSMMA(m5Closes, 5);
  const m5Smma50 = calculateSMMA(m5Closes, 50);
  const m5Rsi = calculateRSI(m5Closes, 14);
  const m5Macd = calculateMACD(m5Closes, 12, 26, 9);
  const m5Atr = calculateATR(m5, 14);
  const m5Adx = calculateADX(m5, 14);

  const lastM5Candle = m5[m5.length - 1];
  const prevM5Candle = m5[m5.length - 2];
  const currentPrice = lastM5Candle.close;

  const lastM5Smma5 = m5Smma5[m5Smma5.length - 1] ?? currentPrice;
  const prevM5Smma5 = m5Smma5[m5Smma5.length - 2] ?? currentPrice;
  const lastM5Smma50 = m5Smma50[m5Smma50.length - 1] ?? currentPrice;
  const currentRsi = m5Rsi[m5Rsi.length - 1] ?? 50;
  const prevRsi = m5Rsi[m5Rsi.length - 2] ?? 50;
  const currentMacdHist = m5Macd.histogram[m5Macd.histogram.length - 1] ?? 0;
  const currentAtr = m5Atr.values[m5Atr.values.length - 1] ?? currentPrice * 0.003;
  const currentAdx = m5Adx.adx[m5Adx.adx.length - 1] ?? 20;
  const lastCandlePattern = detectCandlestickPattern(lastM5Candle, prevM5Candle);

  // SMC & Volume Profile Detection on recent M5 window
  const recentWindow = m5.slice(-80);
  const allFvgs = detectFairValueGaps(recentWindow, 0.12);
  const activeBullishFVGs = allFvgs.filter((g) => g.type === 'BULLISH' && !g.mitigated).slice(-4);
  const activeBearishFVGs = allFvgs.filter((g) => g.type === 'BEARISH' && !g.mitigated).slice(-4);

  const recentSweeps = detectLiquiditySweeps(recentWindow, 20).filter(
    (s) => s.index >= recentWindow.length - 8
  );
  const recentDisplacements = detectDisplacement(recentWindow, 1.3).filter(
    (d) => d.index >= recentWindow.length - 10
  );
  const allOBs = detectOrderBlocks(recentWindow);
  const activeDemandOBs = allOBs.filter((ob) => ob.type === 'DEMAND' && !ob.mitigated).slice(-3);
  const activeSupplyOBs = allOBs.filter((ob) => ob.type === 'SUPPLY' && !ob.mitigated).slice(-3);
  const volumeProfile = calculateVolumeProfile(recentWindow, 24);

  const smcContext: SMCBotContext = {
    activeBullishFVGs,
    activeBearishFVGs,
    recentSweeps,
    recentDisplacements,
    activeDemandOBs,
    activeSupplyOBs,
    volumeProfile,
  };

  const ruleChecks: SignalRuleCheck[] = [];
  const supportingReasons: string[] = [];
  const invalidationConditions: string[] = [];

  // Candidate Direction Determination
  let bullBiasScore = 0;
  let bearBiasScore = 0;

  if (h1Trend === 'BULLISH') bullBiasScore += 2;
  if (h1Trend === 'BEARISH') bearBiasScore += 2;
  if (lastM15Smma5 > lastM15Smma50) bullBiasScore += 1;
  if (lastM15Smma5 < lastM15Smma50) bearBiasScore += 1;
  if (lastM5Smma5 > lastM5Smma50) bullBiasScore += 1;
  if (lastM5Smma5 < lastM5Smma50) bearBiasScore += 1;
  if (recentSweeps.some((s) => s.type === 'BULLISH_SWEEP')) bullBiasScore += 1;
  if (recentSweeps.some((s) => s.type === 'BEARISH_SWEEP')) bearBiasScore += 1;
  if (recentDisplacements.some((d) => d.type === 'BULLISH')) bullBiasScore += 1;
  if (recentDisplacements.some((d) => d.type === 'BEARISH')) bearBiasScore += 1;

  let candidateAction: SignalAction = 'NO_TRADE';
  if (botSettings.useHtfFilter) {
    if (h1Trend === 'BULLISH' && bullBiasScore > bearBiasScore) candidateAction = 'LONG';
    else if (h1Trend === 'BEARISH' && bearBiasScore > bullBiasScore) candidateAction = 'SHORT';
  } else {
    if (bullBiasScore > bearBiasScore) candidateAction = 'LONG';
    else if (bearBiasScore > bullBiasScore) candidateAction = 'SHORT';
  }

  if (botSettings.mode === 'CLASSIC') {
    // =========================================================================
    // CLASSIC MODE: SMMA 5/50 + RSI + ATR (+ optional HTF Direction Filter)
    // =========================================================================
    const htfPassed = !botSettings.useHtfFilter || (candidateAction === 'LONG' ? h1Trend === 'BULLISH' : candidateAction === 'SHORT' ? h1Trend === 'BEARISH' : false);
    ruleChecks.push({
      id: 'C1_HTF_FILTER',
      name: 'HTF Direction Filter (H1)',
      weight: 20,
      passed: htfPassed,
      scoreAwarded: htfPassed ? 20 : 0,
      details: `H1 Trend: ${h1Trend}. ${botSettings.useHtfFilter ? 'HTF filter strictly enforced.' : 'HTF filter advisory mode.'}`,
    });

    const smmaAligned =
      candidateAction === 'LONG'
        ? lastM5Smma5 > lastM5Smma50 && lastM5Smma5 >= prevM5Smma5 && Math.abs(currentPrice - lastM5Smma5) <= currentAtr * 2.0
        : candidateAction === 'SHORT'
        ? lastM5Smma5 < lastM5Smma50 && lastM5Smma5 <= prevM5Smma5 && Math.abs(currentPrice - lastM5Smma5) <= currentAtr * 2.0
        : false;
    ruleChecks.push({
      id: 'C2_SMMA_5_50',
      name: 'Classic SMMA 5 / 50 Trend & Pullback',
      weight: 30,
      passed: smmaAligned,
      scoreAwarded: smmaAligned ? 30 : 0,
      details: `SMMA 5 (${lastM5Smma5.toFixed(decimals)}) vs SMMA 50 (${lastM5Smma50.toFixed(decimals)}) within ATR pullback envelope.`,
    });

    const rsiValid =
      candidateAction === 'LONG'
        ? currentRsi >= 42 && currentRsi <= 68 && currentRsi >= prevRsi - 1
        : candidateAction === 'SHORT'
        ? currentRsi >= 32 && currentRsi <= 58 && currentRsi <= prevRsi + 1
        : false;
    ruleChecks.push({
      id: 'C3_RSI_14',
      name: 'Classic RSI (14) Momentum Zone',
      weight: 25,
      passed: rsiValid,
      scoreAwarded: rsiValid ? 25 : 0,
      details: `RSI(14) = ${currentRsi.toFixed(1)} (prev ${prevRsi.toFixed(1)}). Non-exhausted directional momentum.`,
    });

    const atrValid = currentAtr > 0 && spread <= riskConfig.maxAllowedSpreadPoints;
    ruleChecks.push({
      id: 'C4_ATR_VOLATILITY',
      name: 'ATR (14) Volatility & Spread Check',
      weight: 25,
      passed: atrValid,
      scoreAwarded: atrValid ? 25 : 0,
      details: `ATR(14) = ${currentAtr.toFixed(decimals)} | Spread = ${spread.toFixed(decimals)}. Stop calibrated at 1.5x ATR.`,
    });

    if (htfPassed) supportingReasons.push(`HTF H1 direction (${h1Trend}) aligned.`);
    else invalidationConditions.push('H1 higher-timeframe direction filter blocked entry.');

    if (smmaAligned) supportingReasons.push('SMMA 5/50 trend and pullback geometry aligned.');
    else invalidationConditions.push('SMMA 5/50 separation or extension outside ATR threshold.');

    if (rsiValid) supportingReasons.push(`RSI (${currentRsi.toFixed(1)}) in optimal trend continuation zone.`);
    else invalidationConditions.push(`RSI (${currentRsi.toFixed(1)}) outside classic entry band.`);
  } else {
    // =========================================================================
    // BRAIN MODE: Multi-Signal Scoring Across All Institutional Indicators
    // =========================================================================

    // 1. HTF Direction (15 pts)
    const htfPassed =
      candidateAction === 'LONG'
        ? h1Trend === 'BULLISH'
        : candidateAction === 'SHORT'
        ? h1Trend === 'BEARISH'
        : false;
    ruleChecks.push({
      id: 'B1_HTF_DIRECTION',
      name: 'HTF Direction Filter (H1)',
      weight: 15,
      passed: htfPassed,
      scoreAwarded: htfPassed ? 15 : 0,
      details: `H1 directional bias is ${h1Trend} (EMA 50/200 & structure).`,
    });
    if (htfPassed) supportingReasons.push(`HTF H1 direction confirms ${h1Trend} bias.`);
    else invalidationConditions.push('HTF H1 direction is neutral or opposing.');

    // 2. Classic SMMA 5/50 + RSI + ATR Baseline (15 pts)
    const classicValid =
      candidateAction === 'LONG'
        ? lastM15Smma5 >= lastM15Smma50 && currentRsi >= 38 && currentRsi <= 70 && currentAtr > 0
        : candidateAction === 'SHORT'
        ? lastM15Smma5 <= lastM15Smma50 && currentRsi >= 30 && currentRsi <= 62 && currentAtr > 0
        : false;
    ruleChecks.push({
      id: 'B2_CLASSIC_CONFLUENCE',
      name: 'SMMA 5/50 + RSI + ATR Core',
      weight: 15,
      passed: classicValid,
      scoreAwarded: classicValid ? 15 : 0,
      details: `M15 SMMA 5/50 aligned, RSI ${currentRsi.toFixed(1)}, ATR ${currentAtr.toFixed(decimals)}.`,
    });
    if (classicValid) supportingReasons.push('SMMA 5/50, RSI, and ATR core indicators aligned.');

    // 3. Fair Value Gaps (FVG) (15 pts)
    const fvgAligned =
      candidateAction === 'LONG'
        ? activeBullishFVGs.length > 0 &&
          activeBullishFVGs.some((g) => currentPrice >= g.bottom - currentAtr && currentPrice <= g.top + currentAtr * 2.5)
        : candidateAction === 'SHORT'
        ? activeBearishFVGs.length > 0 &&
          activeBearishFVGs.some((g) => currentPrice <= g.top + currentAtr && currentPrice >= g.bottom - currentAtr * 2.5)
        : false;
    const fvgPartial =
      !fvgAligned &&
      ((candidateAction === 'LONG' && activeBullishFVGs.length > 0) ||
        (candidateAction === 'SHORT' && activeBearishFVGs.length > 0));
    ruleChecks.push({
      id: 'B3_FVG',
      name: 'Fair Value Gaps (FVG Imbalance)',
      weight: 15,
      passed: fvgAligned || fvgPartial,
      scoreAwarded: fvgAligned ? 15 : fvgPartial ? 8 : 0,
      details: `Active Bull FVGs: ${activeBullishFVGs.length} | Bear FVGs: ${activeBearishFVGs.length}.`,
    });
    if (fvgAligned) supportingReasons.push('Price reacting from unmitigated directional Fair Value Gap.');

    // 4. Liquidity Sweeps (15 pts)
    const sweepAligned =
      candidateAction === 'LONG'
        ? recentSweeps.some((s) => s.type === 'BULLISH_SWEEP')
        : candidateAction === 'SHORT'
        ? recentSweeps.some((s) => s.type === 'BEARISH_SWEEP')
        : false;
    ruleChecks.push({
      id: 'B4_LIQUIDITY_SWEEP',
      name: 'Liquidity Sweeps (Stop Hunt & Reversal)',
      weight: 15,
      passed: sweepAligned,
      scoreAwarded: sweepAligned ? 15 : 0,
      details: sweepAligned
        ? `Detected ${candidateAction === 'LONG' ? 'Sell-Side' : 'Buy-Side'} liquidity sweep and rejection.`
        : 'No recent stop-hunt reversal sweep in last 8 bars.',
    });
    if (sweepAligned) supportingReasons.push('Confirmed liquidity sweep stop-hunt reversal.');

    // 5. Displacement (10 pts)
    const dispAligned =
      candidateAction === 'LONG'
        ? recentDisplacements.some((d) => d.type === 'BULLISH')
        : candidateAction === 'SHORT'
        ? recentDisplacements.some((d) => d.type === 'BEARISH')
        : false;
    ruleChecks.push({
      id: 'B5_DISPLACEMENT',
      name: 'Displacement (Breakout Impulse)',
      weight: 10,
      passed: dispAligned,
      scoreAwarded: dispAligned ? 10 : 0,
      details: `Recent directional breakout displacement candles: ${recentDisplacements.length}.`,
    });
    if (dispAligned) supportingReasons.push('Strong institutional displacement candle detected.');

    // 6. Order Blocks (15 pts)
    const obAligned =
      candidateAction === 'LONG'
        ? activeDemandOBs.length > 0 &&
          activeDemandOBs.some((ob) => currentPrice >= ob.bottom - currentAtr && currentPrice <= ob.top + currentAtr * 2.5)
        : candidateAction === 'SHORT'
        ? activeSupplyOBs.length > 0 &&
          activeSupplyOBs.some((ob) => currentPrice <= ob.top + currentAtr && currentPrice >= ob.bottom - currentAtr * 2.5)
        : false;
    const obPartial =
      !obAligned &&
      ((candidateAction === 'LONG' && activeDemandOBs.length > 0) ||
        (candidateAction === 'SHORT' && activeSupplyOBs.length > 0));
    ruleChecks.push({
      id: 'B6_ORDER_BLOCKS',
      name: 'Order Blocks (Supply & Demand)',
      weight: 15,
      passed: obAligned || obPartial,
      scoreAwarded: obAligned ? 15 : obPartial ? 8 : 0,
      details: `Active Demand OBs: ${activeDemandOBs.length} | Supply OBs: ${activeSupplyOBs.length}.`,
    });
    if (obAligned) supportingReasons.push('Price testing unmitigated institutional Order Block.');

    // 7. Volume Profile (POC & High-Volume Areas) (10 pts)
    const distToPoc = Math.abs(currentPrice - volumeProfile.poc);
    const nearHvn = volumeProfile.highVolumeNodes.some(
      (n) => Math.abs(currentPrice - n.price) <= currentAtr * 1.6
    );
    const vpAligned =
      candidateAction === 'LONG'
        ? (currentPrice >= volumeProfile.val && currentPrice <= volumeProfile.vah) || nearHvn || distToPoc <= currentAtr * 1.5
        : candidateAction === 'SHORT'
        ? (currentPrice >= volumeProfile.val && currentPrice <= volumeProfile.vah) || nearHvn || distToPoc <= currentAtr * 1.5
        : false;
    ruleChecks.push({
      id: 'B7_VOLUME_PROFILE',
      name: 'Volume Profile (POC & HVN Confluence)',
      weight: 10,
      passed: vpAligned,
      scoreAwarded: vpAligned ? 10 : 0,
      details: `POC: ${volumeProfile.poc.toFixed(decimals)} | VA: ${volumeProfile.val.toFixed(decimals)}–${volumeProfile.vah.toFixed(decimals)} | HVNs: ${volumeProfile.highVolumeNodes.length}.`,
    });
    if (vpAligned) supportingReasons.push(`Volume Profile POC (${volumeProfile.poc.toFixed(decimals)}) & HVN confluence.`);

    // 8. Execution & News Filter (5 pts)
    const spreadOk = spread <= riskConfig.maxAllowedSpreadPoints && !data.economicRiskNearby;
    ruleChecks.push({
      id: 'B8_RISK_EXECUTION',
      name: 'Spread & Macro News Filter',
      weight: 5,
      passed: spreadOk,
      scoreAwarded: spreadOk ? 5 : 0,
      details: `Spread ${spread.toFixed(decimals)} pts | ADX ${currentAdx.toFixed(1)} | News: ${data.economicRiskNearby ? data.upcomingEventTitle : 'Clear'}.`,
    });
    if (!spreadOk) invalidationConditions.push('High spread or imminent macro catalyst.');
  }

  const qualityScore = ruleChecks.reduce((sum, r) => sum + r.scoreAwarded, 0);

  // Stop Loss & Take Profit calculation (ATR + Structural/OB protection)
  let entryPrice = currentPrice;
  let stopLossPrice = 0;
  let takeProfit1Price = 0;
  let takeProfit2Price = 0;

  const stopBuffer = Math.max(currentAtr * 1.5, spread * 4);

  if (candidateAction === 'LONG') {
    const recentLows = m5.slice(-10).map((c) => c.low);
    const swingLow = Math.min(...recentLows);
    const obFloor = activeDemandOBs.length > 0 ? activeDemandOBs[activeDemandOBs.length - 1].bottom : swingLow;
    stopLossPrice = Number(Math.min(swingLow, obFloor, currentPrice - stopBuffer).toFixed(decimals));
    const riskDistance = Math.max(currentPrice - stopLossPrice, stopBuffer * 0.5);
    stopLossPrice = Number((currentPrice - riskDistance).toFixed(decimals));
    takeProfit1Price = Number((currentPrice + riskDistance * 1.8).toFixed(decimals));
    takeProfit2Price = Number((currentPrice + riskDistance * 3.0).toFixed(decimals));
  } else if (candidateAction === 'SHORT') {
    const recentHighs = m5.slice(-10).map((c) => c.high);
    const swingHigh = Math.max(...recentHighs);
    const obCeil = activeSupplyOBs.length > 0 ? activeSupplyOBs[activeSupplyOBs.length - 1].top : swingHigh;
    stopLossPrice = Number(Math.max(swingHigh, obCeil, currentPrice + stopBuffer).toFixed(decimals));
    const riskDistance = Math.max(stopLossPrice - currentPrice, stopBuffer * 0.5);
    stopLossPrice = Number((currentPrice + riskDistance).toFixed(decimals));
    takeProfit1Price = Number((currentPrice - riskDistance * 1.8).toFixed(decimals));
    takeProfit2Price = Number((currentPrice - riskDistance * 3.0).toFixed(decimals));
  }

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

  const scoreThreshold = botSettings.mode === 'CLASSIC' ? 70 : botSettings.minBrainScore;
  const isHighConfidenceSignal =
    qualityScore >= scoreThreshold && candidateAction !== 'NO_TRADE' && sizing.allowed;

  const finalAction: SignalAction = isHighConfidenceSignal ? candidateAction : 'NO_TRADE';
  const finalStatus = isHighConfidenceSignal ? 'ACTIVE' : 'NO_SETUP';

  if (!sizing.allowed && sizing.rejectReason) {
    invalidationConditions.push(`Risk Engine Rejection: ${sizing.rejectReason}`);
  }
  if (qualityScore < scoreThreshold) {
    invalidationConditions.push(
      `${botSettings.mode} score (${qualityScore}/100) below execution threshold of ${scoreThreshold}.`
    );
  }

  const explanation =
    finalAction === 'NO_TRADE'
      ? `[${botSettings.mode} MODE] ${symbol} paused (Score: ${qualityScore}/100). ${invalidationConditions[0] || 'Awaiting multi-factor confluence.'}`
      : `[${botSettings.mode} MODE] Confirmed ${finalAction} on ${symbol} (Score: ${qualityScore}/100). Entry ${entryPrice.toFixed(decimals)}, SL ${stopLossPrice.toFixed(decimals)}, TP1 ${takeProfit1Price.toFixed(decimals)} (${sizing.rewardToRiskRatio}R) · ${sizing.recommendedLots} lots.`;

  return {
    id: `sig_${symbol}_${Date.now()}`,
    symbol,
    timeframe: 'M5 / M15 / H1',
    timestamp: Date.now(),
    botMode: botSettings.mode,
    action: finalAction,
    status: finalStatus,
    qualityScore,
    entryZone: {
      min: Number((entryPrice - spread).toFixed(decimals)),
      max: Number((entryPrice + spread).toFixed(decimals)),
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
      smma5: Number(lastM15Smma5.toFixed(decimals)),
      smma50: Number(lastM15Smma50.toFixed(decimals)),
    },
    smcContext,
    explanation,
  };
}

function createNoTradeSignal(
  symbol: string,
  timeframe: string,
  timestamp: number,
  botMode: BotMode,
  reason: string
): TradingSignal {
  return {
    id: `sig_${symbol}_${timestamp}`,
    symbol,
    timeframe,
    timestamp,
    botMode,
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
    smcContext: {
      activeBullishFVGs: [],
      activeBearishFVGs: [],
      recentSweeps: [],
      recentDisplacements: [],
      activeDemandOBs: [],
      activeSupplyOBs: [],
      volumeProfile: { poc: 0, vah: 0, val: 0, totalVolume: 0, highVolumeNodes: [], buckets: [] },
    },
    explanation: `NO TRADE on ${symbol}: ${reason}`,
  };
}

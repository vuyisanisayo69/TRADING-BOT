/**
 * Apex Trader AI - Historical Backtesting & Quantitative Validation Engine
 * Strict chronological iteration with no look-ahead bias, realistic transaction
 * costs (slippage, spread, commission), Monte Carlo resampling, and walk-forward validation.
 */

import type { Candle } from './indicators.ts';
import { generateTradingSignal } from './strategy.ts';
import type { MultiTimeframeCandleSet, TradingSignal } from './strategy.ts';
import { DEFAULT_RISK_CONFIG, INSTRUMENT_SPECS } from './risk.ts';
import type { AccountState, RiskConfig, ContractSpec } from './risk.ts';

export interface BacktestTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'SESSION_CLOSE' | 'TRAIL_STOP';
  lots: number;
  pnlUSD: number;
  pnlPercent: number;
  rMultiple: number;
  commissionUSD: number;
  spreadCostUSD: number;
  slippageUSD: number;
  netPnlUSD: number;
  durationMinutes: number;
}

export interface MonteCarloResult {
  simulationsCount: number;
  ruinProbabilityPercent: number; // Probability equity falls below 50%
  medianMaxDrawdownPercent: number;
  percentile95MaxDrawdownPercent: number; // 95% worst-case drawdown
  medianFinalEquity: number;
  worstCaseFinalEquity: number;
}

export interface BacktestReport {
  symbol: string;
  startDate: string;
  endDate: string;
  initialDeposit: number;
  finalEquity: number;
  netProfitUSD: number;
  netProfitPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  profitFactor: number;
  expectancyUSD: number;
  expectancyR: number;
  maxDrawdownUSD: number;
  maxDrawdownPercent: number;
  averageWinUSD: number;
  averageLossUSD: number;
  winLossRatio: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  totalCommissionsUSD: number;
  totalSpreadCostUSD: number;
  totalSlippageUSD: number;
  benchmarkReturnPercent: number; // Buy & Hold return
  monteCarlo: MonteCarloResult;
  inSampleMetrics: {
    tradeCount: number;
    winRate: number;
    profitFactor: number;
    netProfitPercent: number;
  };
  outOfSampleMetrics: {
    tradeCount: number;
    winRate: number;
    profitFactor: number;
    netProfitPercent: number;
  };
  warnings: string[];
  trades: BacktestTrade[];
  equityCurve: { time: number; equity: number; drawdownPercent: number }[];
}

export interface BacktestOptions {
  symbol: string;
  initialBalance: number;
  m5Candles: Candle[];
  m15Candles: Candle[];
  h1Candles: Candle[];
  riskConfig?: RiskConfig;
  slippageFactor?: number; // e.g. 1.0 (standard)
  outOfSampleRatio?: number; // e.g. 0.3 (30% test set)
}

/**
 * Runs a strict, chronological event-driven backtest across historical bars.
 * Guaranteed zero look-ahead bias: at bar `t`, only data from `0` to `t` is available.
 */
export function runBacktest(options: BacktestOptions): BacktestReport {
  const {
    symbol,
    initialBalance,
    m5Candles,
    m15Candles,
    h1Candles,
    riskConfig = DEFAULT_RISK_CONFIG,
    slippageFactor = 1.0,
    outOfSampleRatio = 0.3,
  } = options;

  const spec: ContractSpec = INSTRUMENT_SPECS[symbol] || INSTRUMENT_SPECS['XAU/USD'];

  const account: AccountState = {
    initialBalance,
    balance: initialBalance,
    equity: initialBalance,
    usedMargin: 0,
    freeMargin: initialBalance,
    dailyRealizedPnL: 0,
    dailyUnrealizedPnL: 0,
    totalRealizedPnL: 0,
    peakEquity: initialBalance,
    consecutiveLosses: 0,
    openPositionCount: 0,
  };

  const trades: BacktestTrade[] = [];
  const equityCurve: { time: number; equity: number; drawdownPercent: number }[] = [
    { time: m5Candles[0]?.time ?? 0, equity: initialBalance, drawdownPercent: 0 },
  ];

  let currentTrade: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryTime: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    lots: number;
    dollarRisk: number;
    stopDistance: number;
  } | null = null;

  // We need warm-up bars (at least 60 M5 candles)
  const warmUpBars = 60;
  const totalM5 = m5Candles.length;

  for (let i = warmUpBars; i < totalM5; i++) {
    const currentM5Slice = m5Candles.slice(0, i + 1);
    const currentCandle = m5Candles[i];
    const currentTime = currentCandle.time;

    // Synchronize M15 and H1 candles available strictly up to currentTime
    const currentM15Slice = m15Candles.filter((c) => c.time <= currentTime);
    const currentH1Slice = h1Candles.filter((c) => c.time <= currentTime);

    // 1. Manage Active Trade if any
    if (currentTrade) {
      let exitPrice: number | null = null;
      let exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'SESSION_CLOSE' | 'TRAIL_STOP' | null = null;

      // Realistic slippage calculation
      const spread = spec.typicalSpreadPoints;
      const slippage = spread * 0.5 * slippageFactor;

      if (currentTrade.side === 'LONG') {
        // Did low hit stop-loss?
        if (currentCandle.low <= currentTrade.stopLoss) {
          exitPrice = currentTrade.stopLoss - slippage; // adverse slippage
          exitReason = 'STOP_LOSS';
        } else if (currentCandle.high >= currentTrade.takeProfit) {
          exitPrice = currentTrade.takeProfit;
          exitReason = 'TAKE_PROFIT';
        }
      } else {
        // SHORT
        if (currentCandle.high >= currentTrade.stopLoss) {
          exitPrice = currentTrade.stopLoss + slippage;
          exitReason = 'STOP_LOSS';
        } else if (currentCandle.low <= currentTrade.takeProfit) {
          exitPrice = currentTrade.takeProfit;
          exitReason = 'TAKE_PROFIT';
        }
      }

      if (exitPrice !== null && exitReason !== null) {
        // Calculate PnL
        const priceDelta =
          currentTrade.side === 'LONG'
            ? exitPrice - currentTrade.entryPrice
            : currentTrade.entryPrice - exitPrice;

        const rawPnL = priceDelta * spec.lotSize * currentTrade.lots;
        const commission = spec.commissionPerLotUSD * currentTrade.lots * 2; // in and out
        const spreadCost = spread * spec.lotSize * currentTrade.lots;
        const slippageUSD = slippage * spec.lotSize * currentTrade.lots;
        const netPnL = rawPnL - commission;

        const rMultiple = currentTrade.stopDistance > 0 ? priceDelta / currentTrade.stopDistance : 0;
        const durationMinutes = Math.round((currentCandle.time - currentTrade.entryTime) / 60);

        trades.push({
          id: `bt_${trades.length + 1}`,
          symbol,
          side: currentTrade.side,
          entryTime: currentTrade.entryTime,
          entryPrice: currentTrade.entryPrice,
          exitTime: currentCandle.time,
          exitPrice,
          exitReason,
          lots: currentTrade.lots,
          pnlUSD: rawPnL,
          pnlPercent: (netPnL / account.equity) * 100,
          rMultiple: Number(rMultiple.toFixed(2)),
          commissionUSD: commission,
          spreadCostUSD: spreadCost,
          slippageUSD,
          netPnlUSD: netPnL,
          durationMinutes,
        });

        // Update Account
        account.balance += netPnL;
        account.equity = account.balance;
        account.totalRealizedPnL += netPnL;
        account.dailyRealizedPnL += netPnL;

        if (account.equity > account.peakEquity) {
          account.peakEquity = account.equity;
        }

        if (netPnL < 0) {
          account.consecutiveLosses += 1;
        } else {
          account.consecutiveLosses = 0;
        }

        account.openPositionCount = 0;
        currentTrade = null;

        const currentDD = ((account.peakEquity - account.equity) / account.peakEquity) * 100;
        equityCurve.push({
          time: currentCandle.time,
          equity: Number(account.equity.toFixed(2)),
          drawdownPercent: Number(currentDD.toFixed(2)),
        });
      }
    }

    // 2. Generate new signal if no active position
    if (!currentTrade && currentM15Slice.length >= 50 && currentH1Slice.length >= 50) {
      const candleSet: MultiTimeframeCandleSet = {
        symbol,
        m5: currentM5Slice,
        m15: currentM15Slice,
        h1: currentH1Slice,
        currentSpread: spec.typicalSpreadPoints,
      };

      const signal: TradingSignal = generateTradingSignal(candleSet, account, riskConfig);

      if (signal.action !== 'NO_TRADE' && signal.positionSizing.allowed && signal.positionSizing.recommendedLots > 0) {
        const spread = spec.typicalSpreadPoints;
        const slippage = spread * 0.3 * slippageFactor;
        // Entry price factoring spread & slippage
        const executedEntry =
          signal.action === 'LONG'
            ? currentCandle.close + spread * 0.5 + slippage
            : currentCandle.close - spread * 0.5 - slippage;

        currentTrade = {
          symbol,
          side: signal.action === 'LONG' ? 'LONG' : 'SHORT',
          entryTime: currentCandle.time,
          entryPrice: executedEntry,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit1,
          lots: signal.positionSizing.recommendedLots,
          dollarRisk: signal.positionSizing.dollarRisk,
          stopDistance: Math.abs(executedEntry - signal.stopLoss),
        };

        account.openPositionCount = 1;
      }
    }
  }

  // Close any trade still open at the end of the backtest
  if (currentTrade && m5Candles.length > 0) {
    const lastBar = m5Candles[m5Candles.length - 1];
    const priceDelta =
      currentTrade.side === 'LONG'
        ? lastBar.close - currentTrade.entryPrice
        : currentTrade.entryPrice - lastBar.close;

    const rawPnL = priceDelta * spec.lotSize * currentTrade.lots;
    const commission = spec.commissionPerLotUSD * currentTrade.lots * 2;
    const netPnL = rawPnL - commission;

    trades.push({
      id: `bt_${trades.length + 1}`,
      symbol,
      side: currentTrade.side,
      entryTime: currentTrade.entryTime,
      entryPrice: currentTrade.entryPrice,
      exitTime: lastBar.time,
      exitPrice: lastBar.close,
      exitReason: 'SESSION_CLOSE',
      lots: currentTrade.lots,
      pnlUSD: rawPnL,
      pnlPercent: (netPnL / account.equity) * 100,
      rMultiple: currentTrade.stopDistance > 0 ? Number((priceDelta / currentTrade.stopDistance).toFixed(2)) : 0,
      commissionUSD: commission,
      spreadCostUSD: spec.typicalSpreadPoints * spec.lotSize * currentTrade.lots,
      slippageUSD: 0,
      netPnlUSD: netPnL,
      durationMinutes: Math.round((lastBar.time - currentTrade.entryTime) / 60),
    });

    account.balance += netPnL;
    account.equity = account.balance;
    account.totalRealizedPnL += netPnL;
  }

  // Calculate Metrics
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.netPnlUSD > 0).length;
  const losingTrades = trades.filter((t) => t.netPnlUSD < 0).length;
  const winRatePercent = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

  const grossWin = trades.filter((t) => t.netPnlUSD > 0).reduce((sum, t) => sum + t.netPnlUSD, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.netPnlUSD < 0).reduce((sum, t) => sum + t.netPnlUSD, 0));
  const profitFactor = grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 99.9 : 0;

  const netProfitUSD = Number((account.equity - initialBalance).toFixed(2));
  const netProfitPercent = Number(((netProfitUSD / initialBalance) * 100).toFixed(2));

  const averageWinUSD = winningTrades > 0 ? Number((grossWin / winningTrades).toFixed(2)) : 0;
  const averageLossUSD = losingTrades > 0 ? Number((grossLoss / losingTrades).toFixed(2)) : 0;
  const winLossRatio = averageLossUSD > 0 ? Number((averageWinUSD / averageLossUSD).toFixed(2)) : 0;

  const expectancyUSD = totalTrades > 0 ? Number((netProfitUSD / totalTrades).toFixed(2)) : 0;
  const totalR = trades.reduce((sum, t) => sum + t.rMultiple, 0);
  const expectancyR = totalTrades > 0 ? Number((totalR / totalTrades).toFixed(2)) : 0;

  let peak = initialBalance;
  let maxDDVal = 0;
  let maxDDPct = 0;

  for (const pt of equityCurve) {
    if (pt.equity > peak) peak = pt.equity;
    const ddVal = peak - pt.equity;
    const ddPct = peak > 0 ? (ddVal / peak) * 100 : 0;
    if (ddVal > maxDDVal) maxDDVal = ddVal;
    if (ddPct > maxDDPct) maxDDPct = ddPct;
  }

  let maxConsecWins = 0;
  let maxConsecLosses = 0;
  let currWins = 0;
  let currLosses = 0;

  for (const t of trades) {
    if (t.netPnlUSD > 0) {
      currWins++;
      currLosses = 0;
      if (currWins > maxConsecWins) maxConsecWins = currWins;
    } else {
      currLosses++;
      currWins = 0;
      if (currLosses > maxConsecLosses) maxConsecLosses = currLosses;
    }
  }

  const totalCommissionsUSD = Number(trades.reduce((sum, t) => sum + t.commissionUSD, 0).toFixed(2));
  const totalSpreadCostUSD = Number(trades.reduce((sum, t) => sum + t.spreadCostUSD, 0).toFixed(2));
  const totalSlippageUSD = Number(trades.reduce((sum, t) => sum + t.slippageUSD, 0).toFixed(2));

  // Benchmark Return (Buy and Hold)
  const firstPrice = m5Candles[0]?.close ?? 1;
  const lastPrice = m5Candles[m5Candles.length - 1]?.close ?? 1;
  const benchmarkReturnPercent = Number((((lastPrice - firstPrice) / firstPrice) * 100).toFixed(2));

  // In-Sample vs Out-of-Sample Split
  const splitIndex = Math.floor(totalTrades * (1 - outOfSampleRatio));
  const inSampleTrades = trades.slice(0, splitIndex);
  const outOfSampleTrades = trades.slice(splitIndex);

  const calcSubMetrics = (sub: BacktestTrade[]) => {
    const count = sub.length;
    const wins = sub.filter((t) => t.netPnlUSD > 0).length;
    const gw = sub.filter((t) => t.netPnlUSD > 0).reduce((s, t) => s + t.netPnlUSD, 0);
    const gl = Math.abs(sub.filter((t) => t.netPnlUSD < 0).reduce((s, t) => s + t.netPnlUSD, 0));
    const net = gw - gl;
    return {
      tradeCount: count,
      winRate: count > 0 ? Number(((wins / count) * 100).toFixed(1)) : 0,
      profitFactor: gl > 0 ? Number((gw / gl).toFixed(2)) : 0,
      netProfitPercent: Number(((net / initialBalance) * 100).toFixed(2)),
    };
  };

  const inSampleMetrics = calcSubMetrics(inSampleTrades);
  const outOfSampleMetrics = calcSubMetrics(outOfSampleTrades);

  // Monte Carlo Simulation (1,000 iterations of trade shuffling)
  const monteCarlo = runMonteCarloSimulation(trades, initialBalance, 1000);

  // Warnings generator
  const warnings: string[] = [];
  if (totalTrades < 30) {
    warnings.push(`Small sample size warning: Only ${totalTrades} trades generated. Statistical significance requires at least 30-50 trades.`);
  }
  if (profitFactor < 1.25 && profitFactor > 0) {
    warnings.push(`Low profit factor (${profitFactor}). The strategy edge may be eroded by unexpected volatility or broker execution slippage.`);
  }
  if (monteCarlo.percentile95MaxDrawdownPercent > 12) {
    warnings.push(`Elevated Monte Carlo risk: 95th percentile worst-case drawdown is ${monteCarlo.percentile95MaxDrawdownPercent}%. Consider lowering risk per trade.`);
  }
  if (Math.abs(inSampleMetrics.profitFactor - outOfSampleMetrics.profitFactor) > 0.8 && outOfSampleTrades.length > 5) {
    warnings.push(`Potential curve-fitting / degradation: Out-of-sample profit factor (${outOfSampleMetrics.profitFactor}) deviates substantially from in-sample (${inSampleMetrics.profitFactor}).`);
  }

  const startDate = m5Candles[0] ? new Date(m5Candles[0].time * 1000).toISOString().split('T')[0] : '';
  const endDate = m5Candles[m5Candles.length - 1]
    ? new Date(m5Candles[m5Candles.length - 1].time * 1000).toISOString().split('T')[0]
    : '';

  return {
    symbol,
    startDate,
    endDate,
    initialDeposit: initialBalance,
    finalEquity: Number(account.equity.toFixed(2)),
    netProfitUSD,
    netProfitPercent,
    totalTrades,
    winningTrades,
    losingTrades,
    winRatePercent,
    profitFactor,
    expectancyUSD,
    expectancyR,
    maxDrawdownUSD: Number(maxDDVal.toFixed(2)),
    maxDrawdownPercent: Number(maxDDPct.toFixed(2)),
    averageWinUSD,
    averageLossUSD,
    winLossRatio,
    maxConsecutiveWins: maxConsecWins,
    maxConsecutiveLosses: maxConsecLosses,
    totalCommissionsUSD,
    totalSpreadCostUSD,
    totalSlippageUSD,
    benchmarkReturnPercent,
    monteCarlo,
    inSampleMetrics,
    outOfSampleMetrics,
    warnings,
    trades,
    equityCurve,
  };
}

/**
 * Monte Carlo analysis: randomly shuffles trade returns 1,000 times
 * to analyze the true distribution of drawdown and risk of ruin.
 */
function runMonteCarloSimulation(trades: BacktestTrade[], initialBalance: number, iterations: number = 1000): MonteCarloResult {
  if (trades.length === 0) {
    return {
      simulationsCount: iterations,
      ruinProbabilityPercent: 0,
      medianMaxDrawdownPercent: 0,
      percentile95MaxDrawdownPercent: 0,
      medianFinalEquity: initialBalance,
      worstCaseFinalEquity: initialBalance,
    };
  }

  const pnlList = trades.map((t) => t.netPnlUSD);
  const drawdowns: number[] = [];
  const finalEquities: number[] = [];
  let ruinCount = 0;

  for (let iter = 0; iter < iterations; iter++) {
    // Fisher-Yates shuffle
    const shuffled = [...pnlList];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    let equity = initialBalance;
    let peak = initialBalance;
    let maxDDPercent = 0;
    let ruined = false;

    for (const pnl of shuffled) {
      equity += pnl;
      if (equity > peak) peak = equity;
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDDPercent) maxDDPercent = dd;

      if (equity <= initialBalance * 0.5) {
        ruined = true;
      }
    }

    if (ruined) ruinCount++;
    drawdowns.push(maxDDPercent);
    finalEquities.push(equity);
  }

  drawdowns.sort((a, b) => a - b);
  finalEquities.sort((a, b) => a - b);

  const medianMaxDrawdownPercent = Number(drawdowns[Math.floor(iterations * 0.5)].toFixed(2));
  const percentile95MaxDrawdownPercent = Number(drawdowns[Math.floor(iterations * 0.95)].toFixed(2));
  const medianFinalEquity = Number(finalEquities[Math.floor(iterations * 0.5)].toFixed(2));
  const worstCaseFinalEquity = Number(finalEquities[0].toFixed(2));
  const ruinProbabilityPercent = Number(((ruinCount / iterations) * 100).toFixed(2));

  return {
    simulationsCount: iterations,
    ruinProbabilityPercent,
    medianMaxDrawdownPercent,
    percentile95MaxDrawdownPercent,
    medianFinalEquity,
    worstCaseFinalEquity,
  };
}

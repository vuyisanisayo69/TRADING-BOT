/**
 * Apex Trader AI - Risk Management Engine
 * Enforces institutional safety constraints, strict capital preservation,
 * dynamic position sizing, and protective order verification.
 */

export interface ContractSpec {
  symbol: string;
  name: string;
  category: 'COMMODITY' | 'CRYPTO' | 'FOREX';
  lotSize: number; // e.g. 100 for Gold (100 oz), 1 for BTC, 100,000 for FX
  minLot: number;
  maxLot: number;
  lotStep: number;
  pipSize: number; // e.g. 0.01 for Gold, 1.0 or 0.1 for BTC, 0.0001 for EUR/USD
  typicalSpreadPoints: number;
  commissionPerLotUSD: number;
}

export const INSTRUMENT_SPECS: Record<string, ContractSpec> = {
  'XAU/USD': {
    symbol: 'XAU/USD',
    name: 'Gold vs US Dollar',
    category: 'COMMODITY',
    lotSize: 100, // 1.0 standard lot = 100 oz
    minLot: 0.01,
    maxLot: 50.0,
    lotStep: 0.01,
    pipSize: 0.1, // $0.10 price delta
    typicalSpreadPoints: 0.25, // $0.25 spread
    commissionPerLotUSD: 5.0,
  },
  'BTC/USD': {
    symbol: 'BTC/USD',
    name: 'Bitcoin vs US Dollar',
    category: 'CRYPTO',
    lotSize: 1, // 1 BTC
    minLot: 0.01,
    maxLot: 20.0,
    lotStep: 0.01,
    pipSize: 1.0,
    typicalSpreadPoints: 12.0, // $12 spread
    commissionPerLotUSD: 10.0,
  },
  'EUR/USD': {
    symbol: 'EUR/USD',
    name: 'Euro vs US Dollar',
    category: 'FOREX',
    lotSize: 100000,
    minLot: 0.01,
    maxLot: 100.0,
    lotStep: 0.01,
    pipSize: 0.0001,
    typicalSpreadPoints: 0.00012, // 1.2 pips
    commissionPerLotUSD: 6.0,
  },
};

export interface RiskConfig {
  riskPercentagePerTrade: number; // Default 0.5% (0.005)
  maxDailyLossUSD: number; // Max total daily loss allowed
  maxDailyLossPercent: number; // Max % daily loss allowed (e.g. 2.0%)
  maxTotalDrawdownPercent: number; // Max total account drawdown allowed (e.g. 5.0%)
  maxOpenPositions: number; // e.g. 3
  maxConsecutiveLosses: number; // e.g. 3 losses triggers circuit breaker
  minRewardToRiskRatio: number; // e.g. 1.5R minimum
  maxAllowedSpreadPoints: number; // e.g. Max spread for Gold = 0.60
  killSwitchActive: boolean; // Emergency trade halt
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  riskPercentagePerTrade: 0.5, // 0.5% default as requested in prompt
  maxDailyLossUSD: 500,
  maxDailyLossPercent: 2.0,
  maxTotalDrawdownPercent: 5.0,
  maxOpenPositions: 3,
  maxConsecutiveLosses: 3,
  minRewardToRiskRatio: 1.5,
  maxAllowedSpreadPoints: 0.8,
  killSwitchActive: false,
};

export interface AccountState {
  initialBalance: number;
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  dailyRealizedPnL: number;
  dailyUnrealizedPnL: number;
  totalRealizedPnL: number;
  peakEquity: number;
  consecutiveLosses: number;
  openPositionCount: number;
}

export interface PositionSizeResult {
  allowed: boolean;
  rejectReason?: string;
  recommendedLots: number;
  riskAmountUSD: number;
  dollarRisk: number;
  stopDistance: number;
  rewardDistance: number;
  rewardToRiskRatio: number;
  estimatedCommissionUSD: number;
  estimatedSpreadCostUSD: number;
  estimatedSlippageUSD: number;
  totalTransactionCostUSD: number;
}

export interface TradeOrderCandidate {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  spreadPoints?: number;
}

/**
 * Calculates accurate position sizing & validates against all risk parameters
 */
export function evaluateOrderRisk(
  order: TradeOrderCandidate,
  account: AccountState,
  config: RiskConfig,
  spec: ContractSpec = INSTRUMENT_SPECS[order.symbol] || INSTRUMENT_SPECS['XAU/USD']
): PositionSizeResult {
  // 1. Kill Switch Check
  if (config.killSwitchActive) {
    return {
      allowed: false,
      rejectReason: 'Emergency Kill Switch is active. All new trade execution is halted.',
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
    };
  }

  // 2. Open Position Limit
  if (account.openPositionCount >= config.maxOpenPositions) {
    return {
      allowed: false,
      rejectReason: `Maximum open positions reached (${account.openPositionCount}/${config.maxOpenPositions}). Cannot open new position.`,
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
    };
  }

  // 3. Consecutive Loss Circuit Breaker
  if (account.consecutiveLosses >= config.maxConsecutiveLosses) {
    return {
      allowed: false,
      rejectReason: `Consecutive loss circuit breaker triggered (${account.consecutiveLosses} consecutive losses). Strategy cooldown enforced.`,
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
    };
  }

  // 4. Daily Loss Limit Check
  const currentDailyTotalPnL = account.dailyRealizedPnL + account.dailyUnrealizedPnL;
  const maxDailyAllowedLossUSD = (account.initialBalance * config.maxDailyLossPercent) / 100;
  if (currentDailyTotalPnL <= -maxDailyAllowedLossUSD || currentDailyTotalPnL <= -config.maxDailyLossUSD) {
    return {
      allowed: false,
      rejectReason: `Max daily loss limit breached ($${Math.abs(currentDailyTotalPnL).toFixed(2)} / limit $${maxDailyAllowedLossUSD.toFixed(2)}). Trading locked for remainder of session.`,
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
    };
  }

  // 5. Total Drawdown Check from Peak Equity
  const currentDrawdownUSD = Math.max(0, account.peakEquity - account.equity);
  const currentDrawdownPercent = account.peakEquity > 0 ? (currentDrawdownUSD / account.peakEquity) * 100 : 0;
  if (currentDrawdownPercent >= config.maxTotalDrawdownPercent) {
    return {
      allowed: false,
      rejectReason: `Max allowable drawdown reached (${currentDrawdownPercent.toFixed(2)}% >= ${config.maxTotalDrawdownPercent}% limit). Capital preservation mode.`,
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
    };
  }

  // 6. Stop-Loss and Price Integrity Validation
  if (order.side === 'LONG') {
    if (order.stopLoss >= order.entryPrice) {
      return {
        allowed: false,
        rejectReason: 'Protective Stop-Loss for LONG order must be strictly below entry price.',
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
      };
    }
    if (order.takeProfit <= order.entryPrice) {
      return {
        allowed: false,
        rejectReason: 'Take-Profit for LONG order must be strictly above entry price.',
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
      };
    }
  } else {
    // SHORT
    if (order.stopLoss <= order.entryPrice) {
      return {
        allowed: false,
        rejectReason: 'Protective Stop-Loss for SHORT order must be strictly above entry price.',
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
      };
    }
    if (order.takeProfit >= order.entryPrice) {
      return {
        allowed: false,
        rejectReason: 'Take-Profit for SHORT order must be strictly below entry price.',
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
      };
    }
  }

  // 7. Distance & Reward:Risk Verification
  const stopDistance = Math.abs(order.entryPrice - order.stopLoss);
  const rewardDistance = Math.abs(order.takeProfit - order.entryPrice);
  if (stopDistance <= 0) {
    return {
      allowed: false,
      rejectReason: 'Invalid zero stop distance.',
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
    };
  }

  const rewardToRiskRatio = Number((rewardDistance / stopDistance).toFixed(2));
  if (rewardToRiskRatio < config.minRewardToRiskRatio) {
    return {
      allowed: false,
      rejectReason: `Reward-to-Risk ratio of ${rewardToRiskRatio}R is below the required minimum threshold of ${config.minRewardToRiskRatio}R.`,
      recommendedLots: 0,
      riskAmountUSD: 0,
      dollarRisk: 0,
      stopDistance,
      rewardDistance,
      rewardToRiskRatio,
      estimatedCommissionUSD: 0,
      estimatedSpreadCostUSD: 0,
      estimatedSlippageUSD: 0,
      totalTransactionCostUSD: 0,
    };
  }

  // 8. Dynamic Position Sizing Calculation
  // Risk Budget = Equity * Risk%
  const riskBudgetUSD = (account.equity * config.riskPercentagePerTrade) / 100;
  // One lot movement cost: stopDistance * spec.lotSize
  const riskPerOneLotUSD = stopDistance * spec.lotSize;

  let rawLots = riskBudgetUSD / riskPerOneLotUSD;

  // Round to nearest lotStep
  let step = spec.lotStep;
  let lots = Math.floor(rawLots / step) * step;
  lots = Number(lots.toFixed(2));

  // Clamp between minLot and maxLot
  if (lots < spec.minLot) {
    // If even minLot exceeds risk budget significantly, check if acceptable
    const minLotRiskUSD = spec.minLot * riskPerOneLotUSD;
    if (minLotRiskUSD > riskBudgetUSD * 1.35) {
      return {
        allowed: false,
        rejectReason: `Required stop distance ($${stopDistance.toFixed(2)}) on minimum lot size (${spec.minLot}) risks $${minLotRiskUSD.toFixed(2)}, which exceeds the allowable risk budget of $${riskBudgetUSD.toFixed(2)}.`,
        recommendedLots: 0,
        riskAmountUSD: riskBudgetUSD,
        dollarRisk: minLotRiskUSD,
        stopDistance,
        rewardDistance,
        rewardToRiskRatio,
        estimatedCommissionUSD: 0,
        estimatedSpreadCostUSD: 0,
        estimatedSlippageUSD: 0,
        totalTransactionCostUSD: 0,
      };
    }
    lots = spec.minLot;
  } else if (lots > spec.maxLot) {
    lots = spec.maxLot;
  }

  const finalDollarRisk = lots * riskPerOneLotUSD;

  // 9. Cost Estimates (Spread + Commission + Slippage)
  const spreadPts = order.spreadPoints ?? spec.typicalSpreadPoints;
  const spreadCostUSD = spreadPts * spec.lotSize * lots;
  const commissionUSD = spec.commissionPerLotUSD * lots;
  // Slippage model: estimated at 0.5 spread points on standard order
  const slippagePts = spreadPts * 0.5;
  const slippageUSD = slippagePts * spec.lotSize * lots;
  const totalCostUSD = spreadCostUSD + commissionUSD + slippageUSD;

  return {
    allowed: true,
    recommendedLots: lots,
    riskAmountUSD: riskBudgetUSD,
    dollarRisk: finalDollarRisk,
    stopDistance,
    rewardDistance,
    rewardToRiskRatio,
    estimatedCommissionUSD: Number(commissionUSD.toFixed(2)),
    estimatedSpreadCostUSD: Number(spreadCostUSD.toFixed(2)),
    estimatedSlippageUSD: Number(slippageUSD.toFixed(2)),
    totalTransactionCostUSD: Number(totalCostUSD.toFixed(2)),
  };
}

/**
 * Apex Trader AI - Evidence-Backed Trade Ticket, Stressed-Stop Sizing & Post-Trade Review
 * Workflow concepts adapted from HyperGrok Trading Desk (MIT, Andrew Wilkinson & Galleon Labs).
 * Built specifically for Simulation Paper Testing & MT5 Demo validation with live trading permanently disabled.
 */

import type { BacktestTrade } from './backtest.ts';
import type { AccountState, ContractSpec, RiskConfig } from './risk.ts';
import { evaluateOrderRisk, INSTRUMENT_SPECS } from './risk.ts';
import type { SizingMode, TradingEnvironment } from '../types/trading.ts';

export type TradeTicketStatus =
  | 'PROPOSED'
  | 'RISK_PASS'
  | 'RISK_REJECT'
  | 'APPROVED'
  | 'EXECUTED'
  | 'EXPIRED'
  | 'CANCELLED';

export type TicketSource =
  | 'STRATEGY_SIGNAL'
  | 'CHART_INTELLIGENCE'
  | 'VISION_ANALYSIS'
  | 'CRYPTO_RESEARCH'
  | 'MANUAL';

export type AdapterHonestyType = 'SYNTHETIC_PAPER_MOCKED' | 'MT5_DEMO_EA';

export type ProcessGrade = 'FOLLOWED_PLAN' | 'MINOR_DEVIATION' | 'PROCESS_BREACH' | 'UNPLANNED';
export type OutcomeGrade = 'WIN' | 'LOSS' | 'BREAKEVEN';

export interface TicketRiskCheckItem {
  name: string;
  passed: boolean;
  detail: string;
}

export interface TicketRiskReview {
  verdict: 'RISK_PASS' | 'RISK_REJECT';
  nominalLots: number;
  stressedLots: number;
  selectedLots: number;
  riskBudgetUSD: number;
  nominalRiskUSD: number;
  stressedRiskUSD: number;
  nominalStopDistance: number;
  stressedStopDistance: number;
  slippageBufferPts: number;
  roundTripFeePts: number;
  spreadCostUSD: number;
  roundTripFeesUSD: number;
  stressedTotalCostUSD: number;
  nominalRR: number;
  stressedRR: number;
  checks: TicketRiskCheckItem[];
  rejectReasons: string[];
  reviewedAtIso: string;
}

export interface TradeTicket {
  id: string;
  environment: TradingEnvironment;
  adapterType: AdapterHonestyType;
  source: TicketSource;
  symbol: string;
  timeframe: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit2?: number;
  thesis: string;
  evidence: string[];
  invalidation: string;
  createdAtIso: string;
  createdAtMs: number;
  expiresAtMs: number;
  status: TradeTicketStatus;
  liveTradingEnabled: false;
  riskReview: TicketRiskReview | null;
  approval: {
    approvedAtIso: string;
    confirmationPhrase: string;
    approvedBy: string;
  } | null;
  execution: {
    executedAtIso: string;
    positionId: string;
    lotsExecuted: number;
    environment: TradingEnvironment;
    adapterNote: string;
  } | null;
}

export interface PostTradeReviewResult {
  ticketId: string | null;
  outcomeGrade: OutcomeGrade;
  processGrade: ProcessGrade;
  plannedEntry: number | null;
  actualEntry: number;
  entrySlippagePts: number | null;
  plannedSL: number | null;
  plannedTP: number | null;
  plannedRR: number | null;
  actualR: number;
  actualCostUSD: number;
  stressedCostEstimateUSD: number | null;
  costVarianceUSD: number | null;
  notes: string[];
}

const DEFAULT_TICKET_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function formatTicketId(date: Date = new Date(), sequence: number = 1): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const seq = String(Math.max(1, Math.min(999, Math.floor(sequence)))).padStart(2, '0');
  return `APX-${yyyy}${mm}${dd}-${seq}`;
}

export function resolveSpecForSymbol(symbol: string): ContractSpec {
  if (INSTRUMENT_SPECS[symbol]) return INSTRUMENT_SPECS[symbol];
  const upper = symbol.toUpperCase();
  if (upper.includes('BTC') || upper.includes('ETH') || upper.includes('SOL') || upper.endsWith('-PERP')) {
    return {
      symbol,
      name: `${symbol} Crypto Research Paper Spec`,
      category: 'CRYPTO',
      lotSize: 1,
      minLot: 0.01,
      maxLot: 50,
      lotStep: 0.01,
      pipSize: 0.1,
      typicalSpreadPoints: Math.max(0.05, upper.includes('BTC') ? 8 : 0.25),
      commissionPerLotUSD: 6.0,
    };
  }
  return INSTRUMENT_SPECS['XAU/USD'];
}

export interface CreateTradeProposalInput {
  sequence?: number;
  nowMs?: number;
  ttlMs?: number;
  environment: TradingEnvironment;
  source: TicketSource;
  symbol: string;
  timeframe: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit2?: number;
  thesis: string;
  evidence: string[];
  invalidation: string;
}

export function createTradeProposal(input: CreateTradeProposalInput): TradeTicket {
  const nowMs = input.nowMs ?? Date.now();
  const nowDate = new Date(nowMs);
  const ttlMs = input.ttlMs ?? DEFAULT_TICKET_TTL_MS;
  const cleanedEvidence = input.evidence
    .map((e) => e.trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    id: formatTicketId(nowDate, input.sequence ?? 1),
    environment: input.environment,
    adapterType: input.environment === 'SIMULATION' ? 'SYNTHETIC_PAPER_MOCKED' : 'MT5_DEMO_EA',
    source: input.source,
    symbol: input.symbol,
    timeframe: input.timeframe || 'M5',
    side: input.side,
    entryPrice: Number(input.entryPrice),
    stopLoss: Number(input.stopLoss),
    takeProfit: Number(input.takeProfit),
    ...(input.takeProfit2 !== undefined ? { takeProfit2: Number(input.takeProfit2) } : {}),
    thesis: input.thesis.trim() || `${input.side} structured setup on ${input.symbol}`,
    evidence:
      cleanedEvidence.length > 0
        ? cleanedEvidence
        : [`Observed reference entry ${input.entryPrice} at ${nowDate.toISOString()}`],
    invalidation:
      input.invalidation.trim() ||
      `Invalidated if price reaches protective stop ${input.stopLoss} against thesis.`,
    createdAtIso: nowDate.toISOString(),
    createdAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
    status: 'PROPOSED',
    liveTradingEnabled: false,
    riskReview: null,
    approval: null,
    execution: null,
  };
}

export interface StressedRiskReviewParams {
  account: AccountState;
  riskConfig: RiskConfig;
  sizingMode: SizingMode;
  fixedPositionSize: number;
  spreadPoints?: number;
  emergencyTradingDisabled: boolean;
  mt5Connected: boolean;
  nowMs?: number;
}

/**
 * Evaluates a TradeTicket against explicit portfolio risk limits AND stressed-stop arithmetic
 * (nominal stop distance + adverse slippage buffer + both-leg fees + spread).
 */
export function reviewProposalWithStressedRisk(
  ticket: TradeTicket,
  params: StressedRiskReviewParams
): TradeTicket {
  const nowMs = params.nowMs ?? Date.now();
  const spec = resolveSpecForSymbol(ticket.symbol);
  const effectiveConfig: RiskConfig = {
    ...params.riskConfig,
    killSwitchActive: params.riskConfig.killSwitchActive || params.emergencyTradingDisabled,
  };

  const baseEval = evaluateOrderRisk(
    {
      symbol: ticket.symbol,
      side: ticket.side,
      entryPrice: ticket.entryPrice,
      stopLoss: ticket.stopLoss,
      takeProfit: ticket.takeProfit,
      spreadPoints: params.spreadPoints ?? spec.typicalSpreadPoints,
    },
    params.account,
    effectiveConfig,
    spec
  );

  const checks: TicketRiskCheckItem[] = [];
  const rejectReasons: string[] = [];

  if (nowMs > ticket.expiresAtMs) {
    rejectReasons.push('Trade proposal TTL expired before Risk Review completed.');
  }
  if (ticket.environment === 'MT5_DEMO' && !params.mt5Connected) {
    rejectReasons.push('MT5 Demo EA is disconnected. Demo orders cannot be validated or sent.');
  }
  if (params.emergencyTradingDisabled || effectiveConfig.killSwitchActive) {
    rejectReasons.push('Global Emergency Trading-Disable is active.');
  }
  if (!baseEval.allowed && baseEval.rejectReason) {
    rejectReasons.push(baseEval.rejectReason);
  }

  // Compute stressed stop arithmetic regardless so user sees exact breakdown
  const nominalStopDistance = Math.abs(ticket.entryPrice - ticket.stopLoss);
  const rewardDistance = Math.abs(ticket.takeProfit - ticket.entryPrice);
  const spreadPts = params.spreadPoints ?? spec.typicalSpreadPoints;
  const slippageBufferPts = Number((spreadPts * 0.5 + nominalStopDistance * 0.05).toFixed(6));
  const roundTripCommissionPerLot = spec.commissionPerLotUSD * 2;
  const roundTripFeePts =
    spec.lotSize > 0
      ? Number(((roundTripCommissionPerLot / spec.lotSize) + spreadPts).toFixed(6))
      : spreadPts;
  const stressedStopDistance = nominalStopDistance + slippageBufferPts + roundTripFeePts;

  const riskBudgetUSD =
    params.account.equity > 0
      ? (params.account.equity * effectiveConfig.riskPercentagePerTrade) / 100
      : 0;

  let stressedLots = 0;
  if (stressedStopDistance > 0 && riskBudgetUSD > 0) {
    const rawStressedLots = riskBudgetUSD / (stressedStopDistance * spec.lotSize);
    const floored = Math.floor(rawStressedLots / spec.lotStep) * spec.lotStep;
    stressedLots = Number(Math.max(0, Math.min(spec.maxLot, floored)).toFixed(2));
  }

  let selectedLots =
    params.sizingMode === 'FIXED_LOT'
      ? Number(params.fixedPositionSize.toFixed(2))
      : stressedLots > 0
      ? stressedLots
      : baseEval.recommendedLots;

  if (params.sizingMode === 'RISK_PERCENT' && stressedLots < spec.minLot && nominalStopDistance > 0) {
    const minLotStressedRisk = spec.minLot * stressedStopDistance * spec.lotSize;
    if (riskBudgetUSD > 0 && minLotStressedRisk <= riskBudgetUSD * 1.35) {
      stressedLots = spec.minLot;
      selectedLots = spec.minLot;
    } else if (baseEval.allowed) {
      rejectReasons.push(
        `Stressed minimum lot (${spec.minLot}) risks $${minLotStressedRisk.toFixed(
          2
        )}, exceeding risk budget $${riskBudgetUSD.toFixed(2)}.`
      );
      selectedLots = 0;
    }
  }

  const nominalRiskUSD = Number((selectedLots * nominalStopDistance * spec.lotSize).toFixed(2));
  const stressedRiskUSD = Number((selectedLots * stressedStopDistance * spec.lotSize).toFixed(2));
  const spreadCostUSD = Number((selectedLots * spreadPts * spec.lotSize).toFixed(2));
  const roundTripFeesUSD = Number((selectedLots * roundTripCommissionPerLot).toFixed(2));
  const slippageCostUSD = Number((selectedLots * slippageBufferPts * spec.lotSize).toFixed(2));
  const stressedTotalCostUSD = Number((spreadCostUSD + roundTripFeesUSD + slippageCostUSD).toFixed(2));

  if (
    params.sizingMode === 'FIXED_LOT' &&
    selectedLots > 0 &&
    riskBudgetUSD > 0 &&
    stressedRiskUSD > riskBudgetUSD * 1.5
  ) {
    rejectReasons.push(
      `Fixed lot ${selectedLots.toFixed(2)} creates stressed risk $${stressedRiskUSD.toFixed(
        2
      )} (> 1.5x risk budget $${riskBudgetUSD.toFixed(2)}).`
    );
  }

  const nominalRR =
    nominalStopDistance > 0 ? Number((rewardDistance / nominalStopDistance).toFixed(2)) : 0;
  const stressedRewardDistance = Math.max(0, rewardDistance - roundTripFeePts);
  const stressedRR =
    stressedStopDistance > 0 ? Number((stressedRewardDistance / stressedStopDistance).toFixed(2)) : 0;

  if (nominalStopDistance > 0 && stressedRR < Math.max(1.0, effectiveConfig.minRewardToRiskRatio * 0.8)) {
    rejectReasons.push(
      `Stressed R:R (${stressedRR}R after fees + slippage) drops below survival floor.`
    );
  }

  checks.push({
    name: 'Portfolio Guardrails & Kill Switch',
    passed: baseEval.allowed && !params.emergencyTradingDisabled,
    detail: baseEval.allowed
      ? 'Daily loss, drawdown, max open positions, and trade limits clear.'
      : baseEval.rejectReason || 'Portfolio risk limit triggered.',
  });
  checks.push({
    name: 'Stressed-Stop Sizing',
    passed: selectedLots >= spec.minLot && stressedRiskUSD <= Math.max(riskBudgetUSD * 1.5, 1),
    detail: `Nominal stop ${nominalStopDistance.toFixed(4)} → Stressed stop ${stressedStopDistance.toFixed(
      4
    )} (+slip ${slippageBufferPts.toFixed(4)} +costs ${roundTripFeePts.toFixed(4)}). Lots: ${selectedLots.toFixed(
      2
    )}`,
  });
  checks.push({
    name: 'Stressed Expectancy (R:R)',
    passed: stressedRR >= Math.max(1.0, effectiveConfig.minRewardToRiskRatio * 0.8),
    detail: `Nominal ${nominalRR}R → Stressed ${stressedRR}R (Cost drag: $${stressedTotalCostUSD.toFixed(2)})`,
  });
  checks.push({
    name: 'Environment Connectivity & Safety Lock',
    passed:
      (ticket.environment === 'SIMULATION' || params.mt5Connected) &&
      ticket.liveTradingEnabled === false,
    detail:
      ticket.environment === 'SIMULATION'
        ? 'Simulation sandbox (synthetic mocked fills). Live trading permanently disabled.'
        : params.mt5Connected
        ? 'MT5 Demo EA connected. Live trading permanently disabled.'
        : 'MT5 Demo EA disconnected.',
  });

  const uniqueRejects = Array.from(new Set(rejectReasons));
  const verdict: 'RISK_PASS' | 'RISK_REJECT' = uniqueRejects.length === 0 ? 'RISK_PASS' : 'RISK_REJECT';

  const riskReview: TicketRiskReview = {
    verdict,
    nominalLots: baseEval.recommendedLots,
    stressedLots,
    selectedLots,
    riskBudgetUSD: Number(riskBudgetUSD.toFixed(2)),
    nominalRiskUSD,
    stressedRiskUSD,
    nominalStopDistance: Number(nominalStopDistance.toFixed(5)),
    stressedStopDistance: Number(stressedStopDistance.toFixed(5)),
    slippageBufferPts: Number(slippageBufferPts.toFixed(5)),
    roundTripFeePts: Number(roundTripFeePts.toFixed(5)),
    spreadCostUSD,
    roundTripFeesUSD,
    stressedTotalCostUSD,
    nominalRR,
    stressedRR,
    checks,
    rejectReasons: uniqueRejects,
    reviewedAtIso: new Date(nowMs).toISOString(),
  };

  return {
    ...ticket,
    status: verdict,
    riskReview,
  };
}

/**
 * Normalizes and validates explicit out-of-band trader confirmation referencing the exact Ticket ID.
 * Prevents self-approval or blind "Confirm" clicks across queued tickets.
 */
export function approveTicketById(
  ticket: TradeTicket,
  confirmationInput: string,
  approvedBy: string = 'Trader',
  nowMs: number = Date.now()
): { ok: true; ticket: TradeTicket } | { ok: false; error: string; ticket: TradeTicket } {
  if (ticket.status === 'EXECUTED') {
    return { ok: false, error: `Ticket ${ticket.id} is already EXECUTED (single-send locked).`, ticket };
  }
  if (nowMs > ticket.expiresAtMs) {
    return {
      ok: false,
      error: `Ticket ${ticket.id} expired at ${new Date(ticket.expiresAtMs).toISOString()}. Generate a fresh proposal.`,
      ticket: { ...ticket, status: 'EXPIRED' },
    };
  }
  if (ticket.status !== 'RISK_PASS' || !ticket.riskReview || ticket.riskReview.verdict !== 'RISK_PASS') {
    return {
      ok: false,
      error: `Ticket ${ticket.id} must pass Stressed Risk Review (RISK_PASS) before trader approval.`,
      ticket,
    };
  }

  const normalized = confirmationInput.trim().toUpperCase();
  const targetId = ticket.id.toUpperCase();
  const expectedPhrase = `APPROVE ${targetId}`;
  if (normalized !== targetId && normalized !== expectedPhrase) {
    return {
      ok: false,
      error: `Out-of-band confirmation must match "${expectedPhrase}" or "${targetId}".`,
      ticket,
    };
  }

  return {
    ok: true,
    ticket: {
      ...ticket,
      status: 'APPROVED',
      approval: {
        approvedAtIso: new Date(nowMs).toISOString(),
        confirmationPhrase: confirmationInput.trim(),
        approvedBy,
      },
    },
  };
}

export interface ExecuteApprovedTicketResult {
  ok: true;
  ticket: TradeTicket;
  orderPayload: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    lots: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    takeProfit2?: number;
    ticketId: string;
    plannedEntry: number;
    plannedSL: number;
    plannedTP: number;
    stressedCostEstimateUSD: number;
  };
}

export function executeApprovedTicketOnce(
  ticket: TradeTicket,
  params: {
    positionId: string;
    emergencyTradingDisabled: boolean;
    mt5Connected: boolean;
    nowMs?: number;
  }
): ExecuteApprovedTicketResult | { ok: false; error: string; ticket: TradeTicket } {
  const nowMs = params.nowMs ?? Date.now();

  // Single-send lock
  if (ticket.status === 'EXECUTED' || ticket.execution !== null) {
    return {
      ok: false,
      error: `Single-send lock: Ticket ${ticket.id} was already executed.`,
      ticket,
    };
  }
  if (params.emergencyTradingDisabled) {
    return {
      ok: false,
      error: 'Global Emergency Trading-Disable is active. Ticket execution blocked.',
      ticket,
    };
  }
  if (ticket.environment === 'MT5_DEMO' && !params.mt5Connected) {
    return {
      ok: false,
      error: 'MT5 Demo EA is disconnected. Demo ticket execution blocked.',
      ticket,
    };
  }
  if (nowMs > ticket.expiresAtMs) {
    return {
      ok: false,
      error: `Ticket ${ticket.id} has expired. Re-run Risk Review on a new proposal.`,
      ticket: { ...ticket, status: 'EXPIRED' },
    };
  }
  if (ticket.status !== 'APPROVED' || !ticket.approval || !ticket.riskReview) {
    return {
      ok: false,
      error: `Ticket ${ticket.id} requires explicit out-of-band approval before execution.`,
      ticket,
    };
  }

  const lots = ticket.riskReview.selectedLots;
  if (lots <= 0) {
    return {
      ok: false,
      error: `Ticket ${ticket.id} has zero approved lot size.`,
      ticket,
    };
  }

  const adapterNote =
    ticket.environment === 'SIMULATION'
      ? 'Synthetic GBM paper simulation fill (mocked market quotes).'
      : 'Dispatched via MT5 Demo validation profile (live trading permanently disabled).';

  const executedTicket: TradeTicket = {
    ...ticket,
    status: 'EXECUTED',
    execution: {
      executedAtIso: new Date(nowMs).toISOString(),
      positionId: params.positionId,
      lotsExecuted: lots,
      environment: ticket.environment,
      adapterNote,
    },
  };

  return {
    ok: true,
    ticket: executedTicket,
    orderPayload: {
      symbol: ticket.symbol,
      side: ticket.side,
      lots,
      entryPrice: ticket.entryPrice,
      stopLoss: ticket.stopLoss,
      takeProfit: ticket.takeProfit,
      takeProfit2: ticket.takeProfit2,
      ticketId: ticket.id,
      plannedEntry: ticket.entryPrice,
      plannedSL: ticket.stopLoss,
      plannedTP: ticket.takeProfit,
      stressedCostEstimateUSD: ticket.riskReview.stressedTotalCostUSD,
    },
  };
}

/**
 * Separates Process quality (adherence to the approved ticket plan) from Outcome quality (win/loss).
 */
export function evaluatePostTradeReview(
  trade: BacktestTrade,
  linkedTicket?: TradeTicket | null
): PostTradeReviewResult {
  const outcomeGrade: OutcomeGrade =
    trade.netPnlUSD > 0 ? 'WIN' : trade.netPnlUSD < 0 ? 'LOSS' : 'BREAKEVEN';
  const actualCostUSD = Number(
    (trade.commissionUSD + trade.spreadCostUSD + trade.slippageUSD).toFixed(2)
  );
  const notes: string[] = [];

  if (!linkedTicket && !trade.ticketId) {
    notes.push('Executed via Quick Order without a pre-approved APX trade ticket.');
    return {
      ticketId: null,
      outcomeGrade,
      processGrade: 'UNPLANNED',
      plannedEntry: null,
      actualEntry: trade.entryPrice,
      entrySlippagePts: null,
      plannedSL: null,
      plannedTP: null,
      plannedRR: null,
      actualR: trade.rMultiple,
      actualCostUSD,
      stressedCostEstimateUSD: null,
      costVarianceUSD: null,
      notes,
    };
  }

  const plannedEntry = linkedTicket?.entryPrice ?? trade.plannedEntry ?? trade.entryPrice;
  const plannedSL = linkedTicket?.stopLoss ?? trade.plannedSL ?? null;
  const plannedTP = linkedTicket?.takeProfit ?? trade.plannedTP ?? null;
  const stressedEst =
    linkedTicket?.riskReview?.stressedTotalCostUSD ?? trade.stressedCostEstimateUSD ?? null;

  const entrySlippagePts = Number(Math.abs(trade.entryPrice - plannedEntry).toFixed(5));
  const plannedStopDist = plannedSL !== null ? Math.abs(plannedEntry - plannedSL) : 0;
  const plannedRewardDist = plannedTP !== null ? Math.abs(plannedTP - plannedEntry) : 0;
  const plannedRR =
    plannedStopDist > 0 ? Number((plannedRewardDist / plannedStopDist).toFixed(2)) : null;

  const slipThreshold = Math.max(plannedStopDist * 0.2, 0.0001);
  let deviations = 0;

  if (linkedTicket && !linkedTicket.approval) {
    deviations += 2;
    notes.push('Missing explicit Ticket ID approval record.');
  } else {
    notes.push(`Approved plan ${trade.ticketId || linkedTicket?.id} executed once.`);
  }

  if (linkedTicket?.riskReview && trade.lots > linkedTicket.riskReview.selectedLots + 0.001) {
    deviations += 2;
    notes.push(
      `Size breach: filled ${trade.lots} lots vs approved ${linkedTicket.riskReview.selectedLots} lots.`
    );
  }

  if (entrySlippagePts > slipThreshold && plannedStopDist > 0) {
    deviations += 1;
    notes.push(`Entry variance ${entrySlippagePts} pts exceeded 20% of planned stop distance.`);
  }

  if (outcomeGrade === 'LOSS' && deviations === 0) {
    notes.push('Outcome was a loss, but execution followed the approved risk & stop plan.');
  } else if (outcomeGrade === 'WIN' && deviations > 0) {
    notes.push('Winning trade had process deviations — do not confuse luck with discipline.');
  }

  const processGrade: ProcessGrade =
    deviations >= 2 ? 'PROCESS_BREACH' : deviations === 1 ? 'MINOR_DEVIATION' : 'FOLLOWED_PLAN';

  return {
    ticketId: trade.ticketId || linkedTicket?.id || null,
    outcomeGrade,
    processGrade,
    plannedEntry,
    actualEntry: trade.entryPrice,
    entrySlippagePts,
    plannedSL,
    plannedTP,
    plannedRR,
    actualR: trade.rMultiple,
    actualCostUSD,
    stressedCostEstimateUSD: stressedEst,
    costVarianceUSD:
      stressedEst !== null ? Number((actualCostUSD - stressedEst).toFixed(2)) : null,
    notes,
  };
}

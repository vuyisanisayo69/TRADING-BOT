import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveTicketById,
  createTradeProposal,
  evaluatePostTradeReview,
  executeApprovedTicketOnce,
  formatTicketId,
  reviewProposalWithStressedRisk,
} from './tradeDesk.ts';
import { DEFAULT_RISK_CONFIG, type AccountState } from './risk.ts';
import type { BacktestTrade } from './backtest.ts';

const baseAccount: AccountState = {
  initialBalance: 100000,
  balance: 100000,
  equity: 100000,
  usedMargin: 0,
  freeMargin: 100000,
  dailyRealizedPnL: 0,
  dailyUnrealizedPnL: 0,
  totalRealizedPnL: 0,
  peakEquity: 100000,
  consecutiveLosses: 0,
  openPositionCount: 0,
  dailyTradeCount: 0,
};

test('formatTicketId produces deterministic APX-YYYYMMDD-XX format', () => {
  const id = formatTicketId(new Date('2026-11-18T12:00:00Z'), 3);
  assert.equal(id, 'APX-20261118-03');
});

test('reviewProposalWithStressedRisk computes stressed-stop sizing <= nominal sizing', () => {
  const now = new Date('2026-11-18T12:00:00Z').getTime();
  const proposal = createTradeProposal({
    sequence: 1,
    nowMs: now,
    environment: 'SIMULATION',
    source: 'STRATEGY_SIGNAL',
    symbol: 'XAU/USD',
    timeframe: 'M5',
    side: 'LONG',
    entryPrice: 2655.0,
    stopLoss: 2650.0,
    takeProfit: 2667.5,
    thesis: 'Bullish FVG mitigation after M5 sweep',
    evidence: ['SMMA5 > SMMA50', 'Sweep below 2651.20'],
    invalidation: 'H1 close below 2650.00',
  });

  const reviewed = reviewProposalWithStressedRisk(proposal, {
    account: baseAccount,
    riskConfig: DEFAULT_RISK_CONFIG,
    sizingMode: 'RISK_PERCENT',
    fixedPositionSize: 0.1,
    spreadPoints: 0.25,
    emergencyTradingDisabled: false,
    mt5Connected: false,
    nowMs: now,
  });

  assert.equal(reviewed.status, 'RISK_PASS');
  assert.ok(reviewed.riskReview);
  assert.equal(reviewed.riskReview.verdict, 'RISK_PASS');
  assert.ok(reviewed.riskReview.stressedStopDistance > reviewed.riskReview.nominalStopDistance);
  assert.ok(reviewed.riskReview.stressedLots <= reviewed.riskReview.nominalLots);
  assert.ok(reviewed.riskReview.stressedRR < reviewed.riskReview.nominalRR);
  assert.equal(reviewed.adapterType, 'SYNTHETIC_PAPER_MOCKED');
});

test('reviewProposalWithStressedRisk rejects when emergency stop or MT5 disconnect active', () => {
  const now = Date.now();
  const proposal = createTradeProposal({
    nowMs: now,
    environment: 'MT5_DEMO',
    source: 'MANUAL',
    symbol: 'XAU/USD',
    timeframe: 'H1',
    side: 'LONG',
    entryPrice: 2655.0,
    stopLoss: 2650.0,
    takeProfit: 2665.0,
    thesis: 'Test',
    evidence: ['Test level'],
    invalidation: 'Below 2650',
  });

  const reviewed = reviewProposalWithStressedRisk(proposal, {
    account: baseAccount,
    riskConfig: DEFAULT_RISK_CONFIG,
    sizingMode: 'RISK_PERCENT',
    fixedPositionSize: 0.1,
    emergencyTradingDisabled: false,
    mt5Connected: false,
    nowMs: now,
  });

  assert.equal(reviewed.status, 'RISK_REJECT');
  assert.equal(reviewed.riskReview?.verdict, 'RISK_REJECT');
});

test('approveTicketById requires exact Ticket ID and executeApprovedTicketOnce enforces single-send lock', () => {
  const now = new Date('2026-11-18T12:00:00Z').getTime();
  const proposal = createTradeProposal({
    sequence: 7,
    nowMs: now,
    environment: 'SIMULATION',
    source: 'CHART_INTELLIGENCE',
    symbol: 'XAU/USD',
    timeframe: 'M15',
    side: 'LONG',
    entryPrice: 2650,
    stopLoss: 2645,
    takeProfit: 2662,
    thesis: 'Chart Intelligence demand zone bounce',
    evidence: ['Order Block 2648-2650'],
    invalidation: 'Close below 2645',
  });

  const reviewed = reviewProposalWithStressedRisk(proposal, {
    account: baseAccount,
    riskConfig: DEFAULT_RISK_CONFIG,
    sizingMode: 'RISK_PERCENT',
    fixedPositionSize: 0.1,
    emergencyTradingDisabled: false,
    mt5Connected: false,
    nowMs: now,
  });
  assert.equal(reviewed.status, 'RISK_PASS');

  // Wrong ID fails
  const wrongApproval = approveTicketById(reviewed, 'approve APX-20261118-99', 'Trader', now + 1000);
  assert.equal(wrongApproval.ok, false);

  // Exact approve command succeeds
  const rightApproval = approveTicketById(reviewed, 'approve APX-20261118-07', 'Trader', now + 1000);
  assert.equal(rightApproval.ok, true);
  if (!rightApproval.ok) return;
  assert.equal(rightApproval.ticket.status, 'APPROVED');

  // First execution succeeds
  const exec1 = executeApprovedTicketOnce(rightApproval.ticket, {
    positionId: 'pos_123',
    emergencyTradingDisabled: false,
    mt5Connected: false,
    nowMs: now + 2000,
  });
  assert.equal(exec1.ok, true);
  if (!exec1.ok) return;
  assert.equal(exec1.ticket.status, 'EXECUTED');

  // Second execution blocked by single-send lock
  const exec2 = executeApprovedTicketOnce(exec1.ticket, {
    positionId: 'pos_456',
    emergencyTradingDisabled: false,
    mt5Connected: false,
    nowMs: now + 3000,
  });
  assert.equal(exec2.ok, false);
});

test('evaluatePostTradeReview separates Process Grade from Outcome Grade', () => {
  const now = new Date('2026-11-18T12:00:00Z').getTime();
  const proposal = createTradeProposal({
    sequence: 2,
    nowMs: now,
    environment: 'SIMULATION',
    source: 'STRATEGY_SIGNAL',
    symbol: 'XAU/USD',
    timeframe: 'M5',
    side: 'LONG',
    entryPrice: 2650,
    stopLoss: 2645,
    takeProfit: 2662,
    thesis: 'Pullback entry',
    evidence: ['SMMA pullback'],
    invalidation: 'Stop 2645',
  });
  const reviewed = reviewProposalWithStressedRisk(proposal, {
    account: baseAccount,
    riskConfig: DEFAULT_RISK_CONFIG,
    sizingMode: 'RISK_PERCENT',
    fixedPositionSize: 0.1,
    emergencyTradingDisabled: false,
    mt5Connected: false,
    nowMs: now,
  });
  const approved = approveTicketById(reviewed, proposal.id, 'Trader', now + 100);
  assert.equal(approved.ok, true);
  if (!approved.ok) return;

  // Losing trade that followed approved plan should grade LOSS + FOLLOWED_PLAN
  const stoppedTrade: BacktestTrade = {
    id: 'tr_1',
    symbol: 'XAU/USD',
    side: 'LONG',
    entryTime: 1000,
    entryPrice: 2650,
    exitTime: 2000,
    exitPrice: 2645,
    exitReason: 'STOP_LOSS',
    lots: approved.ticket.riskReview!.selectedLots,
    pnlUSD: -400,
    pnlPercent: -0.4,
    rMultiple: -1,
    commissionUSD: 8,
    spreadCostUSD: 20,
    slippageUSD: 10,
    netPnlUSD: -438,
    durationMinutes: 16,
    ticketId: approved.ticket.id,
  };

  const review = evaluatePostTradeReview(stoppedTrade, approved.ticket);
  assert.equal(review.outcomeGrade, 'LOSS');
  assert.equal(review.processGrade, 'FOLLOWED_PLAN');

  // Unplanned winning trade should grade WIN + UNPLANNED
  const unplannedWin: BacktestTrade = {
    ...stoppedTrade,
    id: 'tr_2',
    ticketId: undefined,
    exitPrice: 2660,
    exitReason: 'TAKE_PROFIT',
    pnlUSD: 500,
    netPnlUSD: 470,
    rMultiple: 2,
  };
  const unplannedReview = evaluatePostTradeReview(unplannedWin, null);
  assert.equal(unplannedReview.outcomeGrade, 'WIN');
  assert.equal(unplannedReview.processGrade, 'UNPLANNED');
});

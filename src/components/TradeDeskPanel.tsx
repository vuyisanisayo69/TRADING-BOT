import React, { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  ShieldCheck,
  AlertOctagon,
  Lock,
  Play,
  FilePlus2,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
} from 'lucide-react';
import type { SizingMode, TradingEnvironment } from '../types/trading.ts';
import type { AccountState, RiskConfig } from '../utils/risk.ts';
import type { TradingSignal } from '../utils/strategy.ts';
import type { TradeTicket, CreateTradeProposalInput } from '../utils/tradeDesk.ts';

interface TradeDeskPanelProps {
  environment: TradingEnvironment;
  symbol: string;
  timeframe: string;
  currentBid: number;
  currentAsk: number;
  account: AccountState;
  riskConfig: RiskConfig;
  sizingMode: SizingMode;
  fixedPositionSize: number;
  emergencyTradingDisabled: boolean;
  mt5Connected: boolean;
  currentSignal: TradingSignal;
  tickets: TradeTicket[];
  activeTicketId: string | null;
  onSelectTicket: (id: string) => void;
  onCreateProposal: (input: CreateTradeProposalInput) => void;
  onRunRiskReview: (ticketId: string) => void;
  onApproveTicket: (ticketId: string, phrase: string) => { ok: boolean; error?: string };
  onExecuteTicketOnce: (ticketId: string) => { ok: boolean; error?: string };
  onCancelTicket: (ticketId: string) => void;
}

export const TradeDeskPanel: React.FC<TradeDeskPanelProps> = ({
  environment,
  symbol,
  timeframe,
  currentBid,
  currentAsk,
  account,
  riskConfig,
  sizingMode,
  fixedPositionSize,
  emergencyTradingDisabled,
  mt5Connected,
  currentSignal,
  tickets,
  activeTicketId,
  onSelectTicket,
  onCreateProposal,
  onRunRiskReview,
  onApproveTicket,
  onExecuteTicketOnce,
  onCancelTicket,
}) => {
  const [approvalInput, setApprovalInput] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  // Manual draft fields when no ticket is open or drafting fresh
  const [draftSide, setDraftSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [draftThesis, setDraftThesis] = useState<string>('');

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const activeTicket =
    tickets.find((t) => t.id === activeTicketId) || tickets[0] || null;

  useEffect(() => {
    setApprovalInput('');
    setActionError(null);
  }, [activeTicket?.id]);

  const handleDraftFromSignalOrPrice = () => {
    setActionError(null);
    const hasActionableSignal = currentSignal.action !== 'NO_TRADE';
    const side: 'LONG' | 'SHORT' = hasActionableSignal
      ? currentSignal.action === 'LONG'
        ? 'LONG'
        : 'SHORT'
      : draftSide;

    const entryPrice = hasActionableSignal
      ? currentSignal.entryZone.recommended
      : side === 'LONG'
      ? currentAsk || 2655
      : currentBid || 2655;

    const defaultDist = entryPrice > 10000 ? 600 : entryPrice > 100 ? 6 : 0.005;
    const stopLoss = hasActionableSignal
      ? currentSignal.stopLoss
      : Number((side === 'LONG' ? entryPrice - defaultDist : entryPrice + defaultDist).toFixed(4));
    const takeProfit = hasActionableSignal
      ? currentSignal.takeProfit1
      : Number(
          (side === 'LONG' ? entryPrice + defaultDist * 2 : entryPrice - defaultDist * 2).toFixed(4)
        );

    const evidence = hasActionableSignal
      ? [
          `${currentSignal.botMode} Bot Score ${currentSignal.qualityScore}/100 on ${symbol} ${timeframe}`,
          ...currentSignal.supportingReasons.slice(0, 3),
        ]
      : [
          `Terminal ${symbol} ${timeframe} Bid ${currentBid} / Ask ${currentAsk} (${new Date().toISOString()})`,
          `Sizing Profile: ${
            sizingMode === 'FIXED_LOT'
              ? `Fixed ${fixedPositionSize} lots`
              : `${riskConfig.riskPercentagePerTrade}% equity risk`
          }`,
        ];

    onCreateProposal({
      environment,
      source: hasActionableSignal ? 'STRATEGY_SIGNAL' : 'MANUAL',
      symbol,
      timeframe,
      side,
      entryPrice,
      stopLoss,
      takeProfit,
      takeProfit2: hasActionableSignal ? currentSignal.takeProfit2 : undefined,
      thesis:
        draftThesis.trim() ||
        (hasActionableSignal
          ? `${currentSignal.botMode} confluence ${side} setup (${currentSignal.qualityScore}/100)`
          : `Structured ${side} desk proposal on ${symbol} ${timeframe}`),
      evidence,
      invalidation:
        hasActionableSignal && currentSignal.invalidationConditions.length > 0
          ? currentSignal.invalidationConditions[0]
          : `Invalidated if price reaches stop loss ${stopLoss}`,
    });
    setDraftThesis('');
  };

  const handleApproveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;
    const res = onApproveTicket(activeTicket.id, approvalInput);
    if (!res.ok) {
      setActionError(res.error || 'Approval rejected.');
      return;
    }
    setActionError(null);
    setApprovalInput('');
  };

  const handleExecute = () => {
    if (!activeTicket) return;
    const res = onExecuteTicketOnce(activeTicket.id);
    if (!res.ok) {
      setActionError(res.error || 'Ticket dispatch blocked.');
      return;
    }
    setActionError(null);
  };

  const statusBadgeColor = (status: TradeTicket['status']) => {
    switch (status) {
      case 'RISK_PASS':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60';
      case 'APPROVED':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-600/60';
      case 'EXECUTED':
        return 'bg-indigo-950/80 text-indigo-300 border-indigo-600/60';
      case 'RISK_REJECT':
      case 'EXPIRED':
      case 'CANCELLED':
        return 'bg-rose-950/80 text-rose-300 border-rose-700/60';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const ttlRemainingSec = activeTicket
    ? Math.max(0, Math.floor((activeTicket.expiresAtMs - nowMs) / 1000))
    : 0;
  const digits = activeTicket && activeTicket.entryPrice < 10 ? 4 : activeTicket && activeTicket.entryPrice < 200 ? 3 : 2;

  return (
    <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-3.5 shadow-xl space-y-3 text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-1.5">
          <ClipboardCheck className="w-4 h-4 text-cyan-400" />
          <span className="font-bold uppercase tracking-wider text-slate-200">
            APX TICKET DESK
          </span>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded border font-bold ${
            environment === 'SIMULATION'
              ? 'bg-amber-950/60 text-amber-300 border-amber-700/50'
              : 'bg-cyan-950/60 text-cyan-300 border-cyan-700/50'
          }`}
          title={
            environment === 'SIMULATION'
              ? 'Simulation paper fills use synthetic mocked market quotes'
              : 'MT5 Demo bridge validation (live trading disabled)'
          }
        >
          {environment === 'SIMULATION' ? 'PAPER · MOCKED QUOTES' : 'MT5 DEMO · LOCKED'}
        </span>
      </div>

      {/* Draft New Evidence-Backed Proposal */}
      <div className="p-2.5 rounded-lg bg-[#111728] border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>STEP 1 · PROPOSAL ({symbol})</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDraftSide('LONG')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                draftSide === 'LONG' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              LONG
            </button>
            <button
              type="button"
              onClick={() => setDraftSide('SHORT')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                draftSide === 'SHORT' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              SHORT
            </button>
          </div>
        </div>

        <input
          type="text"
          value={draftThesis}
          onChange={(e) => setDraftThesis(e.target.value)}
          placeholder={
            currentSignal.action !== 'NO_TRADE'
              ? `Use ${currentSignal.botMode} ${currentSignal.action} thesis or type custom...`
              : 'Optional thesis note...'
          }
          className="w-full bg-[#0e1424] border border-slate-700 rounded px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-cyan-500"
        />

        <button
          type="button"
          onClick={handleDraftFromSignalOrPrice}
          className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <FilePlus2 className="w-3.5 h-3.5" />
          {currentSignal.action !== 'NO_TRADE'
            ? `Draft APX Proposal (${currentSignal.action} ${currentSignal.qualityScore}/100)`
            : `Draft Manual APX Proposal (${symbol})`}
        </button>
      </div>

      {/* Ticket Selector Queue */}
      {tickets.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {tickets.slice(0, 6).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTicket(t.id)}
              className={`px-2 py-1 rounded text-[10px] border whitespace-nowrap cursor-pointer ${
                activeTicket?.id === t.id
                  ? 'bg-cyan-500/20 border-cyan-500/60 text-white font-bold'
                  : 'bg-[#111728] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.id} ({t.status})
            </button>
          ))}
        </div>
      )}

      {/* Active Ticket Inspector & Gate Controls */}
      {!activeTicket ? (
        <div className="py-5 text-center text-[11px] text-slate-500">
          No active trade ticket. Draft a proposal from Terminal, Signals Engine, Chart Intelligence,
          or Crypto Research to run Stressed Risk Review.
        </div>
      ) : (
        <div className="space-y-2.5 p-3 rounded-lg bg-[#111728] border border-slate-800">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div>
              <div className="font-bold text-white text-xs">{activeTicket.id}</div>
              <div className="text-[10px] text-slate-400">
                {activeTicket.symbol} · {activeTicket.side} · {activeTicket.source}
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusBadgeColor(
                activeTicket.status
              )}`}
            >
              {activeTicket.status}
            </span>
          </div>

          {/* Adapter Honesty Notice */}
          <div className="text-[10px] text-amber-300/90 bg-amber-950/20 border border-amber-800/40 rounded px-2 py-1">
            {activeTicket.adapterType === 'SYNTHETIC_PAPER_MOCKED'
              ? 'Paper Sandbox: Synthetic mocked ticks. Stressed-stop math does not simulate live broker liquidity.'
              : 'MT5 Demo Adapter: Requires active EA heartbeat. Live trading permanently disabled.'}
          </div>

          {/* Levels */}
          <div className="grid grid-cols-3 gap-1.5 text-[11px] tabular-nums bg-[#0b101d] p-2 rounded border border-slate-800">
            <div>
              <span className="text-[9px] text-slate-500 block">ENTRY</span>
              <span className="font-bold text-white">{activeTicket.entryPrice.toFixed(digits)}</span>
            </div>
            <div>
              <span className="text-[9px] text-rose-400 block">STOP LOSS</span>
              <span className="font-bold text-rose-300">{activeTicket.stopLoss.toFixed(digits)}</span>
            </div>
            <div>
              <span className="text-[9px] text-emerald-400 block">TAKE PROFIT</span>
              <span className="font-bold text-emerald-300">{activeTicket.takeProfit.toFixed(digits)}</span>
            </div>
          </div>

          {/* Evidence & Invalidation */}
          <div className="space-y-1 text-[10px]">
            <div className="text-slate-300 font-semibold">{activeTicket.thesis}</div>
            <ul className="list-disc list-inside text-slate-400 space-y-0.5">
              {activeTicket.evidence.slice(0, 3).map((ev, idx) => (
                <li key={idx}>{ev}</li>
              ))}
            </ul>
            <div className="text-rose-300/90">Invalidation: {activeTicket.invalidation}</div>
            <div className="text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              TTL: {ttlRemainingSec > 0 ? `${Math.floor(ttlRemainingSec / 60)}m ${ttlRemainingSec % 60}s left` : 'Expired'}
            </div>
          </div>

          {/* Step 2: Run Stressed Risk Review */}
          {activeTicket.status === 'PROPOSED' && (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                onRunRiskReview(activeTicket.id);
              }}
              className="w-full py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              Run Risk Review (Stressed-Stop Gate)
            </button>
          )}

          {/* Stressed Risk Breakdown */}
          {activeTicket.riskReview && (
            <div className="p-2 rounded bg-[#0b101d] border border-slate-800 space-y-1.5 text-[10px]">
              <div className="flex items-center justify-between font-bold">
                <span className="text-slate-300">STRESSED-STOP ARITHMETIC</span>
                <span
                  className={
                    activeTicket.riskReview.verdict === 'RISK_PASS'
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }
                >
                  {activeTicket.riskReview.verdict}
                </span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Lot Sizing (Stressed / Nominal):</span>
                <span className="text-white font-bold">
                  {activeTicket.riskReview.selectedLots} / {activeTicket.riskReview.nominalLots} lots
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Stressed Risk / Budget:</span>
                <span className="text-slate-200">
                  ${activeTicket.riskReview.stressedRiskUSD.toFixed(2)} / $
                  {activeTicket.riskReview.riskBudgetUSD.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Stop Drag (Slip + Fees + Spr):</span>
                <span className="text-amber-300">
                  ${activeTicket.riskReview.stressedTotalCostUSD.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>R:R (Nominal → Stressed):</span>
                <span className="text-cyan-300 font-bold">
                  {activeTicket.riskReview.nominalRR}R → {activeTicket.riskReview.stressedRR}R
                </span>
              </div>

              {activeTicket.riskReview.checks.map((c, i) => (
                <div key={i} className="flex items-start gap-1.5 pt-0.5">
                  {c.passed ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <span className={c.passed ? 'text-slate-300' : 'text-rose-300'}>
                    <strong>{c.name}:</strong> {c.detail}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Out-of-Band Confirmation by Exact Ticket ID */}
          {activeTicket.status === 'RISK_PASS' && (
            <form onSubmit={handleApproveSubmit} className="space-y-2 pt-1 border-t border-slate-800">
              <div className="text-[10px] text-cyan-300 font-bold">
                STEP 3 · OUT-OF-BAND APPROVAL (NO SELF-APPROVAL)
              </div>
              <p className="text-[10px] text-slate-400">
                Type <code className="text-white select-all">approve {activeTicket.id}</code> to lock
                your approval on this Ticket ID:
              </p>
              <input
                type="text"
                value={approvalInput}
                onChange={(e) => setApprovalInput(e.target.value)}
                placeholder={`approve ${activeTicket.id}`}
                className="w-full bg-[#0e1424] border border-cyan-800/70 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                Approve {activeTicket.id}
              </button>
            </form>
          )}

          {/* Step 4: Bounded Single-Send Dispatch */}
          {activeTicket.status === 'APPROVED' && (
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <div className="text-[10px] text-emerald-300 font-bold">
                STEP 4 · APPROVED AT {new Date(activeTicket.approval!.approvedAtIso).toLocaleTimeString()}
              </div>
              <button
                type="button"
                disabled={emergencyTradingDisabled || (activeTicket.environment === 'MT5_DEMO' && !mt5Connected)}
                onClick={handleExecute}
                className="w-full py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Execute Once ({activeTicket.riskReview?.selectedLots} Lots)
              </button>
            </div>
          )}

          {activeTicket.status === 'EXECUTED' && activeTicket.execution && (
            <div className="p-2 rounded bg-indigo-950/40 border border-indigo-700/50 text-[10px] text-indigo-200 space-y-0.5">
              <div className="font-bold flex items-center gap-1">
                <Lock className="w-3 h-3" /> SINGLE-SEND LOCKED · EXECUTED
              </div>
              <div>
                Position: {activeTicket.execution.positionId} · {activeTicket.execution.lotsExecuted}{' '}
                lots
              </div>
              <div className="text-slate-300">{activeTicket.execution.adapterNote}</div>
            </div>
          )}

          {actionError && (
            <div className="p-2 rounded bg-rose-950/50 border border-rose-700/60 text-rose-300 text-[10px] flex items-start gap-1.5">
              <AlertOctagon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {activeTicket.status !== 'EXECUTED' &&
            activeTicket.status !== 'CANCELLED' &&
            activeTicket.status !== 'EXPIRED' && (
              <button
                type="button"
                onClick={() => onCancelTicket(activeTicket.id)}
                className="w-full py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 text-[10px] flex items-center justify-center gap-1 cursor-pointer"
              >
                <Ban className="w-3 h-3" /> Cancel Ticket {activeTicket.id}
              </button>
            )}
        </div>
      )}
    </div>
  );
};

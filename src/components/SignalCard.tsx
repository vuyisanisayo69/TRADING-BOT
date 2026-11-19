import React from 'react';
import type { TradingSignal } from '../utils/strategy.ts';
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  AlertTriangle,
  Play,
  BrainCircuit,
  Info,
  FilePlus2,
} from 'lucide-react';

interface SignalCardProps {
  signal: TradingSignal | null;
  onExecuteSignal: (signal: TradingSignal) => void;
  onCreateProposal?: (signal: TradingSignal) => void;
  onAskAI: (signal: TradingSignal) => void;
  isLoadingAI?: boolean;
}

export const SignalCard: React.FC<SignalCardProps> = ({
  signal,
  onExecuteSignal,
  onCreateProposal,
  onAskAI,
  isLoadingAI = false,
}) => {
  if (!signal) {
    return (
      <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-4 text-center text-slate-400">
        <Info className="w-8 h-8 mx-auto text-slate-600 mb-2" />
        <p className="text-xs font-mono">Awaiting market candle data to compute signal...</p>
      </div>
    );
  }

  const isNoTrade = signal.action === 'NO_TRADE';
  const isLong = signal.action === 'LONG';
  const score = signal.qualityScore;
  const digits = signal.entryZone.recommended < 10 ? 4 : signal.entryZone.recommended < 200 ? 3 : 2;

  return (
    <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl">
      {/* Header Badge */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-1 rounded-md font-mono text-xs font-extrabold uppercase tracking-wider border whitespace-nowrap ${
              isNoTrade
                ? 'bg-slate-800 text-slate-300 border-slate-700'
                : isLong
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/60 shadow-lg shadow-emerald-900/30'
                : 'bg-rose-950/80 text-rose-300 border-rose-600/60 shadow-lg shadow-rose-900/30'
            }`}
          >
            {isNoTrade ? 'NO TRADE' : `${signal.action} SIGNAL`}
          </div>
          <span className="text-xs font-mono font-bold text-slate-300">{signal.symbol}</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
              signal.botMode === 'BRAIN'
                ? 'bg-cyan-950/70 text-cyan-300 border-cyan-700/60'
                : 'bg-amber-950/70 text-amber-300 border-amber-700/60'
            }`}
          >
            {signal.botMode}
          </span>
        </div>

        {/* Transparent Rule Score */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-slate-400">SCORE:</span>
          <div className="flex items-center gap-1.5 bg-[#121a2f] px-2 py-0.5 rounded border border-slate-800 tabular-nums">
            <span
              className={`font-mono font-bold text-sm ${
                score >= 68 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              {score}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">/100</span>
          </div>
        </div>
      </div>

      {/* Trade Parameters Grid */}
      {!isNoTrade ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 my-3 p-3 bg-[#111728] rounded-lg border border-slate-800 text-xs font-mono tabular-nums">
          <div>
            <span className="text-[10px] text-slate-500 block">ENTRY ZONE</span>
            <span className="font-bold text-slate-100">{signal.entryZone.recommended.toFixed(digits)}</span>
          </div>
          <div>
            <span className="text-[10px] text-rose-400 block">STOP LOSS</span>
            <span className="font-bold text-rose-300">{signal.stopLoss.toFixed(digits)}</span>
          </div>
          <div>
            <span className="text-[10px] text-emerald-400 block">TP1</span>
            <span className="font-bold text-emerald-300">{signal.takeProfit1.toFixed(digits)}</span>
          </div>
          <div>
            <span className="text-[10px] text-emerald-400 block">TP2</span>
            <span className="font-bold text-emerald-300">{signal.takeProfit2.toFixed(digits)}</span>
          </div>
          <div>
            <span className="text-[10px] text-cyan-400 block">R:R RATIO</span>
            <span className="font-bold text-cyan-300">{signal.rewardToRiskRatio}R</span>
          </div>
        </div>
      ) : (
        <div className="my-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800 text-xs font-mono text-slate-400">
          <span className="text-amber-400 font-bold block mb-1">CAPITAL PRESERVATION DEFAULT:</span>
          <p className="text-[11px] leading-relaxed">
            {signal.botMode === 'CLASSIC'
              ? 'Classic Mode awaits aligned SMMA 5/50 slope, RSI pullback confirmation, ATR expansion, and HTF trend alignment.'
              : 'Brain Mode awaits high-confluence score across HTF Direction, SMMA 5/50, FVGs, Liquidity Sweeps, Displacement, Order Blocks, and Volume Profile.'}
          </p>
        </div>
      )}

      {/* Strategy Rule Checklist */}
      <div className="space-y-1.5 my-3">
        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
          {signal.botMode} BOT CONFLUENCE CHECKLIST
        </span>
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          {signal.ruleChecks.map((rule) => (
            <div
              key={rule.id}
              className={`p-2 rounded border text-[11px] flex items-start gap-2 ${
                rule.passed
                  ? 'bg-emerald-950/20 border-emerald-900/40 text-slate-200'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400'
              }`}
            >
              {rule.passed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-slate-600 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{rule.name}</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    +{rule.scoreAwarded}/{rule.weight} pts
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{rule.details}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Supporting Reasons & Invalidation Conditions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] my-3">
        {signal.supportingReasons.length > 0 && (
          <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-emerald-300">
            <span className="font-bold flex items-center gap-1 mb-1 text-[10px] uppercase font-mono">
              <ShieldCheck className="w-3 h-3" /> Supporting Reasons
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-[10px] text-slate-300">
              {signal.supportingReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {signal.invalidationConditions.length > 0 && (
          <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-900/40 text-rose-300">
            <span className="font-bold flex items-center gap-1 mb-1 text-[10px] uppercase font-mono">
              <AlertTriangle className="w-3 h-3 text-rose-400" /> Invalidation Criteria
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-[10px] text-slate-300">
              {signal.invalidationConditions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
        {!isNoTrade && (
          <button
            onClick={() => onExecuteSignal(signal)}
            className="flex-1 py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-cyan-600/20 transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Quick Execute
          </button>
        )}
        {!isNoTrade && onCreateProposal && (
          <button
            onClick={() => onCreateProposal(signal)}
            className="flex-1 py-2 px-3 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/70 text-emerald-300 border border-emerald-700/60 font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            title="Create evidence-backed APX ticket with stressed-stop risk check"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            Draft APX Ticket
          </button>
        )}
        <button
          onClick={() => onAskAI(signal)}
          disabled={isLoadingAI}
          className="flex-1 py-2 px-3 rounded-lg bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 border border-purple-700/60 font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
        >
          <BrainCircuit className="w-3.5 h-3.5 text-purple-400" />
          {isLoadingAI ? 'Analyzing...' : 'Ask AI'}
        </button>
      </div>
    </div>
  );
};

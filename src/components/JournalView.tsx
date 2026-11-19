import React, { useState } from 'react';
import type { BacktestTrade } from '../utils/backtest.ts';
import type { ChartIntelligenceReport } from '../utils/chartIntelligence.ts';
import {
  evaluatePostTradeReview,
  type ProcessGrade,
  type TradeTicket,
} from '../utils/tradeDesk.ts';
import { FileText, Download, Radar } from 'lucide-react';

interface JournalViewProps {
  trades: BacktestTrade[];
  tickets?: TradeTicket[];
  chartIntelligenceEntries?: Array<{ report: ChartIntelligenceReport; score: number }>;
}

export const JournalView: React.FC<JournalViewProps> = ({
  trades,
  tickets = [],
  chartIntelligenceEntries = [],
}) => {
  const [filterSymbol, setFilterSymbol] = useState<string>('ALL');
  const [filterOutcome, setFilterOutcome] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');
  const [filterProcess, setFilterProcess] = useState<'ALL' | ProcessGrade>('ALL');
  const [tradeNotes, setTradeNotes] = useState<Record<string, string>>({});
  const [tradeTags, setTradeTags] = useState<Record<string, string>>({});

  const ticketById = new Map(tickets.map((t) => [t.id, t]));

  const reviewedRows = trades.map((t) => {
    const linked = t.ticketId ? ticketById.get(t.ticketId) || null : null;
    const review = evaluatePostTradeReview(t, linked);
    return {
      trade: t,
      review,
      processGrade: t.processGrade ?? review.processGrade,
      outcomeGrade: t.outcomeGrade ?? review.outcomeGrade,
    };
  });

  const filteredRows = reviewedRows.filter(({ trade: t, processGrade }) => {
    if (filterSymbol !== 'ALL' && t.symbol !== filterSymbol) return false;
    if (filterOutcome === 'WIN' && t.netPnlUSD <= 0) return false;
    if (filterOutcome === 'LOSS' && t.netPnlUSD >= 0) return false;
    if (filterProcess !== 'ALL' && processGrade !== filterProcess) return false;
    return true;
  });

  const totalTrades = filteredRows.length;
  const wins = filteredRows.filter((r) => r.trade.netPnlUSD > 0).length;
  const followedPlanCount = filteredRows.filter((r) => r.processGrade === 'FOLLOWED_PLAN').length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0';
  const processScorePct =
    totalTrades > 0 ? ((followedPlanCount / totalTrades) * 100).toFixed(1) : '0';
  const totalNetPnL = filteredRows.reduce((sum, r) => sum + r.trade.netPnlUSD, 0);

  const uniqueSymbols = Array.from(new Set(trades.map((t) => t.symbol)));

  const handleExportCSV = () => {
    if (trades.length === 0) return;
    const headers =
      'ID,TicketID,Symbol,Side,PlannedEntry,EntryPrice,ExitPrice,Lots,OutcomeGrade,ProcessGrade,ActualCostUSD,StressedEstCostUSD,NetPnL,RMultiple,Reason,Notes,Tag\n';
    const rows = reviewedRows
      .map(({ trade: t, review, processGrade, outcomeGrade }) =>
        [
          t.id,
          review.ticketId || 'UNPLANNED',
          t.symbol,
          t.side,
          review.plannedEntry ?? '',
          t.entryPrice,
          t.exitPrice,
          t.lots,
          outcomeGrade,
          processGrade,
          review.actualCostUSD,
          review.stressedCostEstimateUSD ?? '',
          t.netPnlUSD,
          t.rMultiple,
          t.exitReason,
          `"${tradeNotes[t.id] || t.processNotes || ''}"`,
          `"${tradeTags[t.id] || ''}"`,
        ].join(',')
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apex_trader_journal_${Date.now()}.csv`;
    a.click();
  };

  const processBadgeClass = (grade: ProcessGrade) => {
    switch (grade) {
      case 'FOLLOWED_PLAN':
        return 'bg-emerald-950 text-emerald-300 border-emerald-700/60';
      case 'MINOR_DEVIATION':
        return 'bg-amber-950 text-amber-300 border-amber-700/60';
      case 'PROCESS_BREACH':
        return 'bg-rose-950 text-rose-300 border-rose-700/60';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header Bar */}
      <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-cyan-400" />
            <h2 className="text-lg font-bold font-mono text-white">
              TRADING JOURNAL & PLAN-VS-ACTUAL REVIEW
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Compares closed execution against approved <code className="text-cyan-300">APX-YYYYMMDD-XX</code>{' '}
            tickets, grading <strong>Process Discipline</strong> independently from <strong>Outcome P&L</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            disabled={trades.length === 0}
            className="px-3.5 py-1.5 rounded-lg bg-[#131b2e] hover:bg-[#1a2540] border border-slate-700 text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            EXPORT CSV
          </button>
        </div>
      </div>

      {/* Summary Filter Bar */}
      <div className="p-3 bg-[#0e1424] rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Market:</span>
            <select
              value={filterSymbol}
              onChange={(e) => setFilterSymbol(e.target.value)}
              className="bg-[#131b2e] border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none"
            >
              <option value="ALL">All Markets</option>
              <option value="XAU/USD">XAU/USD (Gold)</option>
              <option value="BTC/USD">BTC/USD (Bitcoin)</option>
              <option value="EUR/USD">EUR/USD (Euro)</option>
              {uniqueSymbols
                .filter((s) => !['XAU/USD', 'BTC/USD', 'EUR/USD'].includes(s))
                .map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Outcome:</span>
            <select
              value={filterOutcome}
              onChange={(e) => setFilterOutcome(e.target.value as any)}
              className="bg-[#131b2e] border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none"
            >
              <option value="ALL">All Outcomes</option>
              <option value="WIN">Winners Only</option>
              <option value="LOSS">Losses Only</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Process:</span>
            <select
              value={filterProcess}
              onChange={(e) => setFilterProcess(e.target.value as any)}
              className="bg-[#131b2e] border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none"
            >
              <option value="ALL">All Process Grades</option>
              <option value="FOLLOWED_PLAN">Followed Plan</option>
              <option value="MINOR_DEVIATION">Minor Deviation</option>
              <option value="PROCESS_BREACH">Process Breach</option>
              <option value="UNPLANNED">Unplanned</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <span>
            Trades: <strong className="text-white">{totalTrades}</strong>
          </span>
          <span>
            Outcome Win: <strong className="text-cyan-300">{winRate}%</strong>
          </span>
          <span>
            Process Score: <strong className="text-emerald-300">{processScorePct}%</strong>
          </span>
          <span>
            Net P&L:{' '}
            <strong className={totalNetPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {totalNetPnL >= 0 ? '+' : ''}${totalNetPnL.toFixed(2)}
            </strong>
          </span>
        </div>
      </div>

      {/* Plan vs Actual Review Table */}
      <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl overflow-x-auto">
        {filteredRows.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-mono text-xs">
            No journal entries match the selected filters.
          </div>
        ) : (
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800 text-[10px] uppercase">
                <th className="pb-2">Ticket / Trade</th>
                <th className="pb-2">Symbol</th>
                <th className="pb-2">Side</th>
                <th className="pb-2">Plan → Actual Entry</th>
                <th className="pb-2">Actual Exit</th>
                <th className="pb-2">Process Grade</th>
                <th className="pb-2">Outcome</th>
                <th className="pb-2">Costs (Act / Est)</th>
                <th className="pb-2">Strategy Tag</th>
                <th className="pb-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredRows.map(({ trade: t, review, processGrade, outcomeGrade }) => {
                const isWin = t.netPnlUSD >= 0;
                const digits = t.entryPrice < 10 ? 4 : t.entryPrice < 200 ? 3 : 2;
                return (
                  <tr key={t.id} className="hover:bg-slate-800/30">
                    <td className="py-3">
                      <div className="font-bold text-cyan-300">
                        {review.ticketId || 'UNPLANNED'}
                      </div>
                      <div className="text-[10px] text-slate-500">{t.id}</div>
                    </td>
                    <td className="py-3 font-bold text-slate-200">
                      {t.symbol} ({t.lots})
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.side === 'LONG'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {t.side}
                      </span>
                    </td>
                    <td className="py-3 text-slate-300 tabular-nums">
                      <div>
                        {review.plannedEntry !== null
                          ? `${review.plannedEntry.toFixed(digits)} → `
                          : ''}
                        {t.entryPrice.toFixed(digits)}
                      </div>
                      {review.entrySlippagePts !== null && (
                        <div className="text-[10px] text-slate-400">
                          Slip: {review.entrySlippagePts} pts
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-slate-300 tabular-nums">
                      <div>{t.exitPrice.toFixed(digits)}</div>
                      <div className="text-[10px] text-slate-500">{t.exitReason}</div>
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${processBadgeClass(
                          processGrade
                        )}`}
                        title={review.notes.join(' | ')}
                      >
                        {processGrade}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className={`font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {outcomeGrade} · {isWin ? '+' : ''}${t.netPnlUSD.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-cyan-300">
                        {t.rMultiple}R{review.plannedRR !== null ? ` (Plan ${review.plannedRR}R)` : ''}
                      </div>
                    </td>
                    <td className="py-3 text-[11px] text-slate-300 tabular-nums">
                      ${review.actualCostUSD.toFixed(2)}
                      {review.stressedCostEstimateUSD !== null && (
                        <span className="text-slate-500">
                          {' '}
                          / ${review.stressedCostEstimateUSD.toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      <input
                        type="text"
                        placeholder="Tag (e.g. FVG Swept)"
                        value={tradeTags[t.id] || ''}
                        onChange={(e) => setTradeTags({ ...tradeTags, [t.id]: e.target.value })}
                        className="bg-[#131b2e] border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 w-32 focus:outline-none focus:border-cyan-500"
                      />
                    </td>
                    <td className="py-3">
                      <input
                        type="text"
                        placeholder={review.notes[0] || 'Add notes...'}
                        value={tradeNotes[t.id] ?? t.processNotes ?? ''}
                        onChange={(e) => setTradeNotes({ ...tradeNotes, [t.id]: e.target.value })}
                        className="bg-[#131b2e] border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 w-44 focus:outline-none focus:border-cyan-500"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Saved Chart Intelligence Analyses */}
      <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Radar className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
              Saved Chart Intelligence Analyses ({chartIntelligenceEntries.length})
            </h3>
          </div>
        </div>

        {chartIntelligenceEntries.length === 0 ? (
          <p className="text-xs font-mono text-slate-500 py-4 text-center">
            No Chart Intelligence reports saved yet. Save an analysis from the Chart Intelligence tab to log it here.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            {chartIntelligenceEntries.map(({ report, score }) => (
              <div
                key={report.id}
                className="p-3 rounded-lg bg-[#111728] border border-slate-800 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">
                    {report.manualSymbolOverride || report.extracted.symbolDetected} ·{' '}
                    {report.manualTimeframeOverride || report.extracted.timeframeDetected}
                  </span>
                  <span className="text-[10px] text-cyan-300 font-bold">
                    Confluence: {score}/100
                  </span>
                </div>
                <div className="text-[11px] text-amber-300 font-bold">{report.classification}</div>
                <div className="text-[10px] text-slate-400">
                  {new Date(report.analyzedAt).toLocaleString()} · Model: {report.modelVersion}
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-3">
                  {report.reportSections.A_marketOverview}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attribution Footer */}
      <div className="text-[11px] font-mono text-slate-500 text-center pb-2">
        Ticket proposal, stressed-stop sizing, ID confirmation, and plan-vs-actual review concepts
        adapted from <strong className="text-slate-400">HyperGrok Trading Desk</strong> (MIT License
        — Andrew Wilkinson &amp; Galleon Labs).
      </div>
    </div>
  );
};

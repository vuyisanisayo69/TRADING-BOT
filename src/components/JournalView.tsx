import React, { useState } from 'react';
import type { BacktestTrade } from '../utils/backtest.ts';
import { FileText, Download, Tag, CheckCircle2, XCircle } from 'lucide-react';

interface JournalViewProps {
  trades: BacktestTrade[];
}

export const JournalView: React.FC<JournalViewProps> = ({ trades }) => {
  const [filterSymbol, setFilterSymbol] = useState<string>('ALL');
  const [filterOutcome, setFilterOutcome] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');
  const [tradeNotes, setTradeNotes] = useState<Record<string, string>>({});
  const [tradeTags, setTradeTags] = useState<Record<string, string>>({});

  const filteredTrades = trades.filter((t) => {
    if (filterSymbol !== 'ALL' && t.symbol !== filterSymbol) return false;
    if (filterOutcome === 'WIN' && t.netPnlUSD <= 0) return false;
    if (filterOutcome === 'LOSS' && t.netPnlUSD >= 0) return false;
    return true;
  });

  const totalTrades = filteredTrades.length;
  const wins = filteredTrades.filter((t) => t.netPnlUSD > 0).length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0';
  const totalNetPnL = filteredTrades.reduce((sum, t) => sum + t.netPnlUSD, 0);

  const handleExportCSV = () => {
    if (trades.length === 0) return;
    const headers = 'ID,Symbol,Side,EntryTime,EntryPrice,ExitTime,ExitPrice,Lots,NetPnL,RMultiple,Reason,Notes,Tag\n';
    const rows = trades
      .map(
        (t) =>
          `${t.id},${t.symbol},${t.side},${t.entryTime},${t.entryPrice},${t.exitTime},${t.exitPrice},${t.lots},${t.netPnlUSD},${t.rMultiple},${t.exitReason},"${tradeNotes[t.id] || ''}","${tradeTags[t.id] || ''}"`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apex_trader_journal_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header Bar */}
      <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-cyan-400" />
            <h2 className="text-lg font-bold font-mono text-white">TRADING JOURNAL & EXECUTION AUDIT</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Detailed chronological record of executed paper trades, notes, strategy tags, and slippage metrics.
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
        <div className="flex items-center gap-3">
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
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <span>
            Trades: <strong className="text-white">{totalTrades}</strong>
          </span>
          <span>
            Win Rate: <strong className="text-cyan-300">{winRate}%</strong>
          </span>
          <span>
            Net P&L:{' '}
            <strong className={totalNetPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {totalNetPnL >= 0 ? '+' : ''}${totalNetPnL.toFixed(2)}
            </strong>
          </span>
        </div>
      </div>

      {/* Trades Table with Notes */}
      <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl overflow-x-auto">
        {filteredTrades.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-mono text-xs">
            No journal entries match the selected filters.
          </div>
        ) : (
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800 text-[10px] uppercase">
                <th className="pb-2">ID</th>
                <th className="pb-2">Symbol</th>
                <th className="pb-2">Side</th>
                <th className="pb-2">Lots</th>
                <th className="pb-2">Entry & Exit</th>
                <th className="pb-2">R</th>
                <th className="pb-2">Exit Reason</th>
                <th className="pb-2">Net P&L</th>
                <th className="pb-2">Strategy Tag</th>
                <th className="pb-2">Trader Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredTrades.map((t) => {
                const isWin = t.netPnlUSD >= 0;
                return (
                  <tr key={t.id} className="hover:bg-slate-800/30">
                    <td className="py-3 text-slate-500">{t.id}</td>
                    <td className="py-3 font-bold text-slate-200">{t.symbol}</td>
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
                    <td className="py-3 text-slate-300">{t.lots}</td>
                    <td className="py-3 text-slate-300">
                      {t.entryPrice.toFixed(2)} → {t.exitPrice.toFixed(2)}
                    </td>
                    <td className="py-3 text-cyan-300 font-bold">{t.rMultiple}R</td>
                    <td className="py-3 text-[10px] font-semibold text-slate-300">{t.exitReason}</td>
                    <td className={`py-3 font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isWin ? '+' : ''}${t.netPnlUSD.toFixed(2)}
                    </td>
                    <td className="py-3">
                      <input
                        type="text"
                        placeholder="Tag (e.g. SMMA Pullback)"
                        value={tradeTags[t.id] || ''}
                        onChange={(e) => setTradeTags({ ...tradeTags, [t.id]: e.target.value })}
                        className="bg-[#131b2e] border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 w-36 focus:outline-none focus:border-cyan-500"
                      />
                    </td>
                    <td className="py-3">
                      <input
                        type="text"
                        placeholder="Add notes..."
                        value={tradeNotes[t.id] || ''}
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
    </div>
  );
};

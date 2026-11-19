import React, { useState } from 'react';
import type { BacktestTrade } from '../utils/backtest.ts';

export interface ActivePosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  lots: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  takeProfit2?: number;
  breakevenMoved?: boolean;
  scaleInsCount?: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  openTime: number;
  ticketId?: string;
  plannedEntry?: number;
  plannedSL?: number;
  plannedTP?: number;
  stressedCostEstimateUSD?: number;
}

export interface PendingOrder {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  lots: number;
  targetPrice: number;
  stopLoss: number;
  takeProfit: number;
  createdAt: number;
}

interface PositionsAndOrdersProps {
  positions: ActivePosition[];
  pendingOrders: PendingOrder[];
  tradeHistory: BacktestTrade[];
  enableMultipleEntries?: boolean;
  onClosePosition: (id: string) => void;
  onMoveToBreakeven?: (id: string) => void;
  onScaleInPosition?: (id: string) => void;
  onCancelPendingOrder: (id: string) => void;
}

export const PositionsAndOrders: React.FC<PositionsAndOrdersProps> = ({
  positions,
  pendingOrders,
  tradeHistory,
  enableMultipleEntries = true,
  onClosePosition,
  onMoveToBreakeven,
  onScaleInPosition,
  onCancelPendingOrder,
}) => {
  const [activeTab, setActiveTab] = useState<'positions' | 'pending' | 'history'>('positions');

  return (
    <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-3 shadow-xl">
      {/* Tab Switcher */}
      <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-800/80 overflow-x-auto">
        <button
          onClick={() => setActiveTab('positions')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'positions'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>OPEN POSITIONS</span>
          <span className="text-[10px] text-cyan-300">({positions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'pending'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>PENDING ORDERS</span>
          <span className="text-[10px] text-slate-400">({pendingOrders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'history'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>SESSION HISTORY</span>
          <span className="text-[10px] text-slate-400">({tradeHistory.length})</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        {activeTab === 'positions' && (
          <div>
            {positions.length === 0 ? (
              <div className="py-6 text-center text-xs font-mono text-slate-500">
                No active open positions. Capital is preserved.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800 text-[10px] uppercase">
                    <th className="pb-2">Symbol</th>
                    <th className="pb-2">Side</th>
                    <th className="pb-2">Lots</th>
                    <th className="pb-2">Entry</th>
                    <th className="pb-2">Current</th>
                    <th className="pb-2">SL</th>
                    <th className="pb-2">TP</th>
                    <th className="pb-2">Unrealized P&L</th>
                    <th className="pb-2 text-right">Position Mgmt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {positions.map((pos) => {
                    const isProfitable = pos.unrealizedPnL >= 0;
                    const digits = pos.entryPrice < 10 ? 4 : pos.entryPrice < 200 ? 3 : 2;
                    return (
                      <tr key={pos.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 font-bold text-slate-200">
                          {pos.symbol}
                          {(pos.scaleInsCount ?? 0) > 0 && (
                            <span className="ml-1.5 text-[10px] text-cyan-400">
                              x{(pos.scaleInsCount ?? 0) + 1}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              pos.side === 'LONG'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {pos.side}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-300">{pos.lots.toFixed(2)}</td>
                        <td className="py-2.5 text-slate-300">{pos.entryPrice.toFixed(digits)}</td>
                        <td className="py-2.5 text-slate-200 font-semibold">{pos.currentPrice.toFixed(digits)}</td>
                        <td className="py-2.5 text-rose-400">
                          {pos.stopLoss.toFixed(digits)}
                          {pos.breakevenMoved && (
                            <span className="ml-1 text-[9px] text-cyan-300 font-bold">BE</span>
                          )}
                        </td>
                        <td className="py-2.5 text-emerald-400">{pos.takeProfit.toFixed(digits)}</td>
                        <td className="py-2.5">
                          <span className={`font-bold ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isProfitable ? '+' : ''}${pos.unrealizedPnL.toFixed(2)} ({isProfitable ? '+' : ''}
                            {pos.unrealizedPnLPercent.toFixed(2)}%)
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {onMoveToBreakeven && !pos.breakevenMoved && (
                              <button
                                onClick={() => onMoveToBreakeven(pos.id)}
                                className="px-2 py-1 rounded bg-cyan-950/60 text-cyan-300 hover:bg-cyan-900 border border-cyan-800/60 text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                                title="Move Stop Loss to Breakeven"
                              >
                                Move BE
                              </button>
                            )}
                            {onScaleInPosition && enableMultipleEntries && (
                              <button
                                onClick={() => onScaleInPosition(pos.id)}
                                className="px-2 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                                title="Add Multiple Entry (Scale-In)"
                              >
                                +Scale
                              </button>
                            )}
                            <button
                              onClick={() => onClosePosition(pos.id)}
                              className="px-2 py-1 rounded bg-rose-950/60 text-rose-300 hover:bg-rose-900 border border-rose-800/60 text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              CLOSE
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'pending' && (
          <div>
            {pendingOrders.length === 0 ? (
              <div className="py-6 text-center text-xs font-mono text-slate-500">
                No active pending orders.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800 text-[10px] uppercase">
                    <th className="pb-2">Symbol</th>
                    <th className="pb-2">Side</th>
                    <th className="pb-2">Lots</th>
                    <th className="pb-2">Target Price</th>
                    <th className="pb-2">Stop Loss</th>
                    <th className="pb-2">Take Profit</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pendingOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 font-bold text-slate-200">{ord.symbol}</td>
                      <td className="py-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            ord.side === 'LONG'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          LIMIT {ord.side}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-300">{ord.lots}</td>
                      <td className="py-2.5 text-slate-200 font-semibold">{ord.targetPrice.toFixed(2)}</td>
                      <td className="py-2.5 text-rose-400">{ord.stopLoss.toFixed(2)}</td>
                      <td className="py-2.5 text-emerald-400">{ord.takeProfit.toFixed(2)}</td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => onCancelPendingOrder(ord.id)}
                          className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-[10px] font-bold transition-colors cursor-pointer"
                        >
                          CANCEL
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            {tradeHistory.length === 0 ? (
              <div className="py-6 text-center text-xs font-mono text-slate-500">
                No closed trades yet in this session.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800 text-[10px] uppercase">
                    <th className="pb-2">Symbol</th>
                    <th className="pb-2">Side</th>
                    <th className="pb-2">Lots</th>
                    <th className="pb-2">Entry & Exit</th>
                    <th className="pb-2">Exit Reason</th>
                    <th className="pb-2">R-Multiple</th>
                    <th className="pb-2 text-right">Net P&L ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {tradeHistory.slice(0, 12).map((t) => {
                    const isWin = t.netPnlUSD >= 0;
                    const digits = t.entryPrice < 10 ? 4 : t.entryPrice < 200 ? 3 : 2;
                    return (
                      <tr key={t.id} className="hover:bg-slate-800/30">
                        <td className="py-2 font-bold text-slate-200">{t.symbol}</td>
                        <td className="py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.side === 'LONG'
                                ? 'bg-emerald-950 text-emerald-400'
                                : 'bg-rose-950 text-rose-400'
                            }`}
                          >
                            {t.side}
                          </span>
                        </td>
                        <td className="py-2 text-slate-300">{t.lots.toFixed(2)}</td>
                        <td className="py-2 text-slate-400 text-[11px]">
                          {t.entryPrice.toFixed(digits)} → {t.exitPrice.toFixed(digits)}
                        </td>
                        <td className="py-2 text-[10px] font-semibold text-slate-300">{t.exitReason}</td>
                        <td className="py-2 text-cyan-300 font-bold">{t.rMultiple}R</td>
                        <td className={`py-2 text-right font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isWin ? '+' : ''}${t.netPnlUSD.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

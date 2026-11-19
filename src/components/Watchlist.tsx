import React, { useState } from 'react';
import type { MarketTicker } from '../utils/marketData.ts';
import { TrendingUp, TrendingDown, Bell } from 'lucide-react';

interface WatchlistProps {
  tickers: Record<string, MarketTicker>;
  selectedSymbol: string;
  onSelectSymbol: (sym: string) => void;
  onOpenAlertForSymbol?: (sym: string) => void;
}

export const Watchlist: React.FC<WatchlistProps> = ({
  tickers,
  selectedSymbol,
  onSelectSymbol,
  onOpenAlertForSymbol,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'FOREX' | 'METALS' | 'CRYPTO'>('ALL');

  const tickerList = Object.values(tickers).filter((t) => {
    if (categoryFilter === 'ALL') return true;
    if (categoryFilter === 'FOREX') return t.category === 'FOREX';
    if (categoryFilter === 'METALS') return t.category === 'METALS';
    if (categoryFilter === 'CRYPTO') return t.category === 'CRYPTO';
    return true;
  });

  const anySimulated = tickerList.some((t) => t.feedType === 'SIMULATED_HIGH_FIDELITY');
  const anyLiveOpen = tickerList.some((t) => t.feedType === 'LIVE_BROKER' && t.status === 'OPEN');

  return (
    <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-3 shadow-lg">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
          MARKET WATCHLIST
        </span>
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
            anyLiveOpen
              ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800/50'
              : anySimulated
              ? 'text-amber-300 bg-amber-950/80 border-amber-800/50'
              : 'text-rose-300 bg-rose-950/80 border-rose-800/50'
          }`}
        >
          {anyLiveOpen ? 'MT5 DEMO' : anySimulated ? 'SIMULATED' : 'DISCONNECTED'}
        </span>
      </div>

      {/* Category Tabs: Forex (Currencies), Metals, Crypto */}
      <div className="flex items-center gap-1 mb-2 bg-[#12192c] p-1 rounded-lg border border-slate-800">
        {(['ALL', 'FOREX', 'METALS', 'CRYPTO'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`flex-1 py-1 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer ${
              categoryFilter === cat
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {cat === 'FOREX' ? 'CURRENCIES' : cat}
          </button>
        ))}
      </div>

      <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-0.5">
        {tickerList.map((t) => {
          const isSelected = t.symbol === selectedSymbol;
          const isProfitable = t.change24hUSD >= 0;
          const hasQuote = t.status === 'OPEN' && t.bid > 0;

          return (
            <div
              key={t.symbol}
              onClick={() => onSelectSymbol(t.symbol)}
              className={`p-2.5 rounded-lg cursor-pointer transition-all border ${
                isSelected
                  ? 'bg-cyan-950/40 border-cyan-500/60 shadow-md ring-1 ring-cyan-500/20'
                  : 'bg-[#12192c] border-slate-800/60 hover:bg-[#162038] hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm font-mono text-white">{t.symbol}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Spr: {hasQuote ? t.spreadPoints.toFixed(t.digits < 2 ? 1 : t.digits === 3 ? 3 : 2) : '--'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[130px]">{t.name}</div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-slate-100">
                      {hasQuote ? t.bid.toFixed(t.digits) : '--'}
                    </div>
                    {hasQuote ? (
                      <div
                        className={`flex items-center justify-end gap-0.5 text-[11px] font-mono font-medium ${
                          isProfitable ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isProfitable ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        <span>
                          {isProfitable ? '+' : ''}
                          {t.change24hPercent.toFixed(2)}%
                        </span>
                      </div>
                    ) : (
                      <div className="text-[10px] font-mono text-slate-500">Awaiting EA</div>
                    )}
                  </div>

                  {onOpenAlertForSymbol && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenAlertForSymbol(t.symbol);
                      }}
                      className="p-1 rounded bg-slate-800/80 hover:bg-amber-950 hover:text-amber-300 text-slate-400 transition-colors border border-slate-700/60"
                      title={`Set Price Alert on ${t.symbol}`}
                    >
                      <Bell className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* 24h High/Low bar */}
              <div className="mt-2 pt-1.5 border-t border-slate-800/50 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>
                  L: <span className="text-slate-300">{hasQuote ? t.low24h.toFixed(t.digits) : '--'}</span>
                </span>
                <span className="text-[9px] text-slate-500 font-semibold uppercase">{t.category}</span>
                <span>
                  H: <span className="text-slate-300">{hasQuote ? t.high24h.toFixed(t.digits) : '--'}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

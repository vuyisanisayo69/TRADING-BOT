import React from 'react';
import type { MarketTicker } from '../utils/marketData.ts';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface WatchlistProps {
  tickers: Record<string, MarketTicker>;
  selectedSymbol: string;
  onSelectSymbol: (sym: string) => void;
}

export const Watchlist: React.FC<WatchlistProps> = ({
  tickers,
  selectedSymbol,
  onSelectSymbol,
}) => {
  return (
    <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-3 shadow-lg">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
          MARKET WATCHLIST
        </span>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800/50">
          INSTITUTIONAL LIQUIDITY
        </span>
      </div>

      <div className="space-y-1.5">
        {Object.values(tickers).map((t) => {
          const isSelected = t.symbol === selectedSymbol;
          const isProfitable = t.change24hUSD >= 0;

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
                      Spr: {t.spreadPoints.toFixed(t.digits < 2 ? 1 : 2)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{t.name}</div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-slate-100">
                    {t.bid.toFixed(t.digits)}
                  </div>
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
                </div>
              </div>

              {/* 24h High/Low bar */}
              <div className="mt-2 pt-1.5 border-t border-slate-800/50 flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>
                  L: <span className="text-slate-300">{t.low24h.toFixed(t.digits)}</span>
                </span>
                <span>
                  H: <span className="text-slate-300">{t.high24h.toFixed(t.digits)}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

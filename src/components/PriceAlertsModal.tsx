import React, { useState } from 'react';
import type { PriceAlert, AlertCondition } from '../utils/alerts.ts';
import { calculateAlertDistance, formatTimeUTC2 } from '../utils/alerts.ts';
import type { MarketTicker } from '../utils/marketData.ts';
import { INSTRUMENT_SPECS } from '../utils/risk.ts';
import {
  Bell,
  BellRing,
  Plus,
  Trash2,
  Power,
  Volume2,
  VolumeX,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Target,
} from 'lucide-react';

interface PriceAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: PriceAlert[];
  tickers: Record<string, MarketTicker>;
  selectedSymbol: string;
  onAddAlert: (alert: Omit<PriceAlert, 'id' | 'createdAt' | 'status'>) => void;
  onToggleAlertStatus: (id: string) => void;
  onDeleteAlert: (id: string) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const PriceAlertsModal: React.FC<PriceAlertsModalProps> = ({
  isOpen,
  onClose,
  alerts,
  tickers,
  selectedSymbol,
  onAddAlert,
  onToggleAlertStatus,
  onDeleteAlert,
  soundEnabled,
  onToggleSound,
}) => {
  const currentTicker = tickers[selectedSymbol] || Object.values(tickers)[0];
  const spec = INSTRUMENT_SPECS[selectedSymbol] || INSTRUMENT_SPECS['XAU/USD'];

  const [symbol, setSymbol] = useState<string>(selectedSymbol);
  const [targetPrice, setTargetPrice] = useState<number>(currentTicker.bid);
  const [condition, setCondition] = useState<AlertCondition>('CROSSES_ABOVE');
  const [note, setNote] = useState<string>('');
  const [oneShot, setOneShot] = useState<boolean>(true);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'TRIGGERED'>('ALL');

  if (!isOpen) return null;

  const targetTicker = tickers[symbol] || currentTicker;
  const targetSpec = INSTRUMENT_SPECS[symbol] || spec;

  const handleSetQuickDelta = (deltaPips: number) => {
    const pip = targetSpec.pipSize;
    const newPrice = Number((targetTicker.bid + deltaPips * pip).toFixed(targetTicker.digits));
    setTargetPrice(newPrice);
    if (deltaPips > 0) setCondition('CROSSES_ABOVE');
    else if (deltaPips < 0) setCondition('CROSSES_BELOW');
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (targetPrice <= 0) return;

    onAddAlert({
      symbol,
      targetPrice,
      condition,
      note: note.trim() || `${symbol} ${condition.replace('_', ' ')} ${targetPrice}`,
      oneShot,
    });

    setNote('');
  };

  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'ACTIVE') return a.status === 'ACTIVE';
    if (filter === 'TRIGGERED') return a.status === 'TRIGGERED';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0e1424] rounded-2xl border border-slate-700/80 max-w-3xl w-full p-5 shadow-2xl relative max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-950/80 border border-amber-600/50 flex items-center justify-center text-amber-400">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-mono text-white">PRICE ALERTS MANAGER</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60">
                  DEFAULT TIME ZONE: UTC+2
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Set real-time trigger thresholds for Gold, Bitcoin, and Forex currency pairs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleSound}
              className={`p-2 rounded-lg border text-xs font-mono transition-colors flex items-center gap-1.5 ${
                soundEnabled
                  ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60'
                  : 'bg-slate-800 text-slate-500 border-slate-700'
              }`}
              title={soundEnabled ? 'Alert Chime Sound: ON' : 'Alert Chime Sound: MUTED'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden sm:inline">{soundEnabled ? 'AUDIO ON' : 'MUTED'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Create Alert Form */}
        <form onSubmit={handleFormSubmit} className="mt-4 p-3.5 bg-[#12192c] rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-cyan-400" /> NEW PRICE ALERT
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Current {symbol} Bid: <strong className="text-white">{targetTicker.bid.toFixed(targetTicker.digits)}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            {/* Symbol Selector */}
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">INSTRUMENT</label>
              <select
                value={symbol}
                onChange={(e) => {
                  const s = e.target.value;
                  setSymbol(s);
                  const t = tickers[s];
                  if (t) setTargetPrice(t.bid);
                }}
                className="w-full bg-[#0a0e17] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                {Object.keys(tickers).map((sym) => (
                  <option key={sym} value={sym}>
                    {sym} ({tickers[sym].name})
                  </option>
                ))}
              </select>
            </div>

            {/* Condition */}
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">CONDITION</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as AlertCondition)}
                className="w-full bg-[#0a0e17] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="CROSSES_ABOVE">Crosses Above (≥)</option>
                <option value="CROSSES_BELOW">Crosses Below (≤)</option>
                <option value="REACHES">Reaches Level (± Tol)</option>
              </select>
            </div>

            {/* Target Price */}
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">TARGET PRICE</label>
              <input
                type="number"
                step="any"
                value={targetPrice}
                onChange={(e) => setTargetPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#0a0e17] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white font-bold focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Note / Label */}
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1">NOTE (OPTIONAL)</label>
              <input
                type="text"
                placeholder="e.g. Breakout Retest"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-[#0a0e17] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Quick Pip Helpers & Action */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
              <span>Quick Target:</span>
              {[-20, -10, -5, +5, +10, +20].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => handleSetQuickDelta(delta)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700"
                >
                  {delta > 0 ? `+${delta}` : delta} pips
                </button>
              ))}
            </div>

            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-cyan-600/30 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              CREATE ALERT
            </button>
          </div>
        </form>

        {/* Alerts List Tab & Table */}
        <div className="mt-4 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-1">
              {(['ALL', 'ACTIVE', 'TRIGGERED'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-md text-xs font-mono font-bold transition-all ${
                    filter === f
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {f} ({alerts.filter((a) => (f === 'ALL' ? true : a.status === f)).length})
                </button>
              ))}
            </div>

            <span className="text-[11px] font-mono text-slate-500">
              Times displayed in broker zone: <strong>UTC+2</strong>
            </span>
          </div>

          <div className="overflow-y-auto flex-1 pr-1">
            {filteredAlerts.length === 0 ? (
              <div className="py-8 text-center text-slate-500 font-mono text-xs">
                No price alerts found in this view. Create one above to receive instant notifications!
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAlerts.map((a) => {
                  const ticker = tickers[a.symbol] || currentTicker;
                  const currentPrice = ticker.bid;
                  const dist = calculateAlertDistance(currentPrice, a.targetPrice, targetSpec.pipSize);
                  const isTriggered = a.status === 'TRIGGERED';
                  const isActive = a.status === 'ACTIVE';

                  return (
                    <div
                      key={a.id}
                      className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isTriggered
                          ? 'bg-amber-950/20 border-amber-700/60'
                          : isActive
                          ? 'bg-[#12192c] border-slate-800 hover:border-slate-700'
                          : 'bg-[#0f1523] border-slate-900 opacity-60'
                      }`}
                    >
                      {/* Left: Info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm font-mono text-white">{a.symbol}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 ${
                              a.condition === 'CROSSES_ABOVE'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : a.condition === 'CROSSES_BELOW'
                                ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                : 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                            }`}
                          >
                            {a.condition === 'CROSSES_ABOVE' && <ArrowUpRight className="w-3 h-3" />}
                            {a.condition === 'CROSSES_BELOW' && <ArrowDownRight className="w-3 h-3" />}
                            {a.condition === 'REACHES' && <Target className="w-3 h-3" />}
                            {a.condition.replace('_', ' ')}
                          </span>

                          <span className="font-mono text-sm font-extrabold text-amber-300">
                            {a.targetPrice.toFixed(ticker.digits)}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 mt-1">
                          <span>{a.note}</span>
                          <span className="text-slate-600">|</span>
                          <span>
                            Distance:{' '}
                            <strong className="text-slate-300">
                              {dist.distancePips} pips ({dist.distancePercent}%)
                            </strong>
                          </span>
                          {isTriggered && a.triggeredAt && (
                            <>
                              <span className="text-slate-600">|</span>
                              <span className="text-amber-400 font-bold">
                                Triggered at {formatTimeUTC2(a.triggeredAt, true)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => onToggleAlertStatus(a.id)}
                          className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold flex items-center gap-1 transition-colors ${
                            isActive
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800 hover:bg-emerald-900'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }`}
                          title={isActive ? 'Click to Pause Alert' : 'Click to Activate Alert'}
                        >
                          <Power className="w-3 h-3" />
                          <span>{isActive ? 'ACTIVE' : isTriggered ? 'TRIGGERED' : 'PAUSED'}</span>
                        </button>

                        <button
                          onClick={() => onDeleteAlert(a.id)}
                          className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition-colors cursor-pointer"
                          title="Delete Alert"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

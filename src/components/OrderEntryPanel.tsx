import React, { useState, useEffect } from 'react';
import type { AccountState, RiskConfig } from '../utils/risk.ts';
import { evaluateOrderRisk, INSTRUMENT_SPECS } from '../utils/risk.ts';
import { ShieldCheck, AlertOctagon, Calculator, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface OrderEntryPanelProps {
  symbol: string;
  currentBid: number;
  currentAsk: number;
  account: AccountState;
  riskConfig: RiskConfig;
  onPlaceOrder: (order: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    lots: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
  }) => void;
  presetSignal?: {
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
  } | null;
}

export const OrderEntryPanel: React.FC<OrderEntryPanelProps> = ({
  symbol,
  currentBid,
  currentAsk,
  account,
  riskConfig,
  onPlaceOrder,
  presetSignal,
}) => {
  const spec = INSTRUMENT_SPECS[symbol] || INSTRUMENT_SPECS['XAU/USD'];

  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [entryPrice, setEntryPrice] = useState<number>(side === 'LONG' ? currentAsk : currentBid);
  const [stopLoss, setStopLoss] = useState<number>(0);
  const [takeProfit, setTakeProfit] = useState<number>(0);
  const [lots, setLots] = useState<number>(1.0);

  // Keep entry price updated if MARKET order and no active edits
  useEffect(() => {
    if (presetSignal) {
      setSide(presetSignal.side);
      setEntryPrice(presetSignal.entryPrice);
      setStopLoss(presetSignal.stopLoss);
      setTakeProfit(presetSignal.takeProfit);
    } else if (orderType === 'MARKET') {
      const price = side === 'LONG' ? currentAsk : currentBid;
      setEntryPrice(price);
      if (stopLoss === 0) {
        // Auto default 1.5% distance
        const defaultStop = side === 'LONG' ? price * 0.995 : price * 1.005;
        const defaultTP = side === 'LONG' ? price + (price - defaultStop) * 2 : price - (defaultStop - price) * 2;
        setStopLoss(Number(defaultStop.toFixed(spec.pipSize < 0.1 ? 4 : 2)));
        setTakeProfit(Number(defaultTP.toFixed(spec.pipSize < 0.1 ? 4 : 2)));
      }
    }
  }, [presetSignal, side, currentBid, currentAsk, orderType, spec]);

  // Evaluate risk calculations dynamically
  const riskEval = evaluateOrderRisk(
    {
      symbol,
      side,
      entryPrice,
      stopLoss,
      takeProfit,
      spreadPoints: side === 'LONG' ? currentAsk - currentBid : spec.typicalSpreadPoints,
    },
    account,
    riskConfig,
    spec
  );

  // Auto-calculate optimal lot size from 0.5% risk rule
  const handleAutoRiskSizing = () => {
    if (riskEval.recommendedLots > 0) {
      setLots(riskEval.recommendedLots);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!riskEval.allowed && riskEval.rejectReason) {
      return; // blocked by risk engine
    }

    onPlaceOrder({
      symbol,
      side,
      lots: lots > 0 ? lots : riskEval.recommendedLots || spec.minLot,
      entryPrice,
      stopLoss,
      takeProfit,
    });
  };

  return (
    <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-3.5 shadow-xl">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800/80">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
          ORDER EXECUTION (PAPER)
        </span>
        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/50">
          RISK BUDGET: {riskConfig.riskPercentagePerTrade}%
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Order Side Selector */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSide('LONG')}
            className={`py-2 px-3 rounded-lg font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              side === 'LONG'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-1 ring-emerald-400'
                : 'bg-[#131b2e] text-slate-400 border border-slate-800 hover:bg-[#18233c]'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            BUY / LONG
          </button>
          <button
            type="button"
            onClick={() => setSide('SHORT')}
            className={`py-2 px-3 rounded-lg font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              side === 'SHORT'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30 ring-1 ring-rose-400'
                : 'bg-[#131b2e] text-slate-400 border border-slate-800 hover:bg-[#18233c]'
            }`}
          >
            <ArrowDownRight className="w-4 h-4" />
            SELL / SHORT
          </button>
        </div>

        {/* Lots Sizing */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>VOLUME (LOTS)</span>
            <button
              type="button"
              onClick={handleAutoRiskSizing}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[10px] font-semibold underline"
            >
              <Calculator className="w-3 h-3" />
              Auto Size ({riskEval.recommendedLots} Lots)
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step={spec.lotStep}
              min={spec.minLot}
              max={spec.maxLot}
              value={lots}
              onChange={(e) => setLots(parseFloat(e.target.value) || spec.minLot)}
              className="w-full bg-[#131b2e] border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
            />
            <div className="flex items-center gap-1">
              {[0.1, 0.5, 1.0].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setLots(v)}
                  className="px-2 py-1 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Price Levels (Entry, Stop Loss, Take Profit) */}
        <div className="space-y-2">
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">ENTRY PRICE</label>
            <input
              type="number"
              step="any"
              value={entryPrice}
              onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
              className="w-full bg-[#131b2e] border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-mono text-rose-400 mb-1">STOP LOSS (PROTECTION)</label>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#131b2e] border border-rose-900/60 rounded-lg px-3 py-1.5 text-xs font-mono text-rose-200 focus:outline-none focus:border-rose-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono text-emerald-400 mb-1">TAKE PROFIT</label>
              <input
                type="number"
                step="any"
                value={takeProfit}
                onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 0)}
                className="w-full bg-[#131b2e] border border-emerald-900/60 rounded-lg px-3 py-1.5 text-xs font-mono text-emerald-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Live Risk & Cost Estimates Breakdown */}
        <div className="p-2.5 rounded-lg bg-[#111728] border border-slate-800 text-[11px] font-mono space-y-1">
          <div className="flex justify-between text-slate-400">
            <span>Risk Budget (0.5%):</span>
            <span className="text-slate-200 font-bold">${riskEval.riskAmountUSD.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Stop Distance / RR:</span>
            <span className="text-slate-200">
              {riskEval.stopDistance.toFixed(2)} pts |{' '}
              <span className={riskEval.rewardToRiskRatio >= 1.5 ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                {riskEval.rewardToRiskRatio}R
              </span>
            </span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Est. Transaction Cost:</span>
            <span className="text-slate-300">
              ${riskEval.totalTransactionCostUSD.toFixed(2)} (Spr: ${riskEval.estimatedSpreadCostUSD} + Comm: ${riskEval.estimatedCommissionUSD})
            </span>
          </div>
        </div>

        {/* Risk Engine Invalidation / Rejection Alert */}
        {!riskEval.allowed && (
          <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-700/60 text-rose-300 text-[11px] flex items-start gap-2">
            <AlertOctagon className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">RISK GUARDRAIL ACTIVE:</span>
              <span>{riskEval.rejectReason}</span>
            </div>
          </div>
        )}

        {/* Submit Order Button */}
        <button
          type="submit"
          disabled={!riskEval.allowed}
          className={`w-full py-2.5 rounded-lg font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
            riskEval.allowed
              ? side === 'LONG'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 cursor-pointer'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 cursor-pointer'
              : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          {riskEval.allowed ? `SUBMIT PAPER ${side} ORDER` : 'ORDER REJECTED BY RISK ENGINE'}
        </button>
      </form>
    </div>
  );
};

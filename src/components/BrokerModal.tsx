import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  Lock,
  CheckCircle,
  AlertTriangle,
  Server,
  KeyRound,
  ExternalLink,
} from 'lucide-react';

interface BrokerModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLiveMode: boolean;
  onToggleLiveMode: (enable: boolean) => void;
}

export const BrokerModal: React.FC<BrokerModalProps> = ({
  isOpen,
  onClose,
  isLiveMode,
  onToggleLiveMode,
}) => {
  const [selectedBroker, setSelectedBroker] = useState<'paper' | 'exness' | 'mt5' | 'ibkr' | 'binance'>('paper');
  const [confirmUnderstood, setConfirmUnderstood] = useState<boolean>(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleActivateLive = () => {
    if (!confirmUnderstood) {
      setActivationError('You must explicitly acknowledge the live execution risks before enabling live trading.');
      return;
    }
    onToggleLiveMode(true);
    onClose();
  };

  const handleSwitchToDemo = () => {
    onToggleLiveMode(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0e1424] rounded-2xl border border-slate-700/80 max-w-2xl w-full p-5 shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-800/80 flex items-center justify-center text-cyan-400">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold font-mono text-white">
              BROKER INTEGRATION & EXECUTION GATEWAY
            </h2>
            <span className="text-xs text-slate-400">
              Institutional order routing, Exness / MT5 reconciliation & live guardrails
            </span>
          </div>
        </div>

        {/* Current Execution Mode Banner */}
        <div className="my-4 p-3.5 rounded-xl border flex items-center justify-between gap-3 bg-[#111728] border-slate-800">
          <div>
            <span className="text-[11px] font-mono text-slate-400 block">CURRENT EXECUTION MODE</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`font-mono font-bold text-sm ${
                  isLiveMode ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {isLiveMode ? 'LIVE BROKER EXECUTION' : 'PAPER TRADING (SIMULATED DEMO)'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                {isLiveMode ? 'REAL CAPITAL AT RISK' : 'ZERO RISK ENVIRONMENT'}
              </span>
            </div>
          </div>

          {isLiveMode ? (
            <button
              onClick={handleSwitchToDemo}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition-colors cursor-pointer"
            >
              Switch to Paper Demo
            </button>
          ) : (
            <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 font-semibold">
              <CheckCircle className="w-4 h-4" /> Active & Safe
            </span>
          )}
        </div>

        {/* Supported Broker Integrations */}
        <div className="space-y-3">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
            SUPPORTED BROKER INTERFACES
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
            <div
              onClick={() => setSelectedBroker('paper')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedBroker === 'paper'
                  ? 'bg-cyan-950/40 border-cyan-500/60 ring-1 ring-cyan-500/30'
                  : 'bg-[#12192c] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="font-bold text-slate-200">Apex Paper Engine (Default)</div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Full tick simulation with bid/ask spread, commission, and slippage modelling.
              </p>
            </div>

            <div
              onClick={() => setSelectedBroker('exness')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedBroker === 'exness'
                  ? 'bg-cyan-950/40 border-cyan-500/60 ring-1 ring-cyan-500/30'
                  : 'bg-[#12192c] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="font-bold text-slate-200">Exness / MetaTrader Gateway</div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                MT5 REST WebAPI bridge with position reconciliation & idempotency tokens.
              </p>
            </div>

            <div
              onClick={() => setSelectedBroker('ibkr')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedBroker === 'ibkr'
                  ? 'bg-cyan-950/40 border-cyan-500/60 ring-1 ring-cyan-500/30'
                  : 'bg-[#12192c] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="font-bold text-slate-200">Interactive Brokers (TWS / FIX)</div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Client Portal API integration for Gold futures & spot forex routing.
              </p>
            </div>

            <div
              onClick={() => setSelectedBroker('binance')}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedBroker === 'binance'
                  ? 'bg-cyan-950/40 border-cyan-500/60 ring-1 ring-cyan-500/30'
                  : 'bg-[#12192c] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="font-bold text-slate-200">Binance / Crypto Pro API</div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                HMAC-SHA256 authenticated order signing with WebSocket execution stream.
              </p>
            </div>
          </div>
        </div>

        {/* Security & Credentials Policy */}
        <div className="mt-4 p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-[11px] font-mono space-y-1 text-slate-400">
          <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
            <Lock className="w-3.5 h-3.5" />
            STRICT SECURITY ARCHITECTURE
          </div>
          <p>
            • Apex Trader AI never requests or stores broker account passwords.
          </p>
          <p>
            • API keys and credentials reside exclusively in server-side environment variables or secret vaults.
          </p>
          <p>
            • Every outbound order enforces client-side and server-side risk limit validation before submission.
          </p>
        </div>

        {/* Live Activation Guardrail Form */}
        {!isLiveMode && (
          <div className="mt-4 pt-3 border-t border-slate-800 space-y-3">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="ack"
                checked={confirmUnderstood}
                onChange={(e) => {
                  setConfirmUnderstood(e.target.checked);
                  setActivationError(null);
                }}
                className="mt-0.5 rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
              />
              <label htmlFor="ack" className="text-[11px] font-mono text-slate-300 cursor-pointer select-none">
                I understand that live trading incurs genuine financial risk. I verify that position sizing, stop-loss limits,
                and emergency kill switches are configured properly for my account equity.
              </label>
            </div>

            {activationError && (
              <p className="text-rose-400 text-xs font-mono">{activationError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleActivateLive}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-amber-600/20 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Activate Live Mode
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import {
  X,
  Lock,
  CheckCircle,
  Server,
  Cpu,
  ShieldAlert,
  Settings,
} from 'lucide-react';
import type { MT5DemoBridgeStatus, TradingEnvironment } from '../types/trading.ts';

interface BrokerModalProps {
  isOpen: boolean;
  onClose: () => void;
  environment: TradingEnvironment;
  onChangeEnvironment: (env: TradingEnvironment) => void;
  mt5Status: MT5DemoBridgeStatus;
  onOpenSettings: () => void;
}

export const BrokerModal: React.FC<BrokerModalProps> = ({
  isOpen,
  onClose,
  environment,
  onChangeEnvironment,
  mt5Status,
  onOpenSettings,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0e1424] rounded-2xl border border-slate-700/80 max-w-2xl w-full p-5 shadow-2xl relative space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
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
              EXECUTION ENVIRONMENTS &amp; BROKER GUARDRAILS
            </h2>
            <span className="text-xs text-slate-400">
              Isolated Simulation and MT5 Demo workspaces — Live capital execution disabled
            </span>
          </div>
        </div>

        {/* Active Environment Banner */}
        <div className="p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 bg-[#111728] border-slate-800">
          <div>
            <span className="text-[11px] font-mono text-slate-400 block">ACTIVE WORKSPACE</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`font-mono font-bold text-sm ${
                  environment === 'SIMULATION' ? 'text-emerald-400' : 'text-cyan-400'
                }`}
              >
                {environment === 'SIMULATION'
                  ? 'SIMULATION SANDBOX (PAPER)'
                  : 'MT5 DEMO ENVIRONMENT'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                ZERO REAL CAPITAL RISK
              </span>
            </div>
          </div>

          <span className="text-xs font-mono text-emerald-400 flex items-center gap-1 font-semibold">
            <CheckCircle className="w-4 h-4" /> Live Trading Locked Off
          </span>
        </div>

        {/* Selectable Environments */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          <button
            type="button"
            onClick={() => {
              onChangeEnvironment('SIMULATION');
              onClose();
            }}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              environment === 'SIMULATION'
                ? 'bg-emerald-950/30 border-emerald-500/60 ring-1 ring-emerald-500/30'
                : 'bg-[#12192c] border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-slate-100 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-emerald-400" />
                Simulation Sandbox
              </span>
              {environment === 'SIMULATION' && (
                <span className="text-[10px] text-emerald-300 font-bold">ACTIVE</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Self-contained $100,000 synthetic paper market with full SMMA/SMC signal testing, spread, and commission simulation.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeEnvironment('MT5_DEMO');
              onClose();
            }}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              environment === 'MT5_DEMO'
                ? 'bg-cyan-950/30 border-cyan-500/60 ring-1 ring-cyan-500/30'
                : 'bg-[#12192c] border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-slate-100 flex items-center gap-1.5">
                <Server className="w-4 h-4 text-cyan-400" />
                MT5 Demo Bridge
              </span>
              <span
                className={`text-[10px] font-bold ${
                  mt5Status.connected ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {mt5Status.connected ? 'EA LINKED' : 'DISCONNECTED'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Dedicated MetaTrader 5 Demo workspace. Connects only when a real MT5 Demo EA sends an authenticated heartbeat.
            </p>
          </button>
        </div>

        {/* Live Trading Disabled Notice */}
        <div className="p-3.5 rounded-xl bg-rose-950/25 border border-rose-800/50 text-xs font-mono space-y-1.5">
          <div className="flex items-center gap-1.5 text-rose-300 font-bold">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            LIVE BROKER EXECUTION DISABLED (SYSTEM GUARDRAIL)
          </div>
          <p className="text-[11px] text-slate-300">
            Phase 1 strictly prohibits real-money order routing. Real/Live MT5 accounts are rejected on both frontend and backend.
          </p>
          <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-slate-500" />
            Broker account passwords are never requested or stored.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className="px-3.5 py-2 rounded-lg bg-[#131b2e] hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            Configure MT5 Demo Bridge
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

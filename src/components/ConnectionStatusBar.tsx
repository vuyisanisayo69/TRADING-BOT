import React from 'react';
import { Activity, Cpu, Database, Server, RefreshCw, ShieldAlert } from 'lucide-react';
import type { ConnectionHealthSnapshot, ServiceState, TradingEnvironment } from '../types/trading.ts';

interface ConnectionStatusBarProps {
  health: ConnectionHealthSnapshot;
  environment: TradingEnvironment;
  emergencyTradingDisabled: boolean;
  onRefresh: () => void;
}

function getDotClass(state: ServiceState): string {
  switch (state) {
    case 'CONNECTED':
      return 'bg-emerald-400';
    case 'SIMULATED':
      return 'bg-amber-400';
    case 'DEGRADED':
      return 'bg-amber-400';
    case 'DISCONNECTED':
    case 'OFFLINE':
    default:
      return 'bg-rose-500';
  }
}

function getPillClass(state: ServiceState): string {
  switch (state) {
    case 'CONNECTED':
      return 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300';
    case 'SIMULATED':
      return 'border-amber-800/60 bg-amber-950/30 text-amber-300';
    case 'DEGRADED':
      return 'border-amber-700/60 bg-amber-950/40 text-amber-300';
    case 'DISCONNECTED':
    case 'OFFLINE':
    default:
      return 'border-rose-900/60 bg-rose-950/30 text-rose-300';
  }
}

export const ConnectionStatusBar: React.FC<ConnectionStatusBarProps> = ({
  health,
  environment,
  emergencyTradingDisabled,
  onRefresh,
}) => {
  const items = [
    { key: 'marketData', name: 'Market Data', icon: Activity, status: health.marketData },
    { key: 'mt5Ea', name: 'MT5 EA', icon: Cpu, status: health.mt5Ea },
    { key: 'backend', name: 'Backend', icon: Server, status: health.backend },
    { key: 'database', name: 'Database', icon: Database, status: health.database },
  ];

  return (
    <div className="border-b border-slate-800/90 bg-[#0a0f1c] px-4 py-1.5 text-[11px] font-mono">
      <div className="max-w-[1720px] mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-1">
            ENV:
            <span
              className={`ml-1 ${
                environment === 'SIMULATION' ? 'text-emerald-300' : 'text-cyan-300'
              }`}
            >
              {environment === 'SIMULATION' ? 'SIMULATION SANDBOX' : 'MT5 DEMO BRIDGE'}
            </span>
          </span>

          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                title={item.status.detail}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${getPillClass(
                  item.status.state
                )}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${getDotClass(item.status.state)}`} />
                <Icon className="w-3 h-3 opacity-80" />
                <span className="text-slate-400">{item.name}:</span>
                <span className="font-bold">{item.status.label}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {emergencyTradingDisabled && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/70 border border-rose-600/70 text-rose-200 font-bold text-[10px]">
              <ShieldAlert className="w-3 h-3 text-rose-400" />
              TRADING DISABLED
            </span>
          )}
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 text-[10px]">
            LIVE TRADING: DISABLED
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="p-1 rounded bg-[#131b2e] border border-slate-800 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
            title="Refresh Backend, Database, Market Data & MT5 EA Connection Status"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

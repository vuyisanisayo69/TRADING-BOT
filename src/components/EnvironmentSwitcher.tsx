import React from 'react';
import { Cpu, Server, Lock } from 'lucide-react';
import type { TradingEnvironment } from '../types/trading.ts';

interface EnvironmentSwitcherProps {
  environment: TradingEnvironment;
  onChangeEnvironment: (env: TradingEnvironment) => void;
}

export const EnvironmentSwitcher: React.FC<EnvironmentSwitcherProps> = ({
  environment,
  onChangeEnvironment,
}) => {
  return (
    <div className="flex items-center gap-1 bg-[#131b2e] p-1 rounded-lg border border-slate-800 text-[11px] font-mono">
      <button
        type="button"
        onClick={() => onChangeEnvironment('SIMULATION')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors cursor-pointer whitespace-nowrap ${
          environment === 'SIMULATION'
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="Virtual Simulation Sandbox (Isolated Paper Account)"
      >
        <Cpu className="w-3 h-3" />
        <span>SIMULATION</span>
      </button>

      <button
        type="button"
        onClick={() => onChangeEnvironment('MT5_DEMO')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors cursor-pointer whitespace-nowrap ${
          environment === 'MT5_DEMO'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="MetaTrader 5 Demo Account Bridge (Isolated Demo Workspace)"
      >
        <Server className="w-3 h-3" />
        <span>MT5 DEMO</span>
      </button>

      <span
        className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900/90 text-slate-500 border border-slate-800/80 whitespace-nowrap select-none"
        title="Live real-money trading is permanently disabled by system policy"
      >
        <Lock className="w-2.5 h-2.5 text-rose-400" />
        <span className="text-[10px]">LIVE OFF</span>
      </span>
    </div>
  );
};

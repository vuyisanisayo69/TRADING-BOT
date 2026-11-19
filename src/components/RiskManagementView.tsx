import React from 'react';
import type { RiskConfig, AccountState } from '../utils/risk.ts';
import {
  ShieldAlert,
  AlertTriangle,
  Sliders,
  Flame,
  CheckCircle,
  XCircle,
  TrendingDown,
  Lock,
} from 'lucide-react';

interface RiskManagementViewProps {
  config: RiskConfig;
  account: AccountState;
  onUpdateConfig: (updated: Partial<RiskConfig>) => void;
  onToggleKillSwitch: () => void;
}

export const RiskManagementView: React.FC<RiskManagementViewProps> = ({
  config,
  account,
  onUpdateConfig,
  onToggleKillSwitch,
}) => {
  const currentDailyLossUSD = Math.max(0, -(account.dailyRealizedPnL + account.dailyUnrealizedPnL));
  const maxDailyAllowedUSD = (account.initialBalance * config.maxDailyLossPercent) / 100;
  const dailyLossUsedPct = Math.min(100, (currentDailyLossUSD / maxDailyAllowedUSD) * 100);

  const currentDrawdownUSD = Math.max(0, account.peakEquity - account.equity);
  const currentDrawdownPct = account.peakEquity > 0 ? (currentDrawdownUSD / account.peakEquity) * 100 : 0;
  const drawdownUsedPct = Math.min(100, (currentDrawdownPct / config.maxTotalDrawdownPercent) * 100);

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-cyan-400" />
            <h2 className="text-lg font-bold font-mono text-white">INSTITUTIONAL RISK CONTROL CENTER</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Mandatory capital preservation rules. All parameters are enforced programmatically before any trade execution.
          </p>
        </div>

        {/* Emergency Kill Switch */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[11px] font-mono text-slate-400 block">GLOBAL STATUS</span>
            <span
              className={`text-xs font-mono font-bold ${
                config.killSwitchActive ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {config.killSwitchActive ? 'TRADING HALTED' : 'EXECUTION ARMED'}
            </span>
          </div>
          <button
            onClick={onToggleKillSwitch}
            className={`px-4 py-2 rounded-lg font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg ${
              config.killSwitchActive
                ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                : 'bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            {config.killSwitchActive ? 'RELEASE KILL SWITCH' : 'TRIGGER EMERGENCY HALT'}
          </button>
        </div>
      </div>

      {/* Real-Time Risk Meters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Daily Loss Gauge */}
        <div className="p-3.5 rounded-xl bg-[#0e1424] border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span>DAILY LOSS BUDGET</span>
            <span className={dailyLossUsedPct > 70 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
              ${currentDailyLossUSD.toFixed(2)} / ${maxDailyAllowedUSD.toFixed(2)}
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                dailyLossUsedPct > 80 ? 'bg-rose-500' : dailyLossUsedPct > 50 ? 'bg-amber-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${dailyLossUsedPct}%` }}
            ></div>
          </div>
          <span className="text-[10px] font-mono text-slate-500 mt-1 block">
            {dailyLossUsedPct.toFixed(1)}% of daily allowance consumed
          </span>
        </div>

        {/* Total Drawdown Gauge */}
        <div className="p-3.5 rounded-xl bg-[#0e1424] border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span>PEAK DRAWDOWN</span>
            <span className={drawdownUsedPct > 70 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
              {currentDrawdownPct.toFixed(2)}% / {config.maxTotalDrawdownPercent}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                drawdownUsedPct > 80 ? 'bg-rose-500' : drawdownUsedPct > 50 ? 'bg-amber-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${drawdownUsedPct}%` }}
            ></div>
          </div>
          <span className="text-[10px] font-mono text-slate-500 mt-1 block">
            Peak equity: ${account.peakEquity.toFixed(2)}
          </span>
        </div>

        {/* Max Open Positions Gauge */}
        <div className="p-3.5 rounded-xl bg-[#0e1424] border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span>OPEN POSITIONS</span>
            <span className="text-slate-200 font-bold">
              {account.openPositionCount} / {config.maxOpenPositions} Max
            </span>
          </div>
          <div className="flex gap-1.5 mt-2">
            {Array.from({ length: config.maxOpenPositions }).map((_, i) => (
              <div
                key={i}
                className={`h-2.5 flex-1 rounded-full ${
                  i < account.openPositionCount ? 'bg-cyan-400' : 'bg-slate-800'
                }`}
              ></div>
            ))}
          </div>
          <span className="text-[10px] font-mono text-slate-500 mt-1 block">
            {config.maxOpenPositions - account.openPositionCount} slots remaining
          </span>
        </div>

        {/* Consecutive Loss Circuit Breaker */}
        <div className="p-3.5 rounded-xl bg-[#0e1424] border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span>CIRCUIT BREAKER</span>
            <span
              className={`font-bold ${
                account.consecutiveLosses >= config.maxConsecutiveLosses ? 'text-rose-400' : 'text-slate-200'
              }`}
            >
              {account.consecutiveLosses} / {config.maxConsecutiveLosses} Losses
            </span>
          </div>
          <div className="flex gap-1.5 mt-2">
            {Array.from({ length: config.maxConsecutiveLosses }).map((_, i) => (
              <div
                key={i}
                className={`h-2.5 flex-1 rounded-full ${
                  i < account.consecutiveLosses ? 'bg-rose-500' : 'bg-slate-800'
                }`}
              ></div>
            ))}
          </div>
          <span className="text-[10px] font-mono text-slate-500 mt-1 block">
            Halts execution after {config.maxConsecutiveLosses} consecutive stop-outs
          </span>
        </div>
      </div>

      {/* Configurable Risk Parameters Form */}
      <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl">
        <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-800/80">
          <Sliders className="w-5 h-5 text-cyan-400" />
          <h3 className="font-mono text-sm font-bold text-white uppercase tracking-wider">
            CONFIGURABLE RISK & SIZING PARAMETERS
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Risk Per Trade */}
          <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800">
            <label className="block text-xs font-mono text-slate-300 font-bold mb-1">
              RISK PER TRADE (% OF EQUITY)
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Default is 0.5%. Determines exact lot sizing dynamically from stop distance.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="3.0"
                value={config.riskPercentagePerTrade}
                onChange={(e) => onUpdateConfig({ riskPercentagePerTrade: parseFloat(e.target.value) || 0.5 })}
                className="w-full bg-[#0a0e17] border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
              <span className="text-xs font-mono text-slate-400">%</span>
            </div>
          </div>

          {/* Max Daily Loss Limit */}
          <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800">
            <label className="block text-xs font-mono text-slate-300 font-bold mb-1">
              MAX DAILY LOSS LIMIT (% OF BALANCE)
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Closes intraday execution for remaining session if cumulative losses hit limit.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="1.0"
                max="10.0"
                value={config.maxDailyLossPercent}
                onChange={(e) => onUpdateConfig({ maxDailyLossPercent: parseFloat(e.target.value) || 2.0 })}
                className="w-full bg-[#0a0e17] border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
              <span className="text-xs font-mono text-slate-400">%</span>
            </div>
          </div>

          {/* Max Total Drawdown Limit */}
          <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800">
            <label className="block text-xs font-mono text-slate-300 font-bold mb-1">
              MAX TOTAL DRAWDOWN LIMIT (%)
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Maximum allowable drawdown from peak equity before entering capital lock.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="2.0"
                max="20.0"
                value={config.maxTotalDrawdownPercent}
                onChange={(e) => onUpdateConfig({ maxTotalDrawdownPercent: parseFloat(e.target.value) || 5.0 })}
                className="w-full bg-[#0a0e17] border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
              <span className="text-xs font-mono text-slate-400">%</span>
            </div>
          </div>

          {/* Max Open Positions */}
          <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800">
            <label className="block text-xs font-mono text-slate-300 font-bold mb-1">
              MAX CONCURRENT POSITIONS
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Limits exposure across multiple instruments to prevent portfolio over-leverage.
            </p>
            <input
              type="number"
              min="1"
              max="10"
              value={config.maxOpenPositions}
              onChange={(e) => onUpdateConfig({ maxOpenPositions: parseInt(e.target.value) || 3 })}
              className="w-full bg-[#0a0e17] border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Consecutive Losses Cooldown */}
          <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800">
            <label className="block text-xs font-mono text-slate-300 font-bold mb-1">
              CONSECUTIVE LOSS CIRCUIT BREAKER
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Triggers automatic cooldown after N straight losses to stop revenge trading.
            </p>
            <input
              type="number"
              min="2"
              max="10"
              value={config.maxConsecutiveLosses}
              onChange={(e) => onUpdateConfig({ maxConsecutiveLosses: parseInt(e.target.value) || 3 })}
              className="w-full bg-[#0a0e17] border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Minimum Reward-to-Risk Threshold */}
          <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800">
            <label className="block text-xs font-mono text-slate-300 font-bold mb-1">
              MINIMUM REWARD:RISK RATIO (R)
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Rejects any trade whose potential reward does not satisfy minimum asymmetry.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="1.0"
                max="5.0"
                value={config.minRewardToRiskRatio}
                onChange={(e) => onUpdateConfig({ minRewardToRiskRatio: parseFloat(e.target.value) || 1.5 })}
                className="w-full bg-[#0a0e17] border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
              <span className="text-xs font-mono text-slate-400">R</span>
            </div>
          </div>

          {/* Max Daily Trades Limit */}
          <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800">
            <label className="block text-xs font-mono text-slate-300 font-bold mb-1">
              DAILY TRADE LIMIT ({account.dailyTradeCount || 0} / {config.maxDailyTrades} USED)
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Caps total executions per session to enforce strict discipline and prevent overtrading.
            </p>
            <input
              type="number"
              min="1"
              max="50"
              value={config.maxDailyTrades}
              onChange={(e) => onUpdateConfig({ maxDailyTrades: parseInt(e.target.value) || 10 })}
              className="w-full bg-[#0a0e17] border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Max Entries Per Symbol (Multiple Entries / Scaling) */}
          <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800">
            <label className="block text-xs font-mono text-slate-300 font-bold mb-1">
              MAX ENTRIES PER SYMBOL (SCALE-IN)
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Controls how many multiple entries or scale-ins are permitted concurrently on a single instrument.
            </p>
            <input
              type="number"
              min="1"
              max="5"
              value={config.maxEntriesPerSymbol}
              onChange={(e) => onUpdateConfig({ maxEntriesPerSymbol: parseInt(e.target.value) || 3 })}
              className="w-full bg-[#0a0e17] border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Max Daily Loss USD Cap */}
          <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800">
            <label className="block text-xs font-mono text-slate-300 font-bold mb-1">
              MAX DAILY LOSS CAP (USD)
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Hard dollar loss limit per session complementing percentage drawdown controls.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">$</span>
              <input
                type="number"
                step="50"
                min="100"
                max="25000"
                value={config.maxDailyLossUSD}
                onChange={(e) => onUpdateConfig({ maxDailyLossUSD: parseFloat(e.target.value) || 500 })}
                className="w-full bg-[#0a0e17] border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

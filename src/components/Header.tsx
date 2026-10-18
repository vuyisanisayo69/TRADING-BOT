import React from 'react';
import {
  ShieldAlert,
  Activity,
  Sliders,
  TrendingUp,
  BrainCircuit,
  FileText,
  LineChart,
  Lock,
  Radio,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import type { AccountState, RiskConfig } from '../utils/risk.ts';

interface HeaderProps {
  activeTab: 'terminal' | 'signals' | 'risk' | 'backtest' | 'journal' | 'ai';
  setActiveTab: (tab: 'terminal' | 'signals' | 'risk' | 'backtest' | 'journal' | 'ai') => void;
  account: AccountState;
  riskConfig: RiskConfig;
  onToggleKillSwitch: () => void;
  onOpenRiskModal: () => void;
  onOpenBrokerModal: () => void;
  onResetAccount: () => void;
  sessionName: string;
  isLiveMode: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  account,
  riskConfig,
  onToggleKillSwitch,
  onOpenRiskModal,
  onOpenBrokerModal,
  onResetAccount,
  sessionName,
  isLiveMode,
}) => {
  const dailyPnLUSD = account.dailyRealizedPnL + account.dailyUnrealizedPnL;
  const dailyPnLPct = (dailyPnLUSD / account.initialBalance) * 100;
  const isDailyProfitable = dailyPnLUSD >= 0;

  return (
    <header className="border-b border-slate-800 bg-[#0d1322] px-4 py-2.5 select-none sticky top-0 z-40">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Brand & Market Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 via-teal-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <TrendingUp className="w-5 h-5 text-slate-950 font-extrabold stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-white font-mono">
                  APEX TRADER <span className="text-cyan-400">AI</span>
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800/60 rounded">
                  PRO v2.4
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  {sessionName}
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400 font-mono text-[10px]">
                  FEED: <span className="text-slate-300">HIGH-FIDELITY SIMULATED</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-[#131b2e] p-1 rounded-lg border border-slate-800 overflow-x-auto">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'terminal'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Terminal
          </button>
          <button
            onClick={() => setActiveTab('signals')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'signals'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            Signals Engine
          </button>
          <button
            onClick={() => setActiveTab('risk')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'risk'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Risk & Guardrails
          </button>
          <button
            onClick={() => setActiveTab('backtest')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'backtest'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <LineChart className="w-3.5 h-3.5" />
            Backtester
          </button>
          <button
            onClick={() => setActiveTab('journal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'journal'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Journal
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'ai'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5 text-purple-400" />
            AI Analyst
          </button>
        </nav>

        {/* Account Financials & Safety Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Equity & Balance Widget */}
          <div className="flex items-center gap-3 bg-[#131b2e] border border-slate-800/80 px-3 py-1.5 rounded-lg text-xs font-mono">
            <div>
              <span className="text-[10px] text-slate-500 block leading-none">EQUITY</span>
              <span className="font-bold text-slate-100">${account.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="h-6 w-px bg-slate-800"></div>
            <div>
              <span className="text-[10px] text-slate-500 block leading-none">DAILY P&L</span>
              <span className={`font-bold ${isDailyProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isDailyProfitable ? '+' : ''}${dailyPnLUSD.toFixed(2)} ({isDailyProfitable ? '+' : ''}{dailyPnLPct.toFixed(2)}%)
              </span>
            </div>
            <div className="h-6 w-px bg-slate-800"></div>
            <div>
              <span className="text-[10px] text-slate-500 block leading-none">FREE MARGIN</span>
              <span className="text-slate-300">${account.freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Mode Badge (Paper vs Live) */}
          <button
            onClick={onOpenBrokerModal}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all ${
              isLiveMode
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/40 hover:bg-amber-500/20'
                : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50 hover:bg-emerald-900/40'
            }`}
            title="Configure Broker Integration & Execution Mode"
          >
            <Lock className="w-3 h-3" />
            <span>{isLiveMode ? 'LIVE BROKER' : 'PAPER TRADING'}</span>
          </button>

          {/* Risk Config Quick Access */}
          <button
            onClick={onOpenRiskModal}
            className="p-1.5 rounded-md bg-[#131b2e] border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Configure Risk Controls & Circuit Breakers"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Reset Demo Balance */}
          <button
            onClick={onResetAccount}
            className="p-1.5 rounded-md bg-[#131b2e] border border-slate-800 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors"
            title="Reset Paper Account to $100,000"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* EMERGENCY KILL SWITCH */}
          <button
            onClick={onToggleKillSwitch}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all shadow-md ${
              riskConfig.killSwitchActive
                ? 'bg-rose-600 text-white animate-pulse ring-2 ring-rose-400'
                : 'bg-rose-950/50 text-rose-300 border border-rose-800/60 hover:bg-rose-900/60 hover:border-rose-700'
            }`}
            title="Emergency Trading Halt: Halts all execution & rejects all orders"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>{riskConfig.killSwitchActive ? 'HALT ACTIVE' : 'KILL SWITCH'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

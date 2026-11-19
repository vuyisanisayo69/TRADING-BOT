import React from 'react';
import {
  ShieldAlert,
  Activity,
  TrendingUp,
  FileText,
  LineChart,
  Radio,
  AlertTriangle,
  RotateCcw,
  Bell,
  Settings,
  LogIn,
  UserCheck,
} from 'lucide-react';
import type { AccountState, RiskConfig } from '../utils/risk.ts';
import type { PrimaryTab, TradingEnvironment } from '../types/trading.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { EnvironmentSwitcher } from './EnvironmentSwitcher.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface HeaderProps {
  activeTab: PrimaryTab;
  setActiveTab: (tab: PrimaryTab) => void;
  environment: TradingEnvironment;
  onChangeEnvironment: (env: TradingEnvironment) => void;
  account: AccountState;
  riskConfig: RiskConfig;
  emergencyTradingDisabled: boolean;
  onToggleEmergencyDisable: () => void;
  onOpenBrokerModal: () => void;
  onOpenAlertsModal?: () => void;
  onOpenSignInModal: () => void;
  onResetAccount: () => void;
  sessionName: string;
  brokerTimeUTC2?: string;
  activeAlertsCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  environment,
  onChangeEnvironment,
  account,
  riskConfig,
  emergencyTradingDisabled,
  onToggleEmergencyDisable,
  onOpenBrokerModal,
  onOpenAlertsModal,
  onOpenSignInModal,
  onResetAccount,
  sessionName,
  brokerTimeUTC2,
  activeAlertsCount,
}) => {
  const { user } = useAuth();
  const dailyPnLUSD = account.dailyRealizedPnL + account.dailyUnrealizedPnL;
  const dailyPnLPct =
    account.initialBalance > 0 ? (dailyPnLUSD / account.initialBalance) * 100 : 0;
  const isDailyProfitable = dailyPnLUSD >= 0;
  const isHalted = emergencyTradingDisabled || riskConfig.killSwitchActive;

  const navItems: Array<{ id: PrimaryTab; label: string; icon: React.ComponentType<any> }> = [
    { id: 'terminal', label: 'Terminal', icon: Activity },
    { id: 'signals', label: 'Signals Engine', icon: Radio },
    { id: 'risk', label: 'Risk & Guardrails', icon: ShieldAlert },
    { id: 'backtest', label: 'Backtester', icon: LineChart },
    { id: 'journal', label: 'Journal', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="border-b border-slate-800 bg-[#0d1322] px-4 py-2.5 select-none sticky top-0 z-40">
      <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3">
        {/* Brand & Session Status */}
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 via-teal-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <TrendingUp className="w-5 h-5 text-slate-950 font-extrabold stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-white font-mono whitespace-nowrap">
                  APEX TRADER <span className="text-cyan-400">AI</span>
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800/60 rounded whitespace-nowrap">
                  PRO v2.5
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 whitespace-nowrap">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  {sessionName}
                </span>
                <span className="text-slate-600">|</span>
                <span className="text-cyan-300 font-mono text-[10px] font-bold">
                  {brokerTimeUTC2 || 'UTC+2'}
                </span>
              </div>
            </div>
          </div>

          <EnvironmentSwitcher
            environment={environment}
            onChangeEnvironment={onChangeEnvironment}
          />
        </div>

        {/* Organized 6-Tab Primary Navigation */}
        <nav
          aria-label="Primary Navigation"
          className="flex items-center gap-1 bg-[#131b2e] p-1 rounded-lg border border-slate-800 overflow-x-auto"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Account Financials & Safety Controls */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Equity & Daily P&L */}
          <button
            type="button"
            onClick={onOpenBrokerModal}
            className="flex items-center gap-2.5 bg-[#131b2e] hover:bg-[#172138] border border-slate-800/80 px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums cursor-pointer text-left"
            title="Inspect Execution Environments & Broker Guardrails"
          >
            <div>
              <span className="text-[10px] text-slate-500 block leading-none">
                {environment === 'SIMULATION' ? 'SIM EQUITY' : 'MT5 DEMO EQ'}
              </span>
              <span className="font-bold text-slate-100">
                ${account.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="h-5 w-px bg-slate-800"></div>
            <div>
              <span className="text-[10px] text-slate-500 block leading-none">DAILY P&amp;L</span>
              <span className={`font-bold ${isDailyProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isDailyProfitable ? '+' : ''}${dailyPnLUSD.toFixed(2)} ({isDailyProfitable ? '+' : ''}
                {dailyPnLPct.toFixed(2)}%)
              </span>
            </div>
          </button>

          {/* Price Alerts */}
          {onOpenAlertsModal && (
            <button
              type="button"
              onClick={onOpenAlertsModal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono font-bold bg-[#131b2e] border border-amber-600/50 text-amber-300 hover:bg-amber-950/60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Manage Price Alerts"
            >
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              <span>ALERTS ({activeAlertsCount || 0})</span>
            </button>
          )}

          {/* Reset Simulation Account */}
          {environment === 'SIMULATION' && (
            <button
              type="button"
              onClick={onResetAccount}
              className="p-1.5 rounded-md bg-[#131b2e] border border-slate-800 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
              title="Reset Simulation Paper Account to $100,000"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* PWA Install Button */}
          <PWAInstallButton compact />

          {/* Trading Account Sign-In / Profile */}
          <button
            type="button"
            onClick={onOpenSignInModal}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              user
                ? 'bg-[#131b2e] border border-emerald-700/60 text-emerald-200 hover:bg-slate-800'
                : 'bg-[#131b2e] border border-cyan-700/60 text-cyan-300 hover:bg-cyan-950/60'
            }`}
            title={
              user
                ? `Signed in as ${user.email || 'Trader'} — Manage trading account`
                : 'Sign in to your trading account'
            }
          >
            {user ? (
              <>
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="max-w-[96px] truncate">{user.displayName || user.email}</span>
              </>
            ) : (
              <>
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </>
            )}
          </button>

          {/* GLOBAL EMERGENCY TRADING-DISABLE */}
          <button
            type="button"
            onClick={onToggleEmergencyDisable}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all shadow-md whitespace-nowrap shrink-0 cursor-pointer ${
              isHalted
                ? 'bg-rose-600 text-white animate-pulse ring-2 ring-rose-400'
                : 'bg-rose-950/50 text-rose-300 border border-rose-800/60 hover:bg-rose-900/60 hover:border-rose-700'
            }`}
            title="Global Emergency Trading-Disable: Locks auto-trading & blocks all new orders across environments"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>{isHalted ? 'TRADING HALTED' : 'EMERGENCY HALT'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

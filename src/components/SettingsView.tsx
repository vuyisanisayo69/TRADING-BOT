import React, { useState, useEffect } from 'react';
import {
  Settings,
  ShieldAlert,
  Lock,
  Server,
  Sliders,
  CheckCircle2,
  Copy,
  RefreshCw,
  Smartphone,
  AlertTriangle,
  KeyRound,
} from 'lucide-react';
import type {
  ConnectionHealthSnapshot,
  MT5AccountProfile,
  MT5DemoBridgeStatus,
  TimeframeCode,
  TradingEnvironment,
  UserTradingSettings,
} from '../types/trading.ts';
import {
  ALL_SUPPORTED_SYMBOLS,
  ALL_SUPPORTED_TIMEFRAMES,
} from '../types/trading.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface SettingsViewProps {
  settings: UserTradingSettings;
  onUpdateSettings: (patch: Partial<UserTradingSettings>) => void;
  environment: TradingEnvironment;
  onChangeEnvironment: (env: TradingEnvironment) => void;
  mt5Status: MT5DemoBridgeStatus;
  connectionHealth: ConnectionHealthSnapshot;
  onSaveMt5Profile: (profile: MT5AccountProfile, rotateToken?: boolean) => Promise<string | null>;
  onDisconnectMt5: () => Promise<void>;
  onOpenSignIn: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  environment,
  onChangeEnvironment,
  mt5Status,
  connectionHealth,
  onSaveMt5Profile,
  onDisconnectMt5,
  onOpenSignIn,
}) => {
  const { user } = useAuth();
  const [mt5Form, setMt5Form] = useState<MT5AccountProfile>(mt5Status.profile);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [savingMt5, setSavingMt5] = useState(false);
  const [mt5Message, setMt5Message] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  useEffect(() => {
    setMt5Form(mt5Status.profile);
  }, [mt5Status.profile]);

  const toggleSymbol = (sym: string) => {
    const exists = settings.symbols.includes(sym);
    if (exists && settings.symbols.length <= 1) return;
    const nextSymbols = exists
      ? settings.symbols.filter((s) => s !== sym)
      : [...settings.symbols, sym];
    const nextDefault = nextSymbols.includes(settings.defaultSymbol)
      ? settings.defaultSymbol
      : nextSymbols[0];
    onUpdateSettings({ symbols: nextSymbols, defaultSymbol: nextDefault });
  };

  const toggleTimeframe = (tf: TimeframeCode) => {
    const exists = settings.enabledTimeframes.includes(tf);
    if (exists && settings.enabledTimeframes.length <= 1) return;
    const nextTimeframes = exists
      ? settings.enabledTimeframes.filter((t) => t !== tf)
      : [...settings.enabledTimeframes, tf];
    const nextDefault = nextTimeframes.includes(settings.defaultTimeframe)
      ? settings.defaultTimeframe
      : nextTimeframes[0];
    onUpdateSettings({ enabledTimeframes: nextTimeframes, defaultTimeframe: nextDefault });
  };

  const handleSaveMt5 = async (rotateToken = false) => {
    if (!user) {
      onOpenSignIn();
      return;
    }
    setSavingMt5(true);
    setMt5Message(null);
    const token = await onSaveMt5Profile(mt5Form, rotateToken);
    setSavingMt5(false);
    if (token) {
      setIssuedToken(token);
      setMt5Message('MT5 Demo profile saved. Live trading remains disabled.');
    } else {
      setMt5Message('Saved MT5 Demo metadata locally.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 font-mono">
      {/* Header */}
      <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            <h1 className="text-base font-bold text-white uppercase tracking-wider">
              APEX TRADER AI — WORKSPACE &amp; STRATEGY SETTINGS
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Persistent configuration for symbols, timeframes, strategies, fixed position sizing, MT5 Demo EA bridge, and safety guardrails.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
            Sync: {user ? `Cloud SQL + Firestore (${user.email})` : 'Local Browser (Sign in to sync)'}
          </span>
          {!user && (
            <button
              type="button"
              onClick={onOpenSignIn}
              className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      </div>

      {/* Global Emergency Trading-Disable + Live Locked Guardrail */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className={`p-4 rounded-xl border shadow-xl flex items-center justify-between gap-4 ${
            settings.emergencyTradingDisabled
              ? 'bg-rose-950/50 border-rose-600'
              : 'bg-[#0e1424] border-slate-800'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <AlertTriangle
                className={`w-4 h-4 ${
                  settings.emergencyTradingDisabled ? 'text-rose-400' : 'text-amber-400'
                }`}
              />
              <span>GLOBAL EMERGENCY TRADING-DISABLE</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Immediately freezes all auto-trading and blocks manual order execution in both Simulation and MT5 Demo.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateSettings({ emergencyTradingDisabled: !settings.emergencyTradingDisabled })
            }
            className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider shrink-0 cursor-pointer ${
              settings.emergencyTradingDisabled
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-rose-950/60 hover:bg-rose-900 text-rose-200 border border-rose-700/70'
            }`}
          >
            {settings.emergencyTradingDisabled ? 'TRADING DISABLED (CLICK TO ARM)' : 'DISABLE ALL TRADING'}
          </button>
        </div>

        <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <Lock className="w-4 h-4 text-rose-400" />
              <span>LIVE REAL-MONEY TRADING</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Permanently disabled by Phase 1 system policy across backend routes, Firestore security rules, and UI.
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-rose-300 text-xs font-bold shrink-0">
            LOCKED OFF
          </span>
        </div>
      </div>

      {/* Persistent Symbols & Timeframes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-white uppercase">
              1. PREFERRED SYMBOLS &amp; WATCHLIST
            </span>
            <span className="text-[11px] text-cyan-300">
              {settings.symbols.length} / {ALL_SUPPORTED_SYMBOLS.length} Enabled
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {ALL_SUPPORTED_SYMBOLS.map((sym) => {
              const enabled = settings.symbols.includes(sym);
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => toggleSymbol(sym)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    enabled
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                      : 'bg-[#131b2e] border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {sym}
                </button>
              );
            })}
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">DEFAULT TERMINAL SYMBOL</label>
            <select
              value={settings.defaultSymbol}
              onChange={(e) => onUpdateSettings({ defaultSymbol: e.target.value })}
              className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              {settings.symbols.map((sym) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-white uppercase">
              2. TIMEFRAMES CONFIGURATION
            </span>
            <span className="text-[11px] text-cyan-300">Default: {settings.defaultTimeframe}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {ALL_SUPPORTED_TIMEFRAMES.map((tf) => {
              const enabled = settings.enabledTimeframes.includes(tf);
              return (
                <button
                  key={tf}
                  type="button"
                  onClick={() => toggleTimeframe(tf)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    enabled
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                      : 'bg-[#131b2e] border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tf}
                </button>
              );
            })}
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">DEFAULT CHART TIMEFRAME</label>
            <select
              value={settings.defaultTimeframe}
              onChange={(e) =>
                onUpdateSettings({ defaultTimeframe: e.target.value as TimeframeCode })
              }
              className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              {settings.enabledTimeframes.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Persistent Strategies & Fixed Position Size */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-white uppercase">
              3. STRATEGIES &amp; BOT CONFLUENCE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => onUpdateSettings({ botMode: 'CLASSIC' })}
              className={`p-3 rounded-lg border text-left cursor-pointer ${
                settings.botMode === 'CLASSIC'
                  ? 'bg-amber-500/15 border-amber-500/60 text-amber-200'
                  : 'bg-[#131b2e] border-slate-800 text-slate-400'
              }`}
            >
              <div className="font-bold">Classic Mode</div>
              <div className="text-[10px] text-slate-400 mt-0.5">SMMA 5/50 + RSI + ATR</div>
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ botMode: 'BRAIN' })}
              className={`p-3 rounded-lg border text-left cursor-pointer ${
                settings.botMode === 'BRAIN'
                  ? 'bg-cyan-500/15 border-cyan-500/60 text-cyan-200'
                  : 'bg-[#131b2e] border-slate-800 text-slate-400'
              }`}
            >
              <div className="font-bold">Brain Mode</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                FVG, Sweeps, Displacement, OBs, POC
              </div>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => onUpdateSettings({ useHtfFilter: !settings.useHtfFilter })}
              className={`p-2 rounded-lg border cursor-pointer ${
                settings.useHtfFilter
                  ? 'bg-emerald-950/50 border-emerald-600/50 text-emerald-300'
                  : 'bg-[#131b2e] border-slate-800 text-slate-400'
              }`}
            >
              HTF Filter: {settings.useHtfFilter ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ enableBreakeven: !settings.enableBreakeven })}
              className={`p-2 rounded-lg border cursor-pointer ${
                settings.enableBreakeven
                  ? 'bg-emerald-950/50 border-emerald-600/50 text-emerald-300'
                  : 'bg-[#131b2e] border-slate-800 text-slate-400'
              }`}
            >
              Breakeven: {settings.enableBreakeven ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ enableMultipleEntries: !settings.enableMultipleEntries })
              }
              className={`p-2 rounded-lg border cursor-pointer ${
                settings.enableMultipleEntries
                  ? 'bg-emerald-950/50 border-emerald-600/50 text-emerald-300'
                  : 'bg-[#131b2e] border-slate-800 text-slate-400'
              }`}
            >
              Multi-Entry: {settings.enableMultipleEntries ? 'ON' : 'OFF'}
            </button>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              MINIMUM BRAIN SCORE THRESHOLD ({settings.minBrainScore}/100)
            </label>
            <input
              type="range"
              min={50}
              max={90}
              value={settings.minBrainScore}
              onChange={(e) => onUpdateSettings({ minBrainScore: Number(e.target.value) })}
              className="w-full accent-cyan-400"
            />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <ShieldAlert className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-white uppercase">
              4. FIXED POSITION SIZE &amp; RISK SIZING
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => onUpdateSettings({ sizingMode: 'FIXED_LOT' })}
              className={`p-3 rounded-lg border text-left cursor-pointer ${
                settings.sizingMode === 'FIXED_LOT'
                  ? 'bg-cyan-500/15 border-cyan-500/60 text-cyan-200'
                  : 'bg-[#131b2e] border-slate-800 text-slate-400'
              }`}
            >
              <div className="font-bold">Fixed Position Size</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Always prefill fixed lot volume
              </div>
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ sizingMode: 'RISK_PERCENT' })}
              className={`p-3 rounded-lg border text-left cursor-pointer ${
                settings.sizingMode === 'RISK_PERCENT'
                  ? 'bg-cyan-500/15 border-cyan-500/60 text-cyan-200'
                  : 'bg-[#131b2e] border-slate-800 text-slate-400'
              }`}
            >
              <div className="font-bold">Dynamic Risk %</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Size lots by equity &amp; SL distance
              </div>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                FIXED POSITION SIZE (LOTS)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={settings.fixedPositionSize}
                onChange={(e) =>
                  onUpdateSettings({
                    fixedPositionSize: Math.max(0.01, Math.min(100, parseFloat(e.target.value) || 0.01)),
                  })
                }
                className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                RISK PER TRADE (% EQUITY)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="5"
                value={settings.riskPercentagePerTrade}
                onChange={(e) =>
                  onUpdateSettings({
                    riskPercentagePerTrade: Math.max(0.1, Math.min(5, parseFloat(e.target.value) || 0.5)),
                  })
                }
                className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* MT5 Demo Account & EA Bridge Configuration */}
      <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-white uppercase">
              5. MT5 DEMO ENVIRONMENT &amp; EA BRIDGE CONFIGURATION
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span
              className={`px-2 py-0.5 rounded border font-bold ${
                mt5Status.connected
                  ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-700/60 text-rose-300'
              }`}
            >
              {mt5Status.status}
            </span>
            <button
              type="button"
              onClick={() =>
                onChangeEnvironment(environment === 'SIMULATION' ? 'MT5_DEMO' : 'SIMULATION')
              }
              className="px-2.5 py-1 rounded bg-[#131b2e] border border-slate-700 text-cyan-300 hover:bg-slate-800 cursor-pointer"
            >
              Switch to {environment === 'SIMULATION' ? 'MT5 Demo' : 'Simulation'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">ACCOUNT LABEL</label>
            <input
              type="text"
              value={mt5Form.accountLabel}
              onChange={(e) => setMt5Form((p) => ({ ...p, accountLabel: e.target.value }))}
              placeholder="Primary MT5 Demo"
              className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">BROKER NAME (DEMO ONLY)</label>
            <input
              type="text"
              value={mt5Form.brokerName}
              onChange={(e) => setMt5Form((p) => ({ ...p, brokerName: e.target.value }))}
              placeholder="e.g. Exness / MetaQuotes"
              className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">MT5 DEMO SERVER</label>
            <input
              type="text"
              value={mt5Form.brokerServer}
              onChange={(e) => setMt5Form((p) => ({ ...p, brokerServer: e.target.value }))}
              placeholder="e.g. Exness-MT5Trial7"
              className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">DEMO LOGIN NUMBER</label>
            <input
              type="text"
              value={mt5Form.demoAccountNumber}
              onChange={(e) => setMt5Form((p) => ({ ...p, demoAccountNumber: e.target.value }))}
              placeholder="e.g. 51094821"
              className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">CURRENCY</label>
            <input
              type="text"
              value={mt5Form.accountCurrency}
              onChange={(e) => setMt5Form((p) => ({ ...p, accountCurrency: e.target.value }))}
              placeholder="USD"
              className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">LEVERAGE (1:N)</label>
            <input
              type="number"
              min={1}
              max={2000}
              value={mt5Form.leverage}
              onChange={(e) =>
                setMt5Form((p) => ({ ...p, leverage: parseInt(e.target.value, 10) || 100 }))
              }
              className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#111728] border border-slate-800 text-[11px] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-400">
              EA Heartbeat Endpoint: <code className="text-cyan-300">{mt5Status.bridgeEndpoint}</code>
            </span>
            <span className="text-slate-400">
              Database Status:{' '}
              <strong className="text-slate-200">{connectionHealth.database.label}</strong>
            </span>
          </div>
          {issuedToken && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-emerald-950/30 border border-emerald-700/50">
              <span className="text-emerald-200 flex items-center gap-1.5 break-all">
                <KeyRound className="w-3.5 h-3.5 shrink-0" />
                X-MT5-Bridge-Token: <code>{issuedToken}</code>
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(issuedToken);
                  setCopiedToken(true);
                  setTimeout(() => setCopiedToken(false), 2000);
                }}
                className="px-2 py-1 rounded bg-slate-800 text-cyan-300 flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                {copiedToken ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          {mt5Message && (
            <div className="text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{mt5Message}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={savingMt5}
            onClick={() => handleSaveMt5(false)}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
          >
            {savingMt5 ? 'Saving...' : 'Save MT5 Demo Profile & Get Token'}
          </button>
          <button
            type="button"
            disabled={savingMt5}
            onClick={() => handleSaveMt5(true)}
            className="px-3 py-2 rounded-lg bg-[#131b2e] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Rotate EA Token
          </button>
          {mt5Status.connected && (
            <button
              type="button"
              onClick={() => void onDisconnectMt5()}
              className="px-3 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-700/60 text-rose-200 text-xs font-bold cursor-pointer"
            >
              Disconnect EA Session
            </button>
          )}
        </div>
      </div>

      {/* Mobile & Desktop PWA Install */}
      <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Smartphone className="w-4 h-4 text-cyan-400" />
            <span>6. INSTALL APEX TRADER AI ON ANDROID &amp; iOS (PWA)</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Standalone home-screen app experience with cached shell UI and automatic offline awareness.
          </p>
        </div>
        <PWAInstallButton />
      </div>
    </div>
  );
};

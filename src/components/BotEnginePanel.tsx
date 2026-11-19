import React from 'react';
import type { BotSettings, TradingSignal } from '../utils/strategy.ts';
import { Bot, Cpu, Layers, ShieldCheck, Activity } from 'lucide-react';

interface BotEnginePanelProps {
  botSettings: BotSettings;
  onUpdateBotSettings: (patch: Partial<BotSettings>) => void;
  signal: TradingSignal;
  digits?: number;
}

export const BotEnginePanel: React.FC<BotEnginePanelProps> = ({
  botSettings,
  onUpdateBotSettings,
  signal,
  digits = 2,
}) => {
  const { smcContext, marketContext } = signal;

  return (
    <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-3.5 shadow-xl space-y-3">
      {/* Header + Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
            Trading Bot Engine
          </span>
        </div>

        <div className="flex items-center gap-1 bg-[#131b2e] p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => onUpdateBotSettings({ mode: 'CLASSIC' })}
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-colors whitespace-nowrap cursor-pointer ${
              botSettings.mode === 'CLASSIC'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Classic Mode
          </button>
          <button
            type="button"
            onClick={() => onUpdateBotSettings({ mode: 'BRAIN' })}
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold transition-colors whitespace-nowrap cursor-pointer ${
              botSettings.mode === 'BRAIN'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Brain Mode
          </button>
        </div>
      </div>

      {/* Mode Description */}
      <div className="text-[11px] text-slate-400 font-mono">
        {botSettings.mode === 'CLASSIC'
          ? 'Classic Mode: SMMA 5/50 trend & pullback, RSI (14) momentum, ATR (14) volatility stops.'
          : 'Brain Mode: Multi-signal scorer fusing Classic TA, Fair Value Gaps, Liquidity Sweeps, Displacement, Order Blocks, Volume Profile (POC/HVN), and HTF Direction.'}
      </div>

      {/* Bot Automation & Position Management Toggles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
        <button
          type="button"
          onClick={() => onUpdateBotSettings({ autoTradeEnabled: !botSettings.autoTradeEnabled })}
          className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
            botSettings.autoTradeEnabled
              ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
              : 'bg-[#12192c] border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="font-bold flex items-center justify-between">
            <span>Auto-Execute</span>
            <span>{botSettings.autoTradeEnabled ? 'ON' : 'OFF'}</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Live signal bot</span>
        </button>

        <button
          type="button"
          onClick={() => onUpdateBotSettings({ enableBreakeven: !botSettings.enableBreakeven })}
          className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
            botSettings.enableBreakeven
              ? 'bg-cyan-950/60 border-cyan-500/60 text-cyan-300'
              : 'bg-[#12192c] border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="font-bold flex items-center justify-between">
            <span>Breakeven</span>
            <span>{botSettings.enableBreakeven ? '+1.0R' : 'OFF'}</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Auto SL lock</span>
        </button>

        <button
          type="button"
          onClick={() => onUpdateBotSettings({ enableMultipleEntries: !botSettings.enableMultipleEntries })}
          className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
            botSettings.enableMultipleEntries
              ? 'bg-cyan-950/60 border-cyan-500/60 text-cyan-300'
              : 'bg-[#12192c] border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="font-bold flex items-center justify-between">
            <span>Multi-Entry</span>
            <span>{botSettings.enableMultipleEntries ? 'ON' : 'OFF'}</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Scale-in support</span>
        </button>

        <button
          type="button"
          onClick={() => onUpdateBotSettings({ useHtfFilter: !botSettings.useHtfFilter })}
          className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
            botSettings.useHtfFilter
              ? 'bg-purple-950/60 border-purple-500/60 text-purple-300'
              : 'bg-[#12192c] border-slate-800 text-slate-400 hover:border-slate-700'
          }`}
        >
          <div className="font-bold flex items-center justify-between">
            <span>HTF Filter</span>
            <span>{botSettings.useHtfFilter ? 'H1' : 'OFF'}</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Trend alignment</span>
        </button>
      </div>

      {/* Live Multi-Indicator Telemetry Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono tabular-nums pt-1">
        <div className="p-2 rounded-lg bg-[#111728] border border-slate-800/80">
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <Activity className="w-3 h-3 text-amber-400" /> SMMA 5 / 50
          </span>
          <span className="text-slate-200 font-bold block mt-0.5">
            {marketContext.smma5.toFixed(digits)} / {marketContext.smma50.toFixed(digits)}
          </span>
        </div>

        <div className="p-2 rounded-lg bg-[#111728] border border-slate-800/80">
          <span className="text-[10px] text-slate-500 block">RSI (14) · ATR (14)</span>
          <span className="text-slate-200 font-bold block mt-0.5">
            {marketContext.rsiValue.toFixed(1)} · {marketContext.atrValue.toFixed(digits)}
          </span>
        </div>

        <div className="p-2 rounded-lg bg-[#111728] border border-slate-800/80">
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <Layers className="w-3 h-3 text-emerald-400" /> Fair Value Gaps
          </span>
          <span className="text-slate-200 font-bold block mt-0.5">
            <span className="text-emerald-400">{smcContext.activeBullishFVGs.length} Bull</span>
            {' · '}
            <span className="text-rose-400">{smcContext.activeBearishFVGs.length} Bear</span>
          </span>
        </div>

        <div className="p-2 rounded-lg bg-[#111728] border border-slate-800/80">
          <span className="text-[10px] text-slate-500 block">Order Blocks</span>
          <span className="text-slate-200 font-bold block mt-0.5">
            <span className="text-sky-400">{smcContext.activeDemandOBs.length} Dem</span>
            {' · '}
            <span className="text-orange-400">{smcContext.activeSupplyOBs.length} Sup</span>
          </span>
        </div>

        <div className="p-2 rounded-lg bg-[#111728] border border-slate-800/80">
          <span className="text-[10px] text-slate-500 block">Liquidity Sweeps</span>
          <span className="text-cyan-300 font-bold block mt-0.5">
            {smcContext.recentSweeps.length > 0
              ? `${smcContext.recentSweeps.length} Active`
              : 'None Recent'}
          </span>
        </div>

        <div className="p-2 rounded-lg bg-[#111728] border border-slate-800/80">
          <span className="text-[10px] text-slate-500 block">Displacement</span>
          <span className="text-slate-200 font-bold block mt-0.5">
            {smcContext.recentDisplacements.length} Impulse Bars
          </span>
        </div>

        <div className="p-2 rounded-lg bg-[#111728] border border-slate-800/80">
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <Cpu className="w-3 h-3 text-amber-400" /> Vol Profile POC
          </span>
          <span className="text-amber-300 font-bold block mt-0.5">
            {smcContext.volumeProfile.poc.toFixed(digits)} ({smcContext.volumeProfile.highVolumeNodes.length} HVN)
          </span>
        </div>

        <div className="p-2 rounded-lg bg-[#111728] border border-slate-800/80">
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-purple-400" /> HTF H1 Flow
          </span>
          <span
            className={`font-bold block mt-0.5 ${
              marketContext.h1Trend === 'BULLISH'
                ? 'text-emerald-400'
                : marketContext.h1Trend === 'BEARISH'
                ? 'text-rose-400'
                : 'text-slate-400'
            }`}
          >
            {marketContext.h1Trend}
          </span>
        </div>
      </div>
    </div>
  );
};

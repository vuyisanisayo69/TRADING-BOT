import React from 'react';
import { Radio, Radar, Eye, BrainCircuit, Coins } from 'lucide-react';
import type { SignalsSubTab, TradingEnvironment } from '../types/trading.ts';
import type { BotSettings, TradingSignal } from '../utils/strategy.ts';
import type { MarketTicker, EconomicEvent } from '../utils/marketData.ts';
import type { ChartIntelligenceReport, StrategyEngineHandoff } from '../utils/chartIntelligence.ts';
import type { AccountState, RiskConfig } from '../utils/risk.ts';
import type { ActivePosition } from './PositionsAndOrders.tsx';
import type { BacktestTrade } from '../utils/backtest.ts';
import type { CreateTradeProposalInput } from '../utils/tradeDesk.ts';
import { BotEnginePanel } from './BotEnginePanel.tsx';
import { SignalCard } from './SignalCard.tsx';
import { ChartIntelligenceView } from './ChartIntelligenceView.tsx';
import { VisionAnalysisView } from './VisionAnalysisView.tsx';
import { AIAssistantView } from './AIAssistantView.tsx';
import { CryptoResearchView } from './CryptoResearchView.tsx';

interface SignalsWorkspaceViewProps {
  subTab: SignalsSubTab;
  onChangeSubTab: (subTab: SignalsSubTab) => void;
  environment: TradingEnvironment;
  selectedSymbol: string;
  timeframe: string;
  tickers: Record<string, MarketTicker>;
  currentSignal: TradingSignal;
  botSettings: BotSettings;
  onUpdateBotSettings: (patch: Partial<BotSettings>) => void;
  onExecuteSignal: (signal: TradingSignal) => void;
  onDraftSignalTicket?: (signal: TradingSignal) => void;
  onDraftCustomTicket?: (draft: Omit<CreateTradeProposalInput, 'environment'>) => void;
  strategyHandoff: StrategyEngineHandoff | null;
  onDismissHandoff: () => void;
  capturedScreenshot: string | null;
  onClearCapturedScreenshot: () => void;
  onApplyVisionLevels: (levels: {
    symbol?: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
  }) => void;
  savedChartReports: ChartIntelligenceReport[];
  onSaveChartReportToJournal: (rep: ChartIntelligenceReport, score: number) => void;
  onSyncChartHistoryLoaded: (reports: ChartIntelligenceReport[]) => void;
  onSendToStrategyEngine: (handoff: StrategyEngineHandoff) => void;
  upcomingEvents: EconomicEvent[];
  tradeHistory: BacktestTrade[];
  positions: ActivePosition[];
  account: AccountState;
  riskConfig: RiskConfig;
  sessionName: string;
}

export const SignalsWorkspaceView: React.FC<SignalsWorkspaceViewProps> = ({
  subTab,
  onChangeSubTab,
  environment,
  selectedSymbol,
  timeframe,
  tickers,
  currentSignal,
  botSettings,
  onUpdateBotSettings,
  onExecuteSignal,
  onDraftSignalTicket,
  onDraftCustomTicket,
  strategyHandoff,
  onDismissHandoff,
  capturedScreenshot,
  onClearCapturedScreenshot,
  onApplyVisionLevels,
  savedChartReports,
  onSaveChartReportToJournal,
  onSyncChartHistoryLoaded,
  onSendToStrategyEngine,
  upcomingEvents,
  tradeHistory,
  positions,
  account,
  riskConfig,
  sessionName,
}) => {
  const currentTicker = tickers[selectedSymbol] || Object.values(tickers)[0];

  const subTabs: Array<{ id: SignalsSubTab; label: string; icon: React.ComponentType<any> }> = [
    { id: 'engine', label: 'Bot Signals & Scoring', icon: Radio },
    { id: 'intelligence', label: 'Chart Intelligence', icon: Radar },
    { id: 'vision', label: 'Vision Analysis', icon: Eye },
    { id: 'crypto', label: 'Crypto Research (Hyperliquid)', icon: Coins },
    { id: 'ai', label: 'AI & Live Voice', icon: BrainCircuit },
  ];

  return (
    <div className="space-y-4">
      {/* Signals Engine Module Switcher */}
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 bg-[#0e1424] border border-slate-800 rounded-xl p-2 shadow-lg">
        <div className="flex flex-wrap items-center gap-1.5">
          {subTabs.map((item) => {
            const Icon = item.icon;
            const active = subTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeSubTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer ${
                  active
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <span className="text-[11px] font-mono text-slate-400 px-2">
          Mode: <strong className="text-cyan-300">{botSettings.mode}</strong> · Env:{' '}
          <strong className={environment === 'SIMULATION' ? 'text-emerald-300' : 'text-cyan-300'}>
            {environment}
          </strong>
        </span>
      </div>

      {subTab === 'engine' && (
        <div className="max-w-4xl mx-auto space-y-4">
          {strategyHandoff && (
            <div className="p-4 rounded-xl bg-[#0e1424] border border-cyan-500/50 shadow-xl space-y-2 text-xs font-mono">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <span className="font-bold text-cyan-300 uppercase">
                  Chart Intelligence Advisory Handoff — Execution Guardrail Check
                </span>
                <button
                  type="button"
                  onClick={onDismissHandoff}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500 block">SCREENSHOT SYMBOL</span>
                  <span className="text-white font-bold">
                    {strategyHandoff.symbol} ({strategyHandoff.timeframe})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">CLASSIFICATION</span>
                  <span className="text-amber-300 font-bold">{strategyHandoff.classification}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">CONFLUENCE INDEX</span>
                  <span className="text-cyan-300 font-bold">{strategyHandoff.confluenceScore}/100</span>
                </div>
                <div>
                  <span className="text-slate-500 block">ENVIRONMENT</span>
                  <span className="text-emerald-300 font-bold">
                    {environment === 'SIMULATION' ? 'SIMULATION SANDBOX' : 'MT5 DEMO VALIDATION'}
                  </span>
                </div>
              </div>
              <div className="p-2.5 rounded bg-[#111728] border border-slate-800 text-[11px] text-slate-300 space-y-1">
                <div>
                  <strong className="text-emerald-300">Scenario A (Long):</strong> Entry{' '}
                  {strategyHandoff.scenarioAEntry} · SL {strategyHandoff.scenarioASL} · TP1{' '}
                  {strategyHandoff.scenarioATP1}
                </div>
                <div>
                  <strong className="text-rose-300">Scenario B (Short):</strong>{' '}
                  {strategyHandoff.scenarioBShortNote}
                </div>
              </div>
              {onDraftCustomTicket && (() => {
                const parseFirstNum = (v: string) => {
                  const m = String(v).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
                  return m ? Number(m[0]) : NaN;
                };
                const e = parseFirstNum(strategyHandoff.scenarioAEntry);
                const sl = parseFirstNum(strategyHandoff.scenarioASL);
                const tp = parseFirstNum(strategyHandoff.scenarioATP1);
                if (!Number.isFinite(e) || !Number.isFinite(sl) || !Number.isFinite(tp) || sl >= e || tp <= e) {
                  return null;
                }
                return (
                  <button
                    type="button"
                    onClick={() =>
                      onDraftCustomTicket({
                        source: 'CHART_INTELLIGENCE',
                        symbol: strategyHandoff.symbol,
                        timeframe: strategyHandoff.timeframe,
                        side: 'LONG',
                        entryPrice: e,
                        stopLoss: sl,
                        takeProfit: tp,
                        thesis: `Chart Intelligence ${strategyHandoff.classification} Scenario A (${strategyHandoff.confluenceScore}/100)`,
                        evidence: [
                          `Chart Intelligence Confluence ${strategyHandoff.confluenceScore}/100`,
                          `Classification: ${strategyHandoff.classification}`,
                        ],
                        invalidation: `Scenario A invalidated below SL ${sl}`,
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/70 text-emerald-300 border border-emerald-700/60 text-[11px] font-bold cursor-pointer"
                  >
                    Draft APX Ticket from Scenario A
                  </button>
                );
              })()}
            </div>
          )}

          <BotEnginePanel
            botSettings={botSettings}
            onUpdateBotSettings={onUpdateBotSettings}
            signal={currentSignal}
            digits={currentTicker?.digits ?? 2}
          />
          <SignalCard
            signal={currentSignal}
            onExecuteSignal={onExecuteSignal}
            onCreateProposal={onDraftSignalTicket}
            onAskAI={() => onChangeSubTab('ai')}
          />
        </div>
      )}

      {subTab === 'intelligence' && (
        <ChartIntelligenceView
          tickers={tickers}
          isLiveMode={false}
          eaLongOnly={true}
          savedReports={savedChartReports}
          onSaveToJournal={onSaveChartReportToJournal}
          onSyncHistoryLoaded={onSyncChartHistoryLoaded}
          onSendToStrategyEngine={onSendToStrategyEngine}
        />
      )}

      {subTab === 'vision' && (
        <VisionAnalysisView
          selectedSymbol={selectedSymbol}
          timeframe={timeframe}
          tickers={tickers}
          currentSignal={currentSignal}
          capturedScreenshot={capturedScreenshot}
          onClearCapturedScreenshot={onClearCapturedScreenshot}
          onApplyLevelsToOrderEntry={onApplyVisionLevels}
        />
      )}

      {subTab === 'crypto' && (
        <CryptoResearchView
          onDraftPaperProposal={(draft) => {
            onDraftCustomTicket?.(draft);
          }}
        />
      )}

      {subTab === 'ai' && (
        <AIAssistantView
          currentSignal={currentSignal}
          selectedSymbol={selectedSymbol}
          tickers={tickers}
          upcomingEvents={upcomingEvents}
          trades={tradeHistory}
          positions={positions}
          account={account}
          riskConfig={riskConfig}
          botSettings={botSettings}
          sessionName={sessionName}
        />
      )}
    </div>
  );
};

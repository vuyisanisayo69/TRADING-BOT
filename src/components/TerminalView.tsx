import React, { useState, useEffect } from 'react';
import { Server, AlertCircle, Settings } from 'lucide-react';
import type {
  MT5DemoBridgeStatus,
  SizingMode,
  TradingEnvironment,
} from '../types/trading.ts';
import type { Candle } from '../utils/indicators.ts';
import type { MarketTicker, EconomicEvent } from '../utils/marketData.ts';
import type { PriceAlert } from '../utils/alerts.ts';
import type { AccountState, RiskConfig } from '../utils/risk.ts';
import type { BotSettings, TradingSignal } from '../utils/strategy.ts';
import type { ActivePosition, PendingOrder } from './PositionsAndOrders.tsx';
import type { BacktestTrade } from '../utils/backtest.ts';
import type { TradeTicket, CreateTradeProposalInput } from '../utils/tradeDesk.ts';
import { Watchlist } from './Watchlist.tsx';
import { SignalCard } from './SignalCard.tsx';
import { CandlestickChart } from './CandlestickChart.tsx';
import { BotEnginePanel } from './BotEnginePanel.tsx';
import { PositionsAndOrders } from './PositionsAndOrders.tsx';
import { OrderEntryPanel } from './OrderEntryPanel.tsx';
import { TradeDeskPanel } from './TradeDeskPanel.tsx';
import { MacroCalendarCard } from './MacroCalendarCard.tsx';

interface TerminalViewProps {
  environment: TradingEnvironment;
  mt5Status: MT5DemoBridgeStatus;
  tickers: Record<string, MarketTicker>;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  timeframe: string;
  onSelectTimeframe: (tf: string) => void;
  activeDisplayCandles: Candle[];
  currentSignal: TradingSignal;
  positions: ActivePosition[];
  pendingOrders: PendingOrder[];
  tradeHistory: BacktestTrade[];
  alerts: PriceAlert[];
  account: AccountState;
  riskConfig: RiskConfig;
  botSettings: BotSettings;
  sizingMode: SizingMode;
  fixedPositionSize: number;
  emergencyTradingDisabled: boolean;
  upcomingEvents: EconomicEvent[];
  presetSignal: {
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
  } | null;
  onUpdateBotSettings: (patch: Partial<BotSettings>) => void;
  onPlaceOrder: (order: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    lots: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    takeProfit2?: number;
  }) => void;
  onExecuteSignal: (sig: TradingSignal) => void;
  onDraftSignalTicket: (sig: TradingSignal) => void;
  tickets: TradeTicket[];
  activeTicketId: string | null;
  onSelectTicket: (id: string) => void;
  onCreateProposal: (input: CreateTradeProposalInput) => void;
  onRunRiskReview: (ticketId: string) => void;
  onApproveTicket: (ticketId: string, phrase: string) => { ok: boolean; error?: string };
  onExecuteTicketOnce: (ticketId: string) => { ok: boolean; error?: string };
  onCancelTicket: (ticketId: string) => void;
  onClosePosition: (id: string) => void;
  onMoveToBreakeven: (id: string) => void;
  onScaleInPosition: (id: string) => void;
  onCancelPendingOrder: (id: string) => void;
  onOpenAlertsModal: (symbol?: string) => void;
  onCaptureToVision: (dataUrl: string) => void;
  onAskAI: () => void;
  onOpenSettings: () => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({
  environment,
  mt5Status,
  tickers,
  selectedSymbol,
  onSelectSymbol,
  timeframe,
  onSelectTimeframe,
  activeDisplayCandles,
  currentSignal,
  positions,
  pendingOrders,
  tradeHistory,
  alerts,
  account,
  riskConfig,
  botSettings,
  sizingMode,
  fixedPositionSize,
  emergencyTradingDisabled,
  upcomingEvents,
  presetSignal,
  onUpdateBotSettings,
  onPlaceOrder,
  onExecuteSignal,
  onDraftSignalTicket,
  tickets,
  activeTicketId,
  onSelectTicket,
  onCreateProposal,
  onRunRiskReview,
  onApproveTicket,
  onExecuteTicketOnce,
  onCancelTicket,
  onClosePosition,
  onMoveToBreakeven,
  onScaleInPosition,
  onCancelPendingOrder,
  onOpenAlertsModal,
  onCaptureToVision,
  onAskAI,
  onOpenSettings,
}) => {
  const currentTicker = tickers[selectedSymbol] || Object.values(tickers)[0];
  const [rightPanelMode, setRightPanelMode] = useState<'ticket' | 'quick'>('ticket');

  useEffect(() => {
    if (activeTicketId) {
      setRightPanelMode('ticket');
    }
  }, [activeTicketId]);

  return (
    <div className="space-y-3.5">
      {/* Honest Environment Banner */}
      {environment === 'MT5_DEMO' && (
        <div
          className={`p-3 rounded-xl border font-mono text-xs flex flex-wrap items-center justify-between gap-3 ${
            mt5Status.connected
              ? 'bg-emerald-950/30 border-emerald-700/60 text-emerald-200'
              : 'bg-[#0e1424] border-cyan-800/50 text-slate-200'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2.5">
            {mt5Status.connected ? (
              <Server className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            )}
            <div>
              <div className="font-bold">
                MT5 DEMO WORKSPACE —{' '}
                <span className={mt5Status.connected ? 'text-emerald-300' : 'text-amber-300'}>
                  {mt5Status.status}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                {mt5Status.statusMessage} Live real-money trading is permanently disabled.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="px-3 py-1.5 rounded-lg bg-[#131b2e] hover:bg-slate-800 border border-slate-700 text-cyan-300 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            MT5 Demo Bridge Setup
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* Left Column: Watchlist & Signal Card */}
        <div className="lg:col-span-3 space-y-3.5">
          <Watchlist
            tickers={tickers}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={onSelectSymbol}
            onOpenAlertForSymbol={(sym) => onOpenAlertsModal(sym)}
          />
          <SignalCard
            signal={currentSignal}
            onExecuteSignal={onExecuteSignal}
            onCreateProposal={(sig) => {
              onDraftSignalTicket(sig);
              setRightPanelMode('ticket');
            }}
            onAskAI={onAskAI}
          />
        </div>

        {/* Center Column: Interactive Candlestick Chart, Bot Engine & Positions */}
        <div className="lg:col-span-6 space-y-3.5">
          <div className="h-[520px]">
            <CandlestickChart
              symbol={selectedSymbol}
              timeframe={timeframe}
              candles={activeDisplayCandles}
              ticker={currentTicker}
              activeTrade={positions.find((p) => p.symbol === selectedSymbol) || null}
              alerts={alerts}
              digits={currentTicker?.digits ?? 2}
              utcOffsetHours={2}
              onSelectTimeframe={onSelectTimeframe}
              onOpenAlertsModal={() => onOpenAlertsModal()}
              onCaptureToVision={onCaptureToVision}
            />
          </div>

          <BotEnginePanel
            botSettings={botSettings}
            onUpdateBotSettings={onUpdateBotSettings}
            signal={currentSignal}
            digits={currentTicker?.digits ?? 2}
          />

          <PositionsAndOrders
            positions={positions}
            pendingOrders={pendingOrders}
            tradeHistory={tradeHistory}
            enableMultipleEntries={botSettings.enableMultipleEntries}
            onClosePosition={onClosePosition}
            onMoveToBreakeven={onMoveToBreakeven}
            onScaleInPosition={onScaleInPosition}
            onCancelPendingOrder={onCancelPendingOrder}
          />
        </div>

        {/* Right Column: Execution Mode Switcher (APX Ticket Desk / Quick Order) & Calendar */}
        <div className="lg:col-span-3 space-y-3.5">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0e1424] border border-slate-800 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setRightPanelMode('ticket')}
              className={`py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                rightPanelMode === 'ticket'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              APX Ticket Desk
            </button>
            <button
              type="button"
              onClick={() => setRightPanelMode('quick')}
              className={`py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                rightPanelMode === 'quick'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Quick Order
            </button>
          </div>

          {rightPanelMode === 'ticket' ? (
            <TradeDeskPanel
              environment={environment}
              symbol={selectedSymbol}
              timeframe={timeframe}
              currentBid={currentTicker?.bid ?? 0}
              currentAsk={currentTicker?.ask ?? 0}
              account={account}
              riskConfig={riskConfig}
              sizingMode={sizingMode}
              fixedPositionSize={fixedPositionSize}
              emergencyTradingDisabled={emergencyTradingDisabled}
              mt5Connected={mt5Status.connected}
              currentSignal={currentSignal}
              tickets={tickets}
              activeTicketId={activeTicketId}
              onSelectTicket={onSelectTicket}
              onCreateProposal={onCreateProposal}
              onRunRiskReview={onRunRiskReview}
              onApproveTicket={onApproveTicket}
              onExecuteTicketOnce={onExecuteTicketOnce}
              onCancelTicket={onCancelTicket}
            />
          ) : (
            <OrderEntryPanel
              symbol={selectedSymbol}
              currentBid={currentTicker?.bid ?? 0}
              currentAsk={currentTicker?.ask ?? 0}
              account={account}
              riskConfig={riskConfig}
              environment={environment}
              sizingMode={sizingMode}
              fixedPositionSize={fixedPositionSize}
              emergencyTradingDisabled={emergencyTradingDisabled}
              mt5Connected={mt5Status.connected}
              onPlaceOrder={onPlaceOrder}
              presetSignal={presetSignal}
            />
          )}

          <MacroCalendarCard events={upcomingEvents} />
        </div>
      </div>
    </div>
  );
};

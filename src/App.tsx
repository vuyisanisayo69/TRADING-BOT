import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './components/Header.tsx';
import { CandlestickChart } from './components/CandlestickChart.tsx';
import { Watchlist } from './components/Watchlist.tsx';
import { OrderEntryPanel } from './components/OrderEntryPanel.tsx';
import { SignalCard } from './components/SignalCard.tsx';
import { PositionsAndOrders, ActivePosition, PendingOrder } from './components/PositionsAndOrders.tsx';
import { RiskManagementView } from './components/RiskManagementView.tsx';
import { BacktestView } from './components/BacktestView.tsx';
import { JournalView } from './components/JournalView.tsx';
import { AIAssistantView } from './components/AIAssistantView.tsx';
import { BrokerModal } from './components/BrokerModal.tsx';

import type { Candle } from './utils/indicators.ts';
import type { RiskConfig, AccountState } from './utils/risk.ts';
import { DEFAULT_RISK_CONFIG, INSTRUMENT_SPECS } from './utils/risk.ts';
import type { TradingSignal } from './utils/strategy.ts';
import { generateTradingSignal } from './utils/strategy.ts';
import type { BacktestTrade } from './utils/backtest.ts';
import {
  INITIAL_TICKERS,
  generateSyntheticHistory,
  resampleCandles,
  getActiveMarketSession,
  UPCOMING_ECONOMIC_EVENTS,
  MarketTicker,
} from './utils/marketData.ts';

export default function App() {
  // Navigation & Modal States
  const [activeTab, setActiveTab] = useState<'terminal' | 'signals' | 'risk' | 'backtest' | 'journal' | 'ai'>('terminal');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('XAU/USD');
  const [timeframe, setTimeframe] = useState<string>('M5');
  const [isBrokerModalOpen, setIsBrokerModalOpen] = useState<boolean>(false);
  const [isLiveMode, setIsLiveMode] = useState<boolean>(false);

  // Market Tickers & Economic News
  const [tickers, setTickers] = useState<Record<string, MarketTicker>>(INITIAL_TICKERS);
  const [sessionInfo, setSessionInfo] = useState(getActiveMarketSession());

  // Account State (Default $100,000 demo paper equity)
  const [account, setAccount] = useState<AccountState>({
    initialBalance: 100000,
    balance: 100000,
    equity: 100000,
    usedMargin: 0,
    freeMargin: 100000,
    dailyRealizedPnL: 0,
    dailyUnrealizedPnL: 0,
    totalRealizedPnL: 0,
    peakEquity: 100000,
    consecutiveLosses: 0,
    openPositionCount: 0,
  });

  // Risk Parameters
  const [riskConfig, setRiskConfig] = useState<RiskConfig>(DEFAULT_RISK_CONFIG);

  // Candlestick Data Stores per symbol
  const [candleStore, setCandleStore] = useState<Record<string, Candle[]>>(() => ({
    'XAU/USD': generateSyntheticHistory('XAU/USD', 2654.0, 5, 800, 0.00015),
    'BTC/USD': generateSyntheticHistory('BTC/USD', 68400.0, 5, 800, 0.0003),
    'EUR/USD': generateSyntheticHistory('EUR/USD', 1.0845, 5, 800, -0.00005),
  }));

  // Executed Positions, Pending Orders & Closed History
  const [positions, setPositions] = useState<ActivePosition[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [tradeHistory, setTradeHistory] = useState<BacktestTrade[]>([]);

  // Selected setup preset for Order Entry
  const [presetSignal, setPresetSignal] = useState<{
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
  } | null>(null);

  // Current candles for selected symbol
  const currentM5Candles = candleStore[selectedSymbol] || [];
  const currentM15Candles = useMemo(() => resampleCandles(currentM5Candles, 15, 5), [currentM5Candles]);
  const currentH1Candles = useMemo(() => resampleCandles(currentM5Candles, 60, 5), [currentM5Candles]);

  // Generate Current Trading Signal
  const currentSignal: TradingSignal = useMemo(() => {
    return generateTradingSignal(
      {
        symbol: selectedSymbol,
        m5: currentM5Candles,
        m15: currentM15Candles,
        h1: currentH1Candles,
        currentSpread: tickers[selectedSymbol]?.spreadPoints,
      },
      account,
      riskConfig
    );
  }, [selectedSymbol, currentM5Candles, currentM15Candles, currentH1Candles, tickers, account, riskConfig]);

  // Live Market Tick Simulation & Order Execution Engine
  useEffect(() => {
    const tickInterval = setInterval(() => {
      // 1. Tick price movement on all tickers
      setTickers((prev) => {
        const updated = { ...prev };
        for (const sym of Object.keys(updated)) {
          const t = updated[sym];
          const spec = INSTRUMENT_SPECS[sym] || INSTRUMENT_SPECS['XAU/USD'];
          const volatility = sym === 'BTC/USD' ? 8.5 : sym === 'XAU/USD' ? 0.35 : 0.00008;
          const delta = (Math.random() - 0.495) * volatility;

          let newBid = Number((t.bid + delta).toFixed(t.digits));
          let newAsk = Number((newBid + t.spreadPoints).toFixed(t.digits));

          const high24 = Math.max(t.high24h, newAsk);
          const low24 = Math.min(t.low24h, newBid);
          const changeUSD = newBid - (t.bid - t.change24hUSD);
          const changePct = (changeUSD / (newBid - changeUSD)) * 100;

          updated[sym] = {
            ...t,
            bid: newBid,
            ask: newAsk,
            high24h: high24,
            low24h: low24,
            change24hUSD: Number(changeUSD.toFixed(t.digits)),
            change24hPercent: Number(changePct.toFixed(2)),
          };
        }
        return updated;
      });

      // 2. Update the latest candle of the active store
      setCandleStore((prevStore) => {
        const updated = { ...prevStore };
        for (const sym of Object.keys(updated)) {
          const candles = updated[sym];
          if (!candles || candles.length === 0) continue;
          const last = candles[candles.length - 1];
          const ticker = tickers[sym];
          if (!ticker) continue;

          const currentPrice = ticker.bid;
          const updatedLast: Candle = {
            ...last,
            high: Math.max(last.high, currentPrice),
            low: Math.min(last.low, currentPrice),
            close: currentPrice,
            volume: last.volume + Math.floor(Math.random() * 5 + 1),
          };

          updated[sym] = [...candles.slice(0, -1), updatedLast];
        }
        return updated;
      });

      // 3. Reconcile Open Positions & Evaluate Stop Loss / Take Profit
      setPositions((prevPositions) => {
        if (prevPositions.length === 0) return prevPositions;

        const remaining: ActivePosition[] = [];
        let realizedDelta = 0;
        let consecutiveLost = false;

        for (const pos of prevPositions) {
          const ticker = tickers[pos.symbol];
          const spec = INSTRUMENT_SPECS[pos.symbol] || INSTRUMENT_SPECS['XAU/USD'];
          if (!ticker) {
            remaining.push(pos);
            continue;
          }

          const currentPrice = pos.side === 'LONG' ? ticker.bid : ticker.ask;
          let exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | null = null;
          let exitPrice = currentPrice;

          if (pos.side === 'LONG') {
            if (currentPrice <= pos.stopLoss) {
              exitReason = 'STOP_LOSS';
              exitPrice = pos.stopLoss - spec.typicalSpreadPoints * 0.5; // slippage
            } else if (currentPrice >= pos.takeProfit) {
              exitReason = 'TAKE_PROFIT';
              exitPrice = pos.takeProfit;
            }
          } else {
            // SHORT
            if (currentPrice >= pos.stopLoss) {
              exitReason = 'STOP_LOSS';
              exitPrice = pos.stopLoss + spec.typicalSpreadPoints * 0.5;
            } else if (currentPrice <= pos.takeProfit) {
              exitReason = 'TAKE_PROFIT';
              exitPrice = pos.takeProfit;
            }
          }

          if (exitReason) {
            // Close Position
            const priceDelta = pos.side === 'LONG' ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
            const grossPnL = priceDelta * spec.lotSize * pos.lots;
            const comm = spec.commissionPerLotUSD * pos.lots * 2;
            const netPnL = grossPnL - comm;
            realizedDelta += netPnL;

            if (netPnL < 0) consecutiveLost = true;

            const rMult =
              Math.abs(pos.entryPrice - pos.stopLoss) > 0
                ? priceDelta / Math.abs(pos.entryPrice - pos.stopLoss)
                : 0;

            const closedTrade: BacktestTrade = {
              id: `tr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              symbol: pos.symbol,
              side: pos.side,
              entryTime: pos.openTime,
              entryPrice: pos.entryPrice,
              exitTime: Math.floor(Date.now() / 1000),
              exitPrice,
              exitReason,
              lots: pos.lots,
              pnlUSD: grossPnL,
              pnlPercent: (netPnL / account.equity) * 100,
              rMultiple: Number(rMult.toFixed(2)),
              commissionUSD: comm,
              spreadCostUSD: spec.typicalSpreadPoints * spec.lotSize * pos.lots,
              slippageUSD: spec.typicalSpreadPoints * 0.5 * spec.lotSize * pos.lots,
              netPnlUSD: netPnL,
              durationMinutes: Math.max(1, Math.round((Date.now() / 1000 - pos.openTime) / 60)),
            };

            setTradeHistory((h) => [closedTrade, ...h]);
          } else {
            // Update Unrealized PnL
            const priceDelta = pos.side === 'LONG' ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice;
            const grossPnL = priceDelta * spec.lotSize * pos.lots;
            const comm = spec.commissionPerLotUSD * pos.lots * 2;
            const netUnrealized = grossPnL - comm;

            remaining.push({
              ...pos,
              currentPrice,
              unrealizedPnL: netUnrealized,
              unrealizedPnLPercent: (netUnrealized / account.equity) * 100,
            });
          }
        }

        // Apply Realized PnL updates to Account
        if (realizedDelta !== 0 || consecutiveLost) {
          setAccount((acc) => {
            const newBal = acc.balance + realizedDelta;
            const newEquity = newBal;
            const newConsec = consecutiveLost ? acc.consecutiveLosses + 1 : 0;
            return {
              ...acc,
              balance: newBal,
              equity: newEquity,
              totalRealizedPnL: acc.totalRealizedPnL + realizedDelta,
              dailyRealizedPnL: acc.dailyRealizedPnL + realizedDelta,
              peakEquity: Math.max(acc.peakEquity, newEquity),
              consecutiveLosses: newConsec,
              openPositionCount: remaining.length,
            };
          });
        }

        return remaining;
      });

      // 4. Update Unrealized PnL on Account
      setAccount((acc) => {
        const totalUnrealized = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
        const eq = acc.balance + totalUnrealized;
        const usedMarg = positions.reduce((sum, p) => {
          const spec = INSTRUMENT_SPECS[p.symbol] || INSTRUMENT_SPECS['XAU/USD'];
          return sum + p.lots * spec.lotSize * p.entryPrice * 0.01; // 1:100 leverage
        }, 0);
        return {
          ...acc,
          equity: eq,
          dailyUnrealizedPnL: totalUnrealized,
          usedMargin: usedMarg,
          freeMargin: Math.max(0, eq - usedMarg),
          openPositionCount: positions.length,
        };
      });
    }, 1500);

    return () => clearInterval(tickInterval);
  }, [tickers, positions, account.equity, account.balance]);

  // Order Placement Handler (Paper Trading)
  const handlePlaceOrder = useCallback(
    (order: {
      symbol: string;
      side: 'LONG' | 'SHORT';
      lots: number;
      entryPrice: number;
      stopLoss: number;
      takeProfit: number;
    }) => {
      const newPos: ActivePosition = {
        id: `pos_${Date.now()}`,
        symbol: order.symbol,
        side: order.side,
        lots: order.lots,
        entryPrice: order.entryPrice,
        currentPrice: order.entryPrice,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        openTime: Math.floor(Date.now() / 1000),
      };

      setPositions((prev) => [...prev, newPos]);
      setAccount((acc) => ({ ...acc, openPositionCount: acc.openPositionCount + 1 }));
      setPresetSignal(null);
    },
    []
  );

  // Close Active Position manually
  const handleClosePosition = useCallback(
    (id: string) => {
      const pos = positions.find((p) => p.id === id);
      if (!pos) return;
      const ticker = tickers[pos.symbol];
      const spec = INSTRUMENT_SPECS[pos.symbol] || INSTRUMENT_SPECS['XAU/USD'];
      const exitPrice = pos.side === 'LONG' ? ticker.bid : ticker.ask;

      const priceDelta = pos.side === 'LONG' ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
      const grossPnL = priceDelta * spec.lotSize * pos.lots;
      const comm = spec.commissionPerLotUSD * pos.lots * 2;
      const netPnL = grossPnL - comm;

      const closedTrade: BacktestTrade = {
        id: `tr_${Date.now()}`,
        symbol: pos.symbol,
        side: pos.side,
        entryTime: pos.openTime,
        entryPrice: pos.entryPrice,
        exitTime: Math.floor(Date.now() / 1000),
        exitPrice,
        exitReason: 'SESSION_CLOSE',
        lots: pos.lots,
        pnlUSD: grossPnL,
        pnlPercent: (netPnL / account.equity) * 100,
        rMultiple:
          Math.abs(pos.entryPrice - pos.stopLoss) > 0
            ? Number((priceDelta / Math.abs(pos.entryPrice - pos.stopLoss)).toFixed(2))
            : 0,
        commissionUSD: comm,
        spreadCostUSD: spec.typicalSpreadPoints * spec.lotSize * pos.lots,
        slippageUSD: 0,
        netPnlUSD: netPnL,
        durationMinutes: Math.max(1, Math.round((Date.now() / 1000 - pos.openTime) / 60)),
      };

      setTradeHistory((h) => [closedTrade, ...h]);
      setPositions((prev) => prev.filter((p) => p.id !== id));
      setAccount((acc) => ({
        ...acc,
        balance: acc.balance + netPnL,
        equity: acc.equity + netPnL,
        dailyRealizedPnL: acc.dailyRealizedPnL + netPnL,
        totalRealizedPnL: acc.totalRealizedPnL + netPnL,
        openPositionCount: Math.max(0, acc.openPositionCount - 1),
      }));
    },
    [positions, tickers, account.equity]
  );

  // Quick Execute Signal: fills order entry and places order
  const handleQuickExecuteSignal = useCallback((sig: TradingSignal) => {
    setPresetSignal({
      side: sig.action === 'LONG' ? 'LONG' : 'SHORT',
      entryPrice: sig.entryZone.recommended,
      stopLoss: sig.stopLoss,
      takeProfit: sig.takeProfit1,
    });
    setActiveTab('terminal');
  }, []);

  // Emergency Kill Switch Toggle
  const handleToggleKillSwitch = useCallback(() => {
    setRiskConfig((prev) => {
      const willHalt = !prev.killSwitchActive;
      if (willHalt) {
        // Close all positions immediately on Kill Switch activation
        setPositions((currentPositions) => {
          for (const pos of currentPositions) {
            handleClosePosition(pos.id);
          }
          return [];
        });
        setPendingOrders([]);
      }
      return { ...prev, killSwitchActive: willHalt };
    });
  }, [handleClosePosition]);

  // Reset Demo Account
  const handleResetAccount = useCallback(() => {
    setAccount({
      initialBalance: 100000,
      balance: 100000,
      equity: 100000,
      usedMargin: 0,
      freeMargin: 100000,
      dailyRealizedPnL: 0,
      dailyUnrealizedPnL: 0,
      totalRealizedPnL: 0,
      peakEquity: 100000,
      consecutiveLosses: 0,
      openPositionCount: 0,
    });
    setPositions([]);
    setPendingOrders([]);
    setTradeHistory([]);
    setRiskConfig(DEFAULT_RISK_CONFIG);
  }, []);

  const currentTicker = tickers[selectedSymbol] || INITIAL_TICKERS['XAU/USD'];

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        account={account}
        riskConfig={riskConfig}
        onToggleKillSwitch={handleToggleKillSwitch}
        onOpenRiskModal={() => setActiveTab('risk')}
        onOpenBrokerModal={() => setIsBrokerModalOpen(true)}
        onResetAccount={handleResetAccount}
        sessionName={sessionInfo.sessionName}
        isLiveMode={isLiveMode}
      />

      {/* Main Container */}
      <main className="flex-1 p-3 lg:p-4 max-w-[1720px] w-full mx-auto">
        {activeTab === 'terminal' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
            {/* Left Column: Watchlist & Signal Card (3 cols) */}
            <div className="lg:col-span-3 space-y-3.5">
              <Watchlist
                tickers={tickers}
                selectedSymbol={selectedSymbol}
                onSelectSymbol={setSelectedSymbol}
              />
              <SignalCard
                signal={currentSignal}
                onExecuteSignal={handleQuickExecuteSignal}
                onAskAI={() => setActiveTab('ai')}
              />
            </div>

            {/* Center Column: Interactive Candlestick Chart & Positions/Orders (6 cols) */}
            <div className="lg:col-span-6 space-y-3.5">
              <div className="h-[520px]">
                <CandlestickChart
                  symbol={selectedSymbol}
                  timeframe={timeframe}
                  candles={currentM5Candles}
                  activeTrade={positions.find((p) => p.symbol === selectedSymbol) || null}
                  digits={currentTicker.digits}
                  onSelectTimeframe={setTimeframe}
                />
              </div>

              <PositionsAndOrders
                positions={positions}
                pendingOrders={pendingOrders}
                tradeHistory={tradeHistory}
                onClosePosition={handleClosePosition}
                onCancelPendingOrder={(id) => setPendingOrders((o) => o.filter((p) => p.id !== id))}
              />
            </div>

            {/* Right Column: Order Execution Panel & Economic Calendar (3 cols) */}
            <div className="lg:col-span-3 space-y-3.5">
              <OrderEntryPanel
                symbol={selectedSymbol}
                currentBid={currentTicker.bid}
                currentAsk={currentTicker.ask}
                account={account}
                riskConfig={riskConfig}
                onPlaceOrder={handlePlaceOrder}
                presetSignal={presetSignal}
              />

              {/* Economic Calendar Quick Widget */}
              <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-3 shadow-xl">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                    MACRO CATALYST CALENDAR
                  </span>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/50">
                    HIGH IMPACT RISKS
                  </span>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {UPCOMING_ECONOMIC_EVENTS.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-2 rounded bg-[#12192c] border border-slate-800 text-[11px] font-mono flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-slate-200">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              ev.impact === 'HIGH' ? 'bg-rose-400' : 'bg-amber-400'
                            }`}
                          ></span>
                          <span>{ev.currency}</span>
                          <span>{ev.event}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Fcst: {ev.forecast} | Prev: {ev.previous}
                        </div>
                      </div>
                      <div className="text-right text-[10px] font-semibold text-cyan-300">
                        {ev.time}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Signals Engine Dedicated View */}
        {activeTab === 'signals' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <SignalCard
              signal={currentSignal}
              onExecuteSignal={handleQuickExecuteSignal}
              onAskAI={() => setActiveTab('ai')}
            />
          </div>
        )}

        {/* Risk & Guardrails View */}
        {activeTab === 'risk' && (
          <RiskManagementView
            config={riskConfig}
            account={account}
            onUpdateConfig={(u) => setRiskConfig((prev) => ({ ...prev, ...u }))}
            onToggleKillSwitch={handleToggleKillSwitch}
          />
        )}

        {/* Backtester View */}
        {activeTab === 'backtest' && (
          <BacktestView
            currentSymbol={selectedSymbol}
            m5Candles={currentM5Candles}
            riskConfig={riskConfig}
          />
        )}

        {/* Trading Journal View */}
        {activeTab === 'journal' && <JournalView trades={tradeHistory} />}

        {/* AI Assistant View */}
        {activeTab === 'ai' && (
          <AIAssistantView
            currentSignal={currentSignal}
            tickers={tickers}
            upcomingEvents={UPCOMING_ECONOMIC_EVENTS}
            trades={tradeHistory}
            riskConfig={riskConfig}
            sessionName={sessionInfo.sessionName}
          />
        )}
      </main>

      {/* Broker Integration Modal */}
      <BrokerModal
        isOpen={isBrokerModalOpen}
        onClose={() => setIsBrokerModalOpen(false)}
        isLiveMode={isLiveMode}
        onToggleLiveMode={setIsLiveMode}
      />
    </div>
  );
}

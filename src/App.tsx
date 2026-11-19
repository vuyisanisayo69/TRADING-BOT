import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Header } from './components/Header.tsx';
import { ConnectionStatusBar } from './components/ConnectionStatusBar.tsx';
import { EmergencyStopBanner } from './components/EmergencyStopBanner.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { TerminalView } from './components/TerminalView.tsx';
import { SignalsWorkspaceView } from './components/SignalsWorkspaceView.tsx';
import { RiskManagementView } from './components/RiskManagementView.tsx';
import { BacktestView } from './components/BacktestView.tsx';
import { JournalView } from './components/JournalView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { BrokerModal } from './components/BrokerModal.tsx';
import { PriceAlertsModal } from './components/PriceAlertsModal.tsx';
import { SignInModal } from './components/SignInModal.tsx';
import { AlertToastStack, type AlertToast } from './components/AlertToastStack.tsx';
import type { ActivePosition, PendingOrder } from './components/PositionsAndOrders.tsx';
import { useAuth } from './contexts/AuthContext.tsx';
import { useConnectionStatus } from './hooks/useConnectionStatus.ts';
import { usePersistentSettings } from './hooks/usePersistentSettings.ts';
import {
  loadUserFirestoreWorkspace,
  saveAlertsToFirestore,
  saveEnvironmentWorkspaceToFirestore,
  saveTradeJournalEntryToFirestore,
  saveTradeTicketToFirestore,
  saveUserProfileToFirestore,
  saveUserSettingsToFirestore,
  testFirestoreConnection,
} from './lib/firestore.ts';
import type {
  MT5AccountProfile,
  PrimaryTab,
  SignalsSubTab,
  TradingEnvironment,
} from './types/trading.ts';
import { EMPTY_MT5_DEMO_ACCOUNT } from './types/trading.ts';
import {
  calculateWeightedConfluenceScore,
  type ChartIntelligenceReport,
  type StrategyEngineHandoff,
} from './utils/chartIntelligence.ts';
import type { Candle } from './utils/indicators.ts';
import type { RiskConfig, AccountState } from './utils/risk.ts';
import {
  DEFAULT_RISK_CONFIG,
  INSTRUMENT_SPECS,
  evaluateOrderRisk,
  evaluateBreakevenUpdate,
} from './utils/risk.ts';
import type { TradingSignal, BotSettings } from './utils/strategy.ts';
import { generateTradingSignal, DEFAULT_BOT_SETTINGS } from './utils/strategy.ts';
import type { BacktestTrade } from './utils/backtest.ts';
import type { PriceAlert } from './utils/alerts.ts';
import { evaluateAlertTrigger } from './utils/alerts.ts';
import {
  approveTicketById,
  createTradeProposal,
  evaluatePostTradeReview,
  executeApprovedTicketOnce,
  reviewProposalWithStressedRisk,
  type CreateTradeProposalInput,
  type TradeTicket,
} from './utils/tradeDesk.ts';
import {
  INITIAL_TICKERS,
  generateSyntheticHistory,
  updateOrAppendLiveCandle,
  resampleCandles,
  getActiveMarketSession,
  UPCOMING_ECONOMIC_EVENTS,
  MarketTicker,
} from './utils/marketData.ts';

const INITIAL_ALERTS: PriceAlert[] = [
  {
    id: 'alert_1',
    symbol: 'XAU/USD',
    targetPrice: 2660.0,
    condition: 'CROSSES_ABOVE',
    status: 'ACTIVE',
    note: 'Resistance Retest Level',
    createdAt: Math.floor(Date.now() / 1000) - 3600,
    oneShot: true,
  },
  {
    id: 'alert_2',
    symbol: 'EUR/USD',
    targetPrice: 1.0865,
    condition: 'CROSSES_ABOVE',
    status: 'ACTIVE',
    note: 'London High Breakout',
    createdAt: Math.floor(Date.now() / 1000) - 1800,
    oneShot: true,
  },
  {
    id: 'alert_3',
    symbol: 'GBP/USD',
    targetPrice: 1.295,
    condition: 'CROSSES_BELOW',
    status: 'ACTIVE',
    note: 'Key Support Liquidity Sweep',
    createdAt: Math.floor(Date.now() / 1000) - 1200,
    oneShot: true,
  },
  {
    id: 'alert_4',
    symbol: 'USD/JPY',
    targetPrice: 150.0,
    condition: 'CROSSES_ABOVE',
    status: 'ACTIVE',
    note: 'Psychological 150.00 Handle',
    createdAt: Math.floor(Date.now() / 1000) - 900,
    oneShot: true,
  },
];

const INITIAL_SIMULATION_ACCOUNT: AccountState = {
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
  dailyTradeCount: 0,
};

export default function App() {
  const { user, getIdToken } = useAuth();
  const {
    settings,
    updateSettings,
    environment,
    setEnvironment,
    mt5Profile,
    setMt5Profile,
  } = usePersistentSettings();

  const { health, mt5Status, refreshConnections } = useConnectionStatus(
    environment,
    user?.uid
  );

  // Primary Navigation & Modals
  const [activeTab, setActiveTab] = useState<PrimaryTab>('terminal');
  const [signalsSubTab, setSignalsSubTab] = useState<SignalsSubTab>('engine');
  const [selectedSymbol, setSelectedSymbol] = useState<string>(settings.defaultSymbol);
  const [timeframe, setTimeframe] = useState<string>(settings.defaultTimeframe);
  const [isBrokerModalOpen, setIsBrokerModalOpen] = useState<boolean>(false);
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState<boolean>(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState<boolean>(false);
  const [capturedScreenshot, setCapturedScreenshot] = useState<string | null>(null);

  // Sound & Toast Alerts
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [alertToasts, setAlertToasts] = useState<AlertToast[]>([]);
  const prevPricesRef = useRef<Record<string, number>>({});

  // Market Tickers & Session Clock
  const [simTickers, setSimTickers] = useState<Record<string, MarketTicker>>(INITIAL_TICKERS);
  const [sessionInfo, setSessionInfo] = useState(getActiveMarketSession());

  // Isolated Simulation Environment State
  const [simAccount, setSimAccount] = useState<AccountState>(INITIAL_SIMULATION_ACCOUNT);
  const [simPositions, setSimPositions] = useState<ActivePosition[]>([]);
  const [simPendingOrders, setSimPendingOrders] = useState<PendingOrder[]>([]);
  const [simTradeHistory, setSimTradeHistory] = useState<BacktestTrade[]>([]);

  // Isolated MT5 Demo Environment State (strictly zero fabricated data)
  const [mt5TradeHistory, setMt5TradeHistory] = useState<BacktestTrade[]>([]);

  // Shared Risk, Bot & Alerts State
  const [riskConfig, setRiskConfig] = useState<RiskConfig>(() => ({
    ...DEFAULT_RISK_CONFIG,
    riskPercentagePerTrade: settings.riskPercentagePerTrade,
    killSwitchActive: settings.emergencyTradingDisabled,
  }));

  const [botSettings, setBotSettings] = useState<BotSettings>(() => ({
    ...DEFAULT_BOT_SETTINGS,
    mode: settings.botMode,
    useHtfFilter: settings.useHtfFilter,
    enableBreakeven: settings.enableBreakeven,
    enableMultipleEntries: settings.enableMultipleEntries,
    minBrainScore: settings.minBrainScore,
    autoTradeEnabled: false,
  }));

  const [alerts, setAlerts] = useState<PriceAlert[]>(INITIAL_ALERTS);

  // Simulation Candlestick Stores
  const [candleStore, setCandleStore] = useState<Record<string, Candle[]>>(() => ({
    'XAU/USD': generateSyntheticHistory('XAU/USD', 2654.35, 5, 800, 0.00015),
    'BTC/USD': generateSyntheticHistory('BTC/USD', 68420.5, 5, 800, 0.0003),
    'EUR/USD': generateSyntheticHistory('EUR/USD', 1.08452, 5, 800, -0.00005),
    'GBP/USD': generateSyntheticHistory('GBP/USD', 1.29845, 5, 800, 0.0001),
    'USD/JPY': generateSyntheticHistory('USD/JPY', 149.645, 5, 800, -0.0001),
    'AUD/USD': generateSyntheticHistory('AUD/USD', 0.6552, 5, 800, 0.00008),
    'USD/CAD': generateSyntheticHistory('USD/CAD', 1.3842, 5, 800, -0.00008),
  }));

  const [chartIntelligenceJournal, setChartIntelligenceJournal] = useState<
    Array<{ report: ChartIntelligenceReport; score: number }>
  >([]);
  const [strategyHandoff, setStrategyHandoff] = useState<StrategyEngineHandoff | null>(null);
  const [presetSignal, setPresetSignal] = useState<{
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
  } | null>(null);
  const [tradeTickets, setTradeTickets] = useState<TradeTicket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  const workspaceLoadedRef = useRef<boolean>(false);
  const lastAutoTradeAtRef = useRef<number>(0);
  const ticketSeqRef = useRef<number>(1);

  // Keep selectedSymbol & bot/risk settings aligned when user updates persistent Settings
  useEffect(() => {
    if (!settings.symbols.includes(selectedSymbol)) {
      setSelectedSymbol(settings.defaultSymbol);
    }
  }, [settings.symbols, settings.defaultSymbol, selectedSymbol]);

  const handleUpdateUserSettings = useCallback(
    (patch: Partial<typeof settings>) => {
      updateSettings(patch);
      if (patch.botMode !== undefined || patch.useHtfFilter !== undefined || patch.enableBreakeven !== undefined || patch.enableMultipleEntries !== undefined || patch.minBrainScore !== undefined) {
        setBotSettings((prev) => ({
          ...prev,
          mode: patch.botMode ?? prev.mode,
          useHtfFilter: patch.useHtfFilter ?? prev.useHtfFilter,
          enableBreakeven: patch.enableBreakeven ?? prev.enableBreakeven,
          enableMultipleEntries: patch.enableMultipleEntries ?? prev.enableMultipleEntries,
          minBrainScore: patch.minBrainScore ?? prev.minBrainScore,
        }));
      }
      if (patch.riskPercentagePerTrade !== undefined) {
        setRiskConfig((prev) => ({
          ...prev,
          riskPercentagePerTrade: patch.riskPercentagePerTrade!,
        }));
      }
      if (patch.emergencyTradingDisabled !== undefined) {
        const disabled = patch.emergencyTradingDisabled;
        setRiskConfig((prev) => ({ ...prev, killSwitchActive: disabled }));
        if (disabled) {
          setBotSettings((b) => ({ ...b, autoTradeEnabled: false }));
          setSimPendingOrders([]);
        }
      }
      if (patch.defaultTimeframe) {
        setTimeframe(patch.defaultTimeframe);
      }
      if (patch.defaultSymbol) {
        setSelectedSymbol(patch.defaultSymbol);
      }
    },
    [updateSettings]
  );

  // Keep Settings & Bot/Risk in sync when modified inside BotEnginePanel or RiskManagementView
  const handleUpdateBotSettings = useCallback(
    (patch: Partial<BotSettings>) => {
      const safePatch =
        settings.emergencyTradingDisabled || riskConfig.killSwitchActive
          ? { ...patch, autoTradeEnabled: false }
          : patch;
      setBotSettings((prev) => ({ ...prev, ...safePatch }));
      updateSettings({
        ...(patch.mode ? { botMode: patch.mode } : {}),
        ...(patch.useHtfFilter !== undefined ? { useHtfFilter: patch.useHtfFilter } : {}),
        ...(patch.enableBreakeven !== undefined ? { enableBreakeven: patch.enableBreakeven } : {}),
        ...(patch.enableMultipleEntries !== undefined
          ? { enableMultipleEntries: patch.enableMultipleEntries }
          : {}),
        ...(patch.minBrainScore !== undefined ? { minBrainScore: patch.minBrainScore } : {}),
      });
    },
    [settings.emergencyTradingDisabled, riskConfig.killSwitchActive, updateSettings]
  );

  // Filtered Watchlist Tickers per environment & user's enabled symbols
  const visibleTickers = useMemo(() => {
    const out: Record<string, MarketTicker> = {};
    for (const sym of settings.symbols) {
      const base = simTickers[sym] || INITIAL_TICKERS[sym];
      if (!base) continue;

      if (environment === 'MT5_DEMO') {
        const eaTick = mt5Status.connected ? mt5Status.eaReportedSymbols[sym] : undefined;
        out[sym] = eaTick
          ? {
              ...base,
              bid: eaTick.bid,
              ask: eaTick.ask,
              spreadPoints: eaTick.spreadPoints,
              status: 'OPEN',
              feedType: 'LIVE_BROKER',
            }
          : {
              ...base,
              bid: 0,
              ask: 0,
              spreadPoints: 0,
              change24hUSD: 0,
              change24hPercent: 0,
              volume24h: 0,
              status: 'CLOSED',
              feedType: 'LIVE_BROKER',
            };
      } else {
        out[sym] = base;
      }
    }
    return out;
  }, [settings.symbols, simTickers, environment, mt5Status]);

  // Active Environment Account & Positions
  const activeAccount: AccountState = useMemo(() => {
    if (environment === 'SIMULATION') return simAccount;
    if (mt5Status.connected && mt5Status.eaReportedAccount) {
      const bal = mt5Status.eaReportedAccount.balance ?? 0;
      const eq = mt5Status.eaReportedAccount.equity ?? bal;
      return {
        ...EMPTY_MT5_DEMO_ACCOUNT,
        initialBalance: bal,
        balance: bal,
        equity: eq,
        freeMargin: mt5Status.eaReportedAccount.freeMargin ?? eq,
        dailyUnrealizedPnL: eq - bal,
        openPositionCount: mt5Status.eaReportedAccount.openPositionsCount,
      };
    }
    return EMPTY_MT5_DEMO_ACCOUNT;
  }, [environment, simAccount, mt5Status]);

  const activePositions =
    environment === 'SIMULATION' ? simPositions : mt5Status.eaReportedPositions;
  const activeTradeHistory =
    environment === 'SIMULATION' ? simTradeHistory : mt5TradeHistory;

  // Persist Closed Trade to Cloud SQL + Cloud Firestore when authenticated
  const persistClosedTrade = useCallback(
    async (trade: BacktestTrade, env: TradingEnvironment) => {
      if (!user) return;
      void saveTradeJournalEntryToFirestore(user.uid, env, trade);
      const token = await getIdToken();
      if (!token) return;
      fetch('/api/workspace/trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ trade }),
      }).catch(() => {});
    },
    [user, getIdToken]
  );

  // Hydrate Workspace from Cloud SQL & Cloud Firestore on Sign-In
  useEffect(() => {
    if (!user) {
      workspaceLoadedRef.current = false;
      return;
    }

    let cancelled = false;
    async function loadWorkspace() {
      const token = await getIdToken();
      const [sqlData, fsData] = await Promise.all([
        token
          ? fetch('/api/workspace', {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          : Promise.resolve(null),
        loadUserFirestoreWorkspace(user!.uid).catch(() => null),
      ]);

      if (cancelled) return;

      if (fsData?.settings) {
        updateSettings(fsData.settings);
        if (fsData.settings.defaultSymbol) setSelectedSymbol(fsData.settings.defaultSymbol);
        if (fsData.settings.defaultTimeframe) setTimeframe(fsData.settings.defaultTimeframe);
      }

      if (fsData?.profile?.activeEnvironment) {
        setEnvironment(fsData.profile.activeEnvironment);
      }
      if (fsData?.profile?.emergencyTradingDisabled !== undefined) {
        updateSettings({ emergencyTradingDisabled: fsData.profile.emergencyTradingDisabled });
      }

      if (fsData?.mt5DemoEnv) {
        setMt5Profile((prev) => ({
          ...prev,
          accountLabel: fsData.mt5DemoEnv.accountLabel || prev.accountLabel,
          brokerName: fsData.mt5DemoEnv.brokerName || prev.brokerName,
          brokerServer: fsData.mt5DemoEnv.brokerServer || prev.brokerServer,
          demoAccountNumber: fsData.mt5DemoEnv.demoAccountNumber || prev.demoAccountNumber,
        }));
      }

      if (sqlData?.config) {
        if (
          sqlData.config.riskConfigJson &&
          Object.keys(sqlData.config.riskConfigJson).length > 0
        ) {
          setRiskConfig((prev) => ({ ...prev, ...sqlData.config.riskConfigJson }));
        }
        if (
          sqlData.config.botSettingsJson &&
          Object.keys(sqlData.config.botSettingsJson).length > 0
        ) {
          setBotSettings((prev) => ({ ...prev, ...sqlData.config.botSettingsJson }));
        }
        if (
          sqlData.config.accountStateJson &&
          Object.keys(sqlData.config.accountStateJson).length > 0
        ) {
          setSimAccount((prev) => ({ ...prev, ...sqlData.config.accountStateJson }));
        }
      }

      if (Array.isArray(sqlData?.alerts) && sqlData.alerts.length > 0) {
        setAlerts(
          sqlData.alerts.map((a: any) => ({
            id: a.clientAlertId || a.clientId || String(a.id),
            symbol: a.symbol,
            targetPrice: Number(a.targetPrice),
            condition: a.condition,
            status: a.status,
            note: a.note || undefined,
            createdAt: Number(a.createdAtEpoch || a.createdAt) || Math.floor(Date.now() / 1000),
            triggeredAt: a.triggeredAt ? Number(a.triggeredAt) : undefined,
            triggeredPrice: a.triggeredPrice ? Number(a.triggeredPrice) : undefined,
            oneShot: Boolean(a.oneShot),
          }))
        );
      }

      if (Array.isArray(sqlData?.positions)) {
        setSimPositions(
          sqlData.positions.map((p: any) => ({
            id: p.clientPosId || p.clientId || String(p.id),
            symbol: p.symbol,
            side: p.side,
            lots: Number(p.lots),
            entryPrice: Number(p.entryPrice),
            currentPrice: Number(p.entryPrice),
            stopLoss: Number(p.stopLoss),
            takeProfit: Number(p.takeProfit),
            takeProfit2: p.takeProfit2 ? Number(p.takeProfit2) : undefined,
            breakevenMoved: Boolean(p.breakevenMoved),
            scaleInsCount: Number(p.scaleInsCount) || 0,
            unrealizedPnL: 0,
            unrealizedPnLPercent: 0,
            openTime: Number(p.openTime) || Math.floor(Date.now() / 1000),
          }))
        );
      }

      if (Array.isArray(sqlData?.tradeHistory)) {
        setSimTradeHistory(
          sqlData.tradeHistory.map((t: any) => ({
            id: t.clientTradeId || t.clientId || String(t.id),
            symbol: t.symbol,
            side: t.side,
            entryTime: Number(t.entryTime),
            entryPrice: Number(t.entryPrice),
            exitTime: Number(t.exitTime),
            exitPrice: Number(t.exitPrice),
            exitReason: t.exitReason,
            lots: Number(t.lots),
            pnlUSD: Number(t.pnlUSD ?? t.pnlUsd),
            pnlPercent: Number(t.pnlPercent),
            rMultiple: Number(t.rMultiple),
            commissionUSD: Number(t.commissionUSD ?? t.commissionUsd),
            spreadCostUSD: Number(t.spreadCostUSD ?? t.spreadCostUsd),
            slippageUSD: Number(t.slippageUSD ?? t.slippageUsd),
            netPnlUSD: Number(t.netPnlUSD ?? t.netPnlUsd),
            durationMinutes: Number(t.durationMinutes),
          }))
        );
      }

      if (fsData?.journal && fsData.journal.length > 0) {
        const mt5Only = fsData.journal.filter((j) => j.environment === 'MT5_DEMO');
        if (mt5Only.length > 0) setMt5TradeHistory(mt5Only);
      }

      if (fsData?.tickets && fsData.tickets.length > 0) {
        setTradeTickets(fsData.tickets);
        setActiveTicketId(fsData.tickets[0].id);
        ticketSeqRef.current = fsData.tickets.length + 1;
      }

      workspaceLoadedRef.current = true;
    }

    void testFirestoreConnection();
    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [user, getIdToken, updateSettings, setEnvironment, setMt5Profile]);

  // Sync Config, Preferences, Profile & Active Environment to Cloud SQL + Firestore
  useEffect(() => {
    if (!user || !workspaceLoadedRef.current) return;
    const timer = setTimeout(async () => {
      void saveUserProfileToFirestore({
        uid: user.uid,
        email: user.email || 'trader@apex.local',
        displayName: user.displayName,
        activeEnvironment: environment,
        emergencyTradingDisabled: settings.emergencyTradingDisabled,
      });
      void saveUserSettingsToFirestore(user.uid, settings);
      void saveEnvironmentWorkspaceToFirestore(user.uid, environment, {
        accountProfile: environment === 'MT5_DEMO' ? mt5Profile : undefined,
        accountState: activeAccount,
        riskConfig,
        botSettings,
        positions: activePositions,
      });

      const token = await getIdToken();
      if (!token) return;
      fetch('/api/workspace/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          botMode: botSettings.mode,
          riskConfigJson: riskConfig,
          botSettingsJson: botSettings,
          accountStateJson: {
            balance: simAccount.balance,
            peakEquity: simAccount.peakEquity,
            dailyRealizedPnL: simAccount.dailyRealizedPnL,
            totalRealizedPnL: simAccount.totalRealizedPnL,
            consecutiveLosses: simAccount.consecutiveLosses,
            dailyTradeCount: simAccount.dailyTradeCount || 0,
          },
        }),
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    user,
    getIdToken,
    environment,
    settings,
    mt5Profile,
    botSettings,
    riskConfig,
    simAccount.balance,
    simAccount.dailyTradeCount,
    activeAccount,
    activePositions,
  ]);

  // Sync Alerts to Cloud SQL + Firestore
  useEffect(() => {
    if (!user || !workspaceLoadedRef.current) return;
    const timer = setTimeout(async () => {
      void saveAlertsToFirestore(user.uid, alerts);
      const token = await getIdToken();
      if (!token) return;
      fetch('/api/workspace/alerts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ alerts }),
      }).catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [user, getIdToken, alerts]);

  // Sync Open Simulation Positions to Cloud SQL
  const simPositionSyncKey = simPositions
    .map((p) => `${p.id}:${p.lots}:${p.stopLoss}:${p.breakevenMoved ? 1 : 0}:${p.scaleInsCount || 0}`)
    .join('|');

  useEffect(() => {
    if (!user || !workspaceLoadedRef.current) return;
    const timer = setTimeout(async () => {
      const token = await getIdToken();
      if (!token) return;
      fetch('/api/workspace/positions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ positions: simPositions }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [user, getIdToken, simPositionSyncKey, simPositions]);

  // Alert Chime
  const playAlertChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // ignore audio context block
    }
  }, [soundEnabled]);

  // Multi-Timeframe Candles (empty when in MT5 Demo without an EA feed)
  const currentM5Candles =
    environment === 'SIMULATION' || mt5Status.connected
      ? candleStore[selectedSymbol] || []
      : [];
  const currentM15Candles = useMemo(
    () => resampleCandles(currentM5Candles, 15, 5),
    [currentM5Candles]
  );
  const currentH1Candles = useMemo(
    () => resampleCandles(currentM5Candles, 60, 5),
    [currentM5Candles]
  );
  const currentH4Candles = useMemo(
    () => resampleCandles(currentM5Candles, 240, 5),
    [currentM5Candles]
  );

  const activeDisplayCandles = useMemo(() => {
    switch (timeframe) {
      case 'M15':
        return currentM15Candles;
      case 'H1':
        return currentH1Candles;
      case 'H4':
        return currentH4Candles;
      case 'M1':
      case 'M5':
      default:
        return currentM5Candles;
    }
  }, [timeframe, currentM5Candles, currentM15Candles, currentH1Candles, currentH4Candles]);

  // Trading Signal Engine
  const currentSignal: TradingSignal = useMemo(() => {
    return generateTradingSignal(
      {
        symbol: selectedSymbol,
        m5: currentM5Candles,
        m15: currentM15Candles,
        h1: currentH1Candles,
        currentSpread: visibleTickers[selectedSymbol]?.spreadPoints,
      },
      activeAccount,
      {
        ...riskConfig,
        killSwitchActive: riskConfig.killSwitchActive || settings.emergencyTradingDisabled,
      },
      botSettings
    );
  }, [
    selectedSymbol,
    currentM5Candles,
    currentM15Candles,
    currentH1Candles,
    visibleTickers,
    activeAccount,
    riskConfig,
    settings.emergencyTradingDisabled,
    botSettings,
  ]);

  // Order Placement Handler (Simulation only unless MT5 Demo EA connected; respects Global Emergency Disable)
  const handlePlaceOrder = useCallback(
    (order: {
      symbol: string;
      side: 'LONG' | 'SHORT';
      lots: number;
      entryPrice: number;
      stopLoss: number;
      takeProfit: number;
      takeProfit2?: number;
      positionIdOverride?: string;
      ticketId?: string;
      plannedEntry?: number;
      plannedSL?: number;
      plannedTP?: number;
      stressedCostEstimateUSD?: number;
    }) => {
      if (settings.emergencyTradingDisabled || riskConfig.killSwitchActive) {
        return;
      }
      if (environment === 'MT5_DEMO' && !mt5Status.connected) {
        return;
      }

      const existingSameDir = !order.ticketId
        ? simPositions.find((p) => p.symbol === order.symbol && p.side === order.side)
        : undefined;

      if (existingSameDir && botSettings.enableMultipleEntries) {
        const currentCount = (existingSameDir.scaleInsCount || 0) + 1;
        if (currentCount >= riskConfig.maxEntriesPerSymbol) {
          return;
        }
        setSimPositions((prev) =>
          prev.map((pos) => {
            if (pos.id !== existingSameDir.id) return pos;
            const totalLots = Number((pos.lots + order.lots).toFixed(2));
            const avgEntry =
              (pos.entryPrice * pos.lots + order.entryPrice * order.lots) /
              Math.max(0.01, totalLots);
            return {
              ...pos,
              lots: totalLots,
              entryPrice: avgEntry,
              stopLoss: order.stopLoss,
              takeProfit: order.takeProfit,
              takeProfit2: order.takeProfit2 ?? pos.takeProfit2,
              scaleInsCount: (pos.scaleInsCount || 0) + 1,
            };
          })
        );
        setSimAccount((acc) => ({
          ...acc,
          dailyTradeCount: (acc.dailyTradeCount || 0) + 1,
        }));
        setPresetSignal(null);
        return;
      }

      const newPos: ActivePosition = {
        id: order.positionIdOverride || `pos_${Date.now()}_${Math.floor(Math.random() * 100)}`,
        symbol: order.symbol,
        side: order.side,
        lots: order.lots,
        entryPrice: order.entryPrice,
        currentPrice: order.entryPrice,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        takeProfit2: order.takeProfit2,
        breakevenMoved: false,
        scaleInsCount: 0,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        openTime: Math.floor(Date.now() / 1000),
        ...(order.ticketId ? { ticketId: order.ticketId } : {}),
        ...(order.plannedEntry !== undefined ? { plannedEntry: order.plannedEntry } : {}),
        ...(order.plannedSL !== undefined ? { plannedSL: order.plannedSL } : {}),
        ...(order.plannedTP !== undefined ? { plannedTP: order.plannedTP } : {}),
        ...(order.stressedCostEstimateUSD !== undefined
          ? { stressedCostEstimateUSD: order.stressedCostEstimateUSD }
          : {}),
      };

      setSimPositions((prev) => [...prev, newPos]);
      setSimAccount((acc) => ({
        ...acc,
        openPositionCount: acc.openPositionCount + 1,
        dailyTradeCount: (acc.dailyTradeCount || 0) + 1,
      }));
      setPresetSignal(null);
    },
    [
      settings.emergencyTradingDisabled,
      riskConfig.killSwitchActive,
      riskConfig.maxEntriesPerSymbol,
      environment,
      mt5Status.connected,
      simPositions,
      botSettings.enableMultipleEntries,
    ]
  );

  // Move Position SL to Breakeven
  const handleMoveToBreakeven = useCallback((id: string) => {
    setSimPositions((prev) =>
      prev.map((pos) => {
        if (pos.id !== id || pos.breakevenMoved) return pos;
        const spec = INSTRUMENT_SPECS[pos.symbol] || INSTRUMENT_SPECS['XAU/USD'];
        const buffer = spec.typicalSpreadPoints * 0.25;
        const bePrice = pos.side === 'LONG' ? pos.entryPrice + buffer : pos.entryPrice - buffer;
        return {
          ...pos,
          stopLoss: bePrice,
          breakevenMoved: true,
        };
      })
    );
  }, []);

  // Scale-In Multiple Entry
  const handleScaleInPosition = useCallback(
    (id: string) => {
      if (settings.emergencyTradingDisabled || riskConfig.killSwitchActive) return;
      if (environment === 'MT5_DEMO' && !mt5Status.connected) return;
      if (!botSettings.enableMultipleEntries) return;
      const pos = simPositions.find((p) => p.id === id);
      if (!pos) return;
      if ((pos.scaleInsCount || 0) + 1 >= riskConfig.maxEntriesPerSymbol) return;
      if ((simAccount.dailyTradeCount || 0) >= riskConfig.maxDailyTrades) return;

      const ticker = simTickers[pos.symbol];
      if (!ticker) return;
      const spec = INSTRUMENT_SPECS[pos.symbol] || INSTRUMENT_SPECS['XAU/USD'];
      const fillPrice = pos.side === 'LONG' ? ticker.ask : ticker.bid;

      const evalRes = evaluateOrderRisk(
        {
          symbol: pos.symbol,
          side: pos.side,
          entryPrice: fillPrice,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          spreadPoints: ticker.spreadPoints,
        },
        { ...simAccount, openPositionCount: Math.max(0, simAccount.openPositionCount - 1) },
        riskConfig,
        spec
      );

      if (!evalRes.allowed) return;

      const addLots = Math.max(spec.minLot, Number((pos.lots * 0.5).toFixed(2)));
      setSimPositions((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const totalLots = Number((item.lots + addLots).toFixed(2));
          const weightedEntry =
            (item.entryPrice * item.lots + fillPrice * addLots) / totalLots;
          return {
            ...item,
            lots: totalLots,
            entryPrice: weightedEntry,
            scaleInsCount: (item.scaleInsCount || 0) + 1,
          };
        })
      );

      setSimAccount((acc) => ({
        ...acc,
        dailyTradeCount: (acc.dailyTradeCount || 0) + 1,
      }));
    },
    [
      settings.emergencyTradingDisabled,
      riskConfig,
      environment,
      mt5Status.connected,
      botSettings.enableMultipleEntries,
      simPositions,
      simAccount,
      simTickers,
    ]
  );

  // Simulation Tick Loop (isolated strictly to SIMULATION environment)
  useEffect(() => {
    const tickInterval = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      setSessionInfo(getActiveMarketSession());

      if (environment !== 'SIMULATION') {
        return;
      }

      const nextTickers: Record<string, MarketTicker> = {};
      setSimTickers((prev) => {
        const updated = { ...prev };
        for (const sym of Object.keys(updated)) {
          const t = updated[sym];
          const volatility =
            sym === 'BTC/USD'
              ? 8.5
              : sym === 'XAU/USD'
              ? 0.35
              : sym === 'USD/JPY'
              ? 0.045
              : 0.00008;
          const delta = (Math.random() - 0.495) * volatility;
          const newBid = Number((t.bid + delta).toFixed(t.digits));
          const newAsk = Number((newBid + t.spreadPoints).toFixed(t.digits));
          const high24 = Math.max(t.high24h, newAsk);
          const low24 = Math.min(t.low24h, newBid);
          const changeUSD = newBid - (t.bid - t.change24hUSD);
          const changePct = (changeUSD / (newBid - changeUSD)) * 100;

          const updatedTicker: MarketTicker = {
            ...t,
            bid: newBid,
            ask: newAsk,
            high24h: high24,
            low24h: low24,
            change24hUSD: Number(changeUSD.toFixed(t.digits)),
            change24hPercent: Number(changePct.toFixed(2)),
          };
          updated[sym] = updatedTicker;
          nextTickers[sym] = updatedTicker;
        }
        return updated;
      });

      setCandleStore((prevStore) => {
        const updated = { ...prevStore };
        for (const sym of Object.keys(updated)) {
          const t = nextTickers[sym] || simTickers[sym];
          if (!t) continue;
          updated[sym] = updateOrAppendLiveCandle(updated[sym] || [], t.bid, 5, nowSec);
        }
        return updated;
      });

      setAlerts((prevAlerts) =>
        prevAlerts.map((alert) => {
          if (alert.status !== 'ACTIVE') return alert;
          const ticker = nextTickers[alert.symbol] || simTickers[alert.symbol];
          if (!ticker) return alert;

          const currentPrice = ticker.bid;
          const prevPrice = prevPricesRef.current[alert.symbol] ?? currentPrice - 0.0001;
          const evalResult = evaluateAlertTrigger(alert, currentPrice, prevPrice);

          if (evalResult.triggered) {
            const triggeredTime = Math.floor(Date.now() / 1000);
            playAlertChime();
            setAlertToasts((toasts) => [
              {
                id: `toast_${Date.now()}_${Math.random()}`,
                alert,
                message:
                  evalResult.reason || `${alert.symbol} triggered alert at ${alert.targetPrice}`,
                timestamp: triggeredTime,
              },
              ...toasts.slice(0, 4),
            ]);
            return {
              ...alert,
              status: alert.oneShot ? ('TRIGGERED' as const) : ('ACTIVE' as const),
              triggeredAt: triggeredTime,
              triggeredPrice: currentPrice,
            };
          }
          return alert;
        })
      );

      for (const sym of Object.keys(nextTickers)) {
        prevPricesRef.current[sym] = nextTickers[sym].bid;
      }

      setSimPositions((prevPositions) => {
        if (prevPositions.length === 0) return prevPositions;
        const remaining: ActivePosition[] = [];
        let realizedDelta = 0;
        let consecutiveLost = false;
        let closedAnyWin = false;

        for (const pos of prevPositions) {
          const ticker = nextTickers[pos.symbol] || simTickers[pos.symbol];
          const spec = INSTRUMENT_SPECS[pos.symbol] || INSTRUMENT_SPECS['XAU/USD'];
          if (!ticker) {
            remaining.push(pos);
            continue;
          }

          const currentPrice = pos.side === 'LONG' ? ticker.bid : ticker.ask;
          let activeSL = pos.stopLoss;
          let isBreakeven = Boolean(pos.breakevenMoved);
          if (botSettings.enableBreakeven && !isBreakeven) {
            const beCheck = evaluateBreakevenUpdate({
              side: pos.side,
              entryPrice: pos.entryPrice,
              stopLoss: pos.stopLoss,
              currentPrice,
              triggerR: botSettings.breakevenTriggerR,
              spreadPoints: ticker.spreadPoints,
              alreadyMoved: isBreakeven,
            });
            if (beCheck.shouldMove) {
              activeSL = beCheck.newStopLoss;
              isBreakeven = true;
            }
          }

          let exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | null = null;
          let exitPrice = currentPrice;

          if (pos.side === 'LONG') {
            if (currentPrice <= activeSL) {
              exitReason = 'STOP_LOSS';
              exitPrice = activeSL - spec.typicalSpreadPoints * 0.5;
            } else if (currentPrice >= pos.takeProfit) {
              exitReason = 'TAKE_PROFIT';
              exitPrice = pos.takeProfit;
            }
          } else {
            if (currentPrice >= activeSL) {
              exitReason = 'STOP_LOSS';
              exitPrice = activeSL + spec.typicalSpreadPoints * 0.5;
            } else if (currentPrice <= pos.takeProfit) {
              exitReason = 'TAKE_PROFIT';
              exitPrice = pos.takeProfit;
            }
          }

          if (exitReason) {
            const priceDelta =
              pos.side === 'LONG' ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
            const grossPnL = priceDelta * spec.lotSize * pos.lots;
            const comm = spec.commissionPerLotUSD * pos.lots * 2;
            const netPnL = grossPnL - comm;
            realizedDelta += netPnL;
            if (netPnL < 0) consecutiveLost = true;
            else closedAnyWin = true;

            const rMult =
              Math.abs(pos.entryPrice - pos.stopLoss) > 0
                ? priceDelta / Math.abs(pos.entryPrice - pos.stopLoss)
                : 0;

            const baseClosed: BacktestTrade = {
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
              pnlPercent: (netPnL / simAccount.equity) * 100,
              rMultiple: Number(rMult.toFixed(2)),
              commissionUSD: comm,
              spreadCostUSD: spec.typicalSpreadPoints * spec.lotSize * pos.lots,
              slippageUSD: spec.typicalSpreadPoints * 0.5 * spec.lotSize * pos.lots,
              netPnlUSD: netPnL,
              durationMinutes: Math.max(1, Math.round((Date.now() / 1000 - pos.openTime) / 60)),
              ...(pos.ticketId ? { ticketId: pos.ticketId } : {}),
              ...(pos.plannedEntry !== undefined ? { plannedEntry: pos.plannedEntry } : {}),
              ...(pos.plannedSL !== undefined ? { plannedSL: pos.plannedSL } : {}),
              ...(pos.plannedTP !== undefined ? { plannedTP: pos.plannedTP } : {}),
              ...(pos.stressedCostEstimateUSD !== undefined
                ? { stressedCostEstimateUSD: pos.stressedCostEstimateUSD }
                : {}),
            };
            const linkedTicket = pos.ticketId
              ? tradeTickets.find((tk) => tk.id === pos.ticketId) || null
              : null;
            const postReview = evaluatePostTradeReview(baseClosed, linkedTicket);
            const closedTrade: BacktestTrade = {
              ...baseClosed,
              processGrade: postReview.processGrade,
              outcomeGrade: postReview.outcomeGrade,
              processNotes: postReview.notes.join(' | '),
            };

            setSimTradeHistory((h) => [closedTrade, ...h]);
            void persistClosedTrade(closedTrade, 'SIMULATION');
          } else {
            const priceDelta =
              pos.side === 'LONG' ? currentPrice - pos.entryPrice : pos.entryPrice - currentPrice;
            const grossPnL = priceDelta * spec.lotSize * pos.lots;
            const comm = spec.commissionPerLotUSD * pos.lots * 2;
            const netUnrealized = grossPnL - comm;

            remaining.push({
              ...pos,
              stopLoss: activeSL,
              breakevenMoved: isBreakeven,
              currentPrice,
              unrealizedPnL: netUnrealized,
              unrealizedPnLPercent: (netUnrealized / simAccount.equity) * 100,
            });
          }
        }

        if (realizedDelta !== 0 || consecutiveLost || closedAnyWin) {
          setSimAccount((acc) => {
            const newBal = acc.balance + realizedDelta;
            const newConsec = consecutiveLost ? acc.consecutiveLosses + 1 : 0;
            return {
              ...acc,
              balance: newBal,
              equity: newBal,
              totalRealizedPnL: acc.totalRealizedPnL + realizedDelta,
              dailyRealizedPnL: acc.dailyRealizedPnL + realizedDelta,
              peakEquity: Math.max(acc.peakEquity, newBal),
              consecutiveLosses: newConsec,
              openPositionCount: remaining.length,
            };
          });
        }
        return remaining;
      });

      setSimAccount((acc) => {
        const totalUnrealized = simPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
        const eq = acc.balance + totalUnrealized;
        const usedMarg = simPositions.reduce((sum, p) => {
          const spec = INSTRUMENT_SPECS[p.symbol] || INSTRUMENT_SPECS['XAU/USD'];
          return sum + p.lots * spec.lotSize * p.entryPrice * 0.01;
        }, 0);
        return {
          ...acc,
          equity: eq,
          dailyUnrealizedPnL: totalUnrealized,
          usedMargin: usedMarg,
          freeMargin: Math.max(0, eq - usedMarg),
          openPositionCount: simPositions.length,
        };
      });
    }, 1000);

    return () => clearInterval(tickInterval);
  }, [
    environment,
    simTickers,
    simPositions,
    simAccount.equity,
    botSettings.enableBreakeven,
    botSettings.breakevenTriggerR,
    playAlertChime,
    persistClosedTrade,
  ]);

  // Auto-Execute Simulation Bot Signals when enabled & not halted
  useEffect(() => {
    if (environment !== 'SIMULATION') return;
    if (!botSettings.autoTradeEnabled) return;
    if (settings.emergencyTradingDisabled || riskConfig.killSwitchActive) return;
    if (currentSignal.action === 'NO_TRADE') return;
    if (!currentSignal.positionSizing.allowed) return;
    if ((simAccount.dailyTradeCount || 0) >= riskConfig.maxDailyTrades) return;

    const now = Date.now();
    if (now - lastAutoTradeAtRef.current < 25000) return;

    const existingSameSymbol = simPositions.find((p) => p.symbol === currentSignal.symbol);
    if (existingSameSymbol) {
      if (!botSettings.enableMultipleEntries) return;
      if (existingSameSymbol.side !== currentSignal.action) return;
      if ((existingSameSymbol.scaleInsCount || 0) + 1 >= riskConfig.maxEntriesPerSymbol) return;
    } else if (simPositions.length >= riskConfig.maxOpenPositions) {
      return;
    }

    lastAutoTradeAtRef.current = now;
    const autoLots =
      settings.sizingMode === 'FIXED_LOT'
        ? settings.fixedPositionSize
        : currentSignal.positionSizing.recommendedLots;

    handlePlaceOrder({
      symbol: currentSignal.symbol,
      side: currentSignal.action,
      lots: autoLots,
      entryPrice: currentSignal.entryZone.recommended,
      stopLoss: currentSignal.stopLoss,
      takeProfit: currentSignal.takeProfit1,
      takeProfit2: currentSignal.takeProfit2,
    });
  }, [
    environment,
    botSettings.autoTradeEnabled,
    botSettings.enableMultipleEntries,
    settings.emergencyTradingDisabled,
    settings.sizingMode,
    settings.fixedPositionSize,
    riskConfig.killSwitchActive,
    riskConfig.maxDailyTrades,
    riskConfig.maxEntriesPerSymbol,
    riskConfig.maxOpenPositions,
    currentSignal,
    simAccount.dailyTradeCount,
    simPositions,
    handlePlaceOrder,
  ]);

  // Price Alerts Handlers
  const handleAddAlert = useCallback((newAlert: Omit<PriceAlert, 'id' | 'createdAt' | 'status'>) => {
    const alert: PriceAlert = {
      ...newAlert,
      id: `alert_${Date.now()}`,
      status: 'ACTIVE',
      createdAt: Math.floor(Date.now() / 1000),
    };
    setAlerts((prev) => [alert, ...prev]);
  }, []);

  const handleToggleAlertStatus = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        return { ...a, status: a.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' };
      })
    );
  }, []);

  const handleDeleteAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Close Active Position manually (Simulation)
  const handleClosePosition = useCallback(
    (id: string) => {
      if (environment !== 'SIMULATION') return;
      const pos = simPositions.find((p) => p.id === id);
      if (!pos) return;
      const ticker = simTickers[pos.symbol];
      const spec = INSTRUMENT_SPECS[pos.symbol] || INSTRUMENT_SPECS['XAU/USD'];
      const exitPrice = pos.side === 'LONG' ? ticker.bid : ticker.ask;

      const priceDelta =
        pos.side === 'LONG' ? exitPrice - pos.entryPrice : pos.entryPrice - exitPrice;
      const grossPnL = priceDelta * spec.lotSize * pos.lots;
      const comm = spec.commissionPerLotUSD * pos.lots * 2;
      const netPnL = grossPnL - comm;

      const baseClosed: BacktestTrade = {
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
        pnlPercent: (netPnL / simAccount.equity) * 100,
        rMultiple:
          Math.abs(pos.entryPrice - pos.stopLoss) > 0
            ? Number((priceDelta / Math.abs(pos.entryPrice - pos.stopLoss)).toFixed(2))
            : 0,
        commissionUSD: comm,
        spreadCostUSD: spec.typicalSpreadPoints * spec.lotSize * pos.lots,
        slippageUSD: 0,
        netPnlUSD: netPnL,
        durationMinutes: Math.max(1, Math.round((Date.now() / 1000 - pos.openTime) / 60)),
        ...(pos.ticketId ? { ticketId: pos.ticketId } : {}),
        ...(pos.plannedEntry !== undefined ? { plannedEntry: pos.plannedEntry } : {}),
        ...(pos.plannedSL !== undefined ? { plannedSL: pos.plannedSL } : {}),
        ...(pos.plannedTP !== undefined ? { plannedTP: pos.plannedTP } : {}),
        ...(pos.stressedCostEstimateUSD !== undefined
          ? { stressedCostEstimateUSD: pos.stressedCostEstimateUSD }
          : {}),
      };

      const linkedTicket = pos.ticketId
        ? tradeTickets.find((tk) => tk.id === pos.ticketId) || null
        : null;
      const postReview = evaluatePostTradeReview(baseClosed, linkedTicket);
      const closedTrade: BacktestTrade = {
        ...baseClosed,
        processGrade: postReview.processGrade,
        outcomeGrade: postReview.outcomeGrade,
        processNotes: postReview.notes.join(' | '),
      };

      setSimTradeHistory((h) => [closedTrade, ...h]);
      void persistClosedTrade(closedTrade, 'SIMULATION');
      setSimPositions((prev) => prev.filter((p) => p.id !== id));
      setSimAccount((acc) => ({
        ...acc,
        balance: acc.balance + netPnL,
        equity: acc.equity + netPnL,
        dailyRealizedPnL: acc.dailyRealizedPnL + netPnL,
        totalRealizedPnL: acc.totalRealizedPnL + netPnL,
        openPositionCount: Math.max(0, acc.openPositionCount - 1),
      }));
    },
    [environment, simPositions, simTickers, simAccount.equity, persistClosedTrade, tradeTickets]
  );

  // Quick Execute Signal
  const handleQuickExecuteSignal = useCallback((sig: TradingSignal) => {
    setPresetSignal({
      side: sig.action === 'LONG' ? 'LONG' : 'SHORT',
      entryPrice: sig.entryZone.recommended,
      stopLoss: sig.stopLoss,
      takeProfit: sig.takeProfit1,
    });
    setActiveTab('terminal');
  }, []);

  // APX Trade Desk Workflow Handlers (Proposal -> Stressed Risk -> Out-of-Band ID Approval -> Single Send)
  const handleCreateTicketProposal = useCallback(
    (input: CreateTradeProposalInput) => {
      const seq = ticketSeqRef.current++;
      const ticket = createTradeProposal({ ...input, sequence: seq });
      setTradeTickets((prev) => [ticket, ...prev]);
      setActiveTicketId(ticket.id);
      if (user) {
        void saveTradeTicketToFirestore(user.uid, ticket);
      }
      return ticket;
    },
    [user]
  );

  const handleDraftSignalTicket = useCallback(
    (sig: TradingSignal) => {
      if (sig.action === 'NO_TRADE') return;
      handleCreateTicketProposal({
        environment,
        source: 'STRATEGY_SIGNAL',
        symbol: sig.symbol,
        timeframe,
        side: sig.action === 'LONG' ? 'LONG' : 'SHORT',
        entryPrice: sig.entryZone.recommended,
        stopLoss: sig.stopLoss,
        takeProfit: sig.takeProfit1,
        takeProfit2: sig.takeProfit2,
        thesis: `${sig.botMode} confluence ${sig.action} setup (${sig.qualityScore}/100) on ${sig.symbol} ${timeframe}`,
        evidence:
          sig.supportingReasons.length > 0
            ? sig.supportingReasons
            : [`Bot quality score ${sig.qualityScore}/100`],
        invalidation:
          sig.invalidationConditions[0] || `Close beyond stop loss ${sig.stopLoss}`,
      });
      setActiveTab('terminal');
    },
    [environment, timeframe, handleCreateTicketProposal]
  );

  const handleRunTicketRiskReview = useCallback(
    (ticketId: string) => {
      setTradeTickets((prev) =>
        prev.map((tk) => {
          if (tk.id !== ticketId) return tk;
          const ticker = visibleTickers[tk.symbol];
          const reviewed = reviewProposalWithStressedRisk(tk, {
            account: activeAccount,
            riskConfig: {
              ...riskConfig,
              killSwitchActive: riskConfig.killSwitchActive || settings.emergencyTradingDisabled,
            },
            sizingMode: settings.sizingMode,
            fixedPositionSize: settings.fixedPositionSize,
            spreadPoints: ticker?.spreadPoints,
            emergencyTradingDisabled: settings.emergencyTradingDisabled,
            mt5Connected: mt5Status.connected,
          });
          if (user) {
            void saveTradeTicketToFirestore(user.uid, reviewed);
          }
          return reviewed;
        })
      );
    },
    [
      visibleTickers,
      activeAccount,
      riskConfig,
      settings.emergencyTradingDisabled,
      settings.sizingMode,
      settings.fixedPositionSize,
      mt5Status.connected,
      user,
    ]
  );

  const handleApproveTicketById = useCallback(
    (ticketId: string, phrase: string): { ok: boolean; error?: string } => {
      const target = tradeTickets.find((t) => t.id === ticketId);
      if (!target) return { ok: false, error: 'Ticket not found.' };
      const res = approveTicketById(
        target,
        phrase,
        user?.email || 'LocalTrader',
        Date.now()
      );
      setTradeTickets((prev) => prev.map((t) => (t.id === ticketId ? res.ticket : t)));
      if (user) {
        void saveTradeTicketToFirestore(user.uid, res.ticket);
      }
      if (!res.ok) {
        return { ok: false, error: res.error };
      }
      return { ok: true };
    },
    [tradeTickets, user]
  );

  const handleExecuteTicketOnce = useCallback(
    (ticketId: string): { ok: boolean; error?: string } => {
      const target = tradeTickets.find((t) => t.id === ticketId);
      if (!target) return { ok: false, error: 'Ticket not found.' };

      const posId = `pos_${Date.now()}_${Math.floor(Math.random() * 100)}`;
      const res = executeApprovedTicketOnce(target, {
        positionId: posId,
        emergencyTradingDisabled:
          settings.emergencyTradingDisabled || riskConfig.killSwitchActive,
        mt5Connected: mt5Status.connected,
      });

      setTradeTickets((prev) => prev.map((t) => (t.id === ticketId ? res.ticket : t)));
      if (user) {
        void saveTradeTicketToFirestore(user.uid, res.ticket);
      }
      if (!res.ok) {
        return { ok: false, error: res.error };
      }

      handlePlaceOrder({
        symbol: res.orderPayload.symbol,
        side: res.orderPayload.side,
        lots: res.orderPayload.lots,
        entryPrice: res.orderPayload.entryPrice,
        stopLoss: res.orderPayload.stopLoss,
        takeProfit: res.orderPayload.takeProfit,
        takeProfit2: res.orderPayload.takeProfit2,
        positionIdOverride: posId,
        ticketId: res.orderPayload.ticketId,
        plannedEntry: res.orderPayload.plannedEntry,
        plannedSL: res.orderPayload.plannedSL,
        plannedTP: res.orderPayload.plannedTP,
        stressedCostEstimateUSD: res.orderPayload.stressedCostEstimateUSD,
      });

      return { ok: true };
    },
    [
      tradeTickets,
      settings.emergencyTradingDisabled,
      riskConfig.killSwitchActive,
      mt5Status.connected,
      user,
      handlePlaceOrder,
    ]
  );

  const handleCancelTicket = useCallback(
    (ticketId: string) => {
      setTradeTickets((prev) =>
        prev.map((t) => {
          if (t.id !== ticketId || t.status === 'EXECUTED') return t;
          const cancelled: TradeTicket = { ...t, status: 'CANCELLED' };
          if (user) {
            void saveTradeTicketToFirestore(user.uid, cancelled);
          }
          return cancelled;
        })
      );
    },
    [user]
  );

  // Global Emergency Trading-Disable Toggle
  const handleToggleEmergencyDisable = useCallback(() => {
    const willHalt = !(settings.emergencyTradingDisabled || riskConfig.killSwitchActive);
    updateSettings({ emergencyTradingDisabled: willHalt });
    setRiskConfig((prev) => ({ ...prev, killSwitchActive: willHalt }));
    if (willHalt) {
      setSimPendingOrders([]);
      setBotSettings((b) => ({ ...b, autoTradeEnabled: false }));
    }
  }, [settings.emergencyTradingDisabled, riskConfig.killSwitchActive, updateSettings]);

  // Reset Simulation Account
  const handleResetSimulationAccount = useCallback(() => {
    setSimAccount(INITIAL_SIMULATION_ACCOUNT);
    setSimPositions([]);
    setSimPendingOrders([]);
    setSimTradeHistory([]);
    setRiskConfig({
      ...DEFAULT_RISK_CONFIG,
      riskPercentagePerTrade: settings.riskPercentagePerTrade,
      killSwitchActive: settings.emergencyTradingDisabled,
    });
    setBotSettings((prev) => ({ ...prev, autoTradeEnabled: false }));
  }, [settings.riskPercentagePerTrade, settings.emergencyTradingDisabled]);

  // Save MT5 Demo Non-Secret Profile
  const handleSaveMt5Profile = useCallback(
    async (profile: MT5AccountProfile, rotateToken = false): Promise<string | null> => {
      setMt5Profile(profile);
      const token = await getIdToken();
      if (!token) return null;
      const res = await fetch('/api/mt5-demo/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...profile, rotateToken }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      await refreshConnections();
      return data.bridgeToken || null;
    },
    [getIdToken, setMt5Profile, refreshConnections]
  );

  const handleDisconnectMt5 = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    await fetch('/api/mt5-demo/disconnect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    await refreshConnections();
  }, [getIdToken, refreshConnections]);

  const activeAlertsCount = alerts.filter((a) => a.status === 'ACTIVE').length;
  const isEmergencyHalted =
    settings.emergencyTradingDisabled || riskConfig.killSwitchActive;

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-sans relative">
      <OfflineIndicator />

      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        environment={environment}
        onChangeEnvironment={setEnvironment}
        account={activeAccount}
        riskConfig={riskConfig}
        emergencyTradingDisabled={settings.emergencyTradingDisabled}
        onToggleEmergencyDisable={handleToggleEmergencyDisable}
        onOpenBrokerModal={() => setIsBrokerModalOpen(true)}
        onOpenAlertsModal={() => setIsAlertsModalOpen(true)}
        onOpenSignInModal={() => setIsSignInModalOpen(true)}
        onResetAccount={handleResetSimulationAccount}
        sessionName={sessionInfo.sessionName}
        brokerTimeUTC2={sessionInfo.currentTimeUTC2}
        activeAlertsCount={activeAlertsCount}
      />

      <ConnectionStatusBar
        health={health}
        environment={environment}
        emergencyTradingDisabled={isEmergencyHalted}
        onRefresh={() => void refreshConnections()}
      />

      <EmergencyStopBanner
        active={isEmergencyHalted}
        onRelease={handleToggleEmergencyDisable}
      />

      <main className="flex-1 p-3 lg:p-4 max-w-[1720px] w-full mx-auto">
        {activeTab === 'terminal' && (
          <TerminalView
            environment={environment}
            mt5Status={mt5Status}
            tickers={visibleTickers}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={setSelectedSymbol}
            timeframe={timeframe}
            onSelectTimeframe={setTimeframe}
            activeDisplayCandles={activeDisplayCandles}
            currentSignal={currentSignal}
            positions={activePositions}
            pendingOrders={environment === 'SIMULATION' ? simPendingOrders : []}
            tradeHistory={activeTradeHistory}
            alerts={alerts}
            account={activeAccount}
            riskConfig={riskConfig}
            botSettings={botSettings}
            sizingMode={settings.sizingMode}
            fixedPositionSize={settings.fixedPositionSize}
            emergencyTradingDisabled={isEmergencyHalted}
            upcomingEvents={UPCOMING_ECONOMIC_EVENTS}
            presetSignal={presetSignal}
            onUpdateBotSettings={handleUpdateBotSettings}
            onPlaceOrder={handlePlaceOrder}
            onExecuteSignal={handleQuickExecuteSignal}
            onDraftSignalTicket={handleDraftSignalTicket}
            tickets={tradeTickets}
            activeTicketId={activeTicketId}
            onSelectTicket={setActiveTicketId}
            onCreateProposal={handleCreateTicketProposal}
            onRunRiskReview={handleRunTicketRiskReview}
            onApproveTicket={handleApproveTicketById}
            onExecuteTicketOnce={handleExecuteTicketOnce}
            onCancelTicket={handleCancelTicket}
            onClosePosition={handleClosePosition}
            onMoveToBreakeven={handleMoveToBreakeven}
            onScaleInPosition={handleScaleInPosition}
            onCancelPendingOrder={(id) =>
              setSimPendingOrders((o) => o.filter((p) => p.id !== id))
            }
            onOpenAlertsModal={(sym) => {
              if (sym) setSelectedSymbol(sym);
              setIsAlertsModalOpen(true);
            }}
            onCaptureToVision={(dataUrl) => {
              setCapturedScreenshot(dataUrl);
              setSignalsSubTab('vision');
              setActiveTab('signals');
            }}
            onAskAI={() => {
              setSignalsSubTab('ai');
              setActiveTab('signals');
            }}
            onOpenSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'signals' && (
          <SignalsWorkspaceView
            subTab={signalsSubTab}
            onChangeSubTab={setSignalsSubTab}
            environment={environment}
            selectedSymbol={selectedSymbol}
            timeframe={timeframe}
            tickers={visibleTickers}
            currentSignal={currentSignal}
            botSettings={botSettings}
            onUpdateBotSettings={handleUpdateBotSettings}
            onExecuteSignal={handleQuickExecuteSignal}
            onDraftSignalTicket={handleDraftSignalTicket}
            onDraftCustomTicket={(draft) => {
              handleCreateTicketProposal({
                ...draft,
                environment: 'SIMULATION',
              });
              setActiveTab('terminal');
            }}
            strategyHandoff={strategyHandoff}
            onDismissHandoff={() => setStrategyHandoff(null)}
            capturedScreenshot={capturedScreenshot}
            onClearCapturedScreenshot={() => setCapturedScreenshot(null)}
            onApplyVisionLevels={(levels) => {
              if (levels.symbol && visibleTickers[levels.symbol]) {
                setSelectedSymbol(levels.symbol);
              }
              setPresetSignal({
                side: levels.side,
                entryPrice: levels.entryPrice,
                stopLoss: levels.stopLoss,
                takeProfit: levels.takeProfit,
              });
              setActiveTab('terminal');
            }}
            savedChartReports={chartIntelligenceJournal.map((e) => e.report)}
            onSaveChartReportToJournal={(rep, score) => {
              setChartIntelligenceJournal((prev) => {
                if (prev.some((x) => x.report.id === rep.id)) return prev;
                return [{ report: rep, score }, ...prev];
              });
            }}
            onSyncChartHistoryLoaded={(reports) => {
              setChartIntelligenceJournal((prev) => {
                const existingIds = new Set(prev.map((p) => p.report.id));
                const additions = reports
                  .filter((r) => !existingIds.has(r.id))
                  .map((r) => ({
                    report: r,
                    score: Array.isArray(r.confluenceFactors)
                      ? calculateWeightedConfluenceScore(r.confluenceFactors).totalScore
                      : 0,
                  }));
                return additions.length > 0 ? [...prev, ...additions] : prev;
              });
            }}
            onSendToStrategyEngine={(handoff) => {
              setStrategyHandoff(handoff);
              const cleanSym = handoff.symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
              const matched = Object.keys(visibleTickers).find(
                (sym) => sym.replace(/[^A-Z0-9]/gi, '').toUpperCase() === cleanSym
              );
              if (matched) {
                setSelectedSymbol(matched);
              }
              setSignalsSubTab('engine');
            }}
            upcomingEvents={UPCOMING_ECONOMIC_EVENTS}
            tradeHistory={activeTradeHistory}
            positions={activePositions}
            account={activeAccount}
            riskConfig={riskConfig}
            sessionName={sessionInfo.sessionName}
          />
        )}

        {activeTab === 'risk' && (
          <RiskManagementView
            config={{ ...riskConfig, killSwitchActive: isEmergencyHalted }}
            account={activeAccount}
            onUpdateConfig={(u) => {
              setRiskConfig((prev) => ({ ...prev, ...u }));
              if (u.riskPercentagePerTrade !== undefined) {
                updateSettings({ riskPercentagePerTrade: u.riskPercentagePerTrade });
              }
            }}
            onToggleKillSwitch={handleToggleEmergencyDisable}
          />
        )}

        {activeTab === 'backtest' && (
          <BacktestView
            currentSymbol={selectedSymbol}
            m5Candles={candleStore[selectedSymbol] || []}
            riskConfig={riskConfig}
          />
        )}

        {activeTab === 'journal' && (
          <JournalView
            trades={activeTradeHistory}
            tickets={tradeTickets}
            chartIntelligenceEntries={chartIntelligenceJournal}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={handleUpdateUserSettings}
            environment={environment}
            onChangeEnvironment={setEnvironment}
            mt5Status={mt5Status}
            connectionHealth={health}
            onSaveMt5Profile={handleSaveMt5Profile}
            onDisconnectMt5={handleDisconnectMt5}
            onOpenSignIn={() => setIsSignInModalOpen(true)}
          />
        )}
      </main>

      <PriceAlertsModal
        isOpen={isAlertsModalOpen}
        onClose={() => setIsAlertsModalOpen(false)}
        alerts={alerts}
        tickers={visibleTickers}
        selectedSymbol={selectedSymbol}
        onAddAlert={handleAddAlert}
        onToggleAlertStatus={handleToggleAlertStatus}
        onDeleteAlert={handleDeleteAlert}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
      />

      <BrokerModal
        isOpen={isBrokerModalOpen}
        onClose={() => setIsBrokerModalOpen(false)}
        environment={environment}
        onChangeEnvironment={setEnvironment}
        mt5Status={mt5Status}
        onOpenSettings={() => setActiveTab('settings')}
      />

      <SignInModal
        isOpen={isSignInModalOpen}
        onClose={() => setIsSignInModalOpen(false)}
        activeEnvironment={environment}
        mt5Profile={mt5Profile}
        onOpenSettings={() => setActiveTab('settings')}
      />

      <AlertToastStack
        toasts={alertToasts}
        onDismiss={(id) => setAlertToasts((t) => t.filter((item) => item.id !== id))}
      />
    </div>
  );
}

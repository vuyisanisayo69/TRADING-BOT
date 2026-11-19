import type { AccountState, RiskConfig } from '../utils/risk.ts';
import type { BotMode, BotSettings } from '../utils/strategy.ts';
import type { ActivePosition, PendingOrder } from '../components/PositionsAndOrders.tsx';
import type { BacktestTrade } from '../utils/backtest.ts';

export type TradingEnvironment = 'SIMULATION' | 'MT5_DEMO';

export type PrimaryTab =
  | 'terminal'
  | 'signals'
  | 'risk'
  | 'backtest'
  | 'journal'
  | 'settings';

export type SignalsSubTab = 'engine' | 'intelligence' | 'vision' | 'ai' | 'crypto';

export type SizingMode = 'RISK_PERCENT' | 'FIXED_LOT';

export type TimeframeCode = 'M1' | 'M5' | 'M15' | 'H1' | 'H4';

export interface UserTradingSettings {
  symbols: string[];
  defaultSymbol: string;
  defaultTimeframe: TimeframeCode;
  enabledTimeframes: TimeframeCode[];
  botMode: BotMode;
  useHtfFilter: boolean;
  enableBreakeven: boolean;
  enableMultipleEntries: boolean;
  minBrainScore: number;
  sizingMode: SizingMode;
  fixedPositionSize: number;
  riskPercentagePerTrade: number;
  emergencyTradingDisabled: boolean;
}

export interface MT5AccountProfile {
  accountLabel: string;
  brokerName: string;
  brokerServer: string;
  demoAccountNumber: string;
  accountCurrency: string;
  leverage: number;
}

export interface MT5DemoBridgeStatus {
  configured: boolean;
  connected: boolean;
  status: 'DISCONNECTED' | 'AWAITING_EA_HEARTBEAT' | 'CONNECTED_DEMO';
  liveTradingEnabled: false;
  lastHeartbeatAt: number | null;
  bridgeEndpoint: string;
  profile: MT5AccountProfile;
  eaReportedAccount: {
    balance: number | null;
    equity: number | null;
    freeMargin: number | null;
    marginLevel: number | null;
    openPositionsCount: number;
    serverTime: string | null;
  } | null;
  eaReportedPositions: ActivePosition[];
  eaReportedSymbols: Record<string, { bid: number; ask: number; spreadPoints: number; timestamp: number }>;
  statusMessage: string;
}

export type ServiceState = 'CONNECTED' | 'SIMULATED' | 'DEGRADED' | 'DISCONNECTED' | 'OFFLINE';

export interface ConnectionHealthSnapshot {
  marketData: {
    state: ServiceState;
    label: string;
    detail: string;
  };
  mt5Ea: {
    state: ServiceState;
    label: string;
    detail: string;
  };
  backend: {
    state: ServiceState;
    label: string;
    latencyMs: number | null;
    detail: string;
  };
  database: {
    state: ServiceState;
    label: string;
    cloudSqlReady: boolean;
    firestoreReady: boolean;
    detail: string;
  };
}

export interface EnvironmentStateSnapshot {
  environment: TradingEnvironment;
  account: AccountState;
  positions: ActivePosition[];
  pendingOrders: PendingOrder[];
  tradeHistory: BacktestTrade[];
  riskConfig: RiskConfig;
  botSettings: BotSettings;
}

export const ALL_SUPPORTED_SYMBOLS = [
  'XAU/USD',
  'BTC/USD',
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'USD/CAD',
] as const;

export const ALL_SUPPORTED_TIMEFRAMES: TimeframeCode[] = ['M1', 'M5', 'M15', 'H1', 'H4'];

export const DEFAULT_USER_SETTINGS: UserTradingSettings = {
  symbols: ['XAU/USD', 'BTC/USD', 'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD'],
  defaultSymbol: 'XAU/USD',
  defaultTimeframe: 'M5',
  enabledTimeframes: ['M1', 'M5', 'M15', 'H1', 'H4'],
  botMode: 'BRAIN',
  useHtfFilter: true,
  enableBreakeven: true,
  enableMultipleEntries: true,
  minBrainScore: 68,
  sizingMode: 'RISK_PERCENT',
  fixedPositionSize: 0.1,
  riskPercentagePerTrade: 0.5,
  emergencyTradingDisabled: false,
};

export const DEFAULT_MT5_PROFILE: MT5AccountProfile = {
  accountLabel: 'Primary MT5 Demo',
  brokerName: '',
  brokerServer: '',
  demoAccountNumber: '',
  accountCurrency: 'USD',
  leverage: 100,
};

export const EMPTY_MT5_DEMO_ACCOUNT: AccountState = {
  initialBalance: 0,
  balance: 0,
  equity: 0,
  usedMargin: 0,
  freeMargin: 0,
  dailyRealizedPnL: 0,
  dailyUnrealizedPnL: 0,
  totalRealizedPnL: 0,
  peakEquity: 0,
  consecutiveLosses: 0,
  openPositionCount: 0,
  dailyTradeCount: 0,
};

import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { auth, db } from './firebase.ts';
import type {
  MT5AccountProfile,
  TradingEnvironment,
  UserTradingSettings,
} from '../types/trading.ts';
import type { AccountState, RiskConfig } from '../utils/risk.ts';
import type { BotSettings } from '../utils/strategy.ts';
import type { ActivePosition } from '../components/PositionsAndOrders.tsx';
import type { PriceAlert } from '../utils/alerts.ts';
import type { BacktestTrade } from '../utils/backtest.ts';
import type { TradeTicket } from '../utils/tradeDesk.ts';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
  };
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore client is offline — using local persistence until reconnected.');
    }
    return false;
  }
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.warn('Firestore operation warning:', JSON.stringify(errInfo));
  return errInfo;
}

export async function saveUserProfileToFirestore(params: {
  uid: string;
  email: string;
  displayName?: string | null;
  activeEnvironment: TradingEnvironment;
  emergencyTradingDisabled: boolean;
}) {
  const path = `users/${params.uid}`;
  try {
    await setDoc(
      doc(db, 'users', params.uid),
      {
        uid: params.uid,
        email: params.email,
        displayName: params.displayName || params.email.split('@')[0] || 'Trader',
        role: 'trader',
        activeEnvironment: params.activeEnvironment,
        emergencyTradingDisabled: Boolean(params.emergencyTradingDisabled),
        liveTradingEnabled: false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveUserSettingsToFirestore(uid: string, settings: UserTradingSettings) {
  const path = `users/${uid}/settings/preferences`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'settings', 'preferences'),
      {
        ...settings,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveEnvironmentWorkspaceToFirestore(
  uid: string,
  env: TradingEnvironment,
  payload: {
    accountProfile?: MT5AccountProfile;
    accountState: AccountState;
    riskConfig: RiskConfig;
    botSettings: BotSettings;
    positions: ActivePosition[];
  }
) {
  const path = `users/${uid}/environments/${env}`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'environments', env),
      {
        environment: env,
        accountLabel: payload.accountProfile?.accountLabel || (env === 'SIMULATION' ? 'Simulation Sandbox' : 'MT5 Demo Account'),
        brokerName: payload.accountProfile?.brokerName || '',
        brokerServer: payload.accountProfile?.brokerServer || '',
        demoAccountNumber: payload.accountProfile?.demoAccountNumber || '',
        accountState: payload.accountState,
        riskConfig: payload.riskConfig,
        botSettings: payload.botSettings,
        positions: payload.positions.slice(0, 50),
        liveTradingEnabled: false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveTradeJournalEntryToFirestore(
  uid: string,
  env: TradingEnvironment,
  trade: BacktestTrade
) {
  const path = `users/${uid}/journal/${trade.id}`;
  try {
    const cleanPayload = Object.fromEntries(
      Object.entries({
        ...trade,
        environment: env,
        savedAt: new Date().toISOString(),
      }).filter(([, val]) => val !== undefined)
    );
    await setDoc(doc(db, 'users', uid, 'journal', trade.id), cleanPayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveTradeTicketToFirestore(uid: string, ticket: TradeTicket) {
  const path = `users/${uid}/tickets/${ticket.id}`;
  try {
    const cleanTicket = Object.fromEntries(
      Object.entries({
        ...ticket,
        liveTradingEnabled: false as const,
        savedAt: new Date().toISOString(),
      }).filter(([, val]) => val !== undefined)
    );
    await setDoc(doc(db, 'users', uid, 'tickets', ticket.id), cleanTicket);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveAlertsToFirestore(uid: string, alerts: PriceAlert[]) {
  const basePath = `users/${uid}/alerts`;
  try {
    await Promise.all(
      alerts.slice(0, 30).map((alert) =>
        setDoc(doc(db, 'users', uid, 'alerts', alert.id), {
          id: alert.id,
          symbol: alert.symbol,
          targetPrice: alert.targetPrice,
          condition: alert.condition,
          status: alert.status,
          note: alert.note || '',
          oneShot: Boolean(alert.oneShot),
          createdAt: alert.createdAt,
        })
      )
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, basePath);
  }
}

export async function loadUserFirestoreWorkspace(uid: string): Promise<{
  profile: { activeEnvironment?: TradingEnvironment; emergencyTradingDisabled?: boolean } | null;
  settings: Partial<UserTradingSettings> | null;
  simulationEnv: any | null;
  mt5DemoEnv: any | null;
  journal: Array<BacktestTrade & { environment?: TradingEnvironment }>;
  tickets: TradeTicket[];
}> {
  let profile = null;
  let settings = null;
  let simulationEnv = null;
  let mt5DemoEnv = null;
  const journal: Array<BacktestTrade & { environment?: TradingEnvironment }> = [];
  const tickets: TradeTicket[] = [];

  try {
    const profileSnap = await getDoc(doc(db, 'users', uid));
    if (profileSnap.exists()) {
      profile = profileSnap.data() as any;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  try {
    const settingsSnap = await getDoc(doc(db, 'users', uid, 'settings', 'preferences'));
    if (settingsSnap.exists()) {
      settings = settingsSnap.data() as Partial<UserTradingSettings>;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}/settings/preferences`);
  }

  try {
    const simSnap = await getDoc(doc(db, 'users', uid, 'environments', 'SIMULATION'));
    if (simSnap.exists()) {
      simulationEnv = simSnap.data();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}/environments/SIMULATION`);
  }

  try {
    const mt5Snap = await getDoc(doc(db, 'users', uid, 'environments', 'MT5_DEMO'));
    if (mt5Snap.exists()) {
      mt5DemoEnv = mt5Snap.data();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}/environments/MT5_DEMO`);
  }

  try {
    const q = query(
      collection(db, 'users', uid, 'journal'),
      orderBy('exitTime', 'desc'),
      limit(100)
    );
    const snap = await getDocs(q);
    snap.forEach((docItem) => {
      journal.push(docItem.data() as BacktestTrade & { environment?: TradingEnvironment });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${uid}/journal`);
  }

  try {
    const tq = query(
      collection(db, 'users', uid, 'tickets'),
      orderBy('createdAtMs', 'desc'),
      limit(50)
    );
    const snap = await getDocs(tq);
    snap.forEach((docItem) => {
      tickets.push(docItem.data() as TradeTicket);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${uid}/tickets`);
  }

  return { profile, settings, simulationEnv, mt5DemoEnv, journal, tickets };
}

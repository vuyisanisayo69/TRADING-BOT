import { useEffect, useState, useCallback } from 'react';
import { testFirestoreConnection } from '../lib/firebase.ts';
import type {
  ConnectionHealthSnapshot,
  MT5DemoBridgeStatus,
  TradingEnvironment,
} from '../types/trading.ts';
import { DEFAULT_MT5_PROFILE } from '../types/trading.ts';

const INITIAL_MT5_STATUS: MT5DemoBridgeStatus = {
  configured: false,
  connected: false,
  status: 'DISCONNECTED',
  liveTradingEnabled: false,
  lastHeartbeatAt: null,
  bridgeEndpoint: '/api/mt5-demo/heartbeat',
  profile: DEFAULT_MT5_PROFILE,
  eaReportedAccount: null,
  eaReportedPositions: [],
  eaReportedSymbols: {},
  statusMessage: 'Disconnected. No MetaTrader 5 Demo EA heartbeat detected.',
};

export function useConnectionStatus(
  activeEnvironment: TradingEnvironment,
  uid?: string
) {
  const [backendOk, setBackendOk] = useState<boolean>(true);
  const [backendLatencyMs, setBackendLatencyMs] = useState<number | null>(null);
  const [cloudSqlReady, setCloudSqlReady] = useState<boolean>(false);
  const [cloudSqlError, setCloudSqlError] = useState<string | null>(null);
  const [firestoreReady, setFirestoreReady] = useState<boolean>(false);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [geminiConfigured, setGeminiConfigured] = useState<boolean>(false);
  const [mt5Status, setMt5Status] = useState<MT5DemoBridgeStatus>(INITIAL_MT5_STATUS);

  const refreshConnections = useCallback(async () => {
    const start = performance.now();
    try {
      const [healthRes, mt5Res, fsResult] = await Promise.all([
        fetch('/api/health', { cache: 'no-store' }),
        fetch(`/api/mt5-demo/status?uid=${encodeURIComponent(uid || 'guest')}`, {
          cache: 'no-store',
        }),
        testFirestoreConnection(),
      ]);

      const roundTripMs = Math.round(performance.now() - start);
      setFirestoreReady(fsResult.reachable);
      setFirestoreError(fsResult.error || null);

      if (healthRes.ok) {
        const health = await healthRes.json();
        setBackendOk(true);
        setBackendLatencyMs(roundTripMs);
        setCloudSqlReady(Boolean(health.cloudSqlReady));
        setCloudSqlError(health.cloudSqlError || null);
        setGeminiConfigured(Boolean(health.geminiConfigured));
      } else {
        setBackendOk(false);
        setBackendLatencyMs(null);
        setCloudSqlReady(false);
      }

      if (mt5Res.ok) {
        const bridge = await mt5Res.json();
        setMt5Status(bridge);
      }
    } catch {
      setBackendOk(false);
      setBackendLatencyMs(null);
      setCloudSqlReady(false);
      setMt5Status((prev) => ({
        ...prev,
        connected: false,
        status: 'DISCONNECTED',
      }));
    }
  }, [uid]);

  useEffect(() => {
    void refreshConnections();
    const timer = setInterval(() => {
      void refreshConnections();
    }, 10_000);
    return () => clearInterval(timer);
  }, [refreshConnections]);

  const hasEaTicks =
    mt5Status.connected && Object.keys(mt5Status.eaReportedSymbols || {}).length > 0;

  const health: ConnectionHealthSnapshot = {
    marketData:
      activeEnvironment === 'SIMULATION'
        ? {
            state: 'SIMULATED',
            label: 'SIMULATED',
            detail: 'Synthetic simulation feed active (sandbox only — not live broker quotes)',
          }
        : hasEaTicks
        ? {
            state: 'CONNECTED',
            label: 'MT5 DEMO FEED',
            detail: 'Live demo ticks streaming from your connected MT5 Demo EA',
          }
        : {
            state: 'DISCONNECTED',
            label: 'NO LIVE FEED',
            detail: 'MT5 Demo active — no external EA price stream connected',
          },
    mt5Ea: mt5Status.connected
      ? {
          state: 'CONNECTED',
          label: 'DEMO LINKED',
          detail: mt5Status.statusMessage,
        }
      : {
          state: 'DISCONNECTED',
          label: 'DISCONNECTED',
          detail: mt5Status.statusMessage,
        },
    backend: backendOk
      ? {
          state: 'CONNECTED',
          label: backendLatencyMs !== null ? `ONLINE (${backendLatencyMs}ms)` : 'ONLINE',
          latencyMs: backendLatencyMs,
          detail: geminiConfigured
            ? 'Express API server reachable · Gemini backend configured'
            : 'Express API server reachable · Gemini API key missing',
        }
      : {
          state: 'OFFLINE',
          label: 'OFFLINE',
          latencyMs: null,
          detail: 'Backend API server is unreachable',
        },
    database:
      cloudSqlReady && firestoreReady
        ? {
            state: 'CONNECTED',
            label: 'SQL + FIRESTORE',
            cloudSqlReady,
            firestoreReady,
            detail: 'Cloud SQL PostgreSQL & Cloud Firestore connected',
          }
        : cloudSqlReady || firestoreReady
        ? {
            state: 'DEGRADED',
            label: cloudSqlReady ? 'CLOUD SQL ONLY' : 'FIRESTORE ONLY',
            cloudSqlReady,
            firestoreReady,
            detail: cloudSqlReady
              ? `Cloud SQL connected${firestoreError ? ` · Firestore: ${firestoreError}` : ''}`
              : `Cloud Firestore connected${cloudSqlError ? ` · Cloud SQL offline` : ''}`,
          }
        : {
            state: 'DISCONNECTED',
            label: 'DISCONNECTED',
            cloudSqlReady: false,
            firestoreReady: false,
            detail: cloudSqlError || firestoreError || 'No database connection available',
          },
  };

  return {
    health,
    mt5Status,
    setMt5Status,
    refreshConnections,
  };
}

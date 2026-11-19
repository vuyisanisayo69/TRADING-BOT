import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import type { MT5AccountProfile, MT5DemoBridgeStatus } from '../types/trading.ts';
import { DEFAULT_MT5_PROFILE } from '../types/trading.ts';

interface BridgeSessionRecord {
  userKey: string;
  bridgeToken: string;
  profile: MT5AccountProfile;
  lastHeartbeatAt: number | null;
  eaReportedAccount: MT5DemoBridgeStatus['eaReportedAccount'];
  eaReportedPositions: MT5DemoBridgeStatus['eaReportedPositions'];
  eaReportedSymbols: MT5DemoBridgeStatus['eaReportedSymbols'];
}

const bridgeSessions = new Map<string, BridgeSessionRecord>();
const HEARTBEAT_TTL_MS = 15_000;

function getOrCreateBridgeRecord(userKey: string): BridgeSessionRecord {
  const existing = bridgeSessions.get(userKey);
  if (existing) return existing;
  const fresh: BridgeSessionRecord = {
    userKey,
    bridgeToken: `apex_mt5_demo_${crypto.randomBytes(12).toString('hex')}`,
    profile: { ...DEFAULT_MT5_PROFILE },
    lastHeartbeatAt: null,
    eaReportedAccount: null,
    eaReportedPositions: [],
    eaReportedSymbols: {},
  };
  bridgeSessions.set(userKey, fresh);
  return fresh;
}

export function isAnyMt5EaConnected(): boolean {
  const now = Date.now();
  for (const session of bridgeSessions.values()) {
    if (session.lastHeartbeatAt && now - session.lastHeartbeatAt <= HEARTBEAT_TTL_MS) {
      return true;
    }
  }
  return false;
}

function buildPublicStatus(record: BridgeSessionRecord, baseUrl: string): MT5DemoBridgeStatus & { bridgeTokenPreview: string } {
  const now = Date.now();
  const isFresh = Boolean(record.lastHeartbeatAt && now - record.lastHeartbeatAt <= HEARTBEAT_TTL_MS);
  const configured = Boolean(record.profile.brokerName.trim() || record.profile.demoAccountNumber.trim());

  const status: MT5DemoBridgeStatus['status'] = isFresh
    ? 'CONNECTED_DEMO'
    : configured
    ? 'AWAITING_EA_HEARTBEAT'
    : 'DISCONNECTED';

  return {
    configured,
    connected: isFresh,
    status,
    liveTradingEnabled: false,
    lastHeartbeatAt: record.lastHeartbeatAt,
    bridgeEndpoint: `${baseUrl}/api/mt5-demo/heartbeat`,
    profile: record.profile,
    eaReportedAccount: isFresh ? record.eaReportedAccount : null,
    eaReportedPositions: isFresh ? record.eaReportedPositions : [],
    eaReportedSymbols: isFresh ? record.eaReportedSymbols : {},
    bridgeTokenPreview: `${record.bridgeToken.slice(0, 18)}...`,
    statusMessage: isFresh
      ? `Connected to MT5 Demo EA (${record.profile.brokerServer || 'Demo Server'}). Live trading remains disabled.`
      : configured
      ? 'Profile saved. Awaiting live heartbeat POST from your local MetaTrader 5 Demo EA.'
      : 'Disconnected. No MetaTrader 5 Demo EA heartbeat detected.',
  };
}

export const mt5DemoRouter = Router();

mt5DemoRouter.get('/status', async (req, res) => {
  const userKey = String(req.query.uid || 'guest');
  const record = getOrCreateBridgeRecord(userKey);
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers.host || 'localhost:3000';
  res.json(buildPublicStatus(record, `${proto}://${host}`));
});

mt5DemoRouter.post('/config', requireAuth, (req: AuthRequest, res) => {
  const body = req.body || {};

  // Hard security invariant: never accept broker passwords
  if ('brokerPassword' in body || 'password' in body) {
    return res.status(400).json({
      error: 'Apex Trader AI never accepts or stores MetaTrader account passwords. Use the non-secret EA bridge token instead.',
    });
  }

  // Hard Phase 1 guardrail: live trading cannot be enabled
  if (body.liveTradingEnabled === true || body.accountType === 'REAL' || body.accountType === 'LIVE') {
    return res.status(403).json({
      error: 'Live broker trading is permanently disabled in Phase 1. Only Simulation and MT5 Demo are permitted.',
    });
  }

  const userKey = req.user!.uid;
  const record = getOrCreateBridgeRecord(userKey);

  record.profile = {
    accountLabel: String(body.accountLabel || record.profile.accountLabel || 'Primary MT5 Demo').slice(0, 80),
    brokerName: String(body.brokerName || '').slice(0, 80),
    brokerServer: String(body.brokerServer || '').slice(0, 120),
    demoAccountNumber: String(body.demoAccountNumber || '').slice(0, 40),
    accountCurrency: String(body.accountCurrency || 'USD').slice(0, 10),
    leverage: Math.max(1, Math.min(2000, Number(body.leverage) || 100)),
  };

  if (body.rotateToken === true) {
    record.bridgeToken = `apex_mt5_demo_${crypto.randomBytes(12).toString('hex')}`;
  }

  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers.host || 'localhost:3000';

  res.json({
    ...buildPublicStatus(record, `${proto}://${host}`),
    bridgeToken: record.bridgeToken,
  });
});

mt5DemoRouter.post('/heartbeat', (req, res) => {
  const token = String(req.headers['x-mt5-bridge-token'] || req.body?.bridgeToken || '');
  if (!token) {
    return res.status(401).json({ error: 'Missing X-MT5-Bridge-Token header.' });
  }

  let matched: BridgeSessionRecord | null = null;
  for (const session of bridgeSessions.values()) {
    if (session.bridgeToken === token) {
      matched = session;
      break;
    }
  }

  if (!matched) {
    return res.status(401).json({ error: 'Invalid or expired MT5 Demo bridge token.' });
  }

  const body = req.body || {};
  if (String(body.accountType || 'DEMO').toUpperCase() !== 'DEMO') {
    return res.status(403).json({
      error: 'LIVE/REAL MetaTrader accounts are blocked by system policy. Only DEMO accounts may connect to this bridge.',
    });
  }

  matched.lastHeartbeatAt = Date.now();
  matched.eaReportedAccount = {
    balance: typeof body.balance === 'number' ? body.balance : null,
    equity: typeof body.equity === 'number' ? body.equity : null,
    freeMargin: typeof body.freeMargin === 'number' ? body.freeMargin : null,
    marginLevel: typeof body.marginLevel === 'number' ? body.marginLevel : null,
    openPositionsCount: Array.isArray(body.positions) ? body.positions.length : 0,
    serverTime: typeof body.serverTime === 'string' ? body.serverTime : null,
  };
  matched.eaReportedPositions = Array.isArray(body.positions) ? body.positions.slice(0, 100) : [];
  matched.eaReportedSymbols =
    body.symbols && typeof body.symbols === 'object' ? body.symbols : {};

  res.json({
    ok: true,
    liveTradingEnabled: false,
    receivedAt: matched.lastHeartbeatAt,
  });
});

mt5DemoRouter.post('/disconnect', requireAuth, (req: AuthRequest, res) => {
  const record = getOrCreateBridgeRecord(req.user!.uid);
  record.lastHeartbeatAt = null;
  record.eaReportedAccount = null;
  record.eaReportedPositions = [];
  record.eaReportedSymbols = {};
  res.json({ disconnected: true });
});

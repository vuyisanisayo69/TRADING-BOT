import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import {
  clearChatHistory,
  getChatHistory,
  getOrCreateUser,
  getUserWorkspaceState,
  insertTradeHistoryRecord,
  replaceUserAlerts,
  syncUserPositions,
  upsertTradingConfig,
} from '../db/repository.ts';

export const workspaceRouter = Router();

workspaceRouter.get('/workspace', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const email = req.user!.email || 'trader@apex.local';
    const user = await getOrCreateUser(uid, email, req.user!.name);
    const state = await getUserWorkspaceState(user.id);
    res.json({ user: { id: user.id, email: user.email, displayName: user.displayName }, ...state });
  } catch (error: any) {
    console.error('Failed to load workspace:', error);
    res.status(500).json({ error: error.message || 'Failed to load workspace' });
  }
});

workspaceRouter.put('/workspace/config', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    if (body.liveTradingEnabled === true) {
      return res.status(403).json({
        error: 'Live broker trading is locked disabled in Phase 1.',
      });
    }

    const user = await getOrCreateUser(
      req.user!.uid,
      req.user!.email || 'trader@apex.local',
      req.user!.name
    );
    const { botMode, riskConfigJson, botSettingsJson, accountStateJson } = body;
    const updated = await upsertTradingConfig(user.id, {
      botMode: botMode || 'BRAIN',
      riskConfigJson: riskConfigJson || {},
      botSettingsJson: botSettingsJson || {},
      accountStateJson: accountStateJson || {},
    });
    res.json({ config: updated });
  } catch (error: any) {
    console.error('Failed to save config:', error);
    res.status(500).json({ error: error.message || 'Failed to save trading configuration' });
  }
});

workspaceRouter.put('/workspace/alerts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await getOrCreateUser(
      req.user!.uid,
      req.user!.email || 'trader@apex.local',
      req.user!.name
    );
    const alertsList = Array.isArray(req.body?.alerts) ? req.body.alerts : [];
    const saved = await replaceUserAlerts(user.id, alertsList);
    res.json({ alerts: saved });
  } catch (error: any) {
    console.error('Failed to save alerts:', error);
    res.status(500).json({ error: error.message || 'Failed to save alerts' });
  }
});

workspaceRouter.put('/workspace/positions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await getOrCreateUser(
      req.user!.uid,
      req.user!.email || 'trader@apex.local',
      req.user!.name
    );
    const openPositions = Array.isArray(req.body?.positions) ? req.body.positions : [];
    const saved = await syncUserPositions(user.id, openPositions);
    res.json({ positions: saved });
  } catch (error: any) {
    console.error('Failed to save positions:', error);
    res.status(500).json({ error: error.message || 'Failed to sync positions' });
  }
});

workspaceRouter.post('/workspace/trades', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await getOrCreateUser(
      req.user!.uid,
      req.user!.email || 'trader@apex.local',
      req.user!.name
    );
    const trade = req.body?.trade;
    if (!trade) return res.status(400).json({ error: 'Missing trade payload' });
    const saved = await insertTradeHistoryRecord(user.id, trade);
    res.json({ trade: saved });
  } catch (error: any) {
    console.error('Failed to record trade:', error);
    res.status(500).json({ error: error.message || 'Failed to save trade history' });
  }
});

workspaceRouter.get('/chat/history', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await getOrCreateUser(
      req.user!.uid,
      req.user!.email || 'trader@apex.local',
      req.user!.name
    );
    const sessionId = String(req.query.sessionId || 'default');
    const messages = await getChatHistory(user.id, sessionId);
    res.json({ messages });
  } catch (error: any) {
    console.error('Failed to fetch chat history:', error);
    res.status(500).json({ error: error.message || 'Failed to load chat history' });
  }
});

workspaceRouter.delete('/chat/history', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await getOrCreateUser(
      req.user!.uid,
      req.user!.email || 'trader@apex.local',
      req.user!.name
    );
    const sessionId = String(req.query.sessionId || 'default');
    await clearChatHistory(user.id, sessionId);
    res.json({ cleared: true });
  } catch (error: any) {
    console.error('Failed to clear chat history:', error);
    res.status(500).json({ error: error.message || 'Failed to clear chat history' });
  }
});

import { Router } from 'express';
import { createPool } from '../db/index.ts';
import { isAnyMt5EaConnected } from './mt5Demo.ts';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const startedAt = Date.now();
  let cloudSqlReady = false;
  let cloudSqlError: string | null = null;

  try {
    const pool = createPool();
    await pool.query('SELECT 1');
    cloudSqlReady = true;
  } catch (err: any) {
    cloudSqlReady = false;
    cloudSqlError = err?.message || 'Cloud SQL health probe failed';
  }

  res.json({
    status: 'ok',
    timestamp: Date.now(),
    latencyMs: Date.now() - startedAt,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    cloudSqlReady,
    cloudSqlError,
    mt5EaConnected: isAnyMt5EaConnected(),
    liveTradingEnabled: false,
    service: 'Apex Trader AI Backend',
  });
});

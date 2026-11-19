import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tradingConfigs = pgTable('trading_configs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull()
    .unique(),
  botMode: text('bot_mode').default('BRAIN').notNull(),
  riskConfigJson: jsonb('risk_config_json').notNull(),
  botSettingsJson: jsonb('bot_settings_json').notNull(),
  accountStateJson: jsonb('account_state_json').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const priceAlerts = pgTable('price_alerts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  clientAlertId: text('client_alert_id').notNull(),
  symbol: text('symbol').notNull(),
  targetPrice: doublePrecision('target_price').notNull(),
  condition: text('condition').notNull(),
  status: text('status').notNull(),
  note: text('note').default('').notNull(),
  oneShot: boolean('one_shot').default(true).notNull(),
  triggeredPrice: doublePrecision('triggered_price'),
  triggeredAt: integer('triggered_at'),
  createdAtEpoch: integer('created_at_epoch').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const positions = pgTable('positions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  clientPosId: text('client_pos_id').notNull(),
  symbol: text('symbol').notNull(),
  side: text('side').notNull(),
  lots: doublePrecision('lots').notNull(),
  entryPrice: doublePrecision('entry_price').notNull(),
  stopLoss: doublePrecision('stop_loss').notNull(),
  takeProfit: doublePrecision('take_profit').notNull(),
  takeProfit2: doublePrecision('take_profit_2'),
  breakevenMoved: boolean('breakeven_moved').default(false).notNull(),
  scaleInsCount: integer('scale_ins_count').default(0).notNull(),
  openTime: integer('open_time').notNull(),
  status: text('status').default('OPEN').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tradeHistory = pgTable('trade_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  clientTradeId: text('client_trade_id').notNull(),
  symbol: text('symbol').notNull(),
  side: text('side').notNull(),
  entryTime: integer('entry_time').notNull(),
  entryPrice: doublePrecision('entry_price').notNull(),
  exitTime: integer('exit_time').notNull(),
  exitPrice: doublePrecision('exit_price').notNull(),
  exitReason: text('exit_reason').notNull(),
  lots: doublePrecision('lots').notNull(),
  pnlUSD: doublePrecision('pnl_usd').notNull(),
  pnlPercent: doublePrecision('pnl_percent').notNull(),
  rMultiple: doublePrecision('r_multiple').notNull(),
  commissionUSD: doublePrecision('commission_usd').notNull(),
  spreadCostUSD: doublePrecision('spread_cost_usd').notNull(),
  slippageUSD: doublePrecision('slippage_usd').notNull(),
  netPnlUSD: doublePrecision('net_pnl_usd').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  botMode: text('bot_mode').default('BRAIN').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const visionAnalyses = pgTable('vision_analyses', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  symbol: text('symbol').notNull(),
  timeframe: text('timeframe').notNull(),
  bias: text('bias').notNull(),
  entryPrice: doublePrecision('entry_price').notNull(),
  stopLoss: doublePrecision('stop_loss').notNull(),
  takeProfit1: doublePrecision('take_profit_1').notNull(),
  takeProfit2: doublePrecision('take_profit_2').notNull(),
  confidence: integer('confidence').notNull(),
  setupsJson: jsonb('setups_json').notNull(),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(),
  taskMode: text('task_mode').notNull(),
  modelUsed: text('model_used').notNull(),
  content: text('content').notNull(),
  sourcesJson: jsonb('sources_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const chartIntelligenceReports = pgTable('chart_intelligence_reports', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  clientReportId: text('client_report_id').notNull(),
  symbolDetected: text('symbol_detected').notNull(),
  timeframeDetected: text('timeframe_detected').notNull(),
  platformDetected: text('platform_detected').notNull(),
  classification: text('classification').notNull(),
  confluenceScore: integer('confluence_score').notNull(),
  modelVersion: text('model_version').notNull(),
  savedToJournal: boolean('saved_to_journal').default(true).notNull(),
  consentImageStored: boolean('consent_image_stored').default(false).notNull(),
  reportJson: jsonb('report_json').notNull(),
  analyzedAt: text('analyzed_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  tradingConfig: one(tradingConfigs),
  priceAlerts: many(priceAlerts),
  positions: many(positions),
  tradeHistory: many(tradeHistory),
  visionAnalyses: many(visionAnalyses),
  chatMessages: many(chatMessages),
  chartIntelligenceReports: many(chartIntelligenceReports),
}));

export const tradingConfigsRelations = relations(tradingConfigs, ({ one }) => ({
  user: one(users, {
    fields: [tradingConfigs.userId],
    references: [users.id],
  }),
}));

export const priceAlertsRelations = relations(priceAlerts, ({ one }) => ({
  user: one(users, {
    fields: [priceAlerts.userId],
    references: [users.id],
  }),
}));

export const positionsRelations = relations(positions, ({ one }) => ({
  user: one(users, {
    fields: [positions.userId],
    references: [users.id],
  }),
}));

export const tradeHistoryRelations = relations(tradeHistory, ({ one }) => ({
  user: one(users, {
    fields: [tradeHistory.userId],
    references: [users.id],
  }),
}));

export const visionAnalysesRelations = relations(visionAnalyses, ({ one }) => ({
  user: one(users, {
    fields: [visionAnalyses.userId],
    references: [users.id],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  user: one(users, {
    fields: [chatMessages.userId],
    references: [users.id],
  }),
}));

export const chartIntelligenceReportsRelations = relations(chartIntelligenceReports, ({ one }) => ({
  user: one(users, {
    fields: [chartIntelligenceReports.userId],
    references: [users.id],
  }),
}));

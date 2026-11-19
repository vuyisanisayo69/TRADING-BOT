import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  chartIntelligenceReports,
  chatMessages,
  positions,
  priceAlerts,
  tradeHistory,
  tradingConfigs,
  users,
  visionAnalyses,
} from './schema.ts';

export async function getOrCreateUser(uid: string, email: string, displayName?: string | null) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName ?? null,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed (getOrCreateUser):', error);
    throw new Error('Failed to synchronize user profile.', { cause: error });
  }
}

export async function getUserWorkspaceState(userId: number) {
  try {
    const [configRow] = await db
      .select()
      .from(tradingConfigs)
      .where(eq(tradingConfigs.userId, userId));

    const alertRows = await db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.userId, userId))
      .orderBy(desc(priceAlerts.createdAtEpoch));

    const openPositionRows = await db
      .select()
      .from(positions)
      .where(and(eq(positions.userId, userId), eq(positions.status, 'OPEN')))
      .orderBy(desc(positions.openTime));

    const historyRows = await db
      .select()
      .from(tradeHistory)
      .where(eq(tradeHistory.userId, userId))
      .orderBy(desc(tradeHistory.exitTime))
      .limit(100);

    const visionRows = await db
      .select()
      .from(visionAnalyses)
      .where(eq(visionAnalyses.userId, userId))
      .orderBy(desc(visionAnalyses.createdAt))
      .limit(20);

    return {
      config: configRow ?? null,
      alerts: alertRows,
      positions: openPositionRows,
      tradeHistory: historyRows,
      visionAnalyses: visionRows,
    };
  } catch (error) {
    console.error('Database query failed (getUserWorkspaceState):', error);
    throw new Error('Failed to load saved trading workspace.', { cause: error });
  }
}

export async function upsertTradingConfig(
  userId: number,
  payload: {
    botMode: string;
    riskConfigJson: unknown;
    botSettingsJson: unknown;
    accountStateJson: unknown;
  }
) {
  try {
    const [row] = await db
      .insert(tradingConfigs)
      .values({
        userId,
        botMode: payload.botMode,
        riskConfigJson: payload.riskConfigJson,
        botSettingsJson: payload.botSettingsJson,
        accountStateJson: payload.accountStateJson,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: tradingConfigs.userId,
        set: {
          botMode: payload.botMode,
          riskConfigJson: payload.riskConfigJson,
          botSettingsJson: payload.botSettingsJson,
          accountStateJson: payload.accountStateJson,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  } catch (error) {
    console.error('Database query failed (upsertTradingConfig):', error);
    throw new Error('Failed to save trading configuration.', { cause: error });
  }
}

export async function replaceUserAlerts(
  userId: number,
  alertsList: Array<{
    id: string;
    symbol: string;
    targetPrice: number;
    condition: string;
    status: string;
    note?: string;
    oneShot: boolean;
    triggeredPrice?: number;
    triggeredAt?: number;
    createdAt: number;
  }>
) {
  try {
    await db.delete(priceAlerts).where(eq(priceAlerts.userId, userId));
    if (alertsList.length === 0) return [];
    const inserted = await db
      .insert(priceAlerts)
      .values(
        alertsList.map((a) => ({
          userId,
          clientAlertId: a.id,
          symbol: a.symbol,
          targetPrice: a.targetPrice,
          condition: a.condition,
          status: a.status,
          note: a.note ?? '',
          oneShot: a.oneShot,
          triggeredPrice: a.triggeredPrice ?? null,
          triggeredAt: a.triggeredAt ?? null,
          createdAtEpoch: a.createdAt,
        }))
      )
      .returning();
    return inserted;
  } catch (error) {
    console.error('Database query failed (replaceUserAlerts):', error);
    throw new Error('Failed to save price alerts.', { cause: error });
  }
}

export async function syncUserPositions(
  userId: number,
  openPositions: Array<{
    id: string;
    symbol: string;
    side: string;
    lots: number;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    takeProfit2?: number;
    breakevenMoved?: boolean;
    scaleInsCount?: number;
    openTime: number;
  }>
) {
  try {
    await db.delete(positions).where(eq(positions.userId, userId));
    if (openPositions.length === 0) return [];
    return await db
      .insert(positions)
      .values(
        openPositions.map((p) => ({
          userId,
          clientPosId: p.id,
          symbol: p.symbol,
          side: p.side,
          lots: p.lots,
          entryPrice: p.entryPrice,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
          takeProfit2: p.takeProfit2 ?? null,
          breakevenMoved: Boolean(p.breakevenMoved),
          scaleInsCount: p.scaleInsCount ?? 0,
          openTime: p.openTime,
          status: 'OPEN',
        }))
      )
      .returning();
  } catch (error) {
    console.error('Database query failed (syncUserPositions):', error);
    throw new Error('Failed to save open positions.', { cause: error });
  }
}

export async function insertTradeHistoryRecord(
  userId: number,
  trade: {
    id: string;
    symbol: string;
    side: string;
    entryTime: number;
    entryPrice: number;
    exitTime: number;
    exitPrice: number;
    exitReason: string;
    lots: number;
    pnlUSD: number;
    pnlPercent: number;
    rMultiple: number;
    commissionUSD: number;
    spreadCostUSD: number;
    slippageUSD: number;
    netPnlUSD: number;
    durationMinutes: number;
    botMode?: string;
  }
) {
  try {
    const [inserted] = await db
      .insert(tradeHistory)
      .values({
        userId,
        clientTradeId: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        entryTime: trade.entryTime,
        entryPrice: trade.entryPrice,
        exitTime: trade.exitTime,
        exitPrice: trade.exitPrice,
        exitReason: trade.exitReason,
        lots: trade.lots,
        pnlUSD: trade.pnlUSD,
        pnlPercent: trade.pnlPercent,
        rMultiple: trade.rMultiple,
        commissionUSD: trade.commissionUSD,
        spreadCostUSD: trade.spreadCostUSD,
        slippageUSD: trade.slippageUSD,
        netPnlUSD: trade.netPnlUSD,
        durationMinutes: trade.durationMinutes,
        botMode: trade.botMode ?? 'BRAIN',
      })
      .returning();
    return inserted;
  } catch (error) {
    console.error('Database query failed (insertTradeHistoryRecord):', error);
    throw new Error('Failed to save closed trade record.', { cause: error });
  }
}

export async function saveVisionAnalysisRecord(
  userId: number,
  record: {
    symbol: string;
    timeframe: string;
    bias: string;
    entryPrice: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
    confidence: number;
    setupsJson: unknown;
    summary: string;
  }
) {
  try {
    const [inserted] = await db
      .insert(visionAnalyses)
      .values({
        userId,
        symbol: record.symbol,
        timeframe: record.timeframe,
        bias: record.bias,
        entryPrice: record.entryPrice,
        stopLoss: record.stopLoss,
        takeProfit1: record.takeProfit1,
        takeProfit2: record.takeProfit2,
        confidence: record.confidence,
        setupsJson: record.setupsJson,
        summary: record.summary,
      })
      .returning();
    return inserted;
  } catch (error) {
    console.error('Database query failed (saveVisionAnalysisRecord):', error);
    throw new Error('Failed to save vision analysis.', { cause: error });
  }
}

export async function getChatHistory(userId: number, sessionId: string) {
  try {
    return await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.userId, userId), eq(chatMessages.sessionId, sessionId)))
      .orderBy(chatMessages.id);
  } catch (error) {
    console.error('Database query failed (getChatHistory):', error);
    throw new Error('Failed to load conversation history.', { cause: error });
  }
}

export async function saveChatMessage(
  userId: number,
  msg: {
    sessionId: string;
    role: string;
    taskMode: string;
    modelUsed: string;
    content: string;
    sourcesJson?: unknown;
  }
) {
  try {
    const [inserted] = await db
      .insert(chatMessages)
      .values({
        userId,
        sessionId: msg.sessionId,
        role: msg.role,
        taskMode: msg.taskMode,
        modelUsed: msg.modelUsed,
        content: msg.content,
        sourcesJson: msg.sourcesJson ?? null,
      })
      .returning();
    return inserted;
  } catch (error) {
    console.error('Database query failed (saveChatMessage):', error);
    throw new Error('Failed to save chat message.', { cause: error });
  }
}

export async function clearChatHistory(userId: number, sessionId: string) {
  try {
    await db
      .delete(chatMessages)
      .where(and(eq(chatMessages.userId, userId), eq(chatMessages.sessionId, sessionId)));
  } catch (error) {
    console.error('Database query failed (clearChatHistory):', error);
    throw new Error('Failed to clear chat history.', { cause: error });
  }
}

export async function saveChartIntelligenceReport(
  userId: number,
  record: {
    clientReportId: string;
    symbolDetected: string;
    timeframeDetected: string;
    platformDetected: string;
    classification: string;
    confluenceScore: number;
    modelVersion: string;
    savedToJournal: boolean;
    consentImageStored: boolean;
    reportJson: unknown;
    analyzedAt: string;
  }
) {
  try {
    const [inserted] = await db
      .insert(chartIntelligenceReports)
      .values({
        userId,
        clientReportId: record.clientReportId,
        symbolDetected: record.symbolDetected,
        timeframeDetected: record.timeframeDetected,
        platformDetected: record.platformDetected,
        classification: record.classification,
        confluenceScore: record.confluenceScore,
        modelVersion: record.modelVersion,
        savedToJournal: record.savedToJournal,
        consentImageStored: record.consentImageStored,
        reportJson: record.reportJson,
        analyzedAt: record.analyzedAt,
      })
      .returning();
    return inserted;
  } catch (error) {
    console.error('Database query failed (saveChartIntelligenceReport):', error);
    throw new Error('Failed to save Chart Intelligence report.', { cause: error });
  }
}

export async function getChartIntelligenceReports(userId: number) {
  try {
    return await db
      .select()
      .from(chartIntelligenceReports)
      .where(eq(chartIntelligenceReports.userId, userId))
      .orderBy(desc(chartIntelligenceReports.createdAt))
      .limit(50);
  } catch (error) {
    console.error('Database query failed (getChartIntelligenceReports):', error);
    throw new Error('Failed to load Chart Intelligence history.', { cause: error });
  }
}

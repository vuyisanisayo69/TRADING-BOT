import { Router } from 'express';
import { ThinkingLevel, Type } from '@google/genai';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import { saveChatMessage, saveVisionAnalysisRecord } from '../db/repository.ts';
import { MAX_IMAGE_BYTES, SUPPORTED_IMAGE_MIME_TYPES } from '../utils/chartIntelligence.ts';
import { geminiService, GeminiServiceError } from '../lib/geminiService.ts';
import {
  extractGroundingSources,
  getAiClient,
  getRateLimitActor,
  modelSupportsThinking,
  resolveOptionalUser,
  sendStructuredAIError,
} from '../lib/aiRouteHelpers.ts';

export const aiRouter = Router();

aiRouter.get('/config', (_req, res) => {
  res.json({
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    config: geminiService.getConfig(),
    catalog: geminiService.getModelCatalog(),
    usageSummary: geminiService.getUsageSummary(),
  });
});

aiRouter.put('/config', requireAuth, (req: AuthRequest, res) => {
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const callerEmail = (req.user?.email || '').toLowerCase();
  if (adminEmails.length > 0 && !adminEmails.includes(callerEmail)) {
    return res.status(403).json({
      error: 'Administrator privileges are required to modify AI model configuration.',
      aiError: {
        httpStatus: 403,
        code: 'AUTH_OR_PERMISSION_DENIED',
        title: 'ADMINISTRATOR PERMISSION REQUIRED',
        reason: 'Only designated administrators can update server-side Gemini model configuration.',
        actions: ['Contact the workspace administrator.'],
        retryable: false,
      },
    });
  }

  const body = req.body || {};
  const result = geminiService.updateConfig(
    {
      primaryModel: body.primaryModel,
      fallbackModel: body.fallbackModel,
      allowFallback: body.allowFallback,
      projectBillingActive: body.projectBillingActive,
      searchGroundingPolicy: body.searchGroundingPolicy,
      perMinuteRateLimit: body.perMinuteRateLimit,
      requestTimeoutMs: body.requestTimeoutMs,
    },
    req.user?.email || req.user?.uid || 'admin'
  );

  if (result.ok === false) {
    return res.status(result.error.httpStatus).json({
      error: result.error.reason,
      aiError: result.error,
    });
  }

  res.json({
    config: result.config,
    catalog: geminiService.getModelCatalog(),
  });
});

aiRouter.post('/analyze-setup', async (req, res) => {
  try {
    const aiClient = getAiClient();
    const user = await resolveOptionalUser(req);
    const { signal, symbol, timeframe } = req.body || {};
    if (!signal || !symbol || typeof symbol !== 'string') {
      return sendStructuredAIError(
        res,
        new GeminiServiceError({
          httpStatus: 400,
          code: 'INVALID_REQUEST',
          title: 'INVALID AI REQUEST',
          reason: 'Trading signal and symbol are required for setup analysis.',
          actions: ['Ensure a live trading signal is loaded and retry.'],
          retryable: false,
        })
      );
    }

    const prompt = `You are the lead risk officer and quantitative analyst at Apex Trader AI.
Analyze this day-trading setup (${signal?.botMode || 'BRAIN'} Mode) in financial markets.
Never claim 100% win rate or guaranteed profits. Be objective, conservative, and rigorous.

Market: ${symbol} (${timeframe || 'M15'})
Bot Mode: ${signal?.botMode || 'BRAIN'}
Signal Action: ${signal?.action || 'NO_TRADE'}
Score: ${signal?.qualityScore || 0}/100
Entry Zone: ${signal?.entryZone?.recommended || 'N/A'}
Stop Loss: ${signal?.stopLoss || 'N/A'}
Take Profit 1: ${signal?.takeProfit1 || 'N/A'}
Take Profit 2: ${signal?.takeProfit2 || 'N/A'}
Reward-to-Risk: ${signal?.rewardToRiskRatio || 'N/A'}R
Recommended Lots: ${signal?.positionSizing?.recommendedLots || 'N/A'} (Risk: $${signal?.positionSizing?.dollarRisk || '0'})

Classic & SMC Indicators:
- HTF H1 Trend: ${signal?.marketContext?.h1Trend || 'N/A'}
- M15 Structure: ${signal?.marketContext?.m15Structure || 'N/A'}
- SMMA 5 / SMMA 50: ${signal?.marketContext?.smma5 || 'N/A'} / ${signal?.marketContext?.smma50 || 'N/A'}
- RSI 14: ${signal?.marketContext?.rsiValue || 'N/A'}
- ATR: ${signal?.marketContext?.atrValue || 'N/A'}
- Active Bullish FVGs: ${signal?.smcContext?.activeBullishFVGs?.length || 0} | Bearish FVGs: ${signal?.smcContext?.activeBearishFVGs?.length || 0}
- Recent Liquidity Sweeps: ${JSON.stringify(signal?.smcContext?.recentSweeps || [])}
- Recent Displacements: ${signal?.smcContext?.recentDisplacements?.length || 0}
- Active Demand OBs: ${signal?.smcContext?.activeDemandOBs?.length || 0} | Supply OBs: ${signal?.smcContext?.activeSupplyOBs?.length || 0}
- Volume Profile POC: ${signal?.smcContext?.volumeProfile?.poc || 'N/A'} (VAL: ${signal?.smcContext?.volumeProfile?.val || 'N/A'}, VAH: ${signal?.smcContext?.volumeProfile?.vah || 'N/A'})
- Supporting reasons: ${JSON.stringify(signal?.supportingReasons || [])}
- Invalidation conditions: ${JSON.stringify(signal?.invalidationConditions || [])}

Provide:
1. Executive Setup Summary (Classic + SMC confluence).
2. Institutional Liquidity, FVG, Order Block & Volume Profile Evaluation.
3. Critical Invalidation & Risk Factors.
4. Breakeven (+1R) & Multi-Entry Position Management Plan.`;

    const actorKey = getRateLimitActor(req, user);
    const result = await geminiService.execute<string>({
      task: 'setup-analysis',
      rateLimitKey: actorKey,
      dedupKey: geminiService.computeDedupKey('setup-analysis', actorKey, {
        symbol,
        timeframe,
        action: signal?.action,
        score: signal?.qualityScore,
        entry: signal?.entryZone?.recommended,
      }),
      promptText: prompt,
      runner: async ({ model }) => {
        if (!aiClient) throw new Error('API key missing');
        const config: any = {
          systemInstruction:
            'You are an institutional trading risk analyst at Apex Trader AI. Provide concise, disciplined, actionable trade commentary without hype.',
        };
        if (modelSupportsThinking(model)) {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
        }
        const response = await aiClient.models.generateContent({
          model,
          contents: prompt,
          config,
        });
        return {
          data: response.text || '',
          usageMetadata: response.usageMetadata,
        };
      },
    });

    res.json({ analysis: result.data, meta: result.meta });
  } catch (error: any) {
    sendStructuredAIError(res, error);
  }
});

aiRouter.post('/market-summary', async (req, res) => {
  try {
    const aiClient = getAiClient();
    const user = await resolveOptionalUser(req);
    const { tickers, session, upcomingNews, symbol } = req.body || {};

    const focusSymbol = symbol || 'XAU/USD, BTC/USD, EUR/USD';
    const prompt = `Provide an executive, up-to-date market regime briefing for institutional day traders covering current macro drivers, central bank expectations, Gold, Bitcoin, and major FX currencies (${focusSymbol}).

Active Session: ${session?.sessionName || 'Global'}
Current Terminal Tickers: ${JSON.stringify(tickers || {})}
Terminal Economic Calendar Events: ${JSON.stringify(upcomingNews || [])}

Cover in 3 concise sections:
1. Live Macro Catalysts & Asset Sentiment (cover current USD, Gold, Bitcoin, and FX drivers).
2. Session Volatility & Liquidity Windows (London/NY overlap & key levels).
3. Tactical Execution & Spread/Risk Guidance for Classic & Brain Bot Modes.`;

    const actorKey = getRateLimitActor(req, user);
    const result = await geminiService.execute<string>({
      task: 'market-summary',
      rateLimitKey: actorKey,
      dedupKey: geminiService.computeDedupKey('market-summary', actorKey, {
        focusSymbol,
        sessionName: session?.sessionName,
      }),
      promptText: prompt,
      userRequestedGrounding: true,
      runner: async ({ model, useSearchGrounding }) => {
        if (!aiClient) throw new Error('API key missing');
        const config: any = {};
        if (useSearchGrounding) {
          config.tools = [{ googleSearch: {} }];
        }
        if (modelSupportsThinking(model)) {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
        }
        const response = await aiClient.models.generateContent({
          model,
          contents: prompt,
          config,
        });
        const sources = useSearchGrounding ? extractGroundingSources(response) : [];
        const hasSearchMeta =
          sources.length > 0 ||
          Boolean((response as any)?.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length);

        return {
          data: response.text || '',
          usageMetadata: response.usageMetadata,
          groundingSources: sources,
          groundingUnavailableReason:
            useSearchGrounding && !hasSearchMeta
              ? 'Google Search Grounding returned no live web citations for this session.'
              : undefined,
        };
      },
    });

    res.json({ summary: result.data, sources: result.sources, meta: result.meta });
  } catch (error: any) {
    sendStructuredAIError(res, error);
  }
});

aiRouter.post('/journal-review', async (req, res) => {
  try {
    const aiClient = getAiClient();
    const user = await resolveOptionalUser(req);
    const { trades, performance, riskConfig } = req.body || {};

    if (!performance && !Array.isArray(trades)) {
      return sendStructuredAIError(
        res,
        new GeminiServiceError({
          httpStatus: 400,
          code: 'INVALID_REQUEST',
          title: 'INVALID AI REQUEST',
          reason: 'Trade history or performance metrics are required for journal auditing.',
          actions: ['Run a backtest or record trades first, then retry.'],
          retryable: false,
        })
      );
    }

    const prompt = `Review this trader's journal and strategy performance metrics:
Total Trades: ${trades?.length || 0}
Win Rate: ${performance?.winRatePercent || 0}%
Profit Factor: ${performance?.profitFactor || 0}
Expectancy (R): ${performance?.expectancyR || 0}R
Max Drawdown: ${performance?.maxDrawdownPercent || 0}%
Configured Risk Per Trade: ${riskConfig?.riskPercentagePerTrade || 0.5}%
Max Daily Loss Limit: ${riskConfig?.maxDailyLossPercent || 2.0}%
Sample Recent Trades: ${JSON.stringify((trades || []).slice(-10))}

Provide a constructive, institutional-grade diagnosis:
1. Edge Evaluation (Is the win rate and profit factor mathematically sustainable?).
2. Risk & Discipline Audit (Any evidence of revenge trading, oversized positions, or premature exits).
3. Top 3 Actionable Improvements for next trading session.`;

    const actorKey = getRateLimitActor(req, user);
    const result = await geminiService.execute<string>({
      task: 'journal-review',
      rateLimitKey: actorKey,
      dedupKey: geminiService.computeDedupKey('journal-review', actorKey, {
        total: trades?.length || 0,
        winRate: performance?.winRatePercent,
        pf: performance?.profitFactor,
      }),
      promptText: prompt,
      runner: async ({ model }) => {
        if (!aiClient) throw new Error('API key missing');
        const config: any = {};
        if (modelSupportsThinking(model)) {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
        }
        const response = await aiClient.models.generateContent({
          model,
          contents: prompt,
          config,
        });
        return {
          data: response.text || '',
          usageMetadata: response.usageMetadata,
        };
      },
    });

    res.json({ review: result.data, meta: result.meta });
  } catch (error: any) {
    sendStructuredAIError(res, error);
  }
});

aiRouter.post('/vision-analyze', async (req, res) => {
  try {
    const aiClient = getAiClient();
    const user = await resolveOptionalUser(req);
    const {
      imageBase64,
      mimeType = 'image/png',
      symbol = 'XAU/USD',
      timeframe = 'M5',
      notes = '',
      liveSignal,
      liveTicker,
    } = req.body || {};

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return sendStructuredAIError(
        res,
        new GeminiServiceError({
          httpStatus: 400,
          code: 'INVALID_REQUEST',
          title: 'INVALID CHART IMAGE',
          reason: 'Chart screenshot image data is required.',
          actions: ['Upload a valid PNG, JPG, JPEG, or WEBP screenshot and retry.'],
          retryable: false,
        })
      );
    }

    const normalizedMime = String(mimeType).toLowerCase();
    if (!SUPPORTED_IMAGE_MIME_TYPES.includes(normalizedMime as any)) {
      return sendStructuredAIError(
        res,
        new GeminiServiceError({
          httpStatus: 400,
          code: 'INVALID_REQUEST',
          title: 'UNSUPPORTED IMAGE FORMAT',
          reason: 'Unsupported image type. Allowed formats: PNG, JPG, JPEG, WEBP.',
          actions: ['Convert or upload a PNG, JPG, JPEG, or WEBP chart image.'],
          retryable: false,
        })
      );
    }

    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const approxBytes = Math.ceil((cleanBase64.length * 3) / 4);
    if (approxBytes <= 0 || approxBytes > MAX_IMAGE_BYTES) {
      return sendStructuredAIError(
        res,
        new GeminiServiceError({
          httpStatus: 400,
          code: 'INVALID_REQUEST',
          title: 'IMAGE TOO LARGE',
          reason: `Image payload exceeds maximum allowed size (${MAX_IMAGE_BYTES / (1024 * 1024)} MB).`,
          actions: ['Upload a smaller screenshot under 8 MB.'],
          retryable: false,
        })
      );
    }

    const visionPrompt = `You are a senior institutional technical analyst and quantitative trading bot architect at Apex Trader AI.
Carefully inspect the uploaded trading chart screenshot and cross-reference it with the terminal's live bot indicators below.

Trader Selected Context:
- Symbol hint: ${symbol}
- Timeframe hint: ${timeframe}
- Live Ticker Bid/Ask: ${liveTicker ? `${liveTicker.bid} / ${liveTicker.ask}` : 'Not provided'}
- Trader Notes: ${notes || 'None'}

Live Bot Telemetry & SMC Indicators:
- Classic SMMA 5 / 50: ${liveSignal?.marketContext?.smma5 ?? 'N/A'} / ${liveSignal?.marketContext?.smma50 ?? 'N/A'}
- RSI (14): ${liveSignal?.marketContext?.rsiValue ?? 'N/A'} | ATR (14): ${liveSignal?.marketContext?.atrValue ?? 'N/A'}
- HTF H1 Trend: ${liveSignal?.marketContext?.h1Trend ?? 'N/A'}
- Active FVGs: Bullish=${liveSignal?.smcContext?.activeBullishFVGs?.length ?? 0}, Bearish=${liveSignal?.smcContext?.activeBearishFVGs?.length ?? 0}
- Active Order Blocks: Demand=${liveSignal?.smcContext?.activeDemandOBs?.length ?? 0}, Supply=${liveSignal?.smcContext?.activeSupplyOBs?.length ?? 0}
- Recent Liquidity Sweeps: ${JSON.stringify(liveSignal?.smcContext?.recentSweeps || [])}
- Recent Displacements: ${liveSignal?.smcContext?.recentDisplacements?.length ?? 0}
- Volume Profile POC: ${liveSignal?.smcContext?.volumeProfile?.poc ?? 'N/A'} (VAL: ${liveSignal?.smcContext?.volumeProfile?.val ?? 'N/A'}, VAH: ${liveSignal?.smcContext?.volumeProfile?.vah ?? 'N/A'})

Task:
1. Read price action, candle structure, support/resistance, FVGs, liquidity sweeps, displacement, order blocks, SMMA/MA slopes, and visible price axis values directly from the screenshot.
2. Determine the optimal trade Bias (LONG, SHORT, or WAIT), exact recommended Entry Price, Stop Loss, Take Profit 1, and Take Profit 2 (read numbers faithfully from the chart scale, or calibrate around live ticker if price labels aren't legible).
3. Recommend position management plan (breakeven trigger level and scale-in zone if appropriate).`;

    const actorKey = getRateLimitActor(req, user);
    const result = await geminiService.execute<any>({
      task: 'vision',
      rateLimitKey: actorKey,
      dedupKey: geminiService.computeDedupKey('vision', actorKey, {
        imageHead: cleanBase64.slice(0, 128),
        imageLen: cleanBase64.length,
        symbol,
        timeframe,
        notes,
      }),
      timeoutMs: 60000,
      runner: async ({ model }) => {
        if (!aiClient) throw new Error('API key missing');
        const config: any = {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              symbolDetected: { type: Type.STRING, description: 'Detected market symbol from chart or hint' },
              timeframeDetected: { type: Type.STRING, description: 'Detected chart timeframe' },
              bias: { type: Type.STRING, description: 'LONG, SHORT, or WAIT' },
              confidence: { type: Type.INTEGER, description: 'Setup confidence score 0-100' },
              entryPrice: { type: Type.NUMBER, description: 'Optimal entry price level' },
              stopLoss: { type: Type.NUMBER, description: 'Optimal protective stop loss level' },
              takeProfit1: { type: Type.NUMBER, description: 'First take profit target (1.5R-2R)' },
              takeProfit2: { type: Type.NUMBER, description: 'Extended structural take profit target' },
              rewardToRiskRatio: { type: Type.NUMBER, description: 'Calculated RR ratio to TP1' },
              identifiedSetups: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Technical patterns, FVG, Order Blocks, Sweeps, Displacement observed',
              },
              indicatorAlignment: {
                type: Type.OBJECT,
                properties: {
                  smmaTrend: { type: Type.STRING },
                  fvgAndOrderBlocks: { type: Type.STRING },
                  liquidityAndDisplacement: { type: Type.STRING },
                  volumeProfileAndHtf: { type: Type.STRING },
                },
              },
              positionManagementPlan: { type: Type.STRING, description: 'Breakeven & multiple entry guidance' },
              invalidationCriteria: { type: Type.STRING, description: 'Exact condition that invalidates this setup' },
              executiveSummary: { type: Type.STRING, description: 'Concise 2-3 sentence summary of the setup' },
            },
            required: [
              'symbolDetected',
              'timeframeDetected',
              'bias',
              'confidence',
              'entryPrice',
              'stopLoss',
              'takeProfit1',
              'takeProfit2',
              'rewardToRiskRatio',
              'identifiedSetups',
              'positionManagementPlan',
              'invalidationCriteria',
              'executiveSummary',
            ],
          },
        };
        if (modelSupportsThinking(model)) {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
        }
        const response = await aiClient.models.generateContent({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: normalizedMime,
                  data: cleanBase64,
                },
              },
              { text: visionPrompt },
            ],
          },
          config,
        });
        const parsed = JSON.parse((response.text ?? '{}').trim());
        return {
          data: parsed,
          usageMetadata: response.usageMetadata,
        };
      },
    });

    const parsed = result.data;

    if (user) {
      await saveVisionAnalysisRecord(user.id, {
        symbol: parsed.symbolDetected || symbol,
        timeframe: parsed.timeframeDetected || timeframe,
        bias: parsed.bias || 'WAIT',
        entryPrice: Number(parsed.entryPrice) || 0,
        stopLoss: Number(parsed.stopLoss) || 0,
        takeProfit1: Number(parsed.takeProfit1) || 0,
        takeProfit2: Number(parsed.takeProfit2) || 0,
        confidence: Number(parsed.confidence) || 0,
        setupsJson: {
          identifiedSetups: parsed.identifiedSetups || [],
          indicatorAlignment: parsed.indicatorAlignment || {},
          positionManagementPlan: parsed.positionManagementPlan || '',
          invalidationCriteria: parsed.invalidationCriteria || '',
        },
        summary: parsed.executiveSummary || '',
      }).catch((e) => console.warn('Could not persist vision analysis:', e));
    }

    res.json({
      analysis: parsed,
      liveMarketConditions: '',
      sources: [],
      meta: result.meta,
    });
  } catch (error: any) {
    sendStructuredAIError(res, error);
  }
});

aiRouter.post('/chat', async (req, res) => {
  try {
    const aiClient = getAiClient();
    const user = await resolveOptionalUser(req);
    const {
      sessionId = 'default',
      message,
      history = [],
      taskMode = 'general',
      useSearchGrounding = false,
      terminalContext,
    } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return sendStructuredAIError(
        res,
        new GeminiServiceError({
          httpStatus: 400,
          code: 'INVALID_REQUEST',
          title: 'INVALID CHAT REQUEST',
          reason: 'Message text is required.',
          actions: ['Enter a question or prompt and send again.'],
          retryable: false,
        })
      );
    }

    if (message.length > 8000) {
      return sendStructuredAIError(
        res,
        new GeminiServiceError({
          httpStatus: 400,
          code: 'INVALID_REQUEST',
          title: 'MESSAGE TOO LONG',
          reason: 'Message exceeds the 8,000-character request limit.',
          actions: ['Shorten your message and try again.'],
          retryable: false,
        })
      );
    }

    const serverConfig = geminiService.getConfig();
    const modeConfig: Record<
      string,
      { modelOverride?: string; roleTitle: string; systemInstruction: string; thinkingLevel?: ThinkingLevel }
    > = {
      deep: {
        roleTitle: 'Quantitative Risk & Deep Reasoning Strategist',
        thinkingLevel: ThinkingLevel.XHIGH,
        systemInstruction:
          'You are the Chief Quantitative Risk Strategist at Apex Trader AI. Perform deep, multi-step mathematical and structural reasoning across SMMA 5/50, RSI, ATR, Fair Value Gaps, Liquidity Sweeps, Displacement, Order Blocks, Volume Profile (POC/HVN), HTF direction, and portfolio risk guardrails. Always state invalidation conditions and risk sizing transparently.',
      },
      interactive: {
        roleTitle: 'SMC & Execution Workflow Architect',
        thinkingLevel: ThinkingLevel.HIGH,
        systemInstruction:
          'You are an interactive Institutional Execution & Smart Money Concepts Architect at Apex Trader AI. Design actionable step-by-step entry, breakeven, and multiple-entry scaling plans tailored to the live terminal state.',
      },
      general: {
        roleTitle: 'Senior Market Analyst & Macro Desk',
        thinkingLevel: ThinkingLevel.MEDIUM,
        systemInstruction:
          'You are a Senior Multi-Asset Market Analyst at Apex Trader AI covering Gold (XAU/USD), Bitcoin (BTC/USD), and Major Forex pairs. Provide clear, balanced, real-time grounded market insight.',
      },
      fast: {
        modelOverride:
          serverConfig.primaryModel === 'gemini-4-hydrogen' ? 'gemini-3.1-flash-lite' : undefined,
        roleTitle: 'Rapid Desk Quick-Check Assistant',
        systemInstruction:
          'You are a fast, concise trading desk assistant at Apex Trader AI. Give crisp bullet-point answers with exact price levels and zero fluff.',
      },
    };

    const selectedMode = modeConfig[taskMode] || modeConfig.general;

    const contextBlock = terminalContext
      ? `\n\n[LIVE TERMINAL TELEMETRY]\nSelected Symbol: ${terminalContext.symbol}\nPrice Bid/Ask: ${terminalContext.bid} / ${terminalContext.ask}\nBot Mode: ${terminalContext.botMode}\nCurrent Signal: ${terminalContext.signalAction} (Score: ${terminalContext.signalScore}/100)\nHTF H1 Trend: ${terminalContext.h1Trend} | Volume Profile POC: ${terminalContext.poc}\nOpen Positions: ${terminalContext.openPositionsCount} | Equity: $${terminalContext.equity}\nRisk/Trade: ${terminalContext.riskPercent}%`
      : '';

    const safeHistory = Array.isArray(history) ? history.slice(-16) : [];
    const contents = [
      ...safeHistory.map((m: any) => ({
        role: m?.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m?.content || '') }],
      })),
      {
        role: 'user',
        parts: [{ text: `${message.trim()}${contextBlock}` }],
      },
    ];

    const actorKey = getRateLimitActor(req, user);
    const execResult = await geminiService.execute<{ reply: string }>({
      task: 'chat',
      rateLimitKey: actorKey,
      dedupKey: geminiService.computeDedupKey('chat', actorKey, {
        sessionId,
        message: message.trim(),
        taskMode,
        useSearchGrounding: Boolean(useSearchGrounding),
        historyLen: safeHistory.length,
      }),
      promptText: message,
      userRequestedGrounding: Boolean(useSearchGrounding),
      modelOverride: selectedMode.modelOverride,
      runner: async ({ model, useSearchGrounding: enableGrounding }) => {
        if (!aiClient) throw new Error('API key missing');
        const config: any = {
          systemInstruction: selectedMode.systemInstruction,
        };

        if (selectedMode.thinkingLevel && modelSupportsThinking(model)) {
          config.thinkingConfig = { thinkingLevel: selectedMode.thinkingLevel };
        }

        if (enableGrounding) {
          config.tools = [{ googleSearch: {} }];
        }

        const response = await aiClient.models.generateContent({
          model,
          contents,
          config,
        });

        const sources = enableGrounding ? extractGroundingSources(response) : [];
        const hasSearchMeta =
          sources.length > 0 ||
          Boolean((response as any)?.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length);

        return {
          data: { reply: response.text || 'No response generated.' },
          usageMetadata: response.usageMetadata,
          groundingSources: sources,
          groundingUnavailableReason:
            enableGrounding && !hasSearchMeta
              ? 'Google Search Grounding was unavailable or returned no web results; reply used model knowledge + live terminal telemetry.'
              : undefined,
        };
      },
    });

    const replyText = execResult.data.reply;

    if (user) {
      await saveChatMessage(user.id, {
        sessionId,
        role: 'user',
        taskMode,
        modelUsed: execResult.meta.modelUsed,
        content: message.trim(),
      }).catch(() => {});

      await saveChatMessage(user.id, {
        sessionId,
        role: 'assistant',
        taskMode,
        modelUsed: execResult.meta.modelUsed,
        content: replyText,
        sourcesJson: execResult.sources,
      }).catch(() => {});
    }

    res.json({
      reply: replyText,
      modelUsed: execResult.meta.modelUsed,
      roleTitle: selectedMode.roleTitle,
      sources: execResult.sources,
      meta: execResult.meta,
    });
  } catch (error: any) {
    sendStructuredAIError(res, error);
  }
});

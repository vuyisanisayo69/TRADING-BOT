import { Router } from 'express';
import { ThinkingLevel, Type } from '@google/genai';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import {
  getChartIntelligenceReports,
  getOrCreateUser,
  saveChartIntelligenceReport,
} from '../db/repository.ts';
import {
  MAX_IMAGE_BYTES,
  normalizeTradeClassification,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '../utils/chartIntelligence.ts';
import { geminiService, GeminiServiceError } from '../lib/geminiService.ts';
import {
  getAiClient,
  getRateLimitActor,
  modelSupportsThinking,
  resolveOptionalUser,
  sendStructuredAIError,
} from '../lib/aiRouteHelpers.ts';

export const chartIntelligenceRouter = Router();

chartIntelligenceRouter.post('/analyze', async (req, res) => {
  try {
    const aiClient = getAiClient();
    const user = await resolveOptionalUser(req);
    const {
      imageBase64,
      mimeType = 'image/png',
      manualSymbol,
      manualTimeframe,
      eaLongOnly = true,
    } = req.body || {};

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return sendStructuredAIError(
        res,
        new GeminiServiceError({
          httpStatus: 400,
          code: 'INVALID_REQUEST',
          title: 'INVALID CHART IMAGE',
          reason: 'A valid chart screenshot image is required.',
          actions: ['Upload a valid PNG, JPG, JPEG, or WEBP chart image.'],
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
          actions: ['Upload a PNG, JPG, JPEG, or WEBP screenshot.'],
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
          title: 'IMAGE EXCEEDS SIZE LIMIT',
          reason: `Image payload exceeds maximum allowed size (${MAX_IMAGE_BYTES / (1024 * 1024)} MB).`,
          actions: ['Compress or resize the screenshot under 8 MB and retry.'],
          retryable: false,
        })
      );
    }

    const analyzedAt = new Date().toISOString();

    const prompt = `You are the Principal Technical Analyst & Chart Intelligence Engine inside APEX TRADER AI.
Inspect ONLY the actual uploaded financial chart screenshot image (TradingView, MetaTrader 4, MetaTrader 5, Exness, or other broker charting platform).

CRITICAL GROUNDING & ANTI-HALLUCINATION RULES:
1. Read ONLY what is directly visible in the uploaded chart image.
2. If any field (instrument/symbol, timeframe, current price, candle OHLC, volume, moving averages, indicators, price axis labels) is unreadable, hidden, cropped, or blurry, explicitly write "UNKNOWN" (and null for numericDisplayedPrice).
3. NEVER invent prices, indicator values, market data, or unseen indicators. Never assume SMMA 5, SMMA 50, EMA, RSI, ATR, VWAP, or Volume Profile exist unless visibly drawn on the screenshot.
4. Clearly separate observed visual evidence (observedEvidence) from analytical interpretation (aiInterpretation).
5. Explicitly inspect the rightmost candle: determine whether lastCandleStatus is "COMPLETE", "STILL_FORMING", or "UNKNOWN" and explain why.
6. Produce BOTH conditional scenarios: Scenario A (Bullish / Long) AND Scenario B (Bearish / Short). Both must be strictly conditional ("If X occurs..."), never predictions or guarantees.
7. EA Policy: Current EA configuration is ${eaLongOnly ? 'LONG-ONLY' : 'BIDIRECTIONAL'}. Short setups may still be fully analysed in Scenario B, with executionAllowedByCurrentEA set to ${!eaLongOnly}.
8. Final classification MUST be exactly one of:
   - "VALID LONG SETUP"
   - "VALID SHORT SETUP"
   - "POTENTIAL SETUP — WAIT FOR CONFIRMATION"
   - "NO VALID SETUP"
   - "INSUFFICIENT IMAGE INFORMATION"
   NEVER force VALID LONG SETUP or VALID SHORT SETUP when evidence is missing, price axis is uncalibrated, image is blurry, price is consolidating sideways, or confirmation candle close has not yet occurred.
9. Confluence Score Factors (0-100 rawScore0To100 per factor): explain missing evidence clearly; never frame any score as statistical probability of profit.
10. Chart Annotations (normalized 0..1000 coordinates over the uploaded image where x=0 is left edge, x=1000 is right edge, y=0 is top edge, y=1000 is bottom edge):
   - Draw only visual zones/levels reliably observable on the image.
   - If exact price axis numbers are unreadable/hidden, set isApproximate=true and leave priceLabel as "Approx. visual zone" without fabricating exact numerical prices!
   - Use strictly these colorRole mappings:
     * "green": bullish zones, bullish FVGs, bullish order blocks, Scenario A / long arrows, TP levels
     * "red": bearish zones, bearish FVGs, bearish order blocks, Scenario B / short arrows, SL levels
     * "yellow": caution, equal highs/lows, liquidity sweeps, liquidity pools
     * "blue": market structure, BOS, CHoCH, confirmation/breakout/retest levels
     * "grey": neutral or unconfirmed zones
   - Include Scenario A and Scenario B labels where appropriate.

Optional Trader Context Overrides (use ONLY as fallback context if unreadable in screenshot, NEVER overwrite clear screenshot labels):
- Manual Symbol Hint: ${manualSymbol || 'None provided'}
- Manual Timeframe Hint: ${manualTimeframe || 'None provided'}`;

    const scenarioSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        confirmationLevel: { type: Type.STRING },
        breakoutOrBreakdownRequirements: { type: Type.STRING },
        retestRequirements: { type: Type.STRING },
        momentumConfirmation: { type: Type.STRING },
        structureConfirmation: { type: Type.STRING },
        potentialEntryZone: { type: Type.STRING },
        invalidationLevel: { type: Type.STRING },
        suggestedSlCalculation: { type: Type.STRING },
        potentialTp1: { type: Type.STRING },
        potentialTp2: { type: Type.STRING },
        riskRewardEstimate: { type: Type.STRING },
        whatMustHappen: { type: Type.STRING },
        whatConfirms: { type: Type.STRING },
        whatInvalidates: { type: Type.STRING },
        whatMakesUnreliable: { type: Type.STRING },
        requiredCandleClose: { type: Type.STRING },
      },
      required: [
        'title',
        'confirmationLevel',
        'breakoutOrBreakdownRequirements',
        'retestRequirements',
        'momentumConfirmation',
        'structureConfirmation',
        'potentialEntryZone',
        'invalidationLevel',
        'suggestedSlCalculation',
        'potentialTp1',
        'potentialTp2',
        'riskRewardEstimate',
        'whatMustHappen',
        'whatConfirms',
        'whatInvalidates',
        'whatMakesUnreliable',
        'requiredCandleClose',
      ],
    };

    const actorKey = getRateLimitActor(req, user);
    const execResult = await geminiService.execute<any>({
      task: 'chart-intelligence',
      rateLimitKey: actorKey,
      dedupKey: geminiService.computeDedupKey('chart-intelligence', actorKey, {
        imageHead: cleanBase64.slice(0, 128),
        imageLen: cleanBase64.length,
        manualSymbol,
        manualTimeframe,
        eaLongOnly,
      }),
      timeoutMs: 65000,
      runner: async ({ model }) => {
        if (!aiClient) throw new Error('API key missing');
        const config: any = {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              extracted: {
                type: Type.OBJECT,
                properties: {
                  platformDetected: { type: Type.STRING },
                  symbolDetected: { type: Type.STRING },
                  timeframeDetected: { type: Type.STRING },
                  currentDisplayedPrice: { type: Type.STRING },
                  numericDisplayedPrice: { type: Type.NUMBER, nullable: true },
                  candleOhlc: { type: Type.STRING },
                  visibleIndicators: { type: Type.ARRAY, items: { type: Type.STRING } },
                  movingAveragesVisible: { type: Type.STRING },
                  supportAndResistanceObserved: { type: Type.ARRAY, items: { type: Type.STRING } },
                  volumeInformation: { type: Type.STRING },
                  priceAxisLabelsVisible: { type: Type.BOOLEAN },
                  priceAxisCalibrated: { type: Type.BOOLEAN },
                  candleStructureSummary: { type: Type.STRING },
                  imageQuality: { type: Type.STRING, description: 'CLEAR, MODERATE, or BLURRY' },
                  lastCandleStatus: { type: Type.STRING, description: 'COMPLETE, STILL_FORMING, or UNKNOWN' },
                  lastCandleExplanation: { type: Type.STRING },
                  observedEvidence: { type: Type.ARRAY, items: { type: Type.STRING } },
                  aiInterpretation: { type: Type.ARRAY, items: { type: Type.STRING } },
                  uncertaintiesAndLimitations: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: [
                  'platformDetected',
                  'symbolDetected',
                  'timeframeDetected',
                  'currentDisplayedPrice',
                  'candleOhlc',
                  'visibleIndicators',
                  'movingAveragesVisible',
                  'supportAndResistanceObserved',
                  'volumeInformation',
                  'priceAxisLabelsVisible',
                  'priceAxisCalibrated',
                  'candleStructureSummary',
                  'imageQuality',
                  'lastCandleStatus',
                  'lastCandleExplanation',
                  'observedEvidence',
                  'aiInterpretation',
                  'uncertaintiesAndLimitations',
                ],
              },
              technical: {
                type: Type.OBJECT,
                properties: {
                  marketStructure: {
                    type: Type.OBJECT,
                    properties: {
                      higherHighs: { type: Type.STRING },
                      higherLows: { type: Type.STRING },
                      lowerHighs: { type: Type.STRING },
                      lowerLows: { type: Type.STRING },
                      bos: { type: Type.STRING },
                      choch: { type: Type.STRING },
                      trendOrConsolidation: { type: Type.STRING },
                    },
                    required: ['higherHighs', 'higherLows', 'lowerHighs', 'lowerLows', 'bos', 'choch', 'trendOrConsolidation'],
                  },
                  supportAndResistance: {
                    type: Type.OBJECT,
                    properties: {
                      majorResistanceZones: { type: Type.STRING },
                      minorResistanceZones: { type: Type.STRING },
                      majorSupportZones: { type: Type.STRING },
                      minorSupportZones: { type: Type.STRING },
                      previousSwingHighsAndLows: { type: Type.STRING },
                    },
                    required: ['majorResistanceZones', 'minorResistanceZones', 'majorSupportZones', 'minorSupportZones', 'previousSwingHighsAndLows'],
                  },
                  liquidity: {
                    type: Type.OBJECT,
                    properties: {
                      equalHighs: { type: Type.STRING },
                      equalLows: { type: Type.STRING },
                      liquidityPools: { type: Type.STRING },
                      potentialLiquiditySweeps: { type: Type.STRING },
                      rejectionFollowingSweeps: { type: Type.STRING },
                    },
                    required: ['equalHighs', 'equalLows', 'liquidityPools', 'potentialLiquiditySweeps', 'rejectionFollowingSweeps'],
                  },
                  fairValueGaps: {
                    type: Type.OBJECT,
                    properties: {
                      bullishFvg: { type: Type.STRING },
                      bearishFvg: { type: Type.STRING },
                      unfilledImbalance: { type: Type.STRING },
                      mitigationStatus: { type: Type.STRING },
                    },
                    required: ['bullishFvg', 'bearishFvg', 'unfilledImbalance', 'mitigationStatus'],
                  },
                  orderBlocks: {
                    type: Type.OBJECT,
                    properties: {
                      potentialBullishOrderBlocks: { type: Type.STRING },
                      potentialBearishOrderBlocks: { type: Type.STRING },
                      supplyAndDemandZones: { type: Type.STRING },
                      invalidationConditions: { type: Type.STRING },
                    },
                    required: ['potentialBullishOrderBlocks', 'potentialBearishOrderBlocks', 'supplyAndDemandZones', 'invalidationConditions'],
                  },
                  displacement: {
                    type: Type.OBJECT,
                    properties: {
                      strongBullishCandles: { type: Type.STRING },
                      strongBearishCandles: { type: Type.STRING },
                      momentumShifts: { type: Type.STRING },
                      possibleBreakoutCandles: { type: Type.STRING },
                    },
                    required: ['strongBullishCandles', 'strongBearishCandles', 'momentumShifts', 'possibleBreakoutCandles'],
                  },
                  indicators: {
                    type: Type.OBJECT,
                    properties: {
                      smma5: { type: Type.STRING },
                      smma50: { type: Type.STRING },
                      ema: { type: Type.STRING },
                      rsi: { type: Type.STRING },
                      atr: { type: Type.STRING },
                      vwap: { type: Type.STRING },
                      volumeProfile: { type: Type.STRING },
                    },
                    required: ['smma5', 'smma50', 'ema', 'rsi', 'atr', 'vwap', 'volumeProfile'],
                  },
                },
                required: ['marketStructure', 'supportAndResistance', 'liquidity', 'fairValueGaps', 'orderBlocks', 'displacement', 'indicators'],
              },
              annotations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    category: { type: Type.STRING },
                    kind: { type: Type.STRING, description: 'box, line, arrow, or label' },
                    colorRole: { type: Type.STRING, description: 'green, red, yellow, blue, or grey' },
                    label: { type: Type.STRING },
                    priceLabel: { type: Type.STRING },
                    isApproximate: { type: Type.BOOLEAN },
                    x1: { type: Type.NUMBER },
                    y1: { type: Type.NUMBER },
                    x2: { type: Type.NUMBER },
                    y2: { type: Type.NUMBER },
                  },
                  required: ['id', 'category', 'kind', 'colorRole', 'label', 'isApproximate', 'x1', 'y1', 'x2', 'y2'],
                },
              },
              scenarioA: scenarioSchema,
              scenarioB: scenarioSchema,
              classification: { type: Type.STRING },
              classificationRationale: { type: Type.STRING },
              hasStrongConfirmation: { type: Type.BOOLEAN },
              confluenceFactors: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    label: { type: Type.STRING },
                    rawScore0To100: { type: Type.NUMBER },
                    evidenceStatus: { type: Type.STRING, description: 'OBSERVED, PARTIAL, or MISSING' },
                    explanation: { type: Type.STRING },
                  },
                  required: ['id', 'label', 'rawScore0To100', 'evidenceStatus', 'explanation'],
                },
              },
              reportSections: {
                type: Type.OBJECT,
                properties: {
                  A_marketOverview: { type: Type.STRING },
                  B_detectedTrend: { type: Type.STRING },
                  C_keySupportAndResistance: { type: Type.STRING },
                  D_marketStructure: { type: Type.STRING },
                  E_liquidityAnalysis: { type: Type.STRING },
                  F_fvgAndOrderBlockAnalysis: { type: Type.STRING },
                  G_indicatorInterpretation: { type: Type.STRING },
                  H_scenarioABullish: { type: Type.STRING },
                  I_scenarioBBearish: { type: Type.STRING },
                  J_finalTradeClassification: { type: Type.STRING },
                  K_riskAndRewardAnalysis: { type: Type.STRING },
                  L_reasonsToWaitOrReject: { type: Type.STRING },
                  beginnerPlainLanguageSummary: { type: Type.STRING },
                },
                required: [
                  'A_marketOverview',
                  'B_detectedTrend',
                  'C_keySupportAndResistance',
                  'D_marketStructure',
                  'E_liquidityAnalysis',
                  'F_fvgAndOrderBlockAnalysis',
                  'G_indicatorInterpretation',
                  'H_scenarioABullish',
                  'I_scenarioBBearish',
                  'J_finalTradeClassification',
                  'K_riskAndRewardAnalysis',
                  'L_reasonsToWaitOrReject',
                  'beginnerPlainLanguageSummary',
                ],
              },
            },
            required: [
              'extracted',
              'technical',
              'annotations',
              'scenarioA',
              'scenarioB',
              'classification',
              'classificationRationale',
              'hasStrongConfirmation',
              'confluenceFactors',
              'reportSections',
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
              { text: prompt },
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

    const parsed = execResult.data;
    const modelVersion = execResult.meta.modelUsed;

    const safeExtracted = {
      ...parsed.extracted,
      numericDisplayedPrice:
        typeof parsed.extracted?.numericDisplayedPrice === 'number' &&
        Number.isFinite(parsed.extracted.numericDisplayedPrice)
          ? parsed.extracted.numericDisplayedPrice
          : null,
    };

    const normalizedClass = normalizeTradeClassification(
      parsed.classification,
      {
        imageQuality: safeExtracted.imageQuality || 'MODERATE',
        lastCandleStatus: safeExtracted.lastCandleStatus || 'UNKNOWN',
        priceAxisLabelsVisible: Boolean(safeExtracted.priceAxisLabelsVisible),
      },
      Boolean(parsed.hasStrongConfirmation)
    );

    const clampCoord = (v: any) => Math.max(0, Math.min(1000, Number(v) || 0));
    const safeAnnotations = (Array.isArray(parsed.annotations) ? parsed.annotations : []).map(
      (a: any, idx: number) => ({
        id: a.id || `ann_${idx}`,
        category: a.category || 'SUPPORT_ZONE',
        kind: ['box', 'line', 'arrow', 'label'].includes(a.kind) ? a.kind : 'label',
        colorRole: ['green', 'red', 'yellow', 'blue', 'grey'].includes(a.colorRole)
          ? a.colorRole
          : 'grey',
        label: String(a.label || 'Zone'),
        priceLabel: a.priceLabel ? String(a.priceLabel) : undefined,
        isApproximate: Boolean(a.isApproximate || !safeExtracted.priceAxisCalibrated),
        x1: clampCoord(a.x1),
        y1: clampCoord(a.y1),
        x2: clampCoord(a.x2),
        y2: clampCoord(a.y2),
      })
    );

    const factorDefaults = [
      { id: 'marketStructure', label: 'Market Structure' },
      { id: 'trendAlignment', label: 'Trend Alignment' },
      { id: 'supportResistanceReaction', label: 'Support/Resistance Reaction' },
      { id: 'liquidityBehaviour', label: 'Liquidity Behaviour' },
      { id: 'momentum', label: 'Momentum' },
      { id: 'candleConfirmation', label: 'Candle Confirmation' },
      { id: 'volumeConfirmation', label: 'Volume Confirmation' },
      { id: 'higherTimeframeAlignment', label: 'Higher-Timeframe Alignment' },
    ];

    const incomingFactors = Array.isArray(parsed.confluenceFactors) ? parsed.confluenceFactors : [];
    const safeFactors = factorDefaults.map((def) => {
      const found = incomingFactors.find((f: any) => f.id === def.id);
      return {
        id: def.id,
        label: def.label,
        rawScore0To100: found ? Math.max(0, Math.min(100, Number(found.rawScore0To100) || 0)) : 0,
        evidenceStatus:
          found && ['OBSERVED', 'PARTIAL', 'MISSING'].includes(found.evidenceStatus)
            ? found.evidenceStatus
            : 'MISSING',
        explanation: found?.explanation || 'Evidence not visible in screenshot.',
      };
    });

    const report = {
      id: `ci_${Date.now()}`,
      analyzedAt,
      modelVersion,
      manualSymbolOverride: manualSymbol || undefined,
      manualTimeframeOverride: manualTimeframe || undefined,
      extracted: safeExtracted,
      technical: parsed.technical,
      annotations: safeAnnotations,
      scenarioA: {
        ...parsed.scenarioA,
        executionAllowedByCurrentEA: true,
        executionStatusNote: 'Subject to Signals Engine + live broker validation & EA risk limits',
      },
      scenarioB: {
        ...parsed.scenarioB,
        executionAllowedByCurrentEA: !eaLongOnly,
        executionStatusNote: eaLongOnly
          ? 'NOT ENABLED FOR EXECUTION (Long-only EA policy active)'
          : 'Subject to Signals Engine + live broker validation & EA risk limits',
      },
      classification: normalizedClass.classification,
      classificationRationale: normalizedClass.adjustedReason
        ? `${parsed.classificationRationale} (${normalizedClass.adjustedReason})`
        : parsed.classificationRationale,
      confluenceFactors: safeFactors,
      reportSections: parsed.reportSections,
    };

    res.json({ report, meta: execResult.meta });
  } catch (error: any) {
    sendStructuredAIError(res, error);
  }
});

chartIntelligenceRouter.get('/history', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await getOrCreateUser(
      req.user!.uid,
      req.user!.email || 'trader@apex.local',
      req.user!.name
    );
    const reports = await getChartIntelligenceReports(user.id);
    res.json({ reports });
  } catch (error: any) {
    console.error('Failed to fetch Chart Intelligence history:', error);
    res.status(500).json({ error: error.message || 'Failed to load Chart Intelligence history' });
  }
});

chartIntelligenceRouter.post('/history', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await getOrCreateUser(
      req.user!.uid,
      req.user!.email || 'trader@apex.local',
      req.user!.name
    );
    const { report, confluenceScore, consentImageStored = false } = req.body || {};
    if (!report || !report.id) {
      return res.status(400).json({ error: 'Valid Chart Intelligence report payload is required.' });
    }

    const saved = await saveChartIntelligenceReport(user.id, {
      clientReportId: String(report.id),
      symbolDetected:
        report.manualSymbolOverride || report.extracted?.symbolDetected || 'UNKNOWN',
      timeframeDetected:
        report.manualTimeframeOverride || report.extracted?.timeframeDetected || 'UNKNOWN',
      platformDetected: report.extracted?.platformDetected || 'UNKNOWN',
      classification: report.classification || 'INSUFFICIENT IMAGE INFORMATION',
      confluenceScore: Number(confluenceScore) || 0,
      modelVersion: report.modelVersion || 'gemini-4-hydrogen',
      savedToJournal: true,
      consentImageStored: Boolean(consentImageStored),
      reportJson: report,
      analyzedAt: report.analyzedAt || new Date().toISOString(),
    });

    res.json({ saved });
  } catch (error: any) {
    console.error('Failed to save Chart Intelligence report:', error);
    res.status(500).json({ error: error.message || 'Failed to save Chart Intelligence report' });
  }
});

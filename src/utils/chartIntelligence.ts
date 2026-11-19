/**
 * Apex Trader AI — Chart Intelligence Engine Types, Validation & Scoring Utilities
 */

export type TradeClassification =
  | 'VALID LONG SETUP'
  | 'VALID SHORT SETUP'
  | 'POTENTIAL SETUP — WAIT FOR CONFIRMATION'
  | 'NO VALID SETUP'
  | 'INSUFFICIENT IMAGE INFORMATION';

export type AnnotationColorRole = 'green' | 'red' | 'yellow' | 'blue' | 'grey';

export type AnnotationCategory =
  | 'SUPPORT_ZONE'
  | 'RESISTANCE_ZONE'
  | 'BULLISH_FVG'
  | 'BEARISH_FVG'
  | 'ORDER_BLOCK_BULL'
  | 'ORDER_BLOCK_BEAR'
  | 'LIQUIDITY_SWEEP'
  | 'BREAKOUT_LEVEL'
  | 'RETEST_ZONE'
  | 'ENTRY_ZONE'
  | 'STOP_LOSS'
  | 'TAKE_PROFIT'
  | 'BULLISH_ARROW'
  | 'BEARISH_ARROW'
  | 'BOS_LABEL'
  | 'CHOCH_LABEL'
  | 'SCENARIO_A_LABEL'
  | 'SCENARIO_B_LABEL';

export interface ChartAnnotationItem {
  id: string;
  category: AnnotationCategory;
  kind: 'box' | 'line' | 'arrow' | 'label';
  colorRole: AnnotationColorRole;
  label: string;
  priceLabel?: string;
  isApproximate: boolean;
  // Normalized 0..1000 coordinates relative to original image dimensions
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ScenarioPlan {
  title: string;
  confirmationLevel: string;
  breakoutOrBreakdownRequirements: string;
  retestRequirements: string;
  momentumConfirmation: string;
  structureConfirmation: string;
  potentialEntryZone: string;
  invalidationLevel: string;
  suggestedSlCalculation: string;
  potentialTp1: string;
  potentialTp2: string;
  riskRewardEstimate: string;
  whatMustHappen: string;
  whatConfirms: string;
  whatInvalidates: string;
  whatMakesUnreliable: string;
  requiredCandleClose: string;
  executionAllowedByCurrentEA: boolean;
  executionStatusNote: string;
}

export interface ConfluenceFactorDetail {
  id:
    | 'marketStructure'
    | 'trendAlignment'
    | 'supportResistanceReaction'
    | 'liquidityBehaviour'
    | 'momentum'
    | 'candleConfirmation'
    | 'volumeConfirmation'
    | 'higherTimeframeAlignment';
  label: string;
  rawScore0To100: number;
  evidenceStatus: 'OBSERVED' | 'PARTIAL' | 'MISSING';
  explanation: string;
}

export interface ConfluenceWeights {
  marketStructure: number;
  trendAlignment: number;
  supportResistanceReaction: number;
  liquidityBehaviour: number;
  momentum: number;
  candleConfirmation: number;
  volumeConfirmation: number;
  higherTimeframeAlignment: number;
}

export const DEFAULT_CONFLUENCE_WEIGHTS: ConfluenceWeights = {
  marketStructure: 20,
  trendAlignment: 15,
  supportResistanceReaction: 15,
  liquidityBehaviour: 15,
  momentum: 10,
  candleConfirmation: 10,
  volumeConfirmation: 5,
  higherTimeframeAlignment: 10,
};

export interface ExtractedChartTelemetry {
  platformDetected: string;
  symbolDetected: string;
  timeframeDetected: string;
  currentDisplayedPrice: string;
  numericDisplayedPrice: number | null;
  candleOhlc: string;
  visibleIndicators: string[];
  movingAveragesVisible: string;
  supportAndResistanceObserved: string[];
  volumeInformation: string;
  priceAxisLabelsVisible: boolean;
  priceAxisCalibrated: boolean;
  candleStructureSummary: string;
  imageQuality: 'CLEAR' | 'MODERATE' | 'BLURRY';
  lastCandleStatus: 'COMPLETE' | 'STILL_FORMING' | 'UNKNOWN';
  lastCandleExplanation: string;
  observedEvidence: string[];
  aiInterpretation: string[];
  uncertaintiesAndLimitations: string[];
}

export interface TechnicalAnalysisSections {
  marketStructure: {
    higherHighs: string;
    higherLows: string;
    lowerHighs: string;
    lowerLows: string;
    bos: string;
    choch: string;
    trendOrConsolidation: string;
  };
  supportAndResistance: {
    majorResistanceZones: string;
    minorResistanceZones: string;
    majorSupportZones: string;
    minorSupportZones: string;
    previousSwingHighsAndLows: string;
  };
  liquidity: {
    equalHighs: string;
    equalLows: string;
    liquidityPools: string;
    potentialLiquiditySweeps: string;
    rejectionFollowingSweeps: string;
  };
  fairValueGaps: {
    bullishFvg: string;
    bearishFvg: string;
    unfilledImbalance: string;
    mitigationStatus: string;
  };
  orderBlocks: {
    potentialBullishOrderBlocks: string;
    potentialBearishOrderBlocks: string;
    supplyAndDemandZones: string;
    invalidationConditions: string;
  };
  displacement: {
    strongBullishCandles: string;
    strongBearishCandles: string;
    momentumShifts: string;
    possibleBreakoutCandles: string;
  };
  indicators: {
    smma5: string;
    smma50: string;
    ema: string;
    rsi: string;
    atr: string;
    vwap: string;
    volumeProfile: string;
  };
}

export interface FullReportSections {
  A_marketOverview: string;
  B_detectedTrend: string;
  C_keySupportAndResistance: string;
  D_marketStructure: string;
  E_liquidityAnalysis: string;
  F_fvgAndOrderBlockAnalysis: string;
  G_indicatorInterpretation: string;
  H_scenarioABullish: string;
  I_scenarioBBearish: string;
  J_finalTradeClassification: string;
  K_riskAndRewardAnalysis: string;
  L_reasonsToWaitOrReject: string;
  beginnerPlainLanguageSummary: string;
}

export interface ChartIntelligenceReport {
  id: string;
  analyzedAt: string;
  modelVersion: string;
  manualSymbolOverride?: string;
  manualTimeframeOverride?: string;
  extracted: ExtractedChartTelemetry;
  technical: TechnicalAnalysisSections;
  annotations: ChartAnnotationItem[];
  scenarioA: ScenarioPlan;
  scenarioB: ScenarioPlan;
  classification: TradeClassification;
  classificationRationale: string;
  confluenceFactors: ConfluenceFactorDetail[];
  reportSections: FullReportSections;
}

export interface LiveComparisonResult {
  verified: boolean;
  bannerText: string;
  screenshotSymbol: string;
  brokerSymbol: string | null;
  screenshotPrice: number | null;
  brokerPrice: number | null;
  priceDifference: number | null;
  priceDifferencePercent: number | null;
  isStaleScreenshot: boolean;
  timeframeMatches: boolean | null;
  dataTimestamp: string | null;
  notes: string;
}

export interface StrategyEngineHandoff {
  reportId: string;
  symbol: string;
  timeframe: string;
  classification: TradeClassification;
  confluenceScore: number;
  analyzedAt: string;
  scenarioAEntry: string;
  scenarioASL: string;
  scenarioATP1: string;
  scenarioBShortNote: string;
  requiresLiveValidation: true;
  eaLongOnlyPolicyActive: boolean;
}

export const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
] as const;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

export function validateChartImageFile(file: {
  type: string;
  size: number;
  name?: string;
}): { valid: boolean; error?: string } {
  const mime = (file.type || '').toLowerCase();
  if (!SUPPORTED_IMAGE_MIME_TYPES.includes(mime as any)) {
    return {
      valid: false,
      error: 'Unsupported file format. Upload a PNG, JPG, JPEG, or WEBP chart screenshot.',
    };
  }
  if (file.size <= 0) {
    return {
      valid: false,
      error: 'Uploaded image file is empty.',
    };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      valid: false,
      error: `Image exceeds the ${(MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(0)} MB limit.`,
    };
  }
  return { valid: true };
}

export function calculateWeightedConfluenceScore(
  factors: ConfluenceFactorDetail[],
  weights: ConfluenceWeights = DEFAULT_CONFLUENCE_WEIGHTS
): {
  totalScore: number;
  breakdown: Array<ConfluenceFactorDetail & { weight: number; weightedContribution: number }>;
} {
  const weightSum = Object.values(weights).reduce((s, w) => s + Math.max(0, w), 0);
  const safeDivisor = weightSum > 0 ? weightSum : 100;

  let total = 0;
  const breakdown = factors.map((f) => {
    const weight = Math.max(0, weights[f.id] ?? 0);
    const clampedRaw = Math.max(0, Math.min(100, f.rawScore0To100));
    const weightedContribution = (clampedRaw * weight) / safeDivisor;
    total += weightedContribution;
    return {
      ...f,
      weight,
      weightedContribution: Number(weightedContribution.toFixed(1)),
    };
  });

  return {
    totalScore: Math.round(Math.max(0, Math.min(100, total))),
    breakdown,
  };
}

export function normalizeTradeClassification(
  rawClassification: string,
  extracted: Pick<
    ExtractedChartTelemetry,
    'imageQuality' | 'lastCandleStatus' | 'priceAxisLabelsVisible'
  >,
  hasStrongConfirmation: boolean
): { classification: TradeClassification; adjustedReason?: string } {
  const allowed: TradeClassification[] = [
    'VALID LONG SETUP',
    'VALID SHORT SETUP',
    'POTENTIAL SETUP — WAIT FOR CONFIRMATION',
    'NO VALID SETUP',
    'INSUFFICIENT IMAGE INFORMATION',
  ];

  const matched = allowed.find((c) => c === rawClassification) || 'POTENTIAL SETUP — WAIT FOR CONFIRMATION';

  if (extracted.imageQuality === 'BLURRY') {
    return {
      classification: 'INSUFFICIENT IMAGE INFORMATION',
      adjustedReason: 'Downgraded: screenshot image clarity is too low for reliable structure verification.',
    };
  }

  if (
    (matched === 'VALID LONG SETUP' || matched === 'VALID SHORT SETUP') &&
    (!hasStrongConfirmation || !extracted.priceAxisLabelsVisible)
  ) {
    return {
      classification: 'POTENTIAL SETUP — WAIT FOR CONFIRMATION',
      adjustedReason:
        'Downgraded: required confirmation evidence or visible price-axis calibration is incomplete.',
    };
  }

  return { classification: matched };
}

export function computeLivePriceComparison(params: {
  screenshotSymbol: string;
  screenshotPrice: number | null;
  screenshotTimeframe: string;
  requestedTimeframe: string;
  isLiveConnection: boolean;
  brokerSymbol?: string | null;
  brokerPrice?: number | null;
  brokerTimestamp?: string | null;
}): LiveComparisonResult {
  const {
    screenshotSymbol,
    screenshotPrice,
    screenshotTimeframe,
    requestedTimeframe,
    isLiveConnection,
    brokerSymbol = null,
    brokerPrice = null,
    brokerTimestamp = null,
  } = params;

  if (!isLiveConnection || !brokerSymbol || brokerPrice === null || !Number.isFinite(brokerPrice)) {
    return {
      verified: false,
      bannerText: 'SCREENSHOT ANALYSIS ONLY — LIVE PRICE NOT VERIFIED.',
      screenshotSymbol,
      brokerSymbol: null,
      screenshotPrice,
      brokerPrice: null,
      priceDifference: null,
      priceDifferencePercent: null,
      isStaleScreenshot: false,
      timeframeMatches: null,
      dataTimestamp: null,
      notes: 'No authenticated live broker price feed connected. Screenshot values are kept strictly independent.',
    };
  }

  const normalizedChartSym = screenshotSymbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const normalizedBrokerSym = brokerSymbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const symbolsMatch =
    normalizedChartSym !== 'UNKNOWN' &&
    normalizedChartSym !== '' &&
    (normalizedChartSym === normalizedBrokerSym ||
      normalizedBrokerSym.includes(normalizedChartSym) ||
      normalizedChartSym.includes(normalizedBrokerSym));

  if (!symbolsMatch || screenshotPrice === null || !Number.isFinite(screenshotPrice) || screenshotPrice <= 0) {
    return {
      verified: false,
      bannerText: 'SCREENSHOT ANALYSIS ONLY — LIVE PRICE NOT VERIFIED.',
      screenshotSymbol,
      brokerSymbol,
      screenshotPrice,
      brokerPrice,
      priceDifference: null,
      priceDifferencePercent: null,
      isStaleScreenshot: false,
      timeframeMatches:
        screenshotTimeframe !== 'UNKNOWN'
          ? screenshotTimeframe.toUpperCase() === requestedTimeframe.toUpperCase()
          : null,
      dataTimestamp: brokerTimestamp,
      notes: !symbolsMatch
        ? `Screenshot symbol (${screenshotSymbol}) does not match live broker symbol (${brokerSymbol}).`
        : 'Screenshot price is UNKNOWN or unreadable, so live price variance cannot be computed.',
    };
  }

  const diff = brokerPrice - screenshotPrice;
  const diffPct = (diff / screenshotPrice) * 100;
  const isStale = Math.abs(diffPct) >= 0.35;
  const timeframeMatches =
    screenshotTimeframe !== 'UNKNOWN'
      ? screenshotTimeframe.toUpperCase() === requestedTimeframe.toUpperCase()
      : null;

  return {
    verified: true,
    bannerText: isStale
      ? 'STALE SCREENSHOT DETECTED — LIVE BROKER PRICE HAS DIVERGED'
      : 'LIVE DATA CROSS-CHECKED (SCREENSHOT PRESERVED)',
    screenshotSymbol,
    brokerSymbol,
    screenshotPrice,
    brokerPrice,
    priceDifference: Number(diff.toFixed(brokerPrice < 10 ? 5 : brokerPrice < 200 ? 3 : 2)),
    priceDifferencePercent: Number(diffPct.toFixed(3)),
    isStaleScreenshot: isStale,
    timeframeMatches,
    dataTimestamp: brokerTimestamp,
    notes: isStale
      ? `Live price differs by ${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(3)}% from the screenshot.`
      : 'Screenshot price is within active live spread tolerance.',
  };
}

export function buildStrategyEngineHandoff(
  report: ChartIntelligenceReport,
  confluenceScore: number,
  eaLongOnly = true
): StrategyEngineHandoff {
  const sym =
    report.manualSymbolOverride?.trim() ||
    (report.extracted.symbolDetected !== 'UNKNOWN' ? report.extracted.symbolDetected : 'UNKNOWN');
  const tf =
    report.manualTimeframeOverride?.trim() ||
    (report.extracted.timeframeDetected !== 'UNKNOWN' ? report.extracted.timeframeDetected : 'UNKNOWN');

  return {
    reportId: report.id,
    symbol: sym,
    timeframe: tf,
    classification: report.classification,
    confluenceScore,
    analyzedAt: report.analyzedAt,
    scenarioAEntry: report.scenarioA.potentialEntryZone,
    scenarioASL: report.scenarioA.suggestedSlCalculation,
    scenarioATP1: report.scenarioA.potentialTp1,
    scenarioBShortNote: eaLongOnly
      ? 'NOT ENABLED FOR EXECUTION (Long-only EA policy active)'
      : 'Short scenario advisory attached',
    requiresLiveValidation: true,
    eaLongOnlyPolicyActive: eaLongOnly,
  };
}

export const ANNOTATION_COLOR_HEX: Record<AnnotationColorRole, { stroke: string; fill: string; text: string }> = {
  green: { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.16)', text: '#6ee7b7' },
  red: { stroke: '#f43f5e', fill: 'rgba(244, 63, 94, 0.16)', text: '#fda4af' },
  yellow: { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.16)', text: '#fcd34d' },
  blue: { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.14)', text: '#93c5fd' },
  grey: { stroke: '#94a3b8', fill: 'rgba(148, 163, 184, 0.14)', text: '#cbd5e1' },
};

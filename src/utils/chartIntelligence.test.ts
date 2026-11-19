import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateChartImageFile,
  calculateWeightedConfluenceScore,
  normalizeTradeClassification,
  computeLivePriceComparison,
  buildStrategyEngineHandoff,
  DEFAULT_CONFLUENCE_WEIGHTS,
  type ChartIntelligenceReport,
} from './chartIntelligence.ts';

test('validateChartImageFile accepts PNG/JPEG/WEBP under 8MB and rejects invalid types or huge files', () => {
  assert.equal(validateChartImageFile({ type: 'image/png', size: 1024 * 500 }).valid, true);
  assert.equal(validateChartImageFile({ type: 'image/jpeg', size: 1024 * 500 }).valid, true);
  assert.equal(validateChartImageFile({ type: 'image/webp', size: 1024 * 500 }).valid, true);
  assert.equal(validateChartImageFile({ type: 'application/pdf', size: 1024 }).valid, false);
  assert.equal(validateChartImageFile({ type: 'image/png', size: 0 }).valid, false);
  assert.equal(validateChartImageFile({ type: 'image/png', size: 9 * 1024 * 1024 }).valid, false);
});

test('calculateWeightedConfluenceScore computes configurable weighted score out of 100', () => {
  const factors = [
    { id: 'marketStructure' as const, label: 'Market Structure', rawScore0To100: 80, evidenceStatus: 'OBSERVED' as const, explanation: 'Clear BOS' },
    { id: 'trendAlignment' as const, label: 'Trend Alignment', rawScore0To100: 80, evidenceStatus: 'OBSERVED' as const, explanation: 'Aligned' },
    { id: 'supportResistanceReaction' as const, label: 'S/R', rawScore0To100: 60, evidenceStatus: 'OBSERVED' as const, explanation: 'At support' },
    { id: 'liquidityBehaviour' as const, label: 'Liquidity', rawScore0To100: 70, evidenceStatus: 'OBSERVED' as const, explanation: 'Sweep' },
    { id: 'momentum' as const, label: 'Momentum', rawScore0To100: 50, evidenceStatus: 'PARTIAL' as const, explanation: 'Moderate' },
    { id: 'candleConfirmation' as const, label: 'Candle', rawScore0To100: 40, evidenceStatus: 'PARTIAL' as const, explanation: 'Forming' },
    { id: 'volumeConfirmation' as const, label: 'Volume', rawScore0To100: 0, evidenceStatus: 'MISSING' as const, explanation: 'Hidden' },
    { id: 'higherTimeframeAlignment' as const, label: 'HTF', rawScore0To100: 50, evidenceStatus: 'MISSING' as const, explanation: 'Single TF screenshot' },
  ];
  const result = calculateWeightedConfluenceScore(factors, DEFAULT_CONFLUENCE_WEIGHTS);
  assert.ok(result.totalScore > 50 && result.totalScore < 80);
  assert.equal(result.breakdown.length, 8);
});

test('normalizeTradeClassification never forces VALID LONG/SHORT on blurry or uncalibrated charts', () => {
  const blurry = normalizeTradeClassification(
    'VALID LONG SETUP',
    { imageQuality: 'BLURRY', lastCandleStatus: 'COMPLETE', priceAxisLabelsVisible: true },
    true
  );
  assert.equal(blurry.classification, 'INSUFFICIENT IMAGE INFORMATION');

  const uncalibrated = normalizeTradeClassification(
    'VALID SHORT SETUP',
    { imageQuality: 'CLEAR', lastCandleStatus: 'COMPLETE', priceAxisLabelsVisible: false },
    true
  );
  assert.equal(uncalibrated.classification, 'POTENTIAL SETUP — WAIT FOR CONFIRMATION');
});

test('computeLivePriceComparison preserves screenshot values and outputs required offline banner', () => {
  const offline = computeLivePriceComparison({
    screenshotSymbol: 'XAUUSD',
    screenshotPrice: 2654.2,
    screenshotTimeframe: 'M15',
    requestedTimeframe: 'M15',
    isLiveConnection: false,
  });
  assert.equal(offline.verified, false);
  assert.equal(offline.bannerText, 'SCREENSHOT ANALYSIS ONLY — LIVE PRICE NOT VERIFIED.');

  const stale = computeLivePriceComparison({
    screenshotSymbol: 'XAUUSD',
    screenshotPrice: 2600.0,
    screenshotTimeframe: 'M15',
    requestedTimeframe: 'M15',
    isLiveConnection: true,
    brokerSymbol: 'XAU/USD',
    brokerPrice: 2654.0,
    brokerTimestamp: '2026-11-15T16:20:00Z',
  });
  assert.equal(stale.verified, true);
  assert.equal(stale.isStaleScreenshot, true);
  assert.equal(stale.screenshotPrice, 2600.0);
  assert.equal(stale.brokerPrice, 2654.0);
});

test('buildStrategyEngineHandoff marks short scenarios NOT ENABLED FOR EXECUTION under long-only EA policy', () => {
  const mockReport = {
    id: 'ci_1',
    analyzedAt: '2026-11-15T16:20:00Z',
    modelVersion: 'gemini-4-hydrogen',
    extracted: {
      platformDetected: 'TradingView',
      symbolDetected: 'BTC/USD',
      timeframeDetected: 'M15',
      currentDisplayedPrice: '68420.5',
      numericDisplayedPrice: 68420.5,
      candleOhlc: 'UNKNOWN',
      visibleIndicators: [],
      movingAveragesVisible: 'UNKNOWN',
      supportAndResistanceObserved: [],
      volumeInformation: 'UNKNOWN',
      priceAxisLabelsVisible: true,
      priceAxisCalibrated: true,
      candleStructureSummary: 'Consolidation',
      imageQuality: 'CLEAR' as const,
      lastCandleStatus: 'STILL_FORMING' as const,
      lastCandleExplanation: 'Last candle still forming',
      observedEvidence: [],
      aiInterpretation: [],
      uncertaintiesAndLimitations: [],
    },
    scenarioA: {
      potentialEntryZone: '68500',
      suggestedSlCalculation: '68100',
      potentialTp1: '69200',
    },
    classification: 'POTENTIAL SETUP — WAIT FOR CONFIRMATION' as const,
  } as unknown as ChartIntelligenceReport;

  const handoff = buildStrategyEngineHandoff(mockReport, 64, true);
  assert.equal(handoff.requiresLiveValidation, true);
  assert.equal(handoff.eaLongOnlyPolicyActive, true);
  assert.ok(handoff.scenarioBShortNote.includes('NOT ENABLED FOR EXECUTION'));
});

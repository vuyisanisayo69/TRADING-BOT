import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  validateChartImageFile,
  calculateWeightedConfluenceScore,
  computeLivePriceComparison,
  buildStrategyEngineHandoff,
  DEFAULT_CONFLUENCE_WEIGHTS,
  type ChartIntelligenceReport,
  type ConfluenceWeights,
  type StrategyEngineHandoff,
} from '../utils/chartIntelligence.ts';
import type { MarketTicker } from '../utils/marketData.ts';
import type { AIMetadataPayload, StructuredAIError } from '../lib/geminiTypes.ts';
import { parseStructuredAIError, normalizeCatchToAIError } from '../utils/aiErrorClient.ts';
import { AIServiceAlert } from './AIServiceAlert.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { AnnotatedChartCanvas } from './AnnotatedChartCanvas.tsx';
import {
  Radar,
  Upload,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Trash2,
  Sliders,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  Send,
  BookmarkCheck,
  History,
  BookOpen,
  Clock,
  Cpu,
  AlertTriangle,
  GitCompare,
  Lock,
} from 'lucide-react';

interface ChartIntelligenceViewProps {
  tickers: Record<string, MarketTicker>;
  isLiveMode: boolean;
  eaLongOnly?: boolean;
  savedReports: ChartIntelligenceReport[];
  onSaveToJournal: (report: ChartIntelligenceReport, score: number) => void;
  onSendToStrategyEngine: (handoff: StrategyEngineHandoff) => void;
  onSyncHistoryLoaded?: (reports: ChartIntelligenceReport[]) => void;
}

export const ChartIntelligenceView: React.FC<ChartIntelligenceViewProps> = ({
  tickers,
  isLiveMode,
  eaLongOnly = true,
  savedReports,
  onSaveToJournal,
  onSendToStrategyEngine,
  onSyncHistoryLoaded,
}) => {
  const { user, getIdToken, signInWithGoogle } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitLockRef = useRef<boolean>(false);

  // Upload & Controls State (Never auto-analyzes on file selection!)
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/png');
  const [fileName, setFileName] = useState<string>('');
  const [fileSizeKB, setFileSizeKB] = useState<number>(0);
  const [manualSymbol, setManualSymbol] = useState<string>('');
  const [manualTimeframe, setManualTimeframe] = useState<string>('');
  const [requestedTimeframe, setRequestedTimeframe] = useState<string>('M15');

  // Analysis State
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiError, setAiError] = useState<StructuredAIError | null>(null);
  const [analysisMeta, setAnalysisMeta] = useState<AIMetadataPayload | null>(null);
  const [report, setReport] = useState<ChartIntelligenceReport | null>(null);
  const [weights, setWeights] = useState<ConfluenceWeights>(DEFAULT_CONFLUENCE_WEIGHTS);
  const [showWeightsConfig, setShowWeightsConfig] = useState<boolean>(false);

  // Report Sub-Navigation & Comparison
  const [detailTab, setDetailTab] = useState<'report' | 'technical' | 'history'>('report');
  const [compareReportId, setCompareReportId] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [handoffFeedback, setHandoffFeedback] = useState<string | null>(null);

  const onSyncHistoryRef = useRef(onSyncHistoryLoaded);
  onSyncHistoryRef.current = onSyncHistoryLoaded;

  // Load persisted Chart Intelligence history when signed in
  useEffect(() => {
    if (!user || !onSyncHistoryRef.current) return;
    let cancelled = false;
    async function fetchHistory() {
      const token = await getIdToken();
      if (!token) return;
      try {
        const res = await fetch('/api/chart-intelligence/history', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.reports) && onSyncHistoryRef.current) {
          const parsed = data.reports
            .map((r: any) => r.reportJson as ChartIntelligenceReport)
            .filter(Boolean);
          onSyncHistoryRef.current(parsed);
        }
      } catch {
        // Ignore non-fatal fetch error
      }
    }
    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [user, getIdToken]);

  const handleSelectedFile = (file: File | undefined) => {
    if (!file) return;
    const validation = validateChartImageFile(file);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Invalid chart image.');
      return;
    }

    setErrorMsg(null);
    setAiError(null);
    setSaveFeedback(null);
    setHandoffFeedback(null);
    setMimeType(file.type || 'image/png');
    setFileName(file.name);
    setFileSizeKB(Math.round(file.size / 1024));

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImagePreview(reader.result);
        setReport(null); // Clear prior report so user explicitly clicks Analyse Chart
        setAnalysisMeta(null);
        setStatusMessage('Image staged securely in memory. Click "Analyse Chart" to run inspection.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setFileName('');
    setFileSizeKB(0);
    setReport(null);
    setAnalysisMeta(null);
    setErrorMsg(null);
    setAiError(null);
    setStatusMessage('');
    setSaveFeedback(null);
    setHandoffFeedback(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAnalyzeChart = async () => {
    if (submitLockRef.current || loading) return;
    if (!imagePreview) {
      setErrorMsg('Please upload a chart screenshot before requesting analysis.');
      return;
    }

    submitLockRef.current = true;
    setLoading(true);
    setErrorMsg(null);
    setAiError(null);
    setSaveFeedback(null);
    setHandoffFeedback(null);
    setStatusMessage('Inspecting screenshot pixels, structure, FVGs, liquidity, and conditional scenarios...');

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/chart-intelligence/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageBase64: imagePreview,
          mimeType,
          manualSymbol: manualSymbol.trim() || undefined,
          manualTimeframe: manualTimeframe.trim() || undefined,
          eaLongOnly,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.report) {
        setReport(null);
        setAnalysisMeta(null);
        setAiError(parseStructuredAIError(data, res.status));
        setStatusMessage('');
        return;
      }

      setReport(data.report);
      setAnalysisMeta(data.meta || null);
      setStatusMessage('Analysis complete. Review evidence, both conditional scenarios, and classification.');
      setDetailTab('report');
    } catch (err) {
      setReport(null);
      setAnalysisMeta(null);
      setAiError(normalizeCatchToAIError(err));
      setStatusMessage('');
    } finally {
      submitLockRef.current = false;
      setLoading(false);
    }
  };

  // Dynamic weighted confluence score
  const confluenceResult = useMemo(() => {
    if (!report) return null;
    return calculateWeightedConfluenceScore(report.confluenceFactors, weights);
  }, [report, weights]);

  // Live Broker Data Cross-Comparison (Strictly non-substituting!)
  const liveComparison = useMemo(() => {
    if (!report) return null;
    const effectiveSymbol =
      manualSymbol.trim() ||
      (report.extracted.symbolDetected !== 'UNKNOWN' ? report.extracted.symbolDetected : '');
    const effectiveTf =
      manualTimeframe.trim() || report.extracted.timeframeDetected || 'UNKNOWN';

    const matchedTicker = Object.values(tickers).find((t) => {
      const cleanT = t.symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const cleanEff = effectiveSymbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      return cleanEff && (cleanT === cleanEff || cleanT.includes(cleanEff) || cleanEff.includes(cleanT));
    });

    return computeLivePriceComparison({
      screenshotSymbol: effectiveSymbol || 'UNKNOWN',
      screenshotPrice: report.extracted.numericDisplayedPrice,
      screenshotTimeframe: effectiveTf,
      requestedTimeframe,
      isLiveConnection: isLiveMode && Boolean(matchedTicker),
      brokerSymbol: matchedTicker?.symbol ?? null,
      brokerPrice: matchedTicker?.bid ?? null,
      brokerTimestamp: matchedTicker ? new Date().toISOString() : null,
    });
  }, [report, manualSymbol, manualTimeframe, requestedTimeframe, tickers, isLiveMode]);

  const handleSaveAnalysis = async () => {
    if (!report || !confluenceResult) return;
    const enrichedReport: ChartIntelligenceReport = {
      ...report,
      manualSymbolOverride: manualSymbol.trim() || report.manualSymbolOverride,
      manualTimeframeOverride: manualTimeframe.trim() || report.manualTimeframeOverride,
    };

    onSaveToJournal(enrichedReport, confluenceResult.totalScore);
    setSaveFeedback('Analysis metadata saved to Journal.');

    if (user) {
      const token = await getIdToken();
      if (token) {
        try {
          const res = await fetch('/api/chart-intelligence/history', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              report: enrichedReport,
              confluenceScore: confluenceResult.totalScore,
              consentImageStored: false,
            }),
          });
          if (res.ok) {
            setSaveFeedback('Analysis saved to Journal & Cloud SQL History (raw image not stored).');
          }
        } catch {
          // Local journal already updated
        }
      }
    }
  };

  const handleSendHandoff = () => {
    if (!report || !confluenceResult) return;
    const enrichedReport: ChartIntelligenceReport = {
      ...report,
      manualSymbolOverride: manualSymbol.trim() || report.manualSymbolOverride,
      manualTimeframeOverride: manualTimeframe.trim() || report.manualTimeframeOverride,
    };
    const handoff = buildStrategyEngineHandoff(enrichedReport, confluenceResult.totalScore, eaLongOnly);
    onSendToStrategyEngine(handoff);
    setHandoffFeedback(
      'Sent to Signals Engine for live market validation & EA risk checks. No order has been placed.'
    );
  };

  const effectiveSymbolDisplay =
    manualSymbol.trim() || report?.extracted.symbolDetected || 'UNKNOWN';
  const effectiveTimeframeDisplay =
    manualTimeframe.trim() || report?.extracted.timeframeDetected || 'UNKNOWN';

  const compareTargetReport = useMemo(
    () => savedReports.find((r) => r.id === compareReportId) || null,
    [savedReports, compareReportId]
  );

  const classificationStyle = (c: string) => {
    if (c === 'VALID LONG SETUP') {
      return 'bg-emerald-950/90 text-emerald-300 border-emerald-500/70';
    }
    if (c === 'VALID SHORT SETUP') {
      return 'bg-rose-950/90 text-rose-300 border-rose-500/70';
    }
    if (c === 'POTENTIAL SETUP — WAIT FOR CONFIRMATION') {
      return 'bg-amber-950/90 text-amber-300 border-amber-500/70';
    }
    if (c === 'NO VALID SETUP') {
      return 'bg-slate-800 text-slate-200 border-slate-600';
    }
    return 'bg-rose-950/50 text-rose-200 border-rose-700/60';
  };

  return (
    <div className="space-y-4 max-w-[1680px] mx-auto">
      {/* Header Banner */}
      <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Radar className="w-6 h-6 text-cyan-400" />
            <h2 className="text-lg font-bold font-mono text-white">
              CHART INTELLIGENCE — MULTIMODAL TECHNICAL & SCENARIO ENGINE
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Supports TradingView, MetaTrader 4, MetaTrader 5, Exness & broker screenshots (PNG, JPG, JPEG, WEBP). Strictly analysis-only until validated by the Signals Engine & EA risk guardrails.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-[#12192c] border border-slate-700 text-[11px] font-mono text-slate-300 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>In-Memory Processing · No Auto-Execution</span>
          </div>
          {!user && (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="px-3 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-600/50 text-cyan-300 font-mono text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              Sign In to Sync History
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Upload Interface & Manual Fallback Overrides */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-5 bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
              1. Secure Chart Upload Interface
            </span>
            {imagePreview && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="text-[11px] font-mono text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleSelectedFile(e.target.files?.[0])}
          />

          {!imagePreview ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleSelectedFile(e.dataTransfer.files?.[0]);
              }}
              className="border-2 border-dashed border-slate-700 hover:border-cyan-500/70 rounded-xl p-8 text-center cursor-pointer bg-[#111728] transition-colors"
            >
              <Upload className="w-9 h-9 mx-auto text-cyan-400 mb-2.5" />
              <p className="text-xs font-mono font-bold text-slate-200">
                Drag & drop chart screenshot or Browse Files
              </p>
              <p className="text-[11px] font-mono text-slate-400 mt-1">
                TradingView · MT4 · MT5 · Exness · Broker Platforms
              </p>
              <p className="text-[10px] font-mono text-slate-500 mt-1">
                PNG, JPG, JPEG, WEBP (Max 8 MB) — Not analysed until requested
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="rounded-lg overflow-hidden border border-slate-700 bg-black">
                <img
                  src={imagePreview}
                  alt="Uploaded chart preview"
                  className="w-full max-h-[260px] object-contain mx-auto"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
                <span className="truncate max-w-[240px]">{fileName || 'Chart Screenshot'}</span>
                <span className="tabular-nums">{fileSizeKB} KB · Staged</span>
              </div>
            </div>
          )}

          {/* Manual Overrides when chart metadata is hidden / unreadable */}
          <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                SYMBOL (IF HIDDEN)
              </label>
              <input
                type="text"
                value={manualSymbol}
                onChange={(e) => setManualSymbol(e.target.value)}
                placeholder="e.g. XAUUSD"
                className="w-full bg-[#131b2e] border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                CHART TF (IF HIDDEN)
              </label>
              <select
                value={manualTimeframe}
                onChange={(e) => setManualTimeframe(e.target.value)}
                className="w-full bg-[#131b2e] border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="">Auto-Detect</option>
                {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'].map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                REQUESTED TF
              </label>
              <select
                value={requestedTimeframe}
                onChange={(e) => setRequestedTimeframe(e.target.value)}
                className="w-full bg-[#131b2e] border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-700/60 text-rose-300 text-xs font-mono flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <AIServiceAlert
            error={aiError}
            onRetry={imagePreview ? handleAnalyzeChart : undefined}
            retryDisabled={loading}
            onDismiss={() => setAiError(null)}
            retryLabel="Retry Analysis"
          />

          {statusMessage && !errorMsg && !aiError && (
            <div className="p-2 rounded-lg bg-[#111728] border border-slate-800 text-[11px] font-mono text-cyan-300 flex items-center gap-2">
              {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />}
              <span>{statusMessage}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleAnalyzeChart}
            disabled={loading || !imagePreview}
            className={`w-full py-2.5 px-4 rounded-lg font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
              loading || !imagePreview
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20 cursor-pointer'
            }`}
          >
            <Sparkles className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Analysing Chart...' : 'Analyse Chart'}
          </button>
        </div>

        {/* Right Preview / Executive Classification & Live Comparison Summary */}
        <div className="lg:col-span-7 space-y-3">
          {!report ? (
            <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-10 text-center space-y-3 shadow-xl">
              <Radar className="w-10 h-10 mx-auto text-slate-600" />
              <h3 className="text-sm font-mono font-bold text-slate-200">
                Ready for Independent Screenshot Technical Analysis
              </h3>
              <p className="text-xs font-mono text-slate-400 max-w-xl mx-auto leading-relaxed">
                Upload any TradingView, MT4, MT5, or Exness chart screenshot and click <strong className="text-cyan-300">Analyse Chart</strong>. The engine extracts visible telemetry without inventing hidden prices, builds an aligned annotated overlay, evaluates both Bullish (Scenario A) and Bearish (Scenario B) paths, and scores 8 transparent confluence factors.
              </p>
              {savedReports.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDetailTab('history')}
                  className="px-3 py-1.5 rounded-lg bg-[#131b2e] border border-slate-700 text-cyan-300 text-xs font-mono font-semibold hover:bg-slate-800 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <History className="w-3.5 h-3.5" />
                  View Saved Analysis History ({savedReports.length})
                </button>
              )}
            </div>
          ) : (
            <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl space-y-3">
              {/* Classification & Metadata Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-md font-mono text-xs font-extrabold border ${classificationStyle(
                      report.classification
                    )}`}
                  >
                    {report.classification}
                  </span>
                  <span className="font-mono text-xs font-bold text-white">
                    {effectiveSymbolDisplay} · {effectiveTimeframeDisplay}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#131b2e] border border-slate-700 text-[10px] font-mono text-slate-300">
                    {report.extracted.platformDetected}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{new Date(report.analyzedAt).toLocaleString()}</span>
                  <span className="text-slate-600">|</span>
                  <Cpu className="w-3.5 h-3.5 text-purple-400" />
                  <span>{report.modelVersion}</span>
                  {analysisMeta && (
                    <>
                      <span className="text-slate-600">|</span>
                      <span>Search: {analysisMeta.groundingStatus}</span>
                    </>
                  )}
                </div>
              </div>
              {analysisMeta?.fallbackNotice && (
                <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-700/60 text-[11px] font-mono text-amber-200">
                  {analysisMeta.fallbackNotice}
                </div>
              )}

              {/* Live Price Verification Banner (Section 9) */}
              {liveComparison && (
                <div
                  className={`p-2.5 rounded-lg border text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                    !liveComparison.verified
                      ? 'bg-slate-900/90 border-amber-700/60 text-amber-200'
                      : liveComparison.isStaleScreenshot
                      ? 'bg-rose-950/50 border-rose-700/70 text-rose-200'
                      : 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                  }`}
                >
                  <div>
                    <span className="font-bold block">{liveComparison.bannerText}</span>
                    <span className="text-[11px] opacity-85">{liveComparison.notes}</span>
                  </div>
                  {liveComparison.verified && (
                    <div className="text-[11px] tabular-nums text-right shrink-0">
                      <div>
                        Chart: <strong>{liveComparison.screenshotPrice}</strong> | Live:{' '}
                        <strong>{liveComparison.brokerPrice}</strong>
                      </div>
                      <div>
                        Diff:{' '}
                        <strong>
                          {liveComparison.priceDifference! >= 0 ? '+' : ''}
                          {liveComparison.priceDifference} ({liveComparison.priceDifferencePercent}%)
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Observed Last Candle & Classification Rationale */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-cyan-400 font-bold uppercase block mb-1">
                    Classification Rationale
                  </span>
                  <p className="text-[11px] text-slate-200 leading-relaxed">
                    {report.classificationRationale}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-amber-400 font-bold uppercase block mb-1">
                    Last Visible Candle Status: {report.extracted.lastCandleStatus} · Clarity:{' '}
                    {report.extracted.imageQuality}
                  </span>
                  <p className="text-[11px] text-slate-200 leading-relaxed">
                    {report.extracted.lastCandleExplanation}
                  </p>
                </div>
              </div>

              {/* Action Buttons: Save to Journal & Send to Strategy Engine */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveAnalysis}
                    className="px-3 py-1.5 rounded-lg bg-[#131b2e] hover:bg-[#1a2540] border border-slate-700 text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <BookmarkCheck className="w-3.5 h-3.5 text-cyan-400" />
                    Save Analysis to Journal
                  </button>

                  <button
                    type="button"
                    onClick={handleSendHandoff}
                    className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-md shadow-cyan-500/20"
                  >
                    <Send className="w-3.5 h-3.5" />
                    SEND TO STRATEGY ENGINE
                  </button>
                </div>

                <span className="text-[10px] font-mono text-slate-400">
                  EA Policy: {eaLongOnly ? 'LONG-ONLY (Shorts NOT enabled for execution)' : 'BIDIRECTIONAL'}
                </span>
              </div>

              {saveFeedback && (
                <div className="text-[11px] font-mono text-emerald-300 bg-emerald-950/30 border border-emerald-800/50 rounded px-2.5 py-1.5">
                  {saveFeedback}
                </div>
              )}
              {handoffFeedback && (
                <div className="text-[11px] font-mono text-cyan-300 bg-cyan-950/30 border border-cyan-800/50 rounded px-2.5 py-1.5">
                  {handoffFeedback}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Analysis Outputs (when report exists) */}
      {report && imagePreview && (
        <div className="space-y-4">
          {/* Section 4: Annotated Chart Drawing Engine */}
          <AnnotatedChartCanvas
            imageUrl={imagePreview}
            annotations={report.annotations}
            symbolLabel={effectiveSymbolDisplay}
            priceAxisCalibrated={report.extracted.priceAxisCalibrated}
          />

          {/* Section 2 & 7: Extracted Evidence vs AI Interpretation + Confluence Score */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Observed Evidence & Telemetry */}
            <div className="lg:col-span-6 bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl space-y-3">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300 border-b border-slate-800 pb-2">
                Observed Chart Telemetry & Evidence Separation
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">INSTRUMENT</span>
                  <span className="text-slate-100 font-bold">{effectiveSymbolDisplay}</span>
                </div>
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">TIMEFRAME</span>
                  <span className="text-slate-100 font-bold">{effectiveTimeframeDisplay}</span>
                </div>
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">DISPLAYED PRICE</span>
                  <span className="text-cyan-300 font-bold">{report.extracted.currentDisplayedPrice}</span>
                </div>
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">CANDLE OHLC</span>
                  <span className="text-slate-200">{report.extracted.candleOhlc}</span>
                </div>
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">VOLUME INFO</span>
                  <span className="text-slate-200">{report.extracted.volumeInformation}</span>
                </div>
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">MOVING AVERAGES</span>
                  <span className="text-slate-200">{report.extracted.movingAveragesVisible}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] font-mono">
                <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/40">
                  <span className="text-[10px] text-emerald-300 font-bold uppercase block mb-1">
                    Observed Visual Evidence
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {report.extracted.observedEvidence.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-2.5 rounded-lg bg-purple-950/20 border border-purple-900/40">
                  <span className="text-[10px] text-purple-300 font-bold uppercase block mb-1">
                    AI Analytical Interpretation
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {report.extracted.aiInterpretation.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {report.extracted.uncertaintiesAndLimitations.length > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-800/40 text-[11px] font-mono text-amber-200">
                  <span className="text-[10px] font-bold uppercase flex items-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3" /> Uncertainties & Screenshot Limitations
                  </span>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-100/90">
                    {report.extracted.uncertaintiesAndLimitations.map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Section 7: Transparent Configurable Confluence Score */}
            {confluenceResult && (
              <div className="lg:col-span-6 bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div>
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                      Transparent Confluence Score
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      Weighted evidence score (not a statistical probability of profit or standalone trade trigger)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-extrabold font-mono text-cyan-300 tabular-nums">
                      {confluenceResult.totalScore}
                      <span className="text-xs text-slate-500">/100</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowWeightsConfig((v) => !v)}
                      className="p-1.5 rounded bg-[#131b2e] border border-slate-700 text-slate-300 hover:text-cyan-300 cursor-pointer"
                      title="Configure Confluence Factor Weights"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {showWeightsConfig && (
                  <div className="p-2.5 rounded-lg bg-[#111728] border border-cyan-800/50 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                    {Object.entries(weights).map(([key, val]) => (
                      <label key={key} className="block">
                        <span className="text-slate-400 block truncate">{key}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={val}
                          onChange={(e) =>
                            setWeights((prev) => ({
                              ...prev,
                              [key]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                            }))
                          }
                          className="w-full mt-0.5 bg-[#0a0e17] border border-slate-700 rounded px-2 py-1 text-white"
                        />
                      </label>
                    ))}
                  </div>
                )}

                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {confluenceResult.breakdown.map((factor) => (
                    <div
                      key={factor.id}
                      className="p-2 rounded bg-[#111728] border border-slate-800 text-[11px] font-mono"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200">{factor.label}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              factor.evidenceStatus === 'OBSERVED'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                                : factor.evidenceStatus === 'PARTIAL'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {factor.evidenceStatus}
                          </span>
                        </div>
                        <span className="tabular-nums text-cyan-300 font-bold">
                          {factor.rawScore0To100}/100 (wt {factor.weight}%) → +{factor.weightedContribution}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">{factor.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Two-Scenario Conditional Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Scenario A: Bullish / Long */}
            <div className="bg-[#0e1424] rounded-xl border border-emerald-800/50 p-4 shadow-xl space-y-2.5">
              <div className="flex items-center justify-between border-b border-emerald-900/50 pb-2">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-mono font-bold uppercase text-emerald-300">
                    Scenario A — Conditional Bullish / Long
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                  LONG ADVISORY
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">CONFIRMATION LEVEL</span>
                  <span className="text-emerald-300 font-bold">{report.scenarioA.confirmationLevel}</span>
                </div>
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">ENTRY ZONE</span>
                  <span className="text-white font-bold">{report.scenarioA.potentialEntryZone}</span>
                </div>
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-rose-400 block">INVALIDATION / SL</span>
                  <span className="text-rose-300 font-bold">
                    {report.scenarioA.invalidationLevel} ({report.scenarioA.suggestedSlCalculation})
                  </span>
                </div>
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-emerald-400 block">TP1 / TP2 / R:R</span>
                  <span className="text-emerald-300 font-bold">
                    {report.scenarioA.potentialTp1} · {report.scenarioA.potentialTp2} ({report.scenarioA.riskRewardEstimate})
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-[11px] font-mono text-slate-300">
                <p><strong className="text-slate-100">Breakout & Retest:</strong> {report.scenarioA.breakoutOrBreakdownRequirements} | {report.scenarioA.retestRequirements}</p>
                <p><strong className="text-slate-100">Structure & Momentum:</strong> {report.scenarioA.structureConfirmation} | {report.scenarioA.momentumConfirmation}</p>
                <p><strong className="text-emerald-300">What Must Happen / Candle Close:</strong> {report.scenarioA.whatMustHappen} ({report.scenarioA.requiredCandleClose})</p>
                <p><strong className="text-cyan-300">What Confirms:</strong> {report.scenarioA.whatConfirms}</p>
                <p><strong className="text-rose-300">What Invalidates / Unreliable:</strong> {report.scenarioA.whatInvalidates} — {report.scenarioA.whatMakesUnreliable}</p>
              </div>
            </div>

            {/* Scenario B: Bearish / Short */}
            <div className="bg-[#0e1424] rounded-xl border border-rose-800/50 p-4 shadow-xl space-y-2.5">
              <div className="flex items-center justify-between border-b border-rose-900/50 pb-2">
                <div className="flex items-center gap-2">
                  <ArrowDownRight className="w-4 h-4 text-rose-400" />
                  <h3 className="text-xs font-mono font-bold uppercase text-rose-300">
                    Scenario B — Conditional Bearish / Short
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950 text-rose-300 border border-rose-700/60">
                  {eaLongOnly ? 'NOT ENABLED FOR EXECUTION' : 'SHORT ADVISORY'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">CONFIRMATION LEVEL</span>
                  <span className="text-rose-300 font-bold">{report.scenarioB.confirmationLevel}</span>
                </div>
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">ENTRY ZONE</span>
                  <span className="text-white font-bold">{report.scenarioB.potentialEntryZone}</span>
                </div>
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-rose-400 block">INVALIDATION / SL</span>
                  <span className="text-rose-300 font-bold">
                    {report.scenarioB.invalidationLevel} ({report.scenarioB.suggestedSlCalculation})
                  </span>
                </div>
                <div className="p-2 rounded bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-emerald-400 block">TP1 / TP2 / R:R</span>
                  <span className="text-slate-200 font-bold">
                    {report.scenarioB.potentialTp1} · {report.scenarioB.potentialTp2} ({report.scenarioB.riskRewardEstimate})
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-[11px] font-mono text-slate-300">
                <p><strong className="text-slate-100">Breakdown & Failed Retest:</strong> {report.scenarioB.breakoutOrBreakdownRequirements} | {report.scenarioB.retestRequirements}</p>
                <p><strong className="text-slate-100">Structure & Momentum:</strong> {report.scenarioB.structureConfirmation} | {report.scenarioB.momentumConfirmation}</p>
                <p><strong className="text-rose-300">What Must Happen / Candle Close:</strong> {report.scenarioB.whatMustHappen} ({report.scenarioB.requiredCandleClose})</p>
                <p><strong className="text-cyan-300">What Confirms:</strong> {report.scenarioB.whatConfirms}</p>
                <p><strong className="text-amber-300">What Invalidates / Unreliable:</strong> {report.scenarioB.whatInvalidates} — {report.scenarioB.whatMakesUnreliable}</p>
              </div>
            </div>
          </div>

          {/* Sub-tabs: Sections A-L Report, 7-Engine Technical Matrix, Saved History Compare */}
          <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2.5">
              <button
                type="button"
                onClick={() => setDetailTab('report')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer ${
                  detailTab === 'report'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Full Analysis Report (Sections A–L)
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('technical')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer ${
                  detailTab === 'technical'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Technical Analysis Engine Breakdown
              </button>
              <button
                type="button"
                onClick={() => setDetailTab('history')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer ${
                  detailTab === 'history'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Analysis History & Compare ({savedReports.length})
              </button>
            </div>

            {detailTab === 'report' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-800/50">
                  <span className="text-[11px] font-mono font-bold uppercase text-cyan-300 block mb-1">
                    Plain-Language Trader Learning Summary
                  </span>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {report.reportSections.beginnerPlainLanguageSummary}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                  {(
                    [
                      ['A. Market Overview', report.reportSections.A_marketOverview],
                      ['B. Detected Trend', report.reportSections.B_detectedTrend],
                      ['C. Key Support & Resistance', report.reportSections.C_keySupportAndResistance],
                      ['D. Market Structure', report.reportSections.D_marketStructure],
                      ['E. Liquidity Analysis', report.reportSections.E_liquidityAnalysis],
                      ['F. FVG & Order-Block Analysis', report.reportSections.F_fvgAndOrderBlockAnalysis],
                      ['G. Indicator Interpretation', report.reportSections.G_indicatorInterpretation],
                      ['H. Scenario A — Bullish', report.reportSections.H_scenarioABullish],
                      ['I. Scenario B — Bearish', report.reportSections.I_scenarioBBearish],
                      ['J. Final Trade Classification', report.reportSections.J_finalTradeClassification],
                      ['K. Risk & Reward Analysis', report.reportSections.K_riskAndRewardAnalysis],
                      ['L. Reasons to Wait or Reject', report.reportSections.L_reasonsToWaitOrReject],
                    ] as const
                  ).map(([heading, content]) => (
                    <div key={heading} className="p-3 rounded-lg bg-[#111728] border border-slate-800">
                      <span className="text-[11px] font-bold text-cyan-300 block mb-1">{heading}</span>
                      <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detailTab === 'technical' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-[11px] font-mono">
                <div className="p-3 rounded-lg bg-[#111728] border border-slate-800 space-y-1">
                  <span className="text-cyan-300 font-bold block uppercase">Market Structure</span>
                  <p>HH: {report.technical.marketStructure.higherHighs}</p>
                  <p>HL: {report.technical.marketStructure.higherLows}</p>
                  <p>LH: {report.technical.marketStructure.lowerHighs}</p>
                  <p>LL: {report.technical.marketStructure.lowerLows}</p>
                  <p>BOS: {report.technical.marketStructure.bos}</p>
                  <p>CHoCH: {report.technical.marketStructure.choch}</p>
                  <p>State: {report.technical.marketStructure.trendOrConsolidation}</p>
                </div>

                <div className="p-3 rounded-lg bg-[#111728] border border-slate-800 space-y-1">
                  <span className="text-cyan-300 font-bold block uppercase">Support & Resistance</span>
                  <p>Major Res: {report.technical.supportAndResistance.majorResistanceZones}</p>
                  <p>Minor Res: {report.technical.supportAndResistance.minorResistanceZones}</p>
                  <p>Major Sup: {report.technical.supportAndResistance.majorSupportZones}</p>
                  <p>Minor Sup: {report.technical.supportAndResistance.minorSupportZones}</p>
                  <p>Swings: {report.technical.supportAndResistance.previousSwingHighsAndLows}</p>
                </div>

                <div className="p-3 rounded-lg bg-[#111728] border border-slate-800 space-y-1">
                  <span className="text-amber-300 font-bold block uppercase">Liquidity</span>
                  <p>Equal Highs: {report.technical.liquidity.equalHighs}</p>
                  <p>Equal Lows: {report.technical.liquidity.equalLows}</p>
                  <p>Pools: {report.technical.liquidity.liquidityPools}</p>
                  <p>Sweeps: {report.technical.liquidity.potentialLiquiditySweeps}</p>
                  <p>Rejection: {report.technical.liquidity.rejectionFollowingSweeps}</p>
                </div>

                <div className="p-3 rounded-lg bg-[#111728] border border-slate-800 space-y-1">
                  <span className="text-emerald-300 font-bold block uppercase">Fair Value Gaps</span>
                  <p>Bullish FVG: {report.technical.fairValueGaps.bullishFvg}</p>
                  <p>Bearish FVG: {report.technical.fairValueGaps.bearishFvg}</p>
                  <p>Unfilled: {report.technical.fairValueGaps.unfilledImbalance}</p>
                  <p>Mitigation: {report.technical.fairValueGaps.mitigationStatus}</p>
                </div>

                <div className="p-3 rounded-lg bg-[#111728] border border-slate-800 space-y-1">
                  <span className="text-purple-300 font-bold block uppercase">Order Blocks & Displacement</span>
                  <p>Bullish OB: {report.technical.orderBlocks.potentialBullishOrderBlocks}</p>
                  <p>Bearish OB: {report.technical.orderBlocks.potentialBearishOrderBlocks}</p>
                  <p>Supply/Demand: {report.technical.orderBlocks.supplyAndDemandZones}</p>
                  <p>OB Invalidation: {report.technical.orderBlocks.invalidationConditions}</p>
                  <p>Displacement Bull: {report.technical.displacement.strongBullishCandles}</p>
                  <p>Displacement Bear: {report.technical.displacement.strongBearishCandles}</p>
                  <p>Momentum Shifts: {report.technical.displacement.momentumShifts}</p>
                  <p>Breakout Candles: {report.technical.displacement.possibleBreakoutCandles}</p>
                </div>

                <div className="p-3 rounded-lg bg-[#111728] border border-slate-800 space-y-1">
                  <span className="text-slate-200 font-bold block uppercase">
                    Visible Indicators (Observed Only)
                  </span>
                  <p>SMMA 5: {report.technical.indicators.smma5}</p>
                  <p>SMMA 50: {report.technical.indicators.smma50}</p>
                  <p>EMA: {report.technical.indicators.ema}</p>
                  <p>RSI: {report.technical.indicators.rsi}</p>
                  <p>ATR: {report.technical.indicators.atr}</p>
                  <p>VWAP: {report.technical.indicators.vwap}</p>
                  <p>Volume Profile: {report.technical.indicators.volumeProfile}</p>
                </div>
              </div>
            )}

            {detailTab === 'history' && (
              <div className="space-y-3">
                {savedReports.length === 0 ? (
                  <p className="text-xs font-mono text-slate-500 py-6 text-center">
                    No saved Chart Intelligence analyses yet. Click &ldquo;Save Analysis to Journal&rdquo; above to archive and compare setups.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {savedReports.map((item) => {
                        const sym = item.manualSymbolOverride || item.extracted.symbolDetected;
                        const tf = item.manualTimeframeOverride || item.extracted.timeframeDetected;
                        return (
                          <div
                            key={item.id}
                            className="p-3 rounded-lg bg-[#111728] border border-slate-800 text-xs font-mono space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white">
                                {sym} · {tf}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(item.analyzedAt).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="text-[11px] text-cyan-300 font-bold">{item.classification}</div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setReport(item)}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200 cursor-pointer"
                              >
                                Load Report
                              </button>
                              <button
                                type="button"
                                onClick={() => setCompareReportId(item.id)}
                                className="px-2 py-1 rounded bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-700/50 text-[10px] text-cyan-300 flex items-center gap-1 cursor-pointer"
                              >
                                <GitCompare className="w-3 h-3" /> Compare Side-by-Side
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {compareTargetReport && (
                      <div className="p-3 rounded-lg bg-[#0a0f1c] border border-cyan-800/50 space-y-2 text-[11px] font-mono">
                        <div className="flex items-center justify-between">
                          <span className="text-cyan-300 font-bold uppercase">
                            Side-by-Side Analysis Comparison
                          </span>
                          <button
                            type="button"
                            onClick={() => setCompareReportId(null)}
                            className="text-slate-400 hover:text-white cursor-pointer"
                          >
                            Close Comparison
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="p-2.5 rounded bg-[#111728] border border-slate-800 space-y-1">
                            <span className="text-emerald-300 font-bold block">
                              Current: {effectiveSymbolDisplay} ({effectiveTimeframeDisplay})
                            </span>
                            <p>Classification: {report.classification}</p>
                            <p>Price: {report.extracted.currentDisplayedPrice}</p>
                            <p>Scenario A Entry: {report.scenarioA.potentialEntryZone}</p>
                            <p>Scenario B Entry: {report.scenarioB.potentialEntryZone}</p>
                          </div>
                          <div className="p-2.5 rounded bg-[#111728] border border-slate-800 space-y-1">
                            <span className="text-cyan-300 font-bold block">
                              Archived: {compareTargetReport.manualSymbolOverride || compareTargetReport.extracted.symbolDetected} (
                              {compareTargetReport.manualTimeframeOverride || compareTargetReport.extracted.timeframeDetected})
                            </span>
                            <p>Classification: {compareTargetReport.classification}</p>
                            <p>Price: {compareTargetReport.extracted.currentDisplayedPrice}</p>
                            <p>Scenario A Entry: {compareTargetReport.scenarioA.potentialEntryZone}</p>
                            <p>Scenario B Entry: {compareTargetReport.scenarioB.potentialEntryZone}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Standalone History Drawer when no active report is open */}
      {!report && detailTab === 'history' && savedReports.length > 0 && (
        <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-mono font-bold uppercase text-cyan-300">
              Saved Chart Intelligence History
            </span>
            <button
              type="button"
              onClick={() => setDetailTab('report')}
              className="text-xs font-mono text-slate-400 hover:text-white cursor-pointer"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {savedReports.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-lg bg-[#111728] border border-slate-800 text-xs font-mono space-y-1"
              >
                <div className="font-bold text-white">
                  {item.manualSymbolOverride || item.extracted.symbolDetected} ·{' '}
                  {item.manualTimeframeOverride || item.extracted.timeframeDetected}
                </div>
                <div className="text-[11px] text-cyan-300">{item.classification}</div>
                <div className="text-[10px] text-slate-400">
                  {new Date(item.analyzedAt).toLocaleString()}
                </div>
                <p className="text-[11px] text-slate-300 line-clamp-2 pt-1">
                  {item.reportSections.A_marketOverview}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

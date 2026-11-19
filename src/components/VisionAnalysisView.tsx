import React, { useState, useRef, useEffect } from 'react';
import type { TradingSignal } from '../utils/strategy.ts';
import type { MarketTicker } from '../utils/marketData.ts';
import type { AIMetadataPayload, StructuredAIError } from '../lib/geminiTypes.ts';
import { parseStructuredAIError, normalizeCatchToAIError } from '../utils/aiErrorClient.ts';
import { AIServiceAlert } from './AIServiceAlert.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import {
  Eye,
  Upload,
  Sparkles,
  ArrowUpRight,
  ExternalLink,
  CheckCircle2,
  Trash2,
  Cpu,
  Globe,
} from 'lucide-react';

interface VisionAnalysisResult {
  symbolDetected: string;
  timeframeDetected: string;
  bias: 'LONG' | 'SHORT' | 'WAIT' | string;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  rewardToRiskRatio: number;
  identifiedSetups: string[];
  indicatorAlignment?: {
    smmaTrend?: string;
    fvgAndOrderBlocks?: string;
    liquidityAndDisplacement?: string;
    volumeProfileAndHtf?: string;
  };
  positionManagementPlan: string;
  invalidationCriteria: string;
  executiveSummary: string;
}

interface VisionAnalysisViewProps {
  selectedSymbol: string;
  timeframe: string;
  tickers: Record<string, MarketTicker>;
  currentSignal: TradingSignal;
  capturedScreenshot: string | null;
  onClearCapturedScreenshot: () => void;
  onApplyLevelsToOrderEntry: (levels: {
    symbol?: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
  }) => void;
}

export const VisionAnalysisView: React.FC<VisionAnalysisViewProps> = ({
  selectedSymbol,
  timeframe,
  tickers,
  currentSignal,
  capturedScreenshot,
  onClearCapturedScreenshot,
  onApplyLevelsToOrderEntry,
}) => {
  const { getIdToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitLockRef = useRef<boolean>(false);

  const [imagePreview, setImagePreview] = useState<string | null>(capturedScreenshot);
  const [mimeType, setMimeType] = useState<string>('image/png');
  const [symbolHint, setSymbolHint] = useState<string>(selectedSymbol);
  const [tfHint, setTfHint] = useState<string>(timeframe);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<StructuredAIError | null>(null);

  const [result, setResult] = useState<VisionAnalysisResult | null>(null);
  const [analysisMeta, setAnalysisMeta] = useState<AIMetadataPayload | null>(null);
  const [liveMarketConditions, setLiveMarketConditions] = useState<string>('');
  const [sources, setSources] = useState<{ title: string; uri: string }[]>([]);

  useEffect(() => {
    if (capturedScreenshot) {
      setImagePreview(capturedScreenshot);
      setMimeType('image/png');
      setSymbolHint(selectedSymbol);
      setTfHint(timeframe);
      onClearCapturedScreenshot();
    }
  }, [capturedScreenshot, selectedSymbol, timeframe, onClearCapturedScreenshot]);

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAiError({
        httpStatus: 400,
        code: 'INVALID_REQUEST',
        title: 'INVALID IMAGE FILE',
        reason: 'Please upload a valid PNG, JPEG, or WEBP chart screenshot.',
        actions: ['Select a PNG, JPG, JPEG, or WEBP image file.'],
        retryable: false,
      });
      return;
    }
    setAiError(null);
    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImagePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) handleFileChange(file);
        break;
      }
    }
  };

  const handleAnalyzeScreenshot = async () => {
    if (submitLockRef.current || loading) return;
    if (!imagePreview) {
      setAiError({
        httpStatus: 400,
        code: 'INVALID_REQUEST',
        title: 'SCREENSHOT REQUIRED',
        reason: 'Upload or paste a chart screenshot first.',
        actions: ['Upload or paste a chart image and click Analyse.'],
        retryable: false,
      });
      return;
    }
    submitLockRef.current = true;
    setLoading(true);
    setAiError(null);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/ai/vision-analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageBase64: imagePreview,
          mimeType,
          symbol: symbolHint,
          timeframe: tfHint,
          notes,
          liveSignal: currentSignal,
          liveTicker: tickers[symbolHint] || tickers[selectedSymbol],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.analysis) {
        setResult(null);
        setAnalysisMeta(null);
        setAiError(parseStructuredAIError(data, res.status));
        return;
      }
      setResult(data.analysis);
      setAnalysisMeta(data.meta || null);
      setLiveMarketConditions(data.liveMarketConditions || '');
      setSources(data.sources || []);
    } catch (err) {
      setResult(null);
      setAnalysisMeta(null);
      setAiError(normalizeCatchToAIError(err));
    } finally {
      submitLockRef.current = false;
      setLoading(false);
    }
  };

  const digits = (tickers[symbolHint]?.digits) ?? 2;

  return (
    <div className="space-y-4 max-w-6xl mx-auto" onPaste={handlePaste}>
      {/* Header Banner */}
      <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold font-mono text-white">
              Vision Analysis — Chart Screenshot & Trade Level Extractor
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Upload or paste any chart screenshot. Gemini Vision evaluates setups against SMMA 5/50, RSI, ATR, FVGs, Liquidity Sweeps, Displacement, Order Blocks, Volume Profile, and HTF Direction without inventing unseen prices.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAnalyzeScreenshot}
          disabled={loading || !imagePreview}
          className={`px-4 py-2 rounded-lg font-mono text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
            loading || !imagePreview
              ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20 cursor-pointer'
          }`}
        >
          <Sparkles className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Analyzing Chart...' : 'Determine Best Entry, SL & TP'}
        </button>
      </div>

      <AIServiceAlert
        error={aiError}
        onRetry={imagePreview ? handleAnalyzeScreenshot : undefined}
        retryDisabled={loading}
        onDismiss={() => setAiError(null)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Screenshot Upload & Context Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-3 bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
              Chart Screenshot Input
            </span>
            {imagePreview && (
              <button
                type="button"
                onClick={() => {
                  setImagePreview(null);
                  setResult(null);
                }}
                className="text-[11px] font-mono text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0])}
          />

          {!imagePreview ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileChange(e.dataTransfer.files?.[0]);
              }}
              className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-8 text-center cursor-pointer bg-[#111728] transition-colors"
            >
              <Upload className="w-8 h-8 mx-auto text-cyan-400 mb-2" />
              <p className="text-xs font-mono font-bold text-slate-200">
                Click to upload, drag & drop, or Ctrl+V paste chart screenshot
              </p>
              <p className="text-[11px] font-mono text-slate-500 mt-1">
                Supports PNG, JPG, WEBP (TradingView, MT5, Exness, or Terminal capture)
              </p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden border border-slate-700 bg-black">
              <img
                src={imagePreview}
                alt="Uploaded trading chart screenshot"
                className="w-full max-h-[300px] object-contain mx-auto"
              />
            </div>
          )}

          {/* Symbol & Timeframe Context */}
          <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">SYMBOL HINT</label>
              <select
                value={symbolHint}
                onChange={(e) => setSymbolHint(e.target.value)}
                className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                {Object.keys(tickers).map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">TIMEFRAME HINT</label>
              <select
                value={tfHint}
                onChange={(e) => setTfHint(e.target.value)}
                className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                {['M1', 'M5', 'M15', 'H1', 'H4', 'D1'].map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-slate-400 mb-1">
              TRADER NOTES / FOCUS AREA (OPTIONAL)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Looking for liquidity sweep entry into H1 demand OB..."
              className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Live Bot Context Snapshot fused into Vision */}
          <div className="p-2.5 rounded-lg bg-[#111728] border border-slate-800 text-[11px] font-mono tabular-nums space-y-1 text-slate-400">
            <div className="text-[10px] text-cyan-400 font-bold uppercase">
              Fused Live Bot Telemetry ({selectedSymbol})
            </div>
            <div className="flex justify-between">
              <span>SMMA 5/50 · RSI · ATR:</span>
              <span className="text-slate-200">
                {currentSignal.marketContext.smma5.toFixed(digits)} / {currentSignal.marketContext.smma50.toFixed(digits)} ·{' '}
                {currentSignal.marketContext.rsiValue} · {currentSignal.marketContext.atrValue.toFixed(digits)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>FVGs · Order Blocks · POC:</span>
              <span className="text-slate-200">
                {currentSignal.smcContext.activeBullishFVGs.length + currentSignal.smcContext.activeBearishFVGs.length} FVG ·{' '}
                {currentSignal.smcContext.activeDemandOBs.length + currentSignal.smcContext.activeSupplyOBs.length} OB ·{' '}
                {currentSignal.smcContext.volumeProfile.poc.toFixed(digits)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: AI Vision Output & Trade Execution Levels (7 cols) */}
        <div className="lg:col-span-7 space-y-3 bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl">
          {!result ? (
            <div className="py-16 text-center text-slate-500 font-mono text-xs space-y-2">
              <Eye className="w-10 h-10 mx-auto text-slate-700" />
              <p className="text-slate-300 font-semibold">Ready for Multimodal Chart Inspection</p>
              <p className="max-w-md mx-auto leading-relaxed">
                Upload a screenshot (or click &ldquo;Vision Scan&rdquo; on the Terminal Chart) and click &ldquo;Determine Best Entry, SL &amp; TP&rdquo; to extract technical setups, optimal execution prices, and Google Search-grounded market evaluation.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Top Result Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`px-3 py-1 rounded-md font-mono text-xs font-extrabold uppercase ${
                      result.bias === 'LONG'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/60'
                        : result.bias === 'SHORT'
                        ? 'bg-rose-950 text-rose-300 border border-rose-600/60'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {result.bias} SETUP
                  </span>
                  <span className="font-mono font-bold text-sm text-white">
                    {result.symbolDetected} · {result.timeframeDetected}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
                  {analysisMeta && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#131b2e] border border-slate-700 text-slate-200">
                        <Cpu className="w-3 h-3 text-purple-400" />
                        {analysisMeta.modelUsed}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#131b2e] border border-slate-700 text-slate-300">
                        <Globe className="w-3 h-3 text-slate-400" />
                        Search: {analysisMeta.groundingStatus}
                      </span>
                    </div>
                  )}
                  <span className="text-slate-400">
                    Confidence:{' '}
                    <strong className="text-cyan-300">{result.confidence}%</strong>
                  </span>
                  {(result.bias === 'LONG' || result.bias === 'SHORT') && (
                    <button
                      type="button"
                      onClick={() =>
                        onApplyLevelsToOrderEntry({
                          symbol: result.symbolDetected,
                          side: result.bias === 'LONG' ? 'LONG' : 'SHORT',
                          entryPrice: result.entryPrice,
                          stopLoss: result.stopLoss,
                          takeProfit: result.takeProfit1,
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Load Levels into Order Entry
                    </button>
                  )}
                </div>
              </div>
              {analysisMeta?.fallbackNotice && (
                <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-700/60 text-[11px] font-mono text-amber-200">
                  {analysisMeta.fallbackNotice}
                </div>
              )}

              {/* Optimal Price Levels Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 font-mono tabular-nums text-xs">
                <div className="p-2.5 rounded-lg bg-[#111728] border border-cyan-800/50">
                  <span className="text-[10px] text-cyan-400 block">BEST ENTRY</span>
                  <span className="text-sm font-bold text-white">{result.entryPrice}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#111728] border border-rose-800/50">
                  <span className="text-[10px] text-rose-400 block">STOP LOSS</span>
                  <span className="text-sm font-bold text-rose-300">{result.stopLoss}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#111728] border border-emerald-800/50">
                  <span className="text-[10px] text-emerald-400 block">TAKE PROFIT 1</span>
                  <span className="text-sm font-bold text-emerald-300">{result.takeProfit1}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#111728] border border-emerald-800/50">
                  <span className="text-[10px] text-emerald-400 block">TAKE PROFIT 2</span>
                  <span className="text-sm font-bold text-emerald-300">{result.takeProfit2}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#111728] border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">R:R RATIO</span>
                  <span className="text-sm font-bold text-cyan-300">{result.rewardToRiskRatio}R</span>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="p-3 rounded-lg bg-[#111728] border border-slate-800 text-xs text-slate-200 leading-relaxed">
                {result.executiveSummary}
              </div>

              {/* Identified Technical Setups */}
              {result.identifiedSetups && result.identifiedSetups.length > 0 && (
                <div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase block mb-1.5">
                    Identified Technical Setups & SMC Confluence
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-mono">
                    {result.identifiedSetups.map((setup, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded bg-[#12192c] border border-slate-800 text-slate-200 flex items-start gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                        <span>{setup}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Indicator Alignment Breakdown */}
              {result.indicatorAlignment && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="p-2.5 rounded-lg bg-[#111728] border border-slate-800">
                    <span className="text-[10px] text-amber-400 font-bold block mb-0.5">SMMA & Classic TA</span>
                    <span className="text-slate-300">{result.indicatorAlignment.smmaTrend || 'Evaluated'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#111728] border border-slate-800">
                    <span className="text-[10px] text-emerald-400 font-bold block mb-0.5">FVG & Order Blocks</span>
                    <span className="text-slate-300">{result.indicatorAlignment.fvgAndOrderBlocks || 'Evaluated'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#111728] border border-slate-800">
                    <span className="text-[10px] text-cyan-400 font-bold block mb-0.5">Liquidity Sweeps & Displacement</span>
                    <span className="text-slate-300">{result.indicatorAlignment.liquidityAndDisplacement || 'Evaluated'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#111728] border border-slate-800">
                    <span className="text-[10px] text-purple-400 font-bold block mb-0.5">Volume Profile & HTF</span>
                    <span className="text-slate-300">{result.indicatorAlignment.volumeProfileAndHtf || 'Evaluated'}</span>
                  </div>
                </div>
              )}

              {/* Position Mgmt & Invalidation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-900/50 text-slate-300">
                  <span className="text-[10px] text-cyan-300 font-bold block mb-0.5">
                    Position Management (BE & Scale-In)
                  </span>
                  {result.positionManagementPlan}
                </div>
                <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-900/50 text-slate-300">
                  <span className="text-[10px] text-rose-300 font-bold block mb-0.5">
                    Invalidation Criteria
                  </span>
                  {result.invalidationCriteria}
                </div>
              </div>

              {/* Search-Grounded Live Market Evaluation */}
              {liveMarketConditions && (
                <div className="p-3 rounded-lg bg-[#111728] border border-slate-800 space-y-2">
                  <span className="text-[10px] font-mono text-amber-300 font-bold uppercase block">
                    Live Google Search Market Conditions Check
                  </span>
                  <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {liveMarketConditions}
                  </p>
                  {sources.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800/80">
                      {sources.map((src, i) => (
                        <a
                          key={i}
                          href={src.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-mono text-cyan-400 hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          <span className="truncate max-w-[200px]">{src.title}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import type { TradingSignal } from '../utils/strategy.ts';
import type { MarketTicker, EconomicEvent } from '../utils/marketData.ts';
import type { BacktestTrade } from '../utils/backtest.ts';
import type { RiskConfig } from '../utils/risk.ts';
import { BrainCircuit, RefreshCw, Sparkles, AlertCircle, ShieldCheck, Newspaper, Compass } from 'lucide-react';

interface AIAssistantViewProps {
  currentSignal: TradingSignal | null;
  tickers: Record<string, MarketTicker>;
  upcomingEvents: EconomicEvent[];
  trades: BacktestTrade[];
  riskConfig: RiskConfig;
  sessionName: string;
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  currentSignal,
  tickers,
  upcomingEvents,
  trades,
  riskConfig,
  sessionName,
}) => {
  const [activeTab, setActiveTab] = useState<'setup' | 'regime' | 'audit'>('setup');
  const [setupAnalysis, setSetupAnalysis] = useState<string>('');
  const [regimeBriefing, setRegimeBriefing] = useState<string>('');
  const [journalReview, setJournalReview] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. Analyze Setup
  const handleAnalyzeSetup = async () => {
    if (!currentSignal) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ai/analyze-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal: currentSignal,
          symbol: currentSignal.symbol,
          timeframe: currentSignal.timeframe,
          indicators: currentSignal.marketContext,
        }),
      });
      const data = await res.json();
      if (data.analysis) {
        setSetupAnalysis(data.analysis);
      } else if (data.error) {
        setErrorMsg(data.error);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect to AI analyst backend');
    } finally {
      setLoading(false);
    }
  };

  // 2. Market Regime Briefing
  const handleGenerateRegimeBriefing = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/ai/market-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickers,
          session: { sessionName },
          upcomingNews: upcomingEvents,
        }),
      });
      const data = await res.json();
      if (data.summary) {
        setRegimeBriefing(data.summary);
      } else if (data.error) {
        setErrorMsg(data.error);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect to AI briefing backend');
    } finally {
      setLoading(false);
    }
  };

  // 3. Journal & Edge Audit
  const handleAuditJournal = async () => {
    setLoading(true);
    setErrorMsg(null);
    const total = trades.length;
    const wins = trades.filter((t) => t.netPnlUSD > 0).length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const gw = trades.filter((t) => t.netPnlUSD > 0).reduce((s, t) => s + t.netPnlUSD, 0);
    const gl = Math.abs(trades.filter((t) => t.netPnlUSD < 0).reduce((s, t) => s + t.netPnlUSD, 0));
    const profitFactor = gl > 0 ? gw / gl : 1.0;
    const totalR = trades.reduce((s, t) => s + t.rMultiple, 0);
    const expectancyR = total > 0 ? totalR / total : 0;

    try {
      const res = await fetch('/api/ai/journal-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trades,
          performance: {
            winRatePercent: Number(winRate.toFixed(1)),
            profitFactor: Number(profitFactor.toFixed(2)),
            expectancyR: Number(expectancyR.toFixed(2)),
            maxDrawdownPercent: 2.5,
          },
          riskConfig,
        }),
      });
      const data = await res.json();
      if (data.review) {
        setJournalReview(data.review);
      } else if (data.error) {
        setErrorMsg(data.error);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect to AI review backend');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header Bar */}
      <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-purple-400" />
            <h2 className="text-lg font-bold font-mono text-white">APEX TRADER AI ANALYST & RISK AUDITOR</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Institutional commentary powered by Gemini 3.8 Flash. Analyzes setups, summarizes regime dynamics, and audits journal performance.
          </p>
        </div>

        {/* Safety Disclaimer */}
        <div className="px-3 py-1.5 rounded-lg bg-purple-950/40 border border-purple-800/60 text-purple-300 text-[11px] font-mono flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
          <span>AI advisory cannot override hard risk guardrails.</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-[#0e1424] p-2 rounded-xl border border-slate-800">
        <button
          onClick={() => setActiveTab('setup')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
            activeTab === 'setup'
              ? 'bg-purple-900/60 text-purple-200 border border-purple-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Setup Explainer & Invalidation
        </button>

        <button
          onClick={() => setActiveTab('regime')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
            activeTab === 'regime'
              ? 'bg-purple-900/60 text-purple-200 border border-purple-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          Market Regime & Macro Briefing
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
            activeTab === 'audit'
              ? 'bg-purple-900/60 text-purple-200 border border-purple-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Journal & Risk Discipline Audit
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Content Area */}
      <div className="p-5 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl space-y-4">
        {activeTab === 'setup' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold font-mono text-white">
                  SETUP EXPLANATION: {currentSignal?.symbol} ({currentSignal?.action})
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  Score: {currentSignal?.qualityScore}/100 | Risk: 0.5% (${currentSignal?.positionSizing.dollarRisk.toFixed(2)})
                </span>
              </div>

              <button
                onClick={handleAnalyzeSetup}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-purple-600/30 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Analyzing...' : setupAnalysis ? 'Re-Analyze Setup' : 'Explain Setup with AI'}
              </button>
            </div>

            {setupAnalysis ? (
              <div className="p-4 rounded-lg bg-[#111728] border border-purple-900/50 font-mono text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                {setupAnalysis}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Click &ldquo;Explain Setup with AI&rdquo; to generate an objective institutional critique of the current market setup, moving average geometry, and invalidation points.
              </div>
            )}
          </div>
        )}

        {activeTab === 'regime' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold font-mono text-white">
                  SESSION REGIME: {sessionName}
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  Gold, Bitcoin, and Forex volatility clustering & macro calendar impact
                </span>
              </div>

              <button
                onClick={handleGenerateRegimeBriefing}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-purple-600/30 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Generating...' : regimeBriefing ? 'Refresh Briefing' : 'Generate Market Briefing'}
              </button>
            </div>

            {regimeBriefing ? (
              <div className="p-4 rounded-lg bg-[#111728] border border-purple-900/50 font-mono text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                {regimeBriefing}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Click &ldquo;Generate Market Briefing&rdquo; to analyze session liquidity, cross-asset correlations, and economic news risks.
              </div>
            )}
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold font-mono text-white">
                  STRATEGY & DISCIPLINE AUDIT
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  Reviews trading journal history to detect behavioral traps, overtrading, and edge degradation
                </span>
              </div>

              <button
                onClick={handleAuditJournal}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-purple-600/30 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Auditing...' : journalReview ? 'Re-Audit Journal' : 'Run AI Strategy Audit'}
              </button>
            </div>

            {journalReview ? (
              <div className="p-4 rounded-lg bg-[#111728] border border-purple-900/50 font-mono text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                {journalReview}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Click &ldquo;Run AI Strategy Audit&rdquo; to analyze realized trades, win/loss distribution, and receive actionable tactical improvements for future sessions.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

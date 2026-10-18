import React, { useState } from 'react';
import type { BacktestReport } from '../utils/backtest.ts';
import { runBacktest } from '../utils/backtest.ts';
import type { Candle } from '../utils/indicators.ts';
import { resampleCandles } from '../utils/marketData.ts';
import type { RiskConfig } from '../utils/risk.ts';
import {
  LineChart,
  Play,
  AlertTriangle,
  TrendingUp,
  Percent,
  CheckCircle,
  Dices,
  Split,
  Download,
} from 'lucide-react';

interface BacktestViewProps {
  currentSymbol: string;
  m5Candles: Candle[];
  riskConfig: RiskConfig;
}

export const BacktestView: React.FC<BacktestViewProps> = ({
  currentSymbol,
  m5Candles,
  riskConfig,
}) => {
  const [initialBalance, setInitialBalance] = useState<number>(100000);
  const [slippageFactor, setSlippageFactor] = useState<number>(1.0);
  const [outOfSampleRatio, setOutOfSampleRatio] = useState<number>(0.3);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'montecarlo' | 'walkforward' | 'trades'>('overview');

  const handleRunBacktest = () => {
    setIsRunning(true);
    setTimeout(() => {
      const m15Candles = resampleCandles(m5Candles, 15, 5);
      const h1Candles = resampleCandles(m5Candles, 60, 5);

      const res = runBacktest({
        symbol: currentSymbol,
        initialBalance,
        m5Candles,
        m15Candles,
        h1Candles,
        riskConfig,
        slippageFactor,
        outOfSampleRatio,
      });

      setReport(res);
      setIsRunning(false);
    }, 150);
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Configuration & Trigger Bar */}
      <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <LineChart className="w-6 h-6 text-cyan-400" />
            <h2 className="text-lg font-bold font-mono text-white">QUANTITATIVE HISTORICAL BACKTESTER</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Chronological bar simulation with realistic spread, broker commissions, execution slippage, and Monte Carlo validation.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <div className="flex items-center gap-1.5 bg-[#131b2e] px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">Capital:</span>
            <select
              value={initialBalance}
              onChange={(e) => setInitialBalance(Number(e.target.value))}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value={10000} className="bg-slate-900">$10,000</option>
              <option value={50000} className="bg-slate-900">$50,000</option>
              <option value={100000} className="bg-slate-900">$100,000</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-[#131b2e] px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">Slippage:</span>
            <select
              value={slippageFactor}
              onChange={(e) => setSlippageFactor(Number(e.target.value))}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value={0.5} className="bg-slate-900">Low (0.5x)</option>
              <option value={1.0} className="bg-slate-900">Normal (1.0x)</option>
              <option value={2.0} className="bg-slate-900">Stress (2.0x)</option>
            </select>
          </div>

          <button
            onClick={handleRunBacktest}
            disabled={isRunning}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-600/30 transition-all cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            {isRunning ? 'SIMULATING...' : 'RUN BACKTEST'}
          </button>
        </div>
      </div>

      {/* Warnings & Integrity Notices */}
      {report && report.warnings.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-700/60 text-amber-300 text-xs font-mono space-y-1">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wide">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            QUANTITATIVE MODEL INTEGRITY WARNINGS
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/90 pl-1">
            {report.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Report Results */}
      {report ? (
        <div className="space-y-4">
          {/* Top Performance Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="p-3 rounded-xl bg-[#0e1424] border border-slate-800">
              <span className="text-[10px] font-mono text-slate-500 block">NET PROFIT</span>
              <span
                className={`font-mono text-base font-extrabold ${
                  report.netProfitUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {report.netProfitUSD >= 0 ? '+' : ''}${report.netProfitUSD.toLocaleString()}
              </span>
              <span className="text-[10px] font-mono text-slate-400 block">
                ({report.netProfitUSD >= 0 ? '+' : ''}{report.netProfitPercent}%)
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#0e1424] border border-slate-800">
              <span className="text-[10px] font-mono text-slate-500 block">WIN RATE</span>
              <span className="font-mono text-base font-extrabold text-white">
                {report.winRatePercent}%
              </span>
              <span className="text-[10px] font-mono text-slate-400 block">
                {report.winningTrades}W / {report.losingTrades}L ({report.totalTrades} total)
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#0e1424] border border-slate-800">
              <span className="text-[10px] font-mono text-slate-500 block">PROFIT FACTOR</span>
              <span
                className={`font-mono text-base font-extrabold ${
                  report.profitFactor >= 1.5 ? 'text-emerald-400' : report.profitFactor >= 1.0 ? 'text-amber-400' : 'text-rose-400'
                }`}
              >
                {report.profitFactor}
              </span>
              <span className="text-[10px] font-mono text-slate-400 block">
                Win/Loss: {report.winLossRatio}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#0e1424] border border-slate-800">
              <span className="text-[10px] font-mono text-slate-500 block">EXPECTANCY</span>
              <span className="font-mono text-base font-extrabold text-cyan-300">
                {report.expectancyR > 0 ? '+' : ''}{report.expectancyR}R
              </span>
              <span className="text-[10px] font-mono text-slate-400 block">
                ${report.expectancyUSD} / trade
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#0e1424] border border-slate-800">
              <span className="text-[10px] font-mono text-rose-400 block">MAX DRAWDOWN</span>
              <span className="font-mono text-base font-extrabold text-rose-400">
                {report.maxDrawdownPercent}%
              </span>
              <span className="text-[10px] font-mono text-slate-400 block">
                -${report.maxDrawdownUSD.toLocaleString()}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#0e1424] border border-slate-800">
              <span className="text-[10px] font-mono text-slate-500 block">BENCHMARK (HOLD)</span>
              <span className="font-mono text-base font-extrabold text-slate-300">
                {report.benchmarkReturnPercent >= 0 ? '+' : ''}{report.benchmarkReturnPercent}%
              </span>
              <span className="text-[10px] font-mono text-slate-400 block">
                Buy & Hold return
              </span>
            </div>
          </div>

          {/* Sub Tabs: Overview, Monte Carlo, Walk-Forward, Trades */}
          <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-800/80">
              <button
                onClick={() => setActiveSubTab('overview')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  activeSubTab === 'overview'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Equity Curve & Costs
              </button>
              <button
                onClick={() => setActiveSubTab('montecarlo')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                  activeSubTab === 'montecarlo'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Dices className="w-3.5 h-3.5" />
                Monte Carlo (1,000 Shuffles)
              </button>
              <button
                onClick={() => setActiveSubTab('walkforward')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                  activeSubTab === 'walkforward'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Split className="w-3.5 h-3.5" />
                Walk-Forward / Out-of-Sample
              </button>
              <button
                onClick={() => setActiveSubTab('trades')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  activeSubTab === 'trades'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Trade Logs ({report.trades.length})
              </button>
            </div>

            {/* Sub Tab: Overview & Equity Curve */}
            {activeSubTab === 'overview' && (
              <div className="space-y-4">
                {/* Visual SVG Equity Curve */}
                <div className="h-64 w-full bg-[#0a0e17] rounded-lg border border-slate-800 p-3 relative flex flex-col justify-between">
                  <div className="flex justify-between text-xs font-mono text-slate-400">
                    <span>CUMULATIVE EQUITY CURVE</span>
                    <span>Initial: ${report.initialDeposit.toLocaleString()} → Final: ${report.finalEquity.toLocaleString()}</span>
                  </div>

                  <svg className="w-full h-44 overflow-visible">
                    <polyline
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2.5"
                      points={report.equityCurve
                        .map((pt, idx) => {
                          const x = (idx / Math.max(1, report.equityCurve.length - 1)) * 800;
                          const minEq = Math.min(report.initialDeposit * 0.9, ...report.equityCurve.map((e) => e.equity));
                          const maxEq = Math.max(report.initialDeposit * 1.1, ...report.equityCurve.map((e) => e.equity));
                          const y = 160 - ((pt.equity - minEq) / (maxEq - minEq || 1)) * 140;
                          return `${x},${y}`;
                        })
                        .join(' ')}
                    />
                  </svg>

                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span>{report.startDate}</span>
                    <span>Chronological Bar Progression</span>
                    <span>{report.endDate}</span>
                  </div>
                </div>

                {/* Transaction Cost Deductions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">COMMISSIONS PAID</span>
                    <span className="font-bold text-slate-200">${report.totalCommissionsUSD.toFixed(2)}</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Two-way broker turnover fee</p>
                  </div>
                  <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">SPREAD FRICTION</span>
                    <span className="font-bold text-slate-200">${report.totalSpreadCostUSD.toFixed(2)}</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Bid/Ask crossing costs</p>
                  </div>
                  <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">SIMULATED SLIPPAGE</span>
                    <span className="font-bold text-slate-200">${report.totalSlippageUSD.toFixed(2)}</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">Adverse stop order execution drift</p>
                  </div>
                </div>
              </div>
            )}

            {/* Sub Tab: Monte Carlo Simulation */}
            {activeSubTab === 'montecarlo' && (
              <div className="space-y-4">
                <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800 text-xs font-mono">
                  <span className="text-cyan-400 font-bold block mb-1">MONTE CARLO RESAMPLING (1,000 SIMULATIONS)</span>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    By randomly shuffling the sequence of realized trades 1,000 times, Monte Carlo stress-testing reveals
                    the true statistical risk of streak clustering, tail-risk drawdowns, and the probability of account ruin.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-3.5 bg-[#131b2e] rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">MEDIAN EXPECTED DRAWDOWN</span>
                    <span className="font-extrabold text-base text-slate-200">
                      {report.monteCarlo.medianMaxDrawdownPercent}%
                    </span>
                    <p className="text-[10px] text-slate-500 mt-1">50th percentile across 1,000 paths</p>
                  </div>

                  <div className="p-3.5 bg-[#131b2e] rounded-lg border border-slate-800">
                    <span className="text-rose-400 font-bold block text-[11px]">95TH PERCENTILE DRAWDOWN (STRESS)</span>
                    <span className="font-extrabold text-base text-rose-400">
                      {report.monteCarlo.percentile95MaxDrawdownPercent}%
                    </span>
                    <p className="text-[10px] text-slate-500 mt-1">Severe tail-risk losing streak scenario</p>
                  </div>

                  <div className="p-3.5 bg-[#131b2e] rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">PROBABILITY OF RUIN (&gt;50% DD)</span>
                    <span
                      className={`font-extrabold text-base ${
                        report.monteCarlo.ruinProbabilityPercent === 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {report.monteCarlo.ruinProbabilityPercent}%
                    </span>
                    <p className="text-[10px] text-slate-500 mt-1">Risk of 50% capital destruction</p>
                  </div>
                </div>
              </div>
            )}

            {/* Sub Tab: Walk-Forward Out-of-Sample Split */}
            {activeSubTab === 'walkforward' && (
              <div className="space-y-4">
                <div className="p-3 bg-[#131b2e] rounded-lg border border-slate-800 text-xs font-mono">
                  <span className="text-cyan-400 font-bold block mb-1">IN-SAMPLE VS OUT-OF-SAMPLE VALIDATION</span>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    The dataset is partitioned into a 70% In-Sample training set and a 30% blind Out-of-Sample validation set
                    to guard against overfitting and verify if edge persists on unseen data.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-[#111728] rounded-lg border border-slate-800 text-xs font-mono space-y-2">
                    <span className="font-bold text-slate-300 block border-b border-slate-800 pb-1">
                      IN-SAMPLE (70% DATA)
                    </span>
                    <div className="flex justify-between text-slate-400">
                      <span>Trades:</span>
                      <span className="text-slate-200">{report.inSampleMetrics.tradeCount}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Win Rate:</span>
                      <span className="text-slate-200">{report.inSampleMetrics.winRate}%</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Profit Factor:</span>
                      <span className="text-emerald-400 font-bold">{report.inSampleMetrics.profitFactor}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Net Return:</span>
                      <span className="text-slate-200">{report.inSampleMetrics.netProfitPercent}%</span>
                    </div>
                  </div>

                  <div className="p-4 bg-[#111728] rounded-lg border border-slate-800 text-xs font-mono space-y-2">
                    <span className="font-bold text-cyan-300 block border-b border-slate-800 pb-1">
                      OUT-OF-SAMPLE (30% BLIND VALIDATION)
                    </span>
                    <div className="flex justify-between text-slate-400">
                      <span>Trades:</span>
                      <span className="text-slate-200">{report.outOfSampleMetrics.tradeCount}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Win Rate:</span>
                      <span className="text-slate-200">{report.outOfSampleMetrics.winRate}%</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Profit Factor:</span>
                      <span className="text-cyan-300 font-bold">{report.outOfSampleMetrics.profitFactor}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Net Return:</span>
                      <span className="text-slate-200">{report.outOfSampleMetrics.netProfitPercent}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sub Tab: Trade Logs */}
            {activeSubTab === 'trades' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800 text-[10px] uppercase">
                      <th className="pb-2">#</th>
                      <th className="pb-2">Side</th>
                      <th className="pb-2">Lots</th>
                      <th className="pb-2">Entry</th>
                      <th className="pb-2">Exit</th>
                      <th className="pb-2">Reason</th>
                      <th className="pb-2">R</th>
                      <th className="pb-2 text-right">Net P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {report.trades.map((t, idx) => (
                      <tr key={t.id} className="hover:bg-slate-800/30">
                        <td className="py-2 text-slate-500">{idx + 1}</td>
                        <td className="py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.side === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {t.side}
                          </span>
                        </td>
                        <td className="py-2 text-slate-300">{t.lots}</td>
                        <td className="py-2 text-slate-300">{t.entryPrice.toFixed(2)}</td>
                        <td className="py-2 text-slate-300">{t.exitPrice.toFixed(2)}</td>
                        <td className="py-2 text-[10px] text-slate-400">{t.exitReason}</td>
                        <td className="py-2 text-cyan-300">{t.rMultiple}R</td>
                        <td
                          className={`py-2 text-right font-bold ${
                            t.netPnlUSD >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {t.netPnlUSD >= 0 ? '+' : ''}${t.netPnlUSD.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-xl bg-[#0e1424] border border-slate-800 text-center text-slate-400">
          <LineChart className="w-12 h-12 mx-auto text-slate-600 mb-3" />
          <h3 className="text-sm font-mono font-bold text-slate-200 uppercase">NO BACKTEST REPORT YET</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Click &ldquo;Run Backtest&rdquo; to simulate strategy execution across chronological historical bars with slippage, commissions, and Monte Carlo ruin calculations.
          </p>
        </div>
      )}
    </div>
  );
};

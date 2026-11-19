import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  RefreshCw,
  FilePlus2,
  ShieldAlert,
  BookOpen,
  Clock,
} from 'lucide-react';
import type { CryptoSnapshotPayload } from '../routes/cryptoResearch.ts';

interface CryptoCandleItem {
  openTimeMs: number;
  closeTimeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}

interface CryptoResearchViewProps {
  onDraftPaperProposal: (draft: {
    symbol: string;
    timeframe: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    thesis: string;
    evidence: string[];
    invalidation: string;
    source: 'CRYPTO_RESEARCH';
  }) => void;
}

const PRESET_COINS = ['BTC', 'ETH', 'SOL', 'HYPE', 'XRP', 'SUI', 'AVAX', 'ARB'];

function formatCompactUSD(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'UNKNOWN';
  if (Math.abs(val) >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

function formatPx(px: number | null | undefined): string {
  if (px === null || px === undefined || !Number.isFinite(px)) return 'UNKNOWN';
  if (px >= 1000) return px.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (px >= 10) return px.toFixed(3);
  return px.toFixed(4);
}

export const CryptoResearchView: React.FC<CryptoResearchViewProps> = ({
  onDraftPaperProposal,
}) => {
  const [coin, setCoin] = useState<string>('BTC');
  const [customCoinInput, setCustomCoinInput] = useState<string>('');
  const [interval, setInterval] = useState<'15m' | '1h' | '4h' | '1d'>('4h');
  const [loading, setLoading] = useState<boolean>(false);
  const [snapshot, setSnapshot] = useState<CryptoSnapshotPayload | null>(null);
  const [candles, setCandles] = useState<CryptoCandleItem[]>([]);
  const [errorBanner, setErrorBanner] = useState<{
    status: string;
    message: string;
    fetchedAtIso?: string;
  } | null>(null);
  const [proposalSide, setProposalSide] = useState<'LONG' | 'SHORT'>('LONG');

  const fetchResearchData = useCallback(async (targetCoin: string, targetInterval: string) => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const [snapRes, candleRes] = await Promise.all([
        fetch(`/api/crypto-research/snapshot?coin=${encodeURIComponent(targetCoin)}`),
        fetch(
          `/api/crypto-research/candles?coin=${encodeURIComponent(
            targetCoin
          )}&interval=${encodeURIComponent(targetInterval)}&bars=24`
        ),
      ]);

      const snapJson = await snapRes.json();
      const candleJson = await candleRes.json().catch(() => ({ candles: [] }));

      if (!snapRes.ok || snapJson.status !== 'OK') {
        setSnapshot(null);
        setCandles(Array.isArray(candleJson?.candles) ? candleJson.candles : []);
        setErrorBanner({
          status: snapJson?.status || `HTTP_${snapRes.status}`,
          message:
            snapJson?.error ||
            'Hyperliquid public /info market research is currently unavailable.',
          fetchedAtIso: snapJson?.fetchedAtIso,
        });
        return;
      }

      setSnapshot(snapJson as CryptoSnapshotPayload);
      setCandles(Array.isArray(candleJson?.candles) ? candleJson.candles : []);
    } catch (err: any) {
      setSnapshot(null);
      setErrorBanner({
        status: 'NETWORK_ERROR',
        message:
          err?.message ||
          'Failed to reach /api/crypto-research. No synthetic crypto quotes substituted.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchResearchData(coin, interval);
  }, [coin, interval, fetchResearchData]);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customCoinInput.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!cleaned) return;
    setCoin(cleaned);
    setCustomCoinInput('');
  };

  const handleDraftProposal = () => {
    if (!snapshot) return;
    const refPx = snapshot.market.markPx ?? snapshot.market.midPx ?? 0;
    if (refPx <= 0) return;

    const latestCandle = candles[candles.length - 1];
    const recentRange =
      candles.length > 0
        ? Math.max(...candles.slice(-6).map((c) => c.high)) -
          Math.min(...candles.slice(-6).map((c) => c.low))
        : refPx * 0.02;

    const stopDist = Math.max(refPx * 0.008, Math.min(refPx * 0.04, recentRange * 0.65));
    const entryPrice = Number(refPx.toFixed(refPx >= 100 ? 2 : 4));
    const stopLoss = Number(
      (proposalSide === 'LONG' ? entryPrice - stopDist : entryPrice + stopDist).toFixed(
        refPx >= 100 ? 2 : 4
      )
    );
    const takeProfit = Number(
      (proposalSide === 'LONG' ? entryPrice + stopDist * 2.2 : entryPrice - stopDist * 2.2).toFixed(
        refPx >= 100 ? 2 : 4
      )
    );

    const band10 = snapshot.orderBook.depthBands.find((b) => b.bps === 10);
    const evidence = [
      `Hyperliquid public /info ${snapshot.coin} Mark ${formatPx(snapshot.market.markPx)} · Mid ${formatPx(
        snapshot.market.midPx
      )} · Oracle ${formatPx(snapshot.market.oraclePx)} (${snapshot.fetchedAtIso})`,
      `Funding: ${
        snapshot.market.hourlyFundingPercent !== null
          ? `${snapshot.market.hourlyFundingPercent}%/hr (${snapshot.market.annualizedFundingPercent}% APR)`
          : 'UNKNOWN'
      } · OI ${formatCompactUSD(snapshot.market.openInterestUSD)} · 24h Vol ${formatCompactUSD(
        snapshot.market.dayNotionalVolumeUSD
      )}`,
      `Book Spread: ${snapshot.orderBook.spreadBps ?? 'N/A'} bps · 10bps Depth: ${formatCompactUSD(
        band10?.totalNotionalUSD
      )}`,
      ...(latestCandle
        ? [
            `Last ${interval} Candle: O ${formatPx(latestCandle.open)} H ${formatPx(
              latestCandle.high
            )} L ${formatPx(latestCandle.low)} C ${formatPx(latestCandle.close)}`,
          ]
        : []),
    ];

    onDraftPaperProposal({
      symbol: snapshot.coin === 'BTC' ? 'BTC/USD' : `${snapshot.coin}-PERP`,
      timeframe: interval.toUpperCase(),
      side: proposalSide,
      entryPrice,
      stopLoss,
      takeProfit,
      thesis: `${proposalSide} crypto perp paper thesis from Hyperliquid public /info research (${snapshot.coin} ${interval}).`,
      evidence,
      invalidation: `Thesis invalid if price breaches protective stop ${stopLoss} or mark-oracle basis diverges sharply.`,
      source: 'CRYPTO_RESEARCH',
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Strict Isolation & Honesty Banner */}
      <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-700/50 text-xs font-mono flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-amber-300 uppercase">
              READ-ONLY HYPERLIQUID PUBLIC /INFO RESEARCH DESK — SEPARATE FROM GOLD & MT5
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
              Queries public Hyperliquid <code className="text-amber-200">POST /info</code> perp data
              (zero API keys, read-only). Does <strong>NOT</strong> provide broker XAU/USD quotes, Forex
              data, or MetaTrader 5 Demo connectivity.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-1 rounded bg-[#131b2e] border border-slate-700 text-[10px] text-cyan-300 font-bold">
            ZERO KEYS · PUBLIC /INFO
          </span>
        </div>
      </div>

      {/* Coin Controls & Interval Selector */}
      <div className="bg-[#0e1424] border border-slate-800 rounded-xl p-3.5 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESET_COINS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCoin(c)}
              className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold transition-colors cursor-pointer ${
                coin === c
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-[#131b2e] text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {c}
            </button>
          ))}

          <form onSubmit={handleCustomSubmit} className="flex items-center gap-1 ml-1">
            <input
              type="text"
              value={customCoinInput}
              onChange={(e) => setCustomCoinInput(e.target.value)}
              placeholder="Other coin (e.g. DOGE)"
              className="w-36 bg-[#131b2e] border border-slate-700 rounded-md px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold cursor-pointer"
            >
              Load
            </button>
          </form>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#131b2e] border border-slate-800 rounded-lg p-0.5">
            {(['15m', '1h', '4h', '1d'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setInterval(tf)}
                className={`px-2 py-1 rounded text-[11px] font-mono font-bold cursor-pointer ${
                  interval === tf ? 'bg-cyan-600 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void fetchResearchData(coin, interval)}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-[#131b2e] hover:bg-[#1a2540] border border-slate-700 text-xs font-mono font-bold text-cyan-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Querying...' : 'Refresh /info'}
          </button>
        </div>
      </div>

      {/* Unavailable Diagnostic Banner (Zero Fake Fallback) */}
      {errorBanner && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-700/60 text-xs font-mono space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>HYPERLIQUID RESEARCH {errorBanner.status}</span>
          </div>
          <p className="text-slate-200">{errorBanner.message}</p>
          {errorBanner.fetchedAtIso && (
            <p className="text-[10px] text-slate-400">Checked UTC: {errorBanner.fetchedAtIso}</p>
          )}
        </div>
      )}

      {/* Live Public Snapshot Display */}
      {snapshot && (
        <div className="space-y-4">
          {/* Top Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#0e1424] border border-slate-800 rounded-xl p-3.5">
              <div className="text-[10px] font-mono text-slate-400 uppercase">
                {snapshot.coin}-PERP Mark / Mid
              </div>
              <div className="text-lg font-mono font-bold text-white tabular-nums mt-0.5">
                ${formatPx(snapshot.market.markPx)}
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-1 flex items-center justify-between">
                <span>Mid: ${formatPx(snapshot.market.midPx)}</span>
                <span
                  className={
                    (snapshot.market.change24hPercent ?? 0) >= 0
                      ? 'text-emerald-400 font-bold'
                      : 'text-rose-400 font-bold'
                  }
                >
                  {(snapshot.market.change24hPercent ?? 0) >= 0 ? '+' : ''}
                  {snapshot.market.change24hPercent ?? 'N/A'}% (24h)
                </span>
              </div>
            </div>

            <div className="bg-[#0e1424] border border-slate-800 rounded-xl p-3.5">
              <div className="text-[10px] font-mono text-slate-400 uppercase">
                Oracle & Basis Divergence
              </div>
              <div className="text-lg font-mono font-bold text-cyan-300 tabular-nums mt-0.5">
                ${formatPx(snapshot.market.oraclePx)}
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">
                Basis: {snapshot.market.markOracleBasisBps ?? 'UNKNOWN'} bps · MaxLev:{' '}
                {snapshot.meta.maxLeverage ?? 'N/A'}x
              </div>
            </div>

            <div className="bg-[#0e1424] border border-slate-800 rounded-xl p-3.5">
              <div className="text-[10px] font-mono text-slate-400 uppercase">
                Funding (1h / Annualized)
              </div>
              <div className="text-lg font-mono font-bold text-amber-300 tabular-nums mt-0.5">
                {snapshot.market.hourlyFundingPercent !== null
                  ? `${snapshot.market.hourlyFundingPercent}%`
                  : 'UNKNOWN'}
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">
                APR:{' '}
                {snapshot.market.annualizedFundingPercent !== null
                  ? `${snapshot.market.annualizedFundingPercent}%`
                  : 'UNKNOWN'}
              </div>
            </div>

            <div className="bg-[#0e1424] border border-slate-800 rounded-xl p-3.5">
              <div className="text-[10px] font-mono text-slate-400 uppercase">
                24h Volume & Open Interest
              </div>
              <div className="text-lg font-mono font-bold text-emerald-300 tabular-nums mt-0.5">
                {formatCompactUSD(snapshot.market.dayNotionalVolumeUSD)}
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">
                OI: {formatCompactUSD(snapshot.market.openInterestUSD)}
              </div>
            </div>
          </div>

          {/* Order Book Depth + Proposal Handoff */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 bg-[#0e1424] border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-mono font-bold uppercase text-white">
                    Visible L2 Order Book & Depth Bands
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  Spread: {snapshot.orderBook.spreadBps ?? 'N/A'} bps (${snapshot.orderBook.spreadUSD ?? 'N/A'})
                </span>
              </div>

              {/* 5 / 10 / 25 bps Depth Bands */}
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                {snapshot.orderBook.depthBands.map((band) => (
                  <div
                    key={band.bps}
                    className="p-2.5 rounded-lg bg-[#111728] border border-slate-800 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>±{band.bps} BPS BAND</span>
                      {(!band.bidReachesBand || !band.askReachesBand) && (
                        <span className="text-amber-400 font-bold" title="Book depth stops short of band edge">
                          SHALLOW
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-white tabular-nums">
                      {formatCompactUSD(band.totalNotionalUSD)}
                    </div>
                    <div className="text-[10px] flex justify-between">
                      <span className="text-emerald-400">Bid {formatCompactUSD(band.bidNotionalUSD)}</span>
                      <span className="text-rose-400">Ask {formatCompactUSD(band.askNotionalUSD)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-[10px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Visible Reach: Bids -{snapshot.orderBook.bidReachBps} bps · Asks +
                  {snapshot.orderBook.askReachBps} bps
                </span>
                <span>
                  Book Precision: {snapshot.orderBook.depthSource} · Snapshot UTC:{' '}
                  {new Date(snapshot.fetchedAtIso).toLocaleTimeString()}
                </span>
              </div>

              {/* Top L2 Ladder */}
              <div className="grid grid-cols-2 gap-3 text-[11px] font-mono tabular-nums pt-1">
                <div>
                  <div className="text-[10px] text-emerald-400 font-bold mb-1">TOP BIDS</div>
                  <div className="space-y-0.5">
                    {snapshot.orderBook.topBids.slice(0, 6).map((b, i) => (
                      <div key={i} className="flex justify-between px-2 py-0.5 rounded bg-emerald-950/20">
                        <span className="text-emerald-300">${formatPx(b.px)}</span>
                        <span className="text-slate-300">{formatCompactUSD(b.notionalUSD)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-rose-400 font-bold mb-1">TOP ASKS</div>
                  <div className="space-y-0.5">
                    {snapshot.orderBook.topAsks.slice(0, 6).map((a, i) => (
                      <div key={i} className="flex justify-between px-2 py-0.5 rounded bg-rose-950/20">
                        <span className="text-rose-300">${formatPx(a.px)}</span>
                        <span className="text-slate-300">{formatCompactUSD(a.notionalUSD)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Candles & Paper Ticket Action */}
            <div className="lg:col-span-5 bg-[#0e1424] border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-xs font-mono font-bold uppercase text-white">
                      Recent {snapshot.coin} {interval} Candles ({candles.length})
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Real Public OHLC
                  </span>
                </div>

                {candles.length === 0 ? (
                  <div className="py-6 text-center text-xs font-mono text-slate-500">
                    No candleSnapshot bars returned for {snapshot.coin} ({interval}).
                  </div>
                ) : (
                  <div className="max-h-52 overflow-y-auto pr-1">
                    <table className="w-full text-left text-[11px] font-mono tabular-nums">
                      <thead>
                        <tr className="text-[10px] text-slate-500 border-b border-slate-800">
                          <th className="pb-1">UTC Time</th>
                          <th className="pb-1">Close</th>
                          <th className="pb-1">High / Low</th>
                          <th className="pb-1 text-right">Vol</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {candles
                          .slice(-8)
                          .reverse()
                          .map((c) => {
                            const bull = c.close >= c.open;
                            return (
                              <tr key={c.openTimeMs}>
                                <td className="py-1 text-slate-400">
                                  {new Date(c.openTimeMs).toISOString().slice(5, 16).replace('T', ' ')}
                                </td>
                                <td className={`py-1 font-bold ${bull ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {formatPx(c.close)}
                                </td>
                                <td className="py-1 text-slate-300">
                                  {formatPx(c.high)} / {formatPx(c.low)}
                                </td>
                                <td className="py-1 text-right text-slate-400">
                                  {c.volume.toFixed(1)}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Paper Ticket Draft Bridge */}
              <div className="p-3 rounded-lg bg-[#111728] border border-slate-800 space-y-2.5 text-xs font-mono">
                <div className="text-[10px] text-cyan-300 font-bold uppercase">
                  Convert Observation to Paper Trade Ticket (Simulation Only)
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Builds an evidence-backed <code className="text-slate-200">APX-YYYYMMDD-XX</code> proposal
                  for the Risk Review & Stressed-Stop Sizing gate before paper testing.
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setProposalSide('LONG')}
                    className={`flex-1 py-1.5 rounded text-xs font-bold cursor-pointer border ${
                      proposalSide === 'LONG'
                        ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/60'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    LONG THESIS
                  </button>
                  <button
                    type="button"
                    onClick={() => setProposalSide('SHORT')}
                    className={`flex-1 py-1.5 rounded text-xs font-bold cursor-pointer border ${
                      proposalSide === 'SHORT'
                        ? 'bg-rose-600/20 text-rose-300 border-rose-500/60'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    SHORT THESIS
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDraftProposal}
                  className="w-full py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  Draft Paper Proposal (`APX-...`)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

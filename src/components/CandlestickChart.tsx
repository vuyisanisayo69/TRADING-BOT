import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { Candle } from '../utils/indicators.ts';
import type { PriceAlert } from '../utils/alerts.ts';
import {
  calculateSMMA,
  calculateBollingerBands,
  calculateVWAP,
  calculateRSI,
  calculateMACD,
  calculateStochastic,
  calculateADX,
  analyzeMarketStructure,
  detectCandlestickPattern,
  detectFairValueGaps,
  detectLiquiditySweeps,
  detectDisplacement,
  detectOrderBlocks,
  calculateVolumeProfile,
} from '../utils/indicators.ts';
import type { MarketTicker } from '../utils/marketData.ts';
import { Camera } from 'lucide-react';

interface CandlestickChartProps {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  ticker?: MarketTicker;
  activeTrade?: {
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
  } | null;
  alerts?: PriceAlert[];
  digits?: number;
  utcOffsetHours?: number;
  onSelectTimeframe: (tf: string) => void;
  onOpenAlertsModal?: () => void;
  onCaptureToVision?: (dataUrl: string) => void;
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  symbol,
  timeframe,
  candles,
  ticker,
  activeTrade,
  alerts = [],
  digits = 2,
  utcOffsetHours = 2,
  onSelectTimeframe,
  onOpenAlertsModal,
  onCaptureToVision,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const subCanvasRef = useRef<HTMLCanvasElement>(null);

  // Overlay state toggles
  const [showSMMA, setShowSMMA] = useState(true);
  const [showBB, setShowBB] = useState(false);
  const [showVWAP, setShowVWAP] = useState(true);
  const [showSR, setShowSR] = useState(true);
  const [showFVG, setShowFVG] = useState(true);
  const [showOB, setShowOB] = useState(true);
  const [showSMC, setShowSMC] = useState(true);
  const [showVP, setShowVP] = useState(true);

  // Sub-chart selector
  const [subIndicator, setSubIndicator] = useState<'RSI' | 'MACD' | 'STOCH' | 'ATR_ADX'>('RSI');

  // Chart view parameters
  const [visibleCount] = useState(65);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const timeframes = ['M1', 'M5', 'M15', 'H1', 'H4'];

  // Pre-calculate indicators
  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const smma5 = useMemo(() => calculateSMMA(closes, 5), [closes]);
  const smma50 = useMemo(() => calculateSMMA(closes, 50), [closes]);
  const bb = useMemo(() => calculateBollingerBands(closes, 20, 2), [closes]);
  const vwap = useMemo(() => calculateVWAP(candles), [candles]);
  const rsi = useMemo(() => calculateRSI(closes, 14), [closes]);
  const macd = useMemo(() => calculateMACD(closes, 12, 26, 9), [closes]);
  const stoch = useMemo(() => calculateStochastic(candles, 14, 3, 3), [candles]);
  const adx = useMemo(() => calculateADX(candles, 14), [candles]);
  const structure = useMemo(() => analyzeMarketStructure(candles, 3), [candles]);

  // Visible window SMC + Volume Profile
  const visibleSlice = useMemo(() => {
    const startIndex = Math.max(0, candles.length - visibleCount);
    return candles.slice(startIndex);
  }, [candles, visibleCount]);

  const fvgs = useMemo(() => detectFairValueGaps(visibleSlice, 0.12), [visibleSlice]);
  const orderBlocks = useMemo(() => detectOrderBlocks(visibleSlice), [visibleSlice]);
  const sweeps = useMemo(() => detectLiquiditySweeps(visibleSlice, 18), [visibleSlice]);
  const displacements = useMemo(() => detectDisplacement(visibleSlice, 1.3), [visibleSlice]);
  const volumeProfile = useMemo(() => calculateVolumeProfile(visibleSlice, 22), [visibleSlice]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, width, height);

    if (candles.length === 0) return;

    const startIndex = Math.max(0, candles.length - visibleCount);
    const visibleCandles = candles.slice(startIndex);
    const count = visibleCandles.length;

    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (let i = 0; i < count; i++) {
      const c = visibleCandles[i];
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;

      const fullIdx = startIndex + i;
      if (showBB && bb.upper[fullIdx]) {
        if (bb.upper[fullIdx]! > maxPrice) maxPrice = bb.upper[fullIdx]!;
        if (bb.lower[fullIdx]! < minPrice) minPrice = bb.lower[fullIdx]!;
      }
    }

    if (activeTrade) {
      minPrice = Math.min(minPrice, activeTrade.stopLoss, activeTrade.entryPrice);
      maxPrice = Math.max(maxPrice, activeTrade.takeProfit, activeTrade.entryPrice);
    }

    const priceMargin = (maxPrice - minPrice) * 0.08 || 1;
    minPrice -= priceMargin;
    maxPrice += priceMargin;
    const priceRange = maxPrice - minPrice;

    const rightMargin = 72;
    const bottomMargin = 22;
    const plotWidth = width - rightMargin;
    const plotHeight = height - bottomMargin;

    const candleWidth = plotWidth / count;
    const barSpacing = candleWidth * 0.28;
    const barBodyWidth = Math.max(2, candleWidth - barSpacing);

    const getY = (price: number) => {
      return plotHeight - ((price - minPrice) / priceRange) * plotHeight;
    };

    // Grid Lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;

    const gridSteps = 6;
    for (let g = 0; g <= gridSteps; g++) {
      const p = minPrice + (priceRange / gridSteps) * g;
      const y = getY(p);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotWidth, y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(p.toFixed(digits), plotWidth + 6, y + 3);
    }

    const timeStep = Math.max(1, Math.floor(count / 6));
    for (let t = 0; t < count; t += timeStep) {
      const x = t * candleWidth + candleWidth / 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, plotHeight);
      ctx.stroke();

      const c = visibleCandles[t];
      const date = new Date((c.time + utcOffsetHours * 3600) * 1000);
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      ctx.fillStyle = '#64748b';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(timeStr, x, height - 6);
    }

    // Volume Profile Histogram + POC line
    if (showVP && volumeProfile.buckets.length > 0) {
      const maxBucketVol = Math.max(...volumeProfile.buckets.map((b) => b.volume), 1);
      const maxBarWidth = Math.min(76, plotWidth * 0.14);

      for (const b of volumeProfile.buckets) {
        const yTop = getY(b.priceHigh);
        const yBottom = getY(b.priceLow);
        const barH = Math.max(1, yBottom - yTop - 1);
        const barW = (b.volume / maxBucketVol) * maxBarWidth;
        const xStart = plotWidth - barW;

        ctx.fillStyle = b.isPOC
          ? 'rgba(245, 158, 11, 0.36)'
          : b.isHVN
          ? 'rgba(56, 189, 248, 0.22)'
          : 'rgba(100, 116, 139, 0.14)';
        ctx.fillRect(xStart, yTop, barW, barH);
      }

      if (volumeProfile.poc >= minPrice && volumeProfile.poc <= maxPrice) {
        const pocY = getY(volumeProfile.poc);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, pocY);
        ctx.lineTo(plotWidth, pocY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText('POC', 6, pocY - 4);
      }
    }

    // Support and Resistance Zones
    if (showSR && structure) {
      for (const zone of structure.supportZones) {
        const yTop = getY(zone.max);
        const yBottom = getY(zone.min);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
        ctx.fillRect(0, yTop, plotWidth, Math.max(2, yBottom - yTop));
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
        ctx.strokeRect(0, yTop, plotWidth, Math.max(2, yBottom - yTop));
      }
      for (const zone of structure.resistanceZones) {
        const yTop = getY(zone.max);
        const yBottom = getY(zone.min);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.06)';
        ctx.fillRect(0, yTop, plotWidth, Math.max(2, yBottom - yTop));
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.2)';
        ctx.strokeRect(0, yTop, plotWidth, Math.max(2, yBottom - yTop));
      }
    }

    // Fair Value Gaps (Unmitigated zones)
    if (showFVG && fvgs.length > 0) {
      const activeFvgs = fvgs.filter((g) => !g.mitigated).slice(-5);
      for (const g of activeFvgs) {
        const xStart = g.startIndex * candleWidth;
        const yTop = getY(g.top);
        const yBottom = getY(g.bottom);
        const boxH = Math.max(2, yBottom - yTop);
        ctx.fillStyle = g.type === 'BULLISH' ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.14)';
        ctx.fillRect(xStart, yTop, plotWidth - xStart, boxH);
        ctx.strokeStyle = g.type === 'BULLISH' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(xStart, yTop, plotWidth - xStart, boxH);

        ctx.fillStyle = g.type === 'BULLISH' ? '#34d399' : '#fb7185';
        ctx.font = 'bold 8px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText('FVG', xStart + 4, yTop + 9);
      }
    }

    // Order Blocks (Supply & Demand)
    if (showOB && orderBlocks.length > 0) {
      const activeObs = orderBlocks.filter((ob) => !ob.mitigated).slice(-4);
      for (const ob of activeObs) {
        const xStart = ob.index * candleWidth;
        const yTop = getY(ob.top);
        const yBottom = getY(ob.bottom);
        const boxH = Math.max(3, yBottom - yTop);
        ctx.fillStyle = ob.type === 'DEMAND' ? 'rgba(56, 189, 248, 0.14)' : 'rgba(249, 115, 22, 0.14)';
        ctx.fillRect(xStart, yTop, plotWidth - xStart, boxH);
        ctx.strokeStyle = ob.type === 'DEMAND' ? 'rgba(56, 189, 248, 0.45)' : 'rgba(249, 115, 22, 0.45)';
        ctx.lineWidth = 0.9;
        ctx.strokeRect(xStart, yTop, plotWidth - xStart, boxH);

        ctx.fillStyle = ob.type === 'DEMAND' ? '#38bdf8' : '#fb923c';
        ctx.font = 'bold 8px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(ob.type === 'DEMAND' ? 'DEMAND OB' : 'SUPPLY OB', xStart + 4, yBottom - 3);
      }
    }

    // Bollinger Bands Ribbon
    if (showBB) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.05)';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < count; i++) {
        const fullIdx = startIndex + i;
        const u = bb.upper[fullIdx];
        if (u !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(u);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      for (let i = count - 1; i >= 0; i--) {
        const fullIdx = startIndex + i;
        const l = bb.lower[fullIdx];
        if (l !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(l);
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const fullIdx = startIndex + i;
        const u = bb.upper[fullIdx];
        if (u !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(u);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const fullIdx = startIndex + i;
        const l = bb.lower[fullIdx];
        if (l !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(l);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    const displacementIdxSet = new Set(displacements.map((d) => d.index));

    // Candlesticks
    for (let i = 0; i < count; i++) {
      const c = visibleCandles[i];
      const xCenter = i * candleWidth + candleWidth / 2;
      const isBullish = c.close >= c.open;

      const bodyTop = getY(Math.max(c.open, c.close));
      const bodyBottom = getY(Math.min(c.open, c.close));
      const wickTop = getY(c.high);
      const wickBottom = getY(c.low);

      const color = isBullish ? '#10b981' : '#f43f5e';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(xCenter, wickTop);
      ctx.lineTo(xCenter, wickBottom);
      ctx.stroke();

      const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);
      ctx.fillRect(xCenter - barBodyWidth / 2, bodyTop, barBodyWidth, bodyHeight);

      // Highlight Displacement breakout candles
      if (showSMC && displacementIdxSet.has(i)) {
        ctx.strokeStyle = isBullish ? '#38bdf8' : '#fbbf24';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(xCenter - barBodyWidth / 2 - 1, bodyTop - 1, barBodyWidth + 2, bodyHeight + 2);
      }

      // Candlestick Pattern Tag
      const prevCandle = i > 0 ? visibleCandles[i - 1] : undefined;
      const pattern = detectCandlestickPattern(c, prevCandle);
      if (pattern && i > count - 8) {
        ctx.fillStyle = pattern.type === 'BULLISH' ? '#34d399' : pattern.type === 'BEARISH' ? '#fb7185' : '#94a3b8';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        const labelY = isBullish ? wickBottom + 12 : wickTop - 6;
        ctx.fillText(pattern.name.split(' ')[0], xCenter, labelY);
      }
    }

    // Liquidity Sweep Markers
    if (showSMC && sweeps.length > 0) {
      for (const sw of sweeps.slice(-6)) {
        const xCenter = sw.index * candleWidth + candleWidth / 2;
        const yMark = sw.type === 'BULLISH_SWEEP' ? getY(sw.wickExtreme) + 12 : getY(sw.wickExtreme) - 8;
        ctx.fillStyle = sw.type === 'BULLISH_SWEEP' ? '#22d3ee' : '#fbbf24';
        ctx.font = 'bold 8px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SWEEP', xCenter, yMark);
      }
    }

    // Overlays: SMMA 5 (Amber) & SMMA 50 (Purple)
    if (showSMMA) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let s5Started = false;
      for (let i = 0; i < count; i++) {
        const val = smma5[startIndex + i];
        if (val !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(val);
          if (!s5Started) {
            ctx.moveTo(x, y);
            s5Started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();

      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      let s50Started = false;
      for (let i = 0; i < count; i++) {
        const val = smma50[startIndex + i];
        if (val !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(val);
          if (!s50Started) {
            ctx.moveTo(x, y);
            s50Started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    }

    // Overlays: VWAP
    if (showVWAP) {
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      let vwapStarted = false;
      for (let i = 0; i < count; i++) {
        const val = vwap[startIndex + i];
        if (val !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(val);
          if (!vwapStarted) {
            ctx.moveTo(x, y);
            vwapStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Active Trade Levels
    if (activeTrade) {
      const entryY = getY(activeTrade.entryPrice);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(0, entryY);
      ctx.lineTo(plotWidth, entryY);
      ctx.stroke();

      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(plotWidth, entryY - 9, rightMargin - 4, 18);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ENTRY', plotWidth + (rightMargin - 4) / 2, entryY + 3);

      const slY = getY(activeTrade.stopLoss);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, slY);
      ctx.lineTo(plotWidth, slY);
      ctx.stroke();

      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(plotWidth, slY - 9, rightMargin - 4, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('SL', plotWidth + (rightMargin - 4) / 2, slY + 3);

      const tpY = getY(activeTrade.takeProfit);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, tpY);
      ctx.lineTo(plotWidth, tpY);
      ctx.stroke();

      ctx.fillStyle = '#10b981';
      ctx.fillRect(plotWidth, tpY - 9, rightMargin - 4, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('TP1', plotWidth + (rightMargin - 4) / 2, tpY + 3);

      ctx.setLineDash([]);
    }

    // Active Price Alerts on Canvas
    if (alerts && alerts.length > 0) {
      const activeSymbolAlerts = alerts.filter((a) => a.symbol === symbol && a.status === 'ACTIVE');
      for (const alert of activeSymbolAlerts) {
        if (alert.targetPrice >= minPrice && alert.targetPrice <= maxPrice) {
          const alertY = getY(alert.targetPrice);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(0, alertY);
          ctx.lineTo(plotWidth, alertY);
          ctx.stroke();

          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(plotWidth, alertY - 9, rightMargin - 4, 18);
          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 9px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText('ALERT', plotWidth + (rightMargin - 4) / 2, alertY + 3);
          ctx.setLineDash([]);
        }
      }
    }

    // Real-time Live Price Line
    if (visibleCandles.length > 0) {
      const latestCandle = visibleCandles[visibleCandles.length - 1];
      const livePrice = latestCandle.close;
      if (livePrice >= minPrice && livePrice <= maxPrice) {
        const livePriceY = getY(livePrice);
        const isUp = latestCandle.close >= latestCandle.open;
        const liveColor = isUp ? '#10b981' : '#f43f5e';

        ctx.strokeStyle = liveColor;
        ctx.lineWidth = 1.3;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(0, livePriceY);
        ctx.lineTo(plotWidth, livePriceY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = liveColor;
        ctx.fillRect(plotWidth, livePriceY - 10, rightMargin, 20);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(livePrice.toFixed(digits), plotWidth + rightMargin / 2, livePriceY + 3.5);

        const lastCandleX = (visibleCandles.length - 1) * candleWidth + candleWidth / 2;
        ctx.beginPath();
        ctx.arc(lastCandleX, livePriceY, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = liveColor;
        ctx.fill();
      }
    }

    // Crosshair
    if (mousePos && mousePos.x < plotWidth && mousePos.y < plotHeight) {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, plotHeight);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(plotWidth, mousePos.y);
      ctx.stroke();

      ctx.setLineDash([]);

      const cursorPrice = minPrice + ((plotHeight - mousePos.y) / plotHeight) * priceRange;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(plotWidth, mousePos.y - 10, rightMargin, 20);
      ctx.strokeStyle = '#64748b';
      ctx.strokeRect(plotWidth, mousePos.y - 10, rightMargin, 20);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(cursorPrice.toFixed(digits), plotWidth + rightMargin / 2, mousePos.y + 3);
    }
  }, [
    candles,
    visibleCount,
    showSMMA,
    showBB,
    showVWAP,
    showSR,
    showFVG,
    showOB,
    showSMC,
    showVP,
    mousePos,
    activeTrade,
    alerts,
    symbol,
    timeframe,
    utcOffsetHours,
    smma5,
    smma50,
    bb,
    vwap,
    structure,
    fvgs,
    orderBlocks,
    sweeps,
    displacements,
    volumeProfile,
    digits,
  ]);

  // Sub-Indicator Canvas Render Loop
  useEffect(() => {
    const canvas = subCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, width, height);

    if (candles.length === 0) return;

    const startIndex = Math.max(0, candles.length - visibleCount);
    const count = Math.min(visibleCount, candles.length - startIndex);
    const rightMargin = 72;
    const plotWidth = width - rightMargin;
    const candleWidth = plotWidth / count;

    if (subIndicator === 'RSI') {
      const getY = (val: number) => height - (val / 100) * height;
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, getY(70));
      ctx.lineTo(plotWidth, getY(70));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, getY(30));
      ctx.lineTo(plotWidth, getY(30));
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#64748b';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillText('70', plotWidth + 6, getY(70) + 3);
      ctx.fillText('30', plotWidth + 6, getY(30) + 3);

      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < count; i++) {
        const val = rsi[startIndex + i];
        if (val !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    } else if (subIndicator === 'MACD') {
      let maxH = 0.001;
      for (let i = 0; i < count; i++) {
        const h = Math.abs(macd.histogram[startIndex + i] || 0);
        const m = Math.abs(macd.macd[startIndex + i] || 0);
        if (h > maxH) maxH = h;
        if (m > maxH) maxH = m;
      }
      maxH *= 1.2;
      const getY = (val: number) => height / 2 - (val / maxH) * (height / 2);

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(plotWidth, height / 2);
      ctx.stroke();

      for (let i = 0; i < count; i++) {
        const h = macd.histogram[startIndex + i];
        if (h !== null && h !== undefined) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(h);
          const barH = height / 2 - y;
          ctx.fillStyle = h >= 0 ? '#10b981' : '#f43f5e';
          ctx.fillRect(x - candleWidth * 0.3, h >= 0 ? y : height / 2, candleWidth * 0.6, Math.abs(barH));
        }
      }

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let mStarted = false;
      for (let i = 0; i < count; i++) {
        const val = macd.macd[startIndex + i];
        if (val !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(val);
          if (!mStarted) {
            ctx.moveTo(x, y);
            mStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();

      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let sStarted = false;
      for (let i = 0; i < count; i++) {
        const val = macd.signal[startIndex + i];
        if (val !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(val);
          if (!sStarted) {
            ctx.moveTo(x, y);
            sStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    } else if (subIndicator === 'STOCH') {
      const getY = (val: number) => height - (val / 100) * height;
      ctx.strokeStyle = '#334155';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, getY(80));
      ctx.lineTo(plotWidth, getY(80));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, getY(20));
      ctx.lineTo(plotWidth, getY(20));
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let kStarted = false;
      for (let i = 0; i < count; i++) {
        const val = stoch.k[startIndex + i];
        if (val !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(val);
          if (!kStarted) {
            ctx.moveTo(x, y);
            kStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();

      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let dStarted = false;
      for (let i = 0; i < count; i++) {
        const val = stoch.d[startIndex + i];
        if (val !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(val);
          if (!dStarted) {
            ctx.moveTo(x, y);
            dStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    } else if (subIndicator === 'ATR_ADX') {
      const getY = (val: number) => height - (val / 60) * height;
      ctx.strokeStyle = '#334155';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, getY(20));
      ctx.lineTo(plotWidth, getY(20));
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      let adxStarted = false;
      for (let i = 0; i < count; i++) {
        const val = adx.adx[startIndex + i];
        if (val !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(val);
          if (!adxStarted) {
            ctx.moveTo(x, y);
            adxStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let pStarted = false;
      for (let i = 0; i < count; i++) {
        const val = adx.plusDI[startIndex + i];
        if (val !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(val);
          if (!pStarted) {
            ctx.moveTo(x, y);
            pStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();

      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let mStarted = false;
      for (let i = 0; i < count; i++) {
        const val = adx.minusDI[startIndex + i];
        if (val !== null) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(val);
          if (!mStarted) {
            ctx.moveTo(x, y);
            mStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    }
  }, [candles, visibleCount, subIndicator, rsi, macd, stoch, adx]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    const startIndex = Math.max(0, candles.length - visibleCount);
    const count = Math.min(visibleCount, candles.length - startIndex);
    const plotWidth = canvas.clientWidth - 72;
    const candleWidth = plotWidth / count;
    const idx = Math.floor(x / candleWidth);
    if (idx >= 0 && idx < count) {
      setHoverIndex(startIndex + idx);
    } else {
      setHoverIndex(null);
    }
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setHoverIndex(null);
  };

  const [countdown, setCountdown] = useState<string>('00:00');
  useEffect(() => {
    const updateCountdown = () => {
      const tfMinutes =
        timeframe === 'M1' ? 1 : timeframe === 'M5' ? 5 : timeframe === 'M15' ? 15 : timeframe === 'H1' ? 60 : 240;
      const stepSec = tfMinutes * 60;
      const nowSec = Math.floor(Date.now() / 1000);
      const rem = stepSec - (nowSec % stepSec);
      const m = Math.floor(rem / 60);
      const s = rem % 60;
      setCountdown(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [timeframe]);

  const handleCaptureChart = () => {
    if (!canvasRef.current || !onCaptureToVision) return;
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onCaptureToVision(dataUrl);
    } catch {
      // ignore capture error
    }
  };

  const activeCandle = hoverIndex !== null && candles[hoverIndex] ? candles[hoverIndex] : candles[candles.length - 1];

  return (
    <div className="flex flex-col h-full bg-[#0a0e17] rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* Chart Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-[#0e1424] gap-2">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-sm font-mono text-white tracking-wide">{symbol}</span>
            {candles.length === 0 ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/60 text-[10px] font-mono font-bold">
                NO FEED
              </span>
            ) : ticker?.feedType === 'LIVE_BROKER' ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 text-[10px] font-mono font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                MT5 DEMO
              </span>
            ) : (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/60 text-[10px] font-mono font-bold">
                SIMULATED
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 bg-[#162038] p-0.5 rounded-md border border-slate-700/60">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => onSelectTimeframe(tf)}
                className={`px-2 py-0.5 text-xs font-mono font-semibold rounded transition-colors cursor-pointer ${
                  timeframe === tf
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {ticker && ticker.status === 'OPEN' && ticker.bid > 0 && (
            <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono tabular-nums bg-[#111827] px-2 py-0.5 rounded border border-slate-800">
              <span className="text-slate-400">
                Bid: <strong className="text-white">{ticker.bid.toFixed(digits)}</strong>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">
                Ask: <strong className="text-white">{ticker.ask.toFixed(digits)}</strong>
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-400 font-semibold">
                Spr: {ticker.category === 'FOREX' ? `${(ticker.spreadPoints / 0.0001).toFixed(1)} pips` : `${ticker.spreadPoints.toFixed(digits)}`}
              </span>
            </div>
          )}

          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
            Close: <strong className="text-cyan-300">{countdown}</strong>
          </span>
        </div>

        {activeCandle && (
          <div className="hidden xl:flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-400">
            <span>O: <span className="text-slate-200">{activeCandle.open.toFixed(digits)}</span></span>
            <span>H: <span className="text-slate-200">{activeCandle.high.toFixed(digits)}</span></span>
            <span>L: <span className="text-slate-200">{activeCandle.low.toFixed(digits)}</span></span>
            <span>
              C:{' '}
              <span className={`font-semibold ${activeCandle.close >= activeCandle.open ? 'text-emerald-400' : 'text-rose-400'}`}>
                {activeCandle.close.toFixed(digits)}
              </span>
            </span>
          </div>
        )}

        {/* Indicator & SMC Overlays Toggles */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setShowSMMA(!showSMMA)}
            className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded border transition-colors cursor-pointer ${
              showSMMA ? 'bg-amber-950/60 text-amber-300 border-amber-600/50' : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            SMMA 5/50
          </button>
          <button
            onClick={() => setShowFVG(!showFVG)}
            className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded border transition-colors cursor-pointer ${
              showFVG ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50' : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            FVG
          </button>
          <button
            onClick={() => setShowOB(!showOB)}
            className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded border transition-colors cursor-pointer ${
              showOB ? 'bg-sky-950/60 text-sky-300 border-sky-600/50' : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            Order Blocks
          </button>
          <button
            onClick={() => setShowSMC(!showSMC)}
            className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded border transition-colors cursor-pointer ${
              showSMC ? 'bg-cyan-950/60 text-cyan-300 border-cyan-600/50' : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            Sweeps/Disp
          </button>
          <button
            onClick={() => setShowVP(!showVP)}
            className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded border transition-colors cursor-pointer ${
              showVP ? 'bg-amber-950/60 text-amber-300 border-amber-600/50' : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            Vol Profile
          </button>
          <button
            onClick={() => setShowVWAP(!showVWAP)}
            className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded border transition-colors cursor-pointer ${
              showVWAP ? 'bg-yellow-950/60 text-yellow-300 border-yellow-600/50' : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            VWAP
          </button>
          <button
            onClick={() => setShowBB(!showBB)}
            className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded border transition-colors cursor-pointer ${
              showBB ? 'bg-sky-950/60 text-sky-300 border-sky-600/50' : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            BB
          </button>
          <button
            onClick={() => setShowSR(!showSR)}
            className={`px-2 py-0.5 text-[10px] font-mono font-medium rounded border transition-colors cursor-pointer ${
              showSR ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50' : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            S/R
          </button>

          {onCaptureToVision && (
            <button
              onClick={handleCaptureChart}
              className="px-2 py-0.5 text-[10px] font-mono font-bold rounded border bg-purple-950/60 text-purple-300 border-purple-600/50 hover:bg-purple-900/60 transition-colors flex items-center gap-1 cursor-pointer"
              title="Send current chart snapshot to Vision Analysis"
            >
              <Camera className="w-3 h-3" />
              <span>Vision Scan</span>
            </button>
          )}

          {onOpenAlertsModal && (
            <button
              onClick={onOpenAlertsModal}
              className="px-2 py-0.5 text-[10px] font-mono font-bold rounded border bg-amber-950/60 text-amber-300 border-amber-600/50 hover:bg-amber-900/60 transition-colors flex items-center gap-1 cursor-pointer"
              title="Manage Price Alerts"
            >
              <span>Alerts ({alerts.filter((a) => a.symbol === symbol && a.status === 'ACTIVE').length})</span>
            </button>
          )}

          <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-800 text-cyan-300 border border-slate-700">
            UTC+2
          </span>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div ref={containerRef} className="relative flex-1 min-h-[360px] w-full">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-full block cursor-crosshair"
        />
        {candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
            <div className="max-w-md text-center bg-[#0e1424]/90 border border-slate-700 rounded-xl p-4 font-mono text-xs space-y-1.5 shadow-xl">
              <div className="font-bold text-amber-300">
                MT5 DEMO MARKET DATA DISCONNECTED
              </div>
              <p className="text-slate-400 text-[11px]">
                No live MT5 Demo EA price stream is connected. Connect your local MetaTrader 5 Demo EA in Settings or switch to Simulation Sandbox.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sub-Indicator Toolbar & Area */}
      <div className="border-t border-slate-800 bg-[#0d1322]">
        <div className="flex items-center justify-between px-3 py-1 bg-[#111827] border-b border-slate-800/60">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mr-2">SUB-INDICATOR:</span>
            {(['RSI', 'MACD', 'STOCH', 'ATR_ADX'] as const).map((sub) => (
              <button
                key={sub}
                onClick={() => setSubIndicator(sub)}
                className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded cursor-pointer ${
                  subIndicator === sub
                    ? 'bg-purple-900/60 text-purple-300 border border-purple-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sub}
              </button>
            ))}
          </div>

          <div className="text-[10px] font-mono text-slate-500">
            {subIndicator === 'RSI' && 'Wilder RSI (14) · OB: 70 / OS: 30'}
            {subIndicator === 'MACD' && 'MACD (12, 26, 9)'}
            {subIndicator === 'STOCH' && 'Stochastic (14, 3, 3)'}
            {subIndicator === 'ATR_ADX' && 'ADX (14) Trend Strength & +DI/-DI'}
          </div>
        </div>

        <div className="h-28 w-full relative">
          <canvas ref={subCanvasRef} className="w-full h-full block" />
        </div>
      </div>
    </div>
  );
};

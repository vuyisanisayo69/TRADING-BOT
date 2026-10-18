import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { Candle } from '../utils/indicators.ts';
import {
  calculateSMMA,
  calculateEMA,
  calculateBollingerBands,
  calculateVWAP,
  calculateRSI,
  calculateMACD,
  calculateStochastic,
  calculateATR,
  calculateADX,
  calculatePivotPoints,
  calculateFibonacciRetracement,
  analyzeMarketStructure,
  detectCandlestickPattern,
} from '../utils/indicators.ts';

interface CandlestickChartProps {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  activeTrade?: {
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
  } | null;
  digits?: number;
  onSelectTimeframe: (tf: string) => void;
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  symbol,
  timeframe,
  candles,
  activeTrade,
  digits = 2,
  onSelectTimeframe,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const subCanvasRef = useRef<HTMLCanvasElement>(null);

  // Overlay state toggles
  const [showSMMA, setShowSMMA] = useState(true);
  const [showEMA, setShowEMA] = useState(false);
  const [showBB, setShowBB] = useState(true);
  const [showVWAP, setShowVWAP] = useState(true);
  const [showSR, setShowSR] = useState(true);
  const [showPivots, setShowPivots] = useState(false);
  const [showFib, setShowFib] = useState(false);

  // Sub-chart selector
  const [subIndicator, setSubIndicator] = useState<'RSI' | 'MACD' | 'STOCH' | 'ATR_ADX'>('RSI');

  // Chart view parameters
  const [visibleCount, setVisibleCount] = useState(65);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Timeframes available
  const timeframes = ['M1', 'M5', 'M15', 'H1', 'H4'];

  // Pre-calculate indicators
  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const smma5 = useMemo(() => calculateSMMA(closes, 5), [closes]);
  const smma50 = useMemo(() => calculateSMMA(closes, 50), [closes]);
  const ema9 = useMemo(() => calculateEMA(closes, 9), [closes]);
  const ema21 = useMemo(() => calculateEMA(closes, 21), [closes]);
  const ema50 = useMemo(() => calculateEMA(closes, 50), [closes]);
  const ema200 = useMemo(() => calculateEMA(closes, 200), [closes]);
  const bb = useMemo(() => calculateBollingerBands(closes, 20, 2), [closes]);
  const vwap = useMemo(() => calculateVWAP(candles), [candles]);
  const rsi = useMemo(() => calculateRSI(closes, 14), [closes]);
  const macd = useMemo(() => calculateMACD(closes, 12, 26, 9), [closes]);
  const stoch = useMemo(() => calculateStochastic(candles, 14, 3, 3), [candles]);
  const atr = useMemo(() => calculateATR(candles, 14), [candles]);
  const adx = useMemo(() => calculateADX(candles, 14), [candles]);
  const structure = useMemo(() => analyzeMarketStructure(candles, 3), [candles]);

  const pivots = useMemo(() => {
    if (candles.length < 2) return null;
    const prev = candles[candles.length - 2];
    return calculatePivotPoints(prev.high, prev.low, prev.close);
  }, [candles]);

  const fib = useMemo(() => {
    if (candles.length < 30) return null;
    const slice = candles.slice(-50);
    const high = Math.max(...slice.map((c) => c.high));
    const low = Math.min(...slice.map((c) => c.low));
    return calculateFibonacciRetracement(high, low, 'UP');
  }, [candles]);

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

    // Price range calculation
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

    // Include active trade prices in visible scale
    if (activeTrade) {
      minPrice = Math.min(minPrice, activeTrade.stopLoss, activeTrade.entryPrice);
      maxPrice = Math.max(maxPrice, activeTrade.takeProfit, activeTrade.entryPrice);
    }

    const priceMargin = (maxPrice - minPrice) * 0.08 || 1;
    minPrice -= priceMargin;
    maxPrice += priceMargin;
    const priceRange = maxPrice - minPrice;

    // Layout margins
    const rightMargin = 68; // Price scale
    const bottomMargin = 22; // Time scale
    const plotWidth = width - rightMargin;
    const plotHeight = height - bottomMargin;

    const candleWidth = plotWidth / count;
    const barSpacing = candleWidth * 0.28;
    const barBodyWidth = Math.max(2, candleWidth - barSpacing);

    const getY = (price: number) => {
      return plotHeight - ((price - minPrice) / priceRange) * plotHeight;
    };

    // Draw Grid Lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;

    // Horizontal Price Grids
    const gridSteps = 6;
    for (let g = 0; g <= gridSteps; g++) {
      const p = minPrice + (priceRange / gridSteps) * g;
      const y = getY(p);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotWidth, y);
      ctx.stroke();

      // Price Label
      ctx.fillStyle = '#64748b';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(p.toFixed(digits), plotWidth + 6, y + 3);
    }

    // Vertical Time Grids
    const timeStep = Math.max(1, Math.floor(count / 6));
    for (let t = 0; t < count; t += timeStep) {
      const x = t * candleWidth + candleWidth / 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, plotHeight);
      ctx.stroke();

      const c = visibleCandles[t];
      const date = new Date(c.time * 1000);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      ctx.fillStyle = '#64748b';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(timeStr, x, height - 6);
    }

    // Render Support and Resistance Zones
    if (showSR && structure) {
      for (const zone of structure.supportZones) {
        const yTop = getY(zone.max);
        const yBottom = getY(zone.min);
        ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
        ctx.fillRect(0, yTop, plotWidth, Math.max(2, yBottom - yTop));
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.strokeRect(0, yTop, plotWidth, Math.max(2, yBottom - yTop));
      }
      for (const zone of structure.resistanceZones) {
        const yTop = getY(zone.max);
        const yBottom = getY(zone.min);
        ctx.fillStyle = 'rgba(244, 63, 94, 0.08)';
        ctx.fillRect(0, yTop, plotWidth, Math.max(2, yBottom - yTop));
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.25)';
        ctx.strokeRect(0, yTop, plotWidth, Math.max(2, yBottom - yTop));
      }
    }

    // Render Bollinger Bands Ribbon
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

      // Stroke Upper and Lower BB
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

    // Render Candlesticks
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

      // Wick
      ctx.beginPath();
      ctx.moveTo(xCenter, wickTop);
      ctx.lineTo(xCenter, wickBottom);
      ctx.stroke();

      // Body
      const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);
      ctx.fillRect(xCenter - barBodyWidth / 2, bodyTop, barBodyWidth, bodyHeight);

      // Candlestick Pattern Detection Tag
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

    // Render Overlays: SMMA 5 (Amber) & SMMA 50 (Purple)
    if (showSMMA) {
      // SMMA 5
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

      // SMMA 50
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

    // Render Overlays: VWAP (Golden Yellow)
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

    // Render Active Trade Levels
    if (activeTrade) {
      // Entry Line (Cyan)
      const entryY = getY(activeTrade.entryPrice);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(0, entryY);
      ctx.lineTo(plotWidth, entryY);
      ctx.stroke();

      // Entry Badge
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(plotWidth, entryY - 9, rightMargin - 4, 18);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`ENTRY`, plotWidth + (rightMargin - 4) / 2, entryY + 3);

      // Stop Loss Line (Rose)
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
      ctx.fillText(`SL`, plotWidth + (rightMargin - 4) / 2, slY + 3);

      // Take Profit Line (Emerald)
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
      ctx.fillText(`TP1`, plotWidth + (rightMargin - 4) / 2, tpY + 3);

      ctx.setLineDash([]);
    }

    // Render Crosshair
    if (mousePos && mousePos.x < plotWidth && mousePos.y < plotHeight) {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0);
      ctx.lineTo(mousePos.x, plotHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(plotWidth, mousePos.y);
      ctx.stroke();

      ctx.setLineDash([]);

      // Current Cursor Price
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
    showEMA,
    showBB,
    showVWAP,
    showSR,
    mousePos,
    activeTrade,
    smma5,
    smma50,
    bb,
    vwap,
    structure,
    digits,
  ]);

  // Sub-Indicator Canvas Render Loop (RSI, MACD, Stochastic, ATR/ADX)
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
    const rightMargin = 68;
    const plotWidth = width - rightMargin;
    const candleWidth = plotWidth / count;

    // Draw Sub-indicator
    if (subIndicator === 'RSI') {
      // 0 to 100 scale
      const getY = (val: number) => height - (val / 100) * height;

      // 70 and 30 Overbought/Oversold lines
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

      // Plot RSI line
      ctx.strokeStyle = '#a855f7'; // Purple
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
      // Calculate MACD min/max in view
      let maxH = 0.001;
      for (let i = 0; i < count; i++) {
        const h = Math.abs(macd.histogram[startIndex + i] || 0);
        const m = Math.abs(macd.macd[startIndex + i] || 0);
        if (h > maxH) maxH = h;
        if (m > maxH) maxH = m;
      }
      maxH *= 1.2;

      const getY = (val: number) => height / 2 - (val / maxH) * (height / 2);

      // Zero line
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(plotWidth, height / 2);
      ctx.stroke();

      // Histogram bars
      for (let i = 0; i < count; i++) {
        const h = macd.histogram[startIndex + i];
        if (h !== null && h !== undefined) {
          const x = i * candleWidth + candleWidth / 2;
          const y = getY(h);
          const barH = height / 2 - y;
          ctx.fillStyle = h >= 0 ? '#10b981' : '#f43f5e';
          ctx.fillRect(x - (candleWidth * 0.3), h >= 0 ? y : height / 2, candleWidth * 0.6, Math.abs(barH));
        }
      }

      // MACD Line
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

      // Signal Line
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

      // %K Line (Cyan)
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

      // %D Line (Orange)
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
      // ADX scale 0 to 60
      const getY = (val: number) => height - (val / 60) * height;

      // 20 and 25 threshold lines
      ctx.strokeStyle = '#334155';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, getY(20));
      ctx.lineTo(plotWidth, getY(20));
      ctx.stroke();
      ctx.setLineDash([]);

      // ADX Line (Yellow)
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

      // +DI (Green)
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

      // -DI (Red)
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

  // Mouse hover handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    const startIndex = Math.max(0, candles.length - visibleCount);
    const count = Math.min(visibleCount, candles.length - startIndex);
    const plotWidth = canvas.clientWidth - 68;
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

  const activeCandle = hoverIndex !== null && candles[hoverIndex] ? candles[hoverIndex] : candles[candles.length - 1];

  return (
    <div className="flex flex-col h-full bg-[#0a0e17] rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* Chart Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-[#0e1424] gap-2">
        {/* Symbol & Timeframe buttons */}
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-sm font-mono text-white tracking-wide">{symbol}</span>
          <div className="flex items-center gap-1 bg-[#162038] p-0.5 rounded-md border border-slate-700/60">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => onSelectTimeframe(tf)}
                className={`px-2 py-0.5 text-xs font-mono font-semibold rounded transition-colors ${
                  timeframe === tf
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* OHLC Bar Statistics */}
        {activeCandle && (
          <div className="hidden md:flex items-center gap-3 text-[11px] font-mono text-slate-400">
            <span>
              O: <span className="text-slate-200">{activeCandle.open.toFixed(digits)}</span>
            </span>
            <span>
              H: <span className="text-slate-200">{activeCandle.high.toFixed(digits)}</span>
            </span>
            <span>
              L: <span className="text-slate-200">{activeCandle.low.toFixed(digits)}</span>
            </span>
            <span>
              C:{' '}
              <span
                className={`font-semibold ${
                  activeCandle.close >= activeCandle.open ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {activeCandle.close.toFixed(digits)}
              </span>
            </span>
            <span>
              V: <span className="text-slate-300">{activeCandle.volume.toLocaleString()}</span>
            </span>
          </div>
        )}

        {/* Indicator Overlays Toggles */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setShowSMMA(!showSMMA)}
            className={`px-2 py-1 text-[11px] font-mono font-medium rounded border transition-colors ${
              showSMMA
                ? 'bg-amber-950/60 text-amber-300 border-amber-600/50'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            SMMA 5/50
          </button>
          <button
            onClick={() => setShowBB(!showBB)}
            className={`px-2 py-1 text-[11px] font-mono font-medium rounded border transition-colors ${
              showBB
                ? 'bg-sky-950/60 text-sky-300 border-sky-600/50'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            BB (20,2)
          </button>
          <button
            onClick={() => setShowVWAP(!showVWAP)}
            className={`px-2 py-1 text-[11px] font-mono font-medium rounded border transition-colors ${
              showVWAP
                ? 'bg-yellow-950/60 text-yellow-300 border-yellow-600/50'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            VWAP
          </button>
          <button
            onClick={() => setShowSR(!showSR)}
            className={`px-2 py-1 text-[11px] font-mono font-medium rounded border transition-colors ${
              showSR
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50'
                : 'bg-slate-900 text-slate-500 border-slate-800'
            }`}
          >
            S/R Zones
          </button>
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
                className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded ${
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
            {subIndicator === 'RSI' && 'Wilder RSI (14) - Overbought: 70 | Oversold: 30'}
            {subIndicator === 'MACD' && 'MACD (12, 26, 9) - Histogram & Signal'}
            {subIndicator === 'STOCH' && 'Stochastic Oscillator (14, 3, 3)'}
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

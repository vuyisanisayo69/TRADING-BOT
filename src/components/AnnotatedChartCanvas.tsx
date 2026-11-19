import React, { useState, useRef } from 'react';
import {
  ANNOTATION_COLOR_HEX,
  type ChartAnnotationItem,
} from '../utils/chartIntelligence.ts';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Columns,
  Eye,
  Layers,
} from 'lucide-react';

interface AnnotatedChartCanvasProps {
  imageUrl: string;
  annotations: ChartAnnotationItem[];
  symbolLabel: string;
  priceAxisCalibrated: boolean;
}

type ViewMode = 'annotated' | 'original' | 'side-by-side';
type LayerFilter = 'all' | 'zones' | 'structure' | 'scenarios';

export const AnnotatedChartCanvas: React.FC<AnnotatedChartCanvasProps> = ({
  imageUrl,
  annotations,
  symbolLabel,
  priceAxisCalibrated,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('annotated');
  const [layerFilter, setLayerFilter] = useState<LayerFilter>('all');
  const [zoom, setZoom] = useState<number>(100);
  const imgRef = useRef<HTMLImageElement>(null);

  const filteredAnnotations = annotations.filter((ann) => {
    if (layerFilter === 'all') return true;
    if (layerFilter === 'zones') {
      return [
        'SUPPORT_ZONE',
        'RESISTANCE_ZONE',
        'BULLISH_FVG',
        'BEARISH_FVG',
        'ORDER_BLOCK_BULL',
        'ORDER_BLOCK_BEAR',
      ].includes(ann.category);
    }
    if (layerFilter === 'structure') {
      return [
        'LIQUIDITY_SWEEP',
        'BREAKOUT_LEVEL',
        'RETEST_ZONE',
        'BOS_LABEL',
        'CHOCH_LABEL',
      ].includes(ann.category);
    }
    return [
      'ENTRY_ZONE',
      'STOP_LOSS',
      'TAKE_PROFIT',
      'BULLISH_ARROW',
      'BEARISH_ARROW',
      'SCENARIO_A_LABEL',
      'SCENARIO_B_LABEL',
    ].includes(ann.category);
  });

  const handleDownloadAnnotated = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return;

    const canvas = document.createElement('canvas');
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(img, 0, 0, w, h);

    const sx = (nx: number) => (nx / 1000) * w;
    const sy = (ny: number) => (ny / 1000) * h;
    const fontSize = Math.max(12, Math.round(h * 0.018));
    ctx.font = `bold ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;

    for (const ann of filteredAnnotations) {
      const palette = ANNOTATION_COLOR_HEX[ann.colorRole] || ANNOTATION_COLOR_HEX.grey;
      const x1 = sx(ann.x1);
      const y1 = sy(ann.y1);
      const x2 = sx(ann.x2);
      const y2 = sy(ann.y2);

      const textLabel = ann.priceLabel
        ? `${ann.label} (${ann.priceLabel}${ann.isApproximate ? ' ~approx' : ''})`
        : ann.isApproximate
        ? `${ann.label} (~approx)`
        : ann.label;

      if (ann.kind === 'box') {
        const bx = Math.min(x1, x2);
        const by = Math.min(y1, y2);
        const bw = Math.max(18, Math.abs(x2 - x1));
        const bh = Math.max(12, Math.abs(y2 - y1));
        ctx.fillStyle = palette.fill;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = palette.stroke;
        ctx.lineWidth = Math.max(1.5, w * 0.002);
        ctx.setLineDash(ann.isApproximate ? [6, 4] : []);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);

        // Label badge
        const tw = ctx.measureText(textLabel).width + 10;
        const lh = fontSize + 6;
        ctx.fillStyle = 'rgba(10, 14, 23, 0.85)';
        ctx.fillRect(bx, Math.max(2, by - lh), tw, lh);
        ctx.fillStyle = palette.text;
        ctx.fillText(textLabel, bx + 5, Math.max(fontSize + 2, by - 4));
      } else if (ann.kind === 'line') {
        ctx.strokeStyle = palette.stroke;
        ctx.lineWidth = Math.max(2, w * 0.0022);
        ctx.setLineDash(ann.isApproximate ? [8, 5] : []);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        const tw = ctx.measureText(textLabel).width + 10;
        const lh = fontSize + 6;
        const lx = Math.min(w - tw - 4, Math.max(4, x1));
        const ly = Math.max(4, y1 - lh - 2);
        ctx.fillStyle = 'rgba(10, 14, 23, 0.88)';
        ctx.fillRect(lx, ly, tw, lh);
        ctx.fillStyle = palette.text;
        ctx.fillText(textLabel, lx + 5, ly + fontSize);
      } else if (ann.kind === 'arrow') {
        ctx.strokeStyle = palette.stroke;
        ctx.fillStyle = palette.stroke;
        ctx.lineWidth = Math.max(2.5, w * 0.0028);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = Math.max(10, h * 0.02);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLen * Math.cos(angle - Math.PI / 6),
          y2 - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          x2 - headLen * Math.cos(angle + Math.PI / 6),
          y2 - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();

        const tw = ctx.measureText(textLabel).width + 10;
        ctx.fillStyle = 'rgba(10, 14, 23, 0.88)';
        ctx.fillRect(Math.max(4, x1 - tw / 2), Math.max(4, y1 - fontSize - 8), tw, fontSize + 6);
        ctx.fillStyle = palette.text;
        ctx.fillText(textLabel, Math.max(8, x1 - tw / 2 + 5), Math.max(fontSize + 2, y1 - 6));
      } else {
        const tw = ctx.measureText(textLabel).width + 10;
        const lh = fontSize + 6;
        const lx = Math.min(w - tw - 4, Math.max(4, x1));
        const ly = Math.min(h - lh - 4, Math.max(4, y1));
        ctx.fillStyle = 'rgba(10, 14, 23, 0.88)';
        ctx.fillRect(lx, ly, tw, lh);
        ctx.strokeStyle = palette.stroke;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(lx, ly, tw, lh);
        ctx.fillStyle = palette.text;
        ctx.fillText(textLabel, lx + 5, ly + fontSize);
      }
    }

    const link = document.createElement('a');
    const safeSym = (symbolLabel || 'CHART').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `apex_chart_intelligence_${safeSym}_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const renderSvgOverlay = () => (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none select-none"
    >
      <defs>
        {(['green', 'red', 'yellow', 'blue', 'grey'] as const).map((color) => (
          <marker
            key={color}
            id={`ci-arrow-${color}`}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill={ANNOTATION_COLOR_HEX[color].stroke} />
          </marker>
        ))}
      </defs>

      {filteredAnnotations.map((ann) => {
        const palette = ANNOTATION_COLOR_HEX[ann.colorRole] || ANNOTATION_COLOR_HEX.grey;
        const displayLabel = ann.priceLabel
          ? `${ann.label} (${ann.priceLabel}${ann.isApproximate ? ' ~' : ''})`
          : ann.isApproximate
          ? `${ann.label} (~approx)`
          : ann.label;

        if (ann.kind === 'box') {
          const x = Math.min(ann.x1, ann.x2);
          const y = Math.min(ann.y1, ann.y2);
          const w = Math.max(24, Math.abs(ann.x2 - ann.x1));
          const h = Math.max(16, Math.abs(ann.y2 - ann.y1));
          return (
            <g key={ann.id}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={palette.fill}
                stroke={palette.stroke}
                strokeWidth="2"
                strokeDasharray={ann.isApproximate ? '6 4' : undefined}
              />
              <rect
                x={x}
                y={Math.max(4, y - 22)}
                width={Math.min(360, displayLabel.length * 7.5 + 14)}
                height="20"
                rx="3"
                fill="rgba(7, 11, 19, 0.88)"
                stroke={palette.stroke}
                strokeWidth="1"
              />
              <text
                x={x + 6}
                y={Math.max(18, y - 8)}
                fill={palette.text}
                fontSize="12"
                fontFamily="ui-monospace, monospace"
                fontWeight="bold"
              >
                {displayLabel}
              </text>
            </g>
          );
        }

        if (ann.kind === 'line') {
          const lx = Math.min(720, Math.max(10, ann.x1));
          const ly = Math.max(24, ann.y1);
          return (
            <g key={ann.id}>
              <line
                x1={ann.x1}
                y1={ann.y1}
                x2={ann.x2}
                y2={ann.y2}
                stroke={palette.stroke}
                strokeWidth="2.4"
                strokeDasharray={ann.isApproximate ? '7 5' : undefined}
              />
              <rect
                x={lx}
                y={ly - 21}
                width={Math.min(360, displayLabel.length * 7.5 + 14)}
                height="19"
                rx="3"
                fill="rgba(7, 11, 19, 0.9)"
                stroke={palette.stroke}
                strokeWidth="1"
              />
              <text
                x={lx + 6}
                y={ly - 7}
                fill={palette.text}
                fontSize="12"
                fontFamily="ui-monospace, monospace"
                fontWeight="bold"
              >
                {displayLabel}
              </text>
            </g>
          );
        }

        if (ann.kind === 'arrow') {
          return (
            <g key={ann.id}>
              <line
                x1={ann.x1}
                y1={ann.y1}
                x2={ann.x2}
                y2={ann.y2}
                stroke={palette.stroke}
                strokeWidth="3"
                markerEnd={`url(#ci-arrow-${ann.colorRole})`}
              />
              <rect
                x={Math.max(8, Math.min(760, ann.x1 - 55))}
                y={Math.max(6, ann.y1 - 24)}
                width={Math.min(280, displayLabel.length * 7.5 + 14)}
                height="20"
                rx="3"
                fill="rgba(7, 11, 19, 0.9)"
                stroke={palette.stroke}
                strokeWidth="1"
              />
              <text
                x={Math.max(14, Math.min(766, ann.x1 - 49))}
                y={Math.max(20, ann.y1 - 10)}
                fill={palette.text}
                fontSize="12"
                fontFamily="ui-monospace, monospace"
                fontWeight="bold"
              >
                {displayLabel}
              </text>
            </g>
          );
        }

        // 'label'
        const tx = Math.max(8, Math.min(740, ann.x1));
        const ty = Math.max(22, Math.min(978, ann.y1));
        return (
          <g key={ann.id}>
            <rect
              x={tx}
              y={ty - 18}
              width={Math.min(340, displayLabel.length * 7.5 + 14)}
              height="20"
              rx="3"
              fill="rgba(7, 11, 19, 0.9)"
              stroke={palette.stroke}
              strokeWidth="1.2"
            />
            <text
              x={tx + 6}
              y={ty - 4}
              fill={palette.text}
              fontSize="12"
              fontFamily="ui-monospace, monospace"
              fontWeight="bold"
            >
              {displayLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );

  return (
    <div className="bg-[#0e1424] rounded-xl border border-slate-800 p-4 shadow-xl space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          <button
            type="button"
            onClick={() => setViewMode('annotated')}
            className={`px-2.5 py-1 rounded border flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              viewMode === 'annotated'
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold'
                : 'bg-[#12192c] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Annotated Chart
          </button>
          <button
            type="button"
            onClick={() => setViewMode('original')}
            className={`px-2.5 py-1 rounded border flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              viewMode === 'original'
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold'
                : 'bg-[#12192c] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Original Screenshot
          </button>
          <button
            type="button"
            onClick={() => setViewMode('side-by-side')}
            className={`px-2.5 py-1 rounded border flex items-center gap-1 whitespace-nowrap cursor-pointer ${
              viewMode === 'side-by-side'
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold'
                : 'bg-[#12192c] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            Side-by-Side
          </button>
        </div>

        {/* Layer Filter + Zoom + Download */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          <select
            value={layerFilter}
            onChange={(e) => setLayerFilter(e.target.value as LayerFilter)}
            className="bg-[#12192c] border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none"
          >
            <option value="all">All Layers ({annotations.length})</option>
            <option value="zones">S/R, FVGs & Order Blocks</option>
            <option value="structure">Liquidity, BOS & CHoCH</option>
            <option value="scenarios">Scenario A & B Levels</option>
          </select>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(50, z - 25))}
            className="p-1.5 rounded bg-[#12192c] border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-slate-300 tabular-nums px-1">{zoom}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(250, z + 25))}
            className="p-1.5 rounded bg-[#12192c] border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(100)}
            className="p-1.5 rounded bg-[#12192c] border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
            title="Reset Zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleDownloadAnnotated}
            className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download Annotated PNG
          </button>
        </div>
      </div>

      {/* Price-Axis Calibration Notice */}
      {!priceAxisCalibrated && (
        <div className="px-3 py-1.5 rounded-lg bg-amber-950/40 border border-amber-700/50 text-amber-300 text-[11px] font-mono">
          Price-axis calibration uncertain or hidden: overlays are rendered as approximate visual zones without fabricated numerical prices.
        </div>
      )}

      {/* Chart Canvas Viewport */}
      {viewMode === 'side-by-side' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-800 bg-black overflow-auto max-h-[520px] p-1">
            <div className="text-[10px] font-mono text-slate-400 uppercase px-2 py-1">
              Original Uploaded Chart
            </div>
            <div style={{ width: `${zoom}%`, minWidth: '100%' }} className="relative inline-block">
              <img
                src={imageUrl}
                alt="Original chart screenshot"
                className="w-full h-auto block select-none"
              />
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-black overflow-auto max-h-[520px] p-1">
            <div className="text-[10px] font-mono text-cyan-400 uppercase px-2 py-1">
              Annotated Technical Overlay
            </div>
            <div style={{ width: `${zoom}%`, minWidth: '100%' }} className="relative inline-block">
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Annotated chart screenshot"
                className="w-full h-auto block select-none"
              />
              {renderSvgOverlay()}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-black overflow-auto max-h-[560px]">
          <div style={{ width: `${zoom}%`, minWidth: '100%' }} className="relative inline-block">
            <img
              ref={imgRef}
              src={imageUrl}
              alt={viewMode === 'original' ? 'Original chart screenshot' : 'Annotated chart screenshot'}
              className="w-full h-auto block select-none"
            />
            {viewMode === 'annotated' && renderSvgOverlay()}
          </div>
        </div>
      )}

      {/* Color Legend */}
      <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] font-mono text-slate-300">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-500/40 border border-emerald-400"></span>
          Green: Bullish zones / Long Scenario A
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-rose-500/40 border border-rose-400"></span>
          Red: Bearish zones / Short Scenario B
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-amber-500/40 border border-amber-400"></span>
          Yellow: Caution & Liquidity pools/sweeps
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-blue-500/40 border border-blue-400"></span>
          Blue: Structure (BOS / CHoCH) & Confirmation
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-slate-400/40 border border-slate-400"></span>
          Grey: Neutral / Unconfirmed zones
        </span>
      </div>
    </div>
  );
};

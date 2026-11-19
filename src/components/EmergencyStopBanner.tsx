import React from 'react';
import { OctagonAlert, ShieldOff } from 'lucide-react';

interface EmergencyStopBannerProps {
  active: boolean;
  onRelease: () => void;
}

export const EmergencyStopBanner: React.FC<EmergencyStopBannerProps> = ({ active, onRelease }) => {
  if (!active) return null;

  return (
    <div
      role="alert"
      className="bg-rose-950/90 border-b border-rose-600 px-4 py-2 text-xs font-mono text-rose-100"
    >
      <div className="max-w-[1720px] mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <OctagonAlert className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
          <span className="font-bold text-rose-200">
            GLOBAL EMERGENCY TRADING-DISABLE ACTIVE:
          </span>
          <span className="text-rose-100/90">
            Auto-trading and all order submissions are locked across Simulation and MT5 Demo.
          </span>
        </div>
        <button
          type="button"
          onClick={onRelease}
          className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
        >
          <ShieldOff className="w-3.5 h-3.5" />
          Re-Arm Trading
        </button>
      </div>
    </div>
  );
};

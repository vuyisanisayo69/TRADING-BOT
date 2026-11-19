import React from 'react';
import { BellRing, X } from 'lucide-react';
import type { PriceAlert } from '../utils/alerts.ts';
import { formatTimeUTC2 } from '../utils/alerts.ts';

export interface AlertToast {
  id: string;
  alert: PriceAlert;
  message: string;
  timestamp: number;
}

interface AlertToastStackProps {
  toasts: AlertToast[];
  onDismiss: (id: string) => void;
}

export const AlertToastStack: React.FC<AlertToastStackProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="p-3.5 rounded-xl bg-[#0e1424] border-2 border-amber-500 shadow-2xl text-xs font-mono flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-950 border border-amber-600/60 text-amber-400">
              <BellRing className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-amber-300">
                <span>PRICE ALERT TRIGGERED</span>
                <span className="text-[10px] text-slate-400">
                  ({formatTimeUTC2(toast.timestamp, true)})
                </span>
              </div>
              <p className="text-slate-200 mt-0.5 leading-snug">{toast.message}</p>
              <span className="text-[10px] text-slate-400 block mt-1">{toast.alert.note}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

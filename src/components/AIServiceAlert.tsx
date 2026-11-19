import React from 'react';
import type { StructuredAIError } from '../lib/geminiTypes.ts';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

interface AIServiceAlertProps {
  error: StructuredAIError | null;
  onRetry?: () => void;
  retryDisabled?: boolean;
  onDismiss?: () => void;
  retryLabel?: string;
}

export const AIServiceAlert: React.FC<AIServiceAlertProps> = ({
  error,
  onRetry,
  retryDisabled = false,
  onDismiss,
  retryLabel = 'Retry Request',
}) => {
  if (!error) return null;

  return (
    <div
      role="alert"
      className="p-3.5 rounded-xl bg-rose-950/55 border border-rose-700/70 text-rose-100 font-mono text-xs shadow-lg space-y-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-extrabold tracking-wide text-amber-300 uppercase">
              {error.title}
            </div>
            <div className="text-rose-100">
              <span className="text-slate-400">Reason: </span>
              {error.reason}
              {error.retryAfterSeconds ? ` (Suggested wait: ~${error.retryAfterSeconds}s)` : ''}
            </div>
            {error.modelAttempted && (
              <div className="text-[11px] text-slate-400">
                Model attempted: <span className="text-slate-200">{error.modelAttempted}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retryDisabled}
              className={`px-2.5 py-1 rounded-md border text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                retryDisabled
                  ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/60 text-amber-200'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${retryDisabled ? 'animate-spin' : ''}`} />
              {retryLabel}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss notification"
              className="p-1 rounded hover:bg-rose-900/50 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {error.actions && error.actions.length > 0 && (
        <div className="pl-6 pt-1 border-t border-rose-800/40">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">
            Actions:
          </span>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-200">
            {error.actions.map((action, idx) => (
              <li key={idx}>{action}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

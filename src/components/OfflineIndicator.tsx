import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="bg-amber-950/90 border-b border-amber-600/60 px-4 py-1.5 text-xs font-mono text-amber-200 flex items-center justify-center gap-2"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>
        Offline Mode — Cached terminal shell active. Backend, Firestore sync, AI requests, and MT5 Demo EA bridge require network connectivity.
      </span>
    </div>
  );
};

import React from 'react';
import { Download, Share, PlusSquare, Smartphone, CheckCircle2, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const {
    isInstallable,
    isInstalled,
    isIOS,
    showIOSInstructions,
    openIOSInstructions,
    closeIOSInstructions,
    promptInstall,
  } = usePWAInstall();

  if (isInstalled) {
    if (compact) return null;
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono bg-emerald-950/50 border border-emerald-800/60 text-emerald-300">
        <CheckCircle2 className="w-3.5 h-3.5" />
        App Installed
      </span>
    );
  }

  const handleClick = () => {
    if (isIOS && !isInstallable) {
      openIOSInstructions();
      return;
    }
    if (isInstallable) {
      void promptInstall();
    } else {
      openIOSInstructions();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`flex items-center gap-1.5 rounded-md font-mono font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          compact
            ? 'px-2.5 py-1.5 text-xs bg-[#131b2e] border border-cyan-700/60 text-cyan-300 hover:bg-cyan-950/60'
            : 'px-3 py-2 text-xs bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-600/20'
        }`}
        title={
          isIOS
            ? 'Add Apex Trader AI to your iOS Home Screen'
            : 'Install Apex Trader AI as a standalone desktop or mobile app'
        }
      >
        <Download className="w-3.5 h-3.5" />
        <span>{compact ? 'Install App' : isIOS ? 'Add to Home Screen' : 'Install App (PWA)'}</span>
      </button>

      {showIOSInstructions && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={closeIOSInstructions}
        >
          <div
            className="bg-[#0e1424] border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 font-mono text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Smartphone className="w-4 h-4 text-cyan-400" />
                <span>INSTALL APEX TRADER AI</span>
              </div>
              <button
                type="button"
                onClick={closeIOSInstructions}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-3 text-slate-300">
                <p className="text-slate-400">
                  Install Apex Trader AI directly on your iPhone or iPad Home Screen without any App Store account:
                </p>
                <div className="p-3 rounded-xl bg-[#131b2e] border border-slate-800 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold shrink-0">
                      1
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>Open this page in Safari and tap the</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                        <Share className="w-3 h-3" /> Share
                      </span>
                      <span>button.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold shrink-0">
                      2
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>Scroll down and choose</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                        <PlusSquare className="w-3 h-3" /> Add to Home Screen
                      </span>
                      <span>.</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold shrink-0">
                      3
                    </span>
                    <span>Tap Add in the upper-right corner to launch in standalone full-screen mode.</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-slate-300">
                <p className="text-slate-400">
                  Your browser manages app installation from the address bar or browser menu:
                </p>
                <div className="p-3 rounded-xl bg-[#131b2e] border border-slate-800 space-y-2">
                  <p>
                    <strong className="text-cyan-300">Android (Chrome / Edge):</strong> Tap the browser menu (⋮) and select{' '}
                    <span className="text-white font-semibold">Install app</span> or{' '}
                    <span className="text-white font-semibold">Add to Home screen</span>.
                  </p>
                  <p>
                    <strong className="text-cyan-300">Desktop (Chrome / Edge):</strong> Click the install icon in the right side of the address bar.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={closeIOSInstructions}
              className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold uppercase tracking-wider cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

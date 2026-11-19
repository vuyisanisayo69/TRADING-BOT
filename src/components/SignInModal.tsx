import React, { useState } from 'react';
import { X, LogIn, Mail, Lock, User, ShieldCheck, AlertCircle, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import type { MT5AccountProfile, TradingEnvironment } from '../types/trading.ts';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeEnvironment: TradingEnvironment;
  mt5Profile: MT5AccountProfile;
  onOpenSettings: () => void;
}

export const SignInModal: React.FC<SignInModalProps> = ({
  isOpen,
  onClose,
  activeEnvironment,
  mt5Profile,
  onOpenSettings,
}) => {
  const {
    user,
    authError,
    clearAuthError,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    logout,
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    const ok = await signInWithGoogle();
    setSubmitting(false);
    if (ok) onClose();
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    const ok =
      mode === 'signin'
        ? await signInWithEmail(email, password)
        : await registerWithEmail(email, password, displayName);
    setSubmitting(false);
    if (ok) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0e1424] rounded-2xl border border-slate-700/80 max-w-md w-full p-5 shadow-2xl space-y-4 font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-950 border border-cyan-700/60 flex items-center justify-center text-cyan-400">
              <LogIn className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">TRADING ACCOUNT SIGN IN</h2>
              <p className="text-[11px] text-slate-400">
                Sync preferences, environments &amp; MT5 Demo profile
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {user ? (
          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#131b2e] border border-emerald-700/40 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-emerald-400 font-bold uppercase">
                  AUTHENTICATED ACCOUNT
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 text-[10px]">
                  {activeEnvironment === 'SIMULATION' ? 'SIMULATION' : 'MT5 DEMO'}
                </span>
              </div>
              <div className="text-sm font-bold text-white">{user.displayName || 'Apex Trader'}</div>
              <div className="text-[11px] text-slate-400">{user.email}</div>
            </div>

            <div className="p-3 rounded-xl bg-[#111728] border border-slate-800 space-y-1 text-[11px]">
              <div className="text-slate-400 font-bold">LINKED MT5 DEMO PROFILE</div>
              <div className="text-slate-200">
                {mt5Profile.brokerName
                  ? `${mt5Profile.brokerName} · ${mt5Profile.brokerServer || 'Server unset'} (#${mt5Profile.demoAccountNumber || 'N/A'})`
                  : 'No MT5 Demo broker server configured yet.'}
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="text-cyan-400 hover:text-cyan-300 underline mt-1 cursor-pointer"
              >
                Configure MT5 Demo Profile &amp; Preferences →
              </button>
            </div>

            <button
              type="button"
              onClick={async () => {
                await logout();
                onClose();
              }}
              className="w-full py-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 border border-rose-700/60 text-rose-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {authError && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-700/60 text-rose-200 flex items-start gap-2 text-[11px]">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={handleGoogleSignIn}
              className="w-full py-2.5 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              Continue with Google Trading Account
            </button>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="shrink mx-3 text-[10px] text-slate-500 uppercase">
                Or Email Account
              </span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <div className="grid grid-cols-2 gap-1 bg-[#131b2e] p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  clearAuthError();
                }}
                className={`py-1.5 rounded text-[11px] font-bold cursor-pointer ${
                  mode === 'signin'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  clearAuthError();
                }}
                className={`py-1.5 rounded text-[11px] font-bold cursor-pointer ${
                  mode === 'register'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-2.5">
              {mode === 'register' && (
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">TRADER NAME</label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Alex Mercer"
                      className="w-full bg-[#131b2e] border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">EMAIL ADDRESS</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@domain.com"
                    className="w-full bg-[#131b2e] border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1">PASSWORD</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#131b2e] border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-[#18233c] hover:bg-[#1e2c4a] border border-cyan-700/60 text-cyan-200 font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {submitting
                  ? 'Authenticating...'
                  : mode === 'signin'
                  ? 'Sign In to Trading Account'
                  : 'Create Trading Account'}
              </button>
            </form>

            <p className="text-[10px] text-slate-500 leading-relaxed">
              Security note: Your Apex account stores workspace preferences, alerts, and non-secret MT5 Demo bridge configuration. Broker passwords and real-money live keys are never requested or stored.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

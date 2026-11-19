import { useState, useEffect, useCallback } from 'react';
import type {
  MT5AccountProfile,
  TradingEnvironment,
  UserTradingSettings,
} from '../types/trading.ts';
import {
  DEFAULT_MT5_PROFILE,
  DEFAULT_USER_SETTINGS,
} from '../types/trading.ts';

const SETTINGS_STORAGE_KEY = 'apex_trader_user_settings_v1';
const ENV_STORAGE_KEY = 'apex_trader_active_env_v1';
const MT5_PROFILE_STORAGE_KEY = 'apex_trader_mt5_profile_v1';

function safeLoadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function usePersistentSettings() {
  const [settings, setSettings] = useState<UserTradingSettings>(() =>
    safeLoadJson<UserTradingSettings>(SETTINGS_STORAGE_KEY, DEFAULT_USER_SETTINGS)
  );

  const [environment, setEnvironment] = useState<TradingEnvironment>(() => {
    if (typeof window === 'undefined') return 'SIMULATION';
    const stored = window.localStorage.getItem(ENV_STORAGE_KEY);
    return stored === 'MT5_DEMO' ? 'MT5_DEMO' : 'SIMULATION';
  });

  const [mt5Profile, setMt5Profile] = useState<MT5AccountProfile>(() =>
    safeLoadJson<MT5AccountProfile>(MT5_PROFILE_STORAGE_KEY, DEFAULT_MT5_PROFILE)
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage quota errors
    }
  }, [settings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ENV_STORAGE_KEY, environment);
    } catch {
      // ignore
    }
  }, [environment]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MT5_PROFILE_STORAGE_KEY, JSON.stringify(mt5Profile));
    } catch {
      // ignore
    }
  }, [mt5Profile]);

  const updateSettings = useCallback((patch: Partial<UserTradingSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (!next.symbols || next.symbols.length === 0) {
        next.symbols = [DEFAULT_USER_SETTINGS.defaultSymbol];
      }
      if (!next.symbols.includes(next.defaultSymbol)) {
        next.defaultSymbol = next.symbols[0];
      }
      if (!next.enabledTimeframes || next.enabledTimeframes.length === 0) {
        next.enabledTimeframes = [DEFAULT_USER_SETTINGS.defaultTimeframe];
      }
      if (!next.enabledTimeframes.includes(next.defaultTimeframe)) {
        next.defaultTimeframe = next.enabledTimeframes[0];
      }
      return next;
    });
  }, []);

  return {
    settings,
    setSettings,
    updateSettings,
    environment,
    setEnvironment,
    mt5Profile,
    setMt5Profile,
  };
}

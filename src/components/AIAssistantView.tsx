import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { TradingSignal, BotSettings } from '../utils/strategy.ts';
import type { MarketTicker, EconomicEvent } from '../utils/marketData.ts';
import type { BacktestTrade } from '../utils/backtest.ts';
import type { RiskConfig, AccountState } from '../utils/risk.ts';
import type { ActivePosition } from './PositionsAndOrders.tsx';
import type {
  AIMetadataPayload,
  AIUsageSummary,
  GeminiModelCatalogEntry,
  GroundingPolicy,
  ServerModelConfig,
  StructuredAIError,
} from '../lib/geminiTypes.ts';
import { parseStructuredAIError, normalizeCatchToAIError } from '../utils/aiErrorClient.ts';
import { AIServiceAlert } from './AIServiceAlert.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import {
  BrainCircuit,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Compass,
  MessageSquare,
  Send,
  Mic,
  MicOff,
  ExternalLink,
  Trash2,
  Globe,
  Volume2,
  SlidersHorizontal,
  Cpu,
  Check,
} from 'lucide-react';

type AssistantSubTab = 'chat' | 'voice' | 'setup' | 'regime' | 'audit';
type ChatTaskMode = 'deep' | 'interactive' | 'general' | 'fast';

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  taskMode?: ChatTaskMode;
  modelUsed?: string;
  groundingStatus?: 'GROUNDED' | 'DISABLED' | 'UNAVAILABLE';
  groundingReason?: string;
  fallbackNotice?: string;
  sources?: { title: string; uri: string }[];
  createdAt?: number;
}

interface VoiceTranscriptItem {
  id: string;
  speaker: 'You' | 'Gemini Live';
  text: string;
}

interface AIAssistantViewProps {
  currentSignal: TradingSignal | null;
  selectedSymbol: string;
  tickers: Record<string, MarketTicker>;
  upcomingEvents: EconomicEvent[];
  trades: BacktestTrade[];
  positions: ActivePosition[];
  account: AccountState;
  riskConfig: RiskConfig;
  botSettings: BotSettings;
  sessionName: string;
}

function int16ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  currentSignal,
  selectedSymbol,
  tickers,
  upcomingEvents,
  trades,
  positions,
  account,
  riskConfig,
  botSettings,
  sessionName,
}) => {
  const { user, getIdToken, signInWithGoogle } = useAuth();
  const [activeTab, setActiveTab] = useState<AssistantSubTab>('chat');

  // Legacy Desk Tabs State
  const [setupAnalysis, setSetupAnalysis] = useState<string>('');
  const [setupMeta, setSetupMeta] = useState<AIMetadataPayload | null>(null);
  const [regimeBriefing, setRegimeBriefing] = useState<string>('');
  const [regimeSources, setRegimeSources] = useState<{ title: string; uri: string }[]>([]);
  const [regimeMeta, setRegimeMeta] = useState<AIMetadataPayload | null>(null);
  const [journalReview, setJournalReview] = useState<string>('');
  const [journalMeta, setJournalMeta] = useState<AIMetadataPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<StructuredAIError | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<(() => void) | null>(null);

  // Server-Side Model & Grounding Settings State
  const [showModelSettings, setShowModelSettings] = useState<boolean>(false);
  const [serverConfig, setServerConfig] = useState<ServerModelConfig | null>(null);
  const [modelCatalog, setModelCatalog] = useState<(GeminiModelCatalogEntry & { availableInProject: boolean })[]>([]);
  const [usageSummary, setUsageSummary] = useState<AIUsageSummary | null>(null);
  const [configSaving, setConfigSaving] = useState<boolean>(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  // Multi-Turn Chatbot State
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatTaskMode, setChatTaskMode] = useState<ChatTaskMode>('general');
  const [useSearchGrounding, setUseSearchGrounding] = useState<boolean>(false);
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [failedChatRetry, setFailedChatRetry] = useState<{
    prompt: string;
    historySnapshot: ChatMessageItem[];
  } | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatLockRef = useRef<boolean>(false);
  const deskLockRef = useRef<boolean>(false);

  // Live Voice API State (gemini-3.8-live)
  const [voiceConnected, setVoiceConnected] = useState<boolean>(false);
  const [voiceConnecting, setVoiceConnecting] = useState<boolean>(false);
  const [voiceTranscripts, setVoiceTranscripts] = useState<VoiceTranscriptItem[]>([]);
  const [voiceError, setVoiceError] = useState<StructuredAIError | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const loadAIConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/config');
      if (!res.ok) return;
      const data = await res.json();
      if (data.config) setServerConfig(data.config);
      if (Array.isArray(data.catalog)) setModelCatalog(data.catalog);
      if (data.usageSummary) setUsageSummary(data.usageSummary);
    } catch {
      // ignore non-fatal initial fetch
    }
  }, []);

  useEffect(() => {
    loadAIConfig();
  }, [loadAIConfig]);

  // Load persisted chat history when authenticated
  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      if (!user) return;
      const token = await getIdToken();
      if (!token) return;
      try {
        const res = await fetch('/api/chat/history?sessionId=default', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.messages)) {
          setChatMessages(
            data.messages.map((m: any) => ({
              id: String(m.id),
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: m.content,
              taskMode: m.taskMode,
              modelUsed: m.modelUsed,
              sources: Array.isArray(m.sourcesJson) ? m.sourcesJson : [],
            }))
          );
        }
      } catch {
        // Non-blocking
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [user, getIdToken]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Cleanup voice session on unmount
  const stopVoiceSession = useCallback(() => {
    try {
      processorRef.current?.disconnect();
    } catch {
      // ignore
    }
    processorRef.current = null;

    try {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    micStreamRef.current = null;

    try {
      if (micCtxRef.current && micCtxRef.current.state !== 'closed') {
        micCtxRef.current.close();
      }
    } catch {
      // ignore
    }
    micCtxRef.current = null;

    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // ignore
      }
    });
    activeSourcesRef.current.clear();

    try {
      if (playCtxRef.current && playCtxRef.current.state !== 'closed') {
        playCtxRef.current.close();
      }
    } catch {
      // ignore
    }
    playCtxRef.current = null;
    nextStartTimeRef.current = 0;

    try {
      wsRef.current?.close();
    } catch {
      // ignore
    }
    wsRef.current = null;

    setVoiceConnected(false);
    setVoiceConnecting(false);
  }, []);

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, [stopVoiceSession]);

  const schedulePcmAudio = useCallback((base64Pcm: string) => {
    if (!playCtxRef.current) return;
    const ctx = playCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const rawBytes = base64ToUint8Array(base64Pcm);
    const int16 = new Int16Array(rawBytes.buffer, rawBytes.byteOffset, Math.floor(rawBytes.byteLength / 2));
    if (int16.length === 0) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  }, []);

  const appendVoiceTranscript = useCallback((speaker: 'You' | 'Gemini Live', chunk: string) => {
    if (!chunk.trim()) return;
    setVoiceTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text}${last.text.endsWith(' ') ? '' : ' '}${chunk}`.trim() },
        ];
      }
      return [...prev, { id: `vt_${Date.now()}_${Math.random()}`, speaker, text: chunk.trim() }];
    });
  }, []);

  const startVoiceSession = async () => {
    if (voiceConnected || voiceConnecting) return;
    setVoiceError(null);
    setVoiceConnecting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const micCtx = new AudioCtx({ sampleRate: 16000 });
      const playCtx = new AudioCtx({ sampleRate: 24000 });
      micCtxRef.current = micCtx;
      playCtxRef.current = playCtx;
      nextStartTimeRef.current = playCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/live-voice`);
      wsRef.current = ws;

      ws.onopen = () => {
        const source = micCtx.createMediaStreamSource(stream);
        const processor = micCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const clamped = Math.max(-1, Math.min(1, input[i]));
            int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
          }
          const b64 = int16ToBase64(new Uint8Array(int16.buffer));
          wsRef.current.send(JSON.stringify({ audio: b64 }));
        };

        source.connect(processor);
        processor.connect(micCtx.destination);

        // Send initial terminal context quietly
        const activeTicker = tickers[selectedSymbol];
        ws.send(
          JSON.stringify({
            text: `Live terminal context: Symbol=${selectedSymbol}, Bid=${activeTicker?.bid}, BotMode=${botSettings.mode}, Signal=${currentSignal?.action || 'NO_TRADE'} (Score ${currentSignal?.qualityScore || 0}/100), OpenPositions=${positions.length}. Greet the trader briefly and summarize readiness.`,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.status === 'connected') {
            setVoiceConnected(true);
            setVoiceConnecting(false);
          } else if (data.error || data.aiError) {
            setVoiceError(parseStructuredAIError(data, data.aiError?.httpStatus || 503));
            stopVoiceSession();
          } else if (data.audio) {
            schedulePcmAudio(data.audio);
          } else if (data.inputTranscript) {
            appendVoiceTranscript('You', data.inputTranscript);
          } else if (data.outputTranscript) {
            appendVoiceTranscript('Gemini Live', data.outputTranscript);
          } else if (data.interrupted) {
            activeSourcesRef.current.forEach((src) => {
              try {
                src.stop();
              } catch {
                // ignore
              }
            });
            activeSourcesRef.current.clear();
            if (playCtxRef.current) {
              nextStartTimeRef.current = playCtxRef.current.currentTime;
            }
          } else if (data.status === 'closed') {
            stopVoiceSession();
          }
        } catch {
          // ignore malformed WS frames
        }
      };

      ws.onerror = () => {
        setVoiceError({
          httpStatus: 503,
          code: 'CONNECTION_FAILURE',
          title: 'AI SERVICE TEMPORARILY UNAVAILABLE',
          reason: 'Live Voice WebSocket connection encountered a network error.',
          actions: ['Verify backend connectivity and retry when available.'],
          retryable: true,
        });
        stopVoiceSession();
      };

      ws.onclose = () => {
        stopVoiceSession();
      };
    } catch (err: any) {
      setVoiceError({
        httpStatus: 400,
        code: 'INVALID_REQUEST',
        title: 'MICROPHONE ACCESS REQUIRED',
        reason: err?.message || 'Microphone access denied or unavailable.',
        actions: ['Allow microphone permissions in your browser and retry.'],
        retryable: true,
      });
      stopVoiceSession();
    }
  };

  const handleSendVoiceContextSnapshot = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const activeTicker = tickers[selectedSymbol];
    wsRef.current.send(
      JSON.stringify({
        text: `Updated Market Snapshot: ${selectedSymbol} Bid=${activeTicker?.bid}, Ask=${activeTicker?.ask}, Bot=${botSettings.mode}, Signal=${currentSignal?.action} (${currentSignal?.qualityScore}/100), H1 Trend=${currentSignal?.marketContext.h1Trend}, POC=${currentSignal?.smcContext.volumeProfile.poc}. Give me a quick verbal tactical read.`,
      })
    );
  };

  // Save Server-Side Model & Grounding Configuration
  const handleSaveModelConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverConfig || configSaving) return;
    setConfigMessage(null);
    setAiError(null);

    if (!user) {
      setAiError({
        httpStatus: 401,
        code: 'AUTH_OR_PERMISSION_DENIED',
        title: 'ADMINISTRATOR SIGN-IN REQUIRED',
        reason: 'Please sign in with Google before updating server-side AI model configuration.',
        actions: ['Click Sign In with Google and retry saving settings.'],
        retryable: false,
      });
      return;
    }

    setConfigSaving(true);
    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error('Authentication token unavailable');
      }
      const res = await fetch('/api/ai/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(serverConfig),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiError(parseStructuredAIError(data, res.status));
        return;
      }
      if (data.config) setServerConfig(data.config);
      if (Array.isArray(data.catalog)) setModelCatalog(data.catalog);
      setConfigMessage('Server-side AI model & grounding configuration updated.');
      loadAIConfig();
    } catch (err) {
      setAiError(normalizeCatchToAIError(err));
    } finally {
      setConfigSaving(false);
    }
  };

  // Multi-Turn Chat Send (retains question & full history on error, supports clean retry without duplicating user turn)
  const executeChatRequest = async (promptText: string, historyBeforePrompt: ChatMessageItem[]) => {
    if (chatLockRef.current) return;
    chatLockRef.current = true;
    setChatLoading(true);
    setAiError(null);
    setFailedChatRetry(null);

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const activeTicker = tickers[selectedSymbol];
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sessionId: 'default',
          message: promptText,
          history: historyBeforePrompt.map((m) => ({ role: m.role, content: m.content })),
          taskMode: chatTaskMode,
          useSearchGrounding,
          terminalContext: {
            symbol: selectedSymbol,
            bid: activeTicker?.bid,
            ask: activeTicker?.ask,
            botMode: botSettings.mode,
            signalAction: currentSignal?.action || 'NO_TRADE',
            signalScore: currentSignal?.qualityScore || 0,
            h1Trend: currentSignal?.marketContext.h1Trend || 'RANGING',
            poc: currentSignal?.smcContext.volumeProfile.poc || 0,
            openPositionsCount: positions.length,
            equity: account.equity.toFixed(2),
            riskPercent: riskConfig.riskPercentagePerTrade,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.reply) {
        const parsedErr = parseStructuredAIError(data, res.status);
        setAiError(parsedErr);
        setFailedChatRetry({ prompt: promptText, historySnapshot: historyBeforePrompt });
        setLastFailedAction(() => () => executeChatRequest(promptText, historyBeforePrompt));
        return;
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          content: data.reply,
          taskMode: chatTaskMode,
          modelUsed: data.meta?.modelUsed || data.modelUsed,
          groundingStatus: data.meta?.groundingStatus,
          groundingReason: data.meta?.groundingReason,
          fallbackNotice: data.meta?.fallbackNotice,
          sources: data.sources || [],
          createdAt: Date.now(),
        },
      ]);
      loadAIConfig();
    } catch (err) {
      setAiError(normalizeCatchToAIError(err));
      setFailedChatRetry({ prompt: promptText, historySnapshot: historyBeforePrompt });
      setLastFailedAction(() => () => executeChatRequest(promptText, historyBeforePrompt));
    } finally {
      chatLockRef.current = false;
      setChatLoading(false);
    }
  };

  const handleSendChatMessage = async (e?: React.FormEvent, overridePrompt?: string) => {
    if (e) e.preventDefault();
    const text = (overridePrompt ?? chatInput).trim();
    if (!text || chatLoading || chatLockRef.current) return;

    const historyBefore = [...chatMessages];
    const userMsg: ChatMessageItem = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
      taskMode: chatTaskMode,
      createdAt: Date.now(),
    };

    setChatMessages([...historyBefore, userMsg]);
    if (!overridePrompt) setChatInput('');
    await executeChatRequest(text, historyBefore);
  };

  const handleClearChat = async () => {
    setChatMessages([]);
    setFailedChatRetry(null);
    setAiError(null);
    if (!user) return;
    const token = await getIdToken();
    if (!token) return;
    fetch('/api/chat/history?sessionId=default', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  };

  // 1. Analyze Setup
  const handleAnalyzeSetup = async () => {
    if (!currentSignal || loading || deskLockRef.current) return;
    deskLockRef.current = true;
    setLoading(true);
    setAiError(null);
    setLastFailedAction(null);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/ai/analyze-setup', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          signal: currentSignal,
          symbol: currentSignal.symbol,
          timeframe: currentSignal.timeframe,
          indicators: currentSignal.marketContext,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.analysis) {
        setAiError(parseStructuredAIError(data, res.status));
        setLastFailedAction(() => handleAnalyzeSetup);
        return;
      }
      setSetupAnalysis(data.analysis);
      setSetupMeta(data.meta || null);
      loadAIConfig();
    } catch (err) {
      setAiError(normalizeCatchToAIError(err));
      setLastFailedAction(() => handleAnalyzeSetup);
    } finally {
      deskLockRef.current = false;
      setLoading(false);
    }
  };

  // 2. Market Regime Briefing (with Configurable Search Grounding)
  const handleGenerateRegimeBriefing = async () => {
    if (loading || deskLockRef.current) return;
    deskLockRef.current = true;
    setLoading(true);
    setAiError(null);
    setLastFailedAction(null);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/ai/market-summary', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          symbol: selectedSymbol,
          tickers,
          session: { sessionName },
          upcomingNews: upcomingEvents,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.summary) {
        setAiError(parseStructuredAIError(data, res.status));
        setLastFailedAction(() => handleGenerateRegimeBriefing);
        return;
      }
      setRegimeBriefing(data.summary);
      setRegimeSources(data.sources || []);
      setRegimeMeta(data.meta || null);
      loadAIConfig();
    } catch (err) {
      setAiError(normalizeCatchToAIError(err));
      setLastFailedAction(() => handleGenerateRegimeBriefing);
    } finally {
      deskLockRef.current = false;
      setLoading(false);
    }
  };

  // 3. Journal & Edge Audit
  const handleAuditJournal = async () => {
    if (loading || deskLockRef.current) return;
    deskLockRef.current = true;
    setLoading(true);
    setAiError(null);
    setLastFailedAction(null);

    const total = trades.length;
    const wins = trades.filter((t) => t.netPnlUSD > 0).length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const gw = trades.filter((t) => t.netPnlUSD > 0).reduce((s, t) => s + t.netPnlUSD, 0);
    const gl = Math.abs(trades.filter((t) => t.netPnlUSD < 0).reduce((s, t) => s + t.netPnlUSD, 0));
    const profitFactor = gl > 0 ? gw / gl : 1.0;
    const totalR = trades.reduce((s, t) => s + t.rMultiple, 0);
    const expectancyR = total > 0 ? totalR / total : 0;

    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/ai/journal-review', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          trades,
          performance: {
            winRatePercent: Number(winRate.toFixed(1)),
            profitFactor: Number(profitFactor.toFixed(2)),
            expectancyR: Number(expectancyR.toFixed(2)),
            maxDrawdownPercent: 2.5,
          },
          riskConfig,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.review) {
        setAiError(parseStructuredAIError(data, res.status));
        setLastFailedAction(() => handleAuditJournal);
        return;
      }
      setJournalReview(data.review);
      setJournalMeta(data.meta || null);
      loadAIConfig();
    } catch (err) {
      setAiError(normalizeCatchToAIError(err));
      setLastFailedAction(() => handleAuditJournal);
    } finally {
      deskLockRef.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header Bar */}
      <div className="p-4 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-purple-400" />
            <h2 className="text-lg font-bold font-mono text-white">
              APEX TRADER AI DESK — CHATBOT, LIVE VOICE & SEARCH GROUNDING
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Multi-turn Gemini Chatbot with configurable Google Search grounding, Real-Time Gemini Live Voice Assistant, and SMC / Risk Auditing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowModelSettings((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors ${
              showModelSettings
                ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-200'
                : 'bg-[#12192c] border-slate-700 text-slate-200 hover:border-cyan-500/50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Model &amp; Grounding Settings</span>
          </button>

          <div className="px-3 py-1.5 rounded-lg bg-purple-950/40 border border-purple-800/60 text-purple-300 text-[11px] font-mono flex items-center gap-1.5 whitespace-nowrap">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            <span>AI advisory cannot override hard risk guardrails.</span>
          </div>
        </div>
      </div>

      {/* Collapsible Server-Side Model & Grounding Configuration Panel */}
      {showModelSettings && serverConfig && (
        <form
          onSubmit={handleSaveModelConfig}
          className="p-4 rounded-xl bg-[#0e1424] border border-cyan-800/50 shadow-xl space-y-3 font-mono text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                Server-Side AI Model, Fallback &amp; Grounding Policy
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Fallback models only run when explicitly enabled here, supported for the task, available to this project, and within their own quota bucket.
              </p>
            </div>
            {usageSummary && (
              <div className="text-[11px] text-slate-300 tabular-nums bg-[#12192c] px-3 py-1.5 rounded-lg border border-slate-800">
                Requests: <strong className="text-cyan-300">{usageSummary.successfulRequests}</strong> ok /{' '}
                <strong className="text-rose-300">{usageSummary.failedRequests}</strong> err · Tokens:{' '}
                <strong className="text-emerald-300">{usageSummary.tokens.totalTokens.toLocaleString()}</strong>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 uppercase">Primary Model</label>
              <select
                value={serverConfig.primaryModel}
                onChange={(e) =>
                  setServerConfig((prev) => (prev ? { ...prev, primaryModel: e.target.value } : prev))
                }
                className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                {modelCatalog
                  .filter((m) => !m.supportsLiveVoice)
                  .map((m) => (
                    <option key={m.id} value={m.id} disabled={!m.availableInProject}>
                      {m.label} {!m.availableInProject ? '(Requires Billing)' : `(${m.rpmLimit} RPM)`}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1 uppercase">Search Grounding Policy</label>
              <select
                value={serverConfig.searchGroundingPolicy}
                onChange={(e) =>
                  setServerConfig((prev) =>
                    prev ? { ...prev, searchGroundingPolicy: e.target.value as GroundingPolicy } : prev
                  )
                }
                className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="AUTO">AUTO (Macro News &amp; Live Research Only)</option>
                <option value="ALLOW_WHEN_REQUESTED">Only When User Toggles Search ON</option>
                <option value="ALWAYS_OFF">Disabled Across All Endpoints</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1 uppercase">Optional Fallback Model</label>
              <select
                value={serverConfig.allowFallback && serverConfig.fallbackModel ? serverConfig.fallbackModel : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setServerConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          allowFallback: Boolean(val),
                          fallbackModel: val || null,
                        }
                      : prev
                  );
                }}
                className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="">Disabled (Never Switch Models)</option>
                {modelCatalog
                  .filter(
                    (m) =>
                      !m.supportsLiveVoice &&
                      m.id !== serverConfig.primaryModel &&
                      m.availableInProject
                  )
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} (Separate {m.rpmLimit} RPM)
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 mb-1 uppercase">Rate Limit (Req / Min)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={serverConfig.perMinuteRateLimit}
                onChange={(e) =>
                  setServerConfig((prev) =>
                    prev
                      ? { ...prev, perMinuteRateLimit: Math.max(1, Math.min(120, Number(e.target.value) || 12)) }
                      : prev
                  )
                }
                className="w-full bg-[#131b2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {configMessage ? (
              <span className="text-[11px] text-emerald-300 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> {configMessage}
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">
                Active: <strong className="text-slate-200">{serverConfig.primaryModel}</strong>
                {serverConfig.allowFallback && serverConfig.fallbackModel
                  ? ` → Fallback: ${serverConfig.fallbackModel}`
                  : ' (No silent fallback)'}
              </span>
            )}

            <div className="flex items-center gap-2">
              {!user && (
                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="px-3 py-1.5 rounded-lg bg-[#131b2e] border border-cyan-600/50 text-cyan-300 text-[11px] font-bold cursor-pointer"
                >
                  Sign In as Admin to Save
                </button>
              )}
              <button
                type="submit"
                disabled={configSaving}
                className={`px-3.5 py-1.5 rounded-lg font-bold text-[11px] cursor-pointer ${
                  configSaving
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                }`}
              >
                {configSaving ? 'Saving...' : 'Save Server Config'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-[#0e1424] p-2 rounded-xl border border-slate-800">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'chat'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Multi-Turn Chatbot
        </button>

        <button
          onClick={() => setActiveTab('voice')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'voice'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          Live Voice Desk
        </button>

        <button
          onClick={() => setActiveTab('regime')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'regime'
              ? 'bg-purple-900/60 text-purple-200 border border-purple-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          Search-Grounded Briefing
        </button>

        <button
          onClick={() => setActiveTab('setup')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'setup'
              ? 'bg-purple-900/60 text-purple-200 border border-purple-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Setup Explainer
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'audit'
              ? 'bg-purple-900/60 text-purple-200 border border-purple-500/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Journal Audit
        </button>
      </div>

      <AIServiceAlert
        error={aiError}
        onRetry={
          failedChatRetry && activeTab === 'chat'
            ? () => executeChatRequest(failedChatRetry.prompt, failedChatRetry.historySnapshot)
            : lastFailedAction ?? undefined
        }
        retryDisabled={chatLoading || loading}
        onDismiss={() => {
          setAiError(null);
          setFailedChatRetry(null);
          setLastFailedAction(null);
        }}
        retryLabel={failedChatRetry && activeTab === 'chat' ? 'Retry Last Question' : 'Retry'}
      />

      {/* Content Area */}
      <div className="p-5 rounded-xl bg-[#0e1424] border border-slate-800 shadow-xl space-y-4">
        {/* 1. MULTI-TURN GEMINI CHATBOT */}
        {activeTab === 'chat' && (
          <div className="space-y-3">
            {/* Chatbot Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                {(
                  [
                    { id: 'deep', label: 'Deep Quant (XHIGH)' },
                    { id: 'interactive', label: 'SMC Architect (HIGH)' },
                    { id: 'general', label: 'Macro Analyst (MED)' },
                    { id: 'fast', label: 'Fast Quick-Check' },
                  ] as const
                ).map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setChatTaskMode(tier.id)}
                    className={`px-2.5 py-1 rounded border transition-colors cursor-pointer whitespace-nowrap ${
                      chatTaskMode === tier.id
                        ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300 font-bold'
                        : 'bg-[#12192c] border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => setUseSearchGrounding((v) => !v)}
                  className={`px-2.5 py-1 rounded border flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    useSearchGrounding
                      ? 'bg-emerald-950/60 border-emerald-600/60 text-emerald-300 font-bold'
                      : 'bg-[#12192c] border-slate-800 text-slate-400'
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  Live Macro Search: {useSearchGrounding ? 'REQUESTED' : 'AUTO / OFF'}
                </button>

                {chatMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearChat}
                    disabled={chatLoading}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Quick Prompts */}
            <div className="flex flex-wrap gap-1.5">
              {[
                `Evaluate ${selectedSymbol} setup using SMMA 5/50, FVG, Order Blocks & POC`,
                `What macro news today is driving ${selectedSymbol}?`,
                'Design a breakeven and 2-entry scale-in plan for this session',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={chatLoading}
                  onClick={() => handleSendChatMessage(undefined, preset)}
                  className="px-2.5 py-1 rounded-md bg-[#12192c] hover:bg-[#18223a] border border-slate-800 text-[11px] font-mono text-slate-300 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Scrollable Conversation Thread */}
            <div className="h-[380px] overflow-y-auto rounded-xl bg-[#0a0f1c] border border-slate-800 p-4 space-y-3">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 font-mono text-xs space-y-2">
                  <MessageSquare className="w-8 h-8 text-slate-700" />
                  <p className="text-slate-300 font-semibold">
                    Live Terminal Telemetry Synced ({selectedSymbol} · {botSettings.mode} Mode)
                  </p>
                  <p className="max-w-md">
                    Ask multi-turn questions about market structure, Fair Value Gaps, Order Blocks, Volume Profile POC, risk sizing, or live macro drivers.
                  </p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs font-mono leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-cyan-600/25 border border-cyan-500/40 text-slate-100'
                          : 'bg-[#12192c] border border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="text-[10px] text-slate-400 mb-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold uppercase">
                          {msg.role === 'user' ? 'You' : msg.modelUsed || 'Gemini Analyst'}
                        </span>
                        {msg.role === 'assistant' && msg.groundingStatus && (
                          <span
                            title={msg.groundingReason || ''}
                            className={`px-1.5 py-0.5 rounded text-[9px] border ${
                              msg.groundingStatus === 'GROUNDED'
                                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                                : msg.groundingStatus === 'UNAVAILABLE'
                                ? 'bg-amber-950/60 border-amber-700/60 text-amber-300'
                                : 'bg-slate-900 border-slate-700 text-slate-400'
                            }`}
                          >
                            Search: {msg.groundingStatus}
                          </span>
                        )}
                      </div>
                      {msg.fallbackNotice && (
                        <div className="mb-1.5 px-2 py-1 rounded bg-amber-950/40 border border-amber-700/60 text-[10px] text-amber-200">
                          {msg.fallbackNotice}
                        </div>
                      )}
                      {msg.content}

                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-800 flex flex-wrap gap-2">
                          {msg.sources.map((src, i) => (
                            <a
                              key={i}
                              href={src.uri}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span className="truncate max-w-[200px]">{src.title}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {chatLoading && (
                <div className="flex items-start">
                  <div className="rounded-xl px-3.5 py-2.5 bg-[#12192c] border border-slate-800 text-xs font-mono text-cyan-300 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Thinking with live terminal telemetry...
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={(e) => handleSendChatMessage(e)} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={`Ask Gemini about ${selectedSymbol}, FVGs, Order Blocks, or macro news...`}
                className="flex-1 bg-[#111728] border border-slate-700 rounded-lg px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className={`px-4 py-2 rounded-lg font-mono text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  chatLoading || !chatInput.trim()
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </form>
          </div>
        )}

        {/* 2. REAL-TIME LIVE VOICE DESK (gemini-3.8-live) */}
        {activeTab === 'voice' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold font-mono text-white flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  GEMINI LIVE VOICE DESK (16kHz Mic / 24kHz PCM Audio)
                </h3>
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  Low-latency bidirectional voice conversation with automatic interruption handling.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {voiceConnected && (
                  <button
                    type="button"
                    onClick={handleSendVoiceContextSnapshot}
                    className="px-3 py-2 rounded-lg bg-[#131b2e] border border-cyan-600/50 text-cyan-300 hover:bg-cyan-950/60 font-mono text-xs font-bold whitespace-nowrap cursor-pointer"
                  >
                    Read Live {selectedSymbol} Snapshot
                  </button>
                )}

                {!voiceConnected ? (
                  <button
                    type="button"
                    onClick={startVoiceSession}
                    disabled={voiceConnecting}
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 whitespace-nowrap cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                    {voiceConnecting ? 'Connecting Mic & Live Session...' : 'Start Live Voice Session'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopVoiceSession}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold flex items-center gap-2 shadow-lg whitespace-nowrap cursor-pointer"
                  >
                    <MicOff className="w-4 h-4" />
                    End Voice Session
                  </button>
                )}
              </div>
            </div>

            <AIServiceAlert
              error={voiceError}
              onRetry={startVoiceSession}
              retryDisabled={voiceConnecting}
              onDismiss={() => setVoiceError(null)}
              retryLabel="Reconnect Voice"
            />

            <div className="h-[320px] overflow-y-auto rounded-xl bg-[#0a0f1c] border border-slate-800 p-4 space-y-2.5 font-mono text-xs">
              {voiceTranscripts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                  <Mic className={`w-8 h-8 ${voiceConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-700'}`} />
                  <p className="text-slate-300 font-semibold">
                    {voiceConnected
                      ? 'Microphone active — speak naturally about your setups or risk limits.'
                      : 'Click "Start Live Voice Session" to talk directly with Apex Trader AI.'}
                  </p>
                </div>
              ) : (
                voiceTranscripts.map((item) => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-lg border ${
                      item.speaker === 'You'
                        ? 'bg-cyan-950/30 border-cyan-800/50 text-cyan-100'
                        : 'bg-[#12192c] border-slate-800 text-slate-200'
                    }`}
                  >
                    <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">
                      {item.speaker}
                    </span>
                    {item.text}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 3. SETUP EXPLAINER */}
        {activeTab === 'setup' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold font-mono text-white">
                  SETUP EXPLANATION: {currentSignal?.symbol} ({currentSignal?.action}) · {currentSignal?.botMode} MODE
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  Score: {currentSignal?.qualityScore}/100 | Risk: {riskConfig.riskPercentagePerTrade}% ($
                  {currentSignal?.positionSizing.dollarRisk.toFixed(2)})
                </span>
              </div>

              <button
                onClick={handleAnalyzeSetup}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-purple-600/30 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Analyzing...' : setupAnalysis ? 'Re-Analyze Setup' : 'Explain Setup with AI'}
              </button>
            </div>

            {setupAnalysis ? (
              <div className="space-y-2">
                {setupMeta && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                    <span>Model: <strong className="text-slate-200">{setupMeta.modelUsed}</strong></span>
                    <span>·</span>
                    <span>Search: {setupMeta.groundingStatus}</span>
                    {setupMeta.fallbackNotice && (
                      <span className="text-amber-300">({setupMeta.fallbackNotice})</span>
                    )}
                  </div>
                )}
                <div className="p-4 rounded-lg bg-[#111728] border border-purple-900/50 font-mono text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {setupAnalysis}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Click &ldquo;Explain Setup with AI&rdquo; to evaluate Classic SMMA 5/50, RSI, ATR, FVGs, Liquidity Sweeps, Displacement, Order Blocks, Volume Profile POC, and invalidation levels.
              </div>
            )}
          </div>
        )}

        {/* 4. SEARCH-GROUNDED MARKET REGIME BRIEFING */}
        {activeTab === 'regime' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold font-mono text-white">
                  SEARCH-GROUNDED MACRO BRIEFING · {sessionName}
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  Live Google Search market catalysts for Gold, Bitcoin, and Major FX currencies
                </span>
              </div>

              <button
                onClick={handleGenerateRegimeBriefing}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-purple-600/30 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Searching & Synthesizing...' : regimeBriefing ? 'Refresh Briefing' : 'Generate Live Briefing'}
              </button>
            </div>

            {regimeBriefing ? (
              <div className="space-y-3">
                {regimeMeta && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                    <span>Model: <strong className="text-slate-200">{regimeMeta.modelUsed}</strong></span>
                    <span>·</span>
                    <span
                      className={
                        regimeMeta.groundingStatus === 'GROUNDED'
                          ? 'text-emerald-300'
                          : regimeMeta.groundingStatus === 'UNAVAILABLE'
                          ? 'text-amber-300'
                          : 'text-slate-400'
                      }
                    >
                      Search Grounding: {regimeMeta.groundingStatus} ({regimeMeta.groundingReason})
                    </span>
                  </div>
                )}
                <div className="p-4 rounded-lg bg-[#111728] border border-purple-900/50 font-mono text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {regimeBriefing}
                </div>
                {regimeSources.length > 0 && (
                  <div className="p-3 rounded-lg bg-[#111728] border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase block">
                      Google Search Grounding Sources
                    </span>
                    <div className="flex flex-wrap gap-2.5">
                      {regimeSources.map((src, i) => (
                        <a
                          key={i}
                          href={src.uri}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-mono text-cyan-300 hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span className="truncate max-w-[260px]">{src.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Click &ldquo;Generate Live Briefing&rdquo; to fetch real-time Google Search market drivers, central bank catalysts, and liquidity conditions.
              </div>
            )}
          </div>
        )}

        {/* 5. JOURNAL AUDIT */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold font-mono text-white">STRATEGY & DISCIPLINE AUDIT</h3>
                <span className="text-xs font-mono text-slate-400">
                  Reviews trading journal history to detect behavioral traps, overtrading, and edge degradation
                </span>
              </div>

              <button
                onClick={handleAuditJournal}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-purple-600/30 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Auditing...' : journalReview ? 'Re-Audit Journal' : 'Run AI Strategy Audit'}
              </button>
            </div>

            {journalReview ? (
              <div className="space-y-2">
                {journalMeta && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                    <span>Model: <strong className="text-slate-200">{journalMeta.modelUsed}</strong></span>
                    <span>·</span>
                    <span>Search: {journalMeta.groundingStatus}</span>
                  </div>
                )}
                <div className="p-4 rounded-lg bg-[#111728] border border-purple-900/50 font-mono text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {journalReview}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Click &ldquo;Run AI Strategy Audit&rdquo; to analyze realized trades, win/loss distribution, and receive actionable improvements.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

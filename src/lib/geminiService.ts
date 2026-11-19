import crypto from 'crypto';
import type {
  AIErrorCode,
  AIMetadataPayload,
  AITaskType,
  AIUsageSummary,
  GeminiModelCatalogEntry,
  GroundingPolicy,
  GroundingStatus,
  ServerModelConfig,
  StructuredAIError,
} from './geminiTypes.ts';

export const GEMINI_MODEL_CATALOG: GeminiModelCatalogEntry[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen (Flash)',
    tier: 'FREE_OR_STANDARD',
    supportsText: true,
    supportsVision: true,
    supportsThinking: true,
    supportsSearchGrounding: true,
    supportsJsonSchema: true,
    supportsLiveVoice: false,
    rpmLimit: 15,
    dailyRequestLimit: 1500,
    description: 'Primary multimodal, reasoning, structured JSON, and Search Grounding model.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    tier: 'FREE_OR_STANDARD',
    supportsText: true,
    supportsVision: true,
    supportsThinking: false,
    supportsSearchGrounding: false,
    supportsJsonSchema: true,
    supportsLiveVoice: false,
    rpmLimit: 30,
    dailyRequestLimit: 1500,
    description: 'High-throughput low-latency model with separate quota bucket (no Search Grounding or Thinking).',
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon (Pro)',
    tier: 'PAID_ONLY',
    supportsText: true,
    supportsVision: true,
    supportsThinking: true,
    supportsSearchGrounding: true,
    supportsJsonSchema: true,
    supportsLiveVoice: false,
    rpmLimit: 60,
    dailyRequestLimit: 10000,
    description: 'Requires an active billing-enabled paid project API key.',
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon (Deep Reasoning)',
    tier: 'PAID_ONLY',
    supportsText: true,
    supportsVision: true,
    supportsThinking: true,
    supportsSearchGrounding: true,
    supportsJsonSchema: true,
    supportsLiveVoice: false,
    rpmLimit: 30,
    dailyRequestLimit: 5000,
    description: 'Requires an active billing-enabled paid project API key.',
  },
  {
    id: 'gemini-3.8-live',
    label: 'Gemini 3.8 Live (Audio)',
    tier: 'FREE_OR_STANDARD',
    supportsText: false,
    supportsVision: false,
    supportsThinking: false,
    supportsSearchGrounding: false,
    supportsJsonSchema: false,
    supportsLiveVoice: true,
    rpmLimit: 10,
    dailyRequestLimit: 500,
    description: 'Dedicated bidirectional real-time audio Live API model.',
  },
];

export const TASK_CAPABILITY_REQUIREMENTS: Record<
  AITaskType,
  {
    requiresVision?: boolean;
    requiresJsonSchema?: boolean;
    requiresSearchGrounding?: boolean;
    requiresLiveVoice?: boolean;
    autoSearchEligible?: boolean;
  }
> = {
  chat: { autoSearchEligible: true },
  vision: { requiresVision: true, requiresJsonSchema: true, autoSearchEligible: false },
  'chart-intelligence': { requiresVision: true, requiresJsonSchema: true, autoSearchEligible: false },
  'setup-analysis': { autoSearchEligible: false },
  'market-summary': { requiresSearchGrounding: true, autoSearchEligible: true },
  'journal-review': { autoSearchEligible: false },
  'live-voice': { requiresLiveVoice: true, autoSearchEligible: false },
};

export interface RawUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

export interface RawGeminiResult<T = unknown> {
  data: T;
  usageMetadata?: RawUsageMetadata;
  groundingSources?: { title: string; uri: string }[];
  groundingAttempted?: boolean;
  groundingUnavailableReason?: string;
}

export interface SearchGroundingDecision {
  enabled: boolean;
  status: GroundingStatus;
  reason: string;
}

const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 45000;
const MAX_EVENT_LOG = 50;

/**
 * Determines whether Search Grounding should be enabled for a given task and prompt.
 * Never automatically uses Search Grounding for chart screenshots, basic strategy explanations,
 * static educational questions, or technical indicator calculations.
 */
export function resolveSearchGroundingDecision(params: {
  task: AITaskType;
  modelId: string;
  policy: GroundingPolicy;
  promptText?: string;
  userRequestedGrounding?: boolean;
}): SearchGroundingDecision {
  const { task, modelId, policy, promptText = '', userRequestedGrounding = false } = params;
  const model = GEMINI_MODEL_CATALOG.find((m) => m.id === modelId);

  // Rule: Never automatically use Search Grounding for screenshot chart analysis, setup analysis, or journal audit
  if (
    task === 'vision' ||
    task === 'chart-intelligence' ||
    task === 'setup-analysis' ||
    task === 'journal-review' ||
    task === 'live-voice'
  ) {
    return {
      enabled: false,
      status: 'DISABLED',
      reason: 'Disabled automatically for chart analysis, strategy evaluation, and indicator tasks.',
    };
  }

  if (policy === 'ALWAYS_OFF') {
    return {
      enabled: false,
      status: 'DISABLED',
      reason: 'Search Grounding is disabled by administrator policy.',
    };
  }

  // Dedicated macro market briefing always seeks live market drivers unless policy disables it
  if (task === 'market-summary') {
    if (!model || !model.supportsSearchGrounding) {
      return {
        enabled: false,
        status: 'UNAVAILABLE',
        reason: `Selected model (${modelId}) does not support Google Search Grounding.`,
      };
    }
    return {
      enabled: true,
      status: 'GROUNDED',
      reason: 'Enabled for current macroeconomic news and market regime briefing.',
    };
  }

  // Chat task classification
  const text = promptText.toLowerCase();

  const staticOrMathPattern =
    /\b(what is a|what is an|explain|define|how does|how do you calculate|calculate|formula|smma|rsi|atr|fair value gap|fvg|order block|liquidity sweep|volume profile|poc|breakeven|scale-in|classic mode|brain mode|strategy rules)\b/i;

  const currentMacroOrResearchPattern =
    /\b(today|tonight|this week|right now|latest|current|news|headline|macro|fomc|cpi|nfp|ppi|gdp|fed|ecb|boe|boj|interest rate|inflation|catalyst|geopolitic|report|release|calendar|live market|market driver|why is .* moving|what happened)\b/i;

  const needsExternalResearch = currentMacroOrResearchPattern.test(text);
  const looksStaticOrTechnical = staticOrMathPattern.test(text) && !needsExternalResearch;

  if (looksStaticOrTechnical) {
    return {
      enabled: false,
      status: 'DISABLED',
      reason: 'Disabled for static education, strategy explanation, or technical indicator calculation.',
    };
  }

  const wantsGrounding =
    policy === 'ALLOW_WHEN_REQUESTED'
      ? userRequestedGrounding
      : needsExternalResearch || userRequestedGrounding;

  if (!wantsGrounding) {
    return {
      enabled: false,
      status: 'DISABLED',
      reason:
        policy === 'ALLOW_WHEN_REQUESTED'
          ? 'Search Grounding was not requested for this prompt.'
          : 'Not required for internal terminal telemetry question (ask about today’s news or macro events to use live search).',
    };
  }

  if (!model || !model.supportsSearchGrounding) {
    return {
      enabled: false,
      status: 'UNAVAILABLE',
      reason: `Selected model (${modelId}) does not support Google Search Grounding.`,
    };
  }

  return {
    enabled: true,
    status: 'GROUNDED',
    reason:
      policy === 'ALLOW_WHEN_REQUESTED'
        ? 'Enabled by user request for current market information.'
        : 'Enabled for current macroeconomic news, live market drivers, or external research.',
  };
}

function extractHttpStatus(err: any): number | undefined {
  if (!err) return undefined;
  const direct = Number(err.status ?? err.statusCode ?? err.code ?? err?.error?.code);
  if (Number.isInteger(direct) && direct >= 400 && direct <= 599) {
    return direct;
  }
  const msg = String(err.message || err.toString || '');
  const match = msg.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
  if (match) return Number(match[1]);
  return undefined;
}

function extractRetryAfterSeconds(err: any): number | undefined {
  if (!err) return undefined;
  const headerVal =
    err?.headers?.['retry-after'] ??
    err?.headers?.get?.('retry-after') ??
    err?.retryAfter ??
    err?.retryAfterSeconds;
  if (headerVal !== undefined && headerVal !== null) {
    const num = Number(headerVal);
    if (Number.isFinite(num) && num > 0) return Math.ceil(num);
  }
  const msg = String(err.message || '');
  const secMatch = msg.match(/retry\s*(?:in|after)?\s*(\d+(?:\.\d+)?)\s*s/i);
  if (secMatch) {
    return Math.max(1, Math.ceil(Number(secMatch[1])));
  }
  return undefined;
}

/**
 * Classifies Gemini SDK, HTTP, and network errors into safe user-facing notifications
 * without exposing raw JSON stack traces.
 */
export function classifyGeminiError(err: any, modelAttempted?: string): StructuredAIError {
  const rawMessage = String(err?.message || err || '');
  const lower = rawMessage.toLowerCase();
  const status = extractHttpStatus(err);
  const retryAfterSeconds = extractRetryAfterSeconds(err);

  // Timeout
  if (
    err?.name === 'AbortError' ||
    err?.code === 'ETIMEDOUT' ||
    err?.code === 'AI_TIMEOUT' ||
    lower.includes('timed out') ||
    lower.includes('timeout')
  ) {
    return {
      httpStatus: 504,
      code: 'NETWORK_TIMEOUT',
      title: 'AI SERVICE TEMPORARILY UNAVAILABLE',
      reason: 'The Gemini AI request timed out before completing.',
      actions: [
        'Verify network connectivity.',
        'Retry with a simpler prompt or smaller chart image.',
        'Switch to a faster model tier if delays persist.',
      ],
      retryable: true,
      modelAttempted,
    };
  }

  // Connection failures
  if (
    err?.code === 'ECONNREFUSED' ||
    err?.code === 'ENOTFOUND' ||
    err?.code === 'ECONNRESET' ||
    lower.includes('fetch failed') ||
    lower.includes('network error') ||
    lower.includes('socket hang up')
  ) {
    return {
      httpStatus: 503,
      code: 'CONNECTION_FAILURE',
      title: 'AI SERVICE TEMPORARILY UNAVAILABLE',
      reason: 'Unable to reach the Gemini AI service due to a temporary network connection failure.',
      actions: [
        'Check network and backend connectivity.',
        'Retry when available.',
      ],
      retryable: true,
      modelAttempted,
    };
  }

  // Billing / Daily Quota Exhausted vs Transient 429 Rate Limit
  const isBillingRestriction =
    lower.includes('billing') ||
    lower.includes('check your plan') ||
    lower.includes('paid tier') ||
    lower.includes('free tier') ||
    lower.includes('payment');

  const isDailyQuotaExhausted =
    lower.includes('perday') ||
    lower.includes('per_day') ||
    lower.includes('daily') ||
    lower.includes('exceeded your current quota') ||
    lower.includes('quota exceeded for metric') && lower.includes('day');

  if (status === 429 || lower.includes('resource_exhausted') || lower.includes('429')) {
    if (isBillingRestriction || isDailyQuotaExhausted) {
      const code: AIErrorCode = isBillingRestriction && !isDailyQuotaExhausted
        ? 'BILLING_REQUIRED'
        : 'DAILY_QUOTA_EXHAUSTED';
      return {
        httpStatus: 429,
        code,
        title: 'AI SERVICE TEMPORARILY UNAVAILABLE',
        reason: 'Gemini API quota or rate limit exceeded.',
        actions: [
          'Check API usage.',
          'Check project billing.',
          'Retry when available.',
        ],
        retryable: false, // Do NOT enter retry loop for exhausted daily quotas or billing restrictions
        retryAfterSeconds,
        modelAttempted,
      };
    }

    return {
      httpStatus: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      title: 'AI SERVICE TEMPORARILY UNAVAILABLE',
      reason: 'Gemini API quota or rate limit exceeded.',
      actions: [
        'Check API usage.',
        'Check project billing.',
        'Retry when available.',
      ],
      retryable: true,
      retryAfterSeconds: retryAfterSeconds ?? 5,
      modelAttempted,
    };
  }

  // 401 / 403 Authentication & Permissions
  if (
    status === 401 ||
    status === 403 ||
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('unauthorized')
  ) {
    if (isBillingRestriction) {
      return {
        httpStatus: 403,
        code: 'BILLING_REQUIRED',
        title: 'AI SERVICE TEMPORARILY UNAVAILABLE',
        reason: 'Project billing or model tier permission is required for the selected Gemini model.',
        actions: [
          'Check API usage.',
          'Check project billing.',
          'Select an eligible standard model in AI Model Settings.',
        ],
        retryable: false,
        modelAttempted,
      };
    }

    return {
      httpStatus: status === 401 ? 401 : 403,
      code: 'AUTH_OR_PERMISSION_DENIED',
      title: 'AI AUTHENTICATION OR PERMISSION ERROR',
      reason: 'The server could not authenticate with the Gemini API or lacks permission for this model.',
      actions: [
        'Verify the server-side API secret in Settings > Secrets.',
        'Check project API permissions and enabled Gemini APIs.',
      ],
      retryable: false,
      modelAttempted,
    };
  }

  // 404 Model or endpoint unavailable
  if (status === 404 || lower.includes('not_found') || lower.includes('model not found')) {
    return {
      httpStatus: 404,
      code: 'MODEL_OR_ENDPOINT_NOT_FOUND',
      title: 'AI MODEL OR ENDPOINT UNAVAILABLE',
      reason: `The configured Gemini model${modelAttempted ? ` (${modelAttempted})` : ''} is unavailable on this project or endpoint.`,
      actions: [
        'Open AI Model Settings and select an active supported model (e.g., gemini-4-hydrogen).',
        'Verify the endpoint configuration.',
      ],
      retryable: false,
      modelAttempted,
    };
  }

  // 400 Invalid request
  if (status === 400 || lower.includes('invalid_argument') || lower.includes('bad request')) {
    return {
      httpStatus: 400,
      code: 'INVALID_REQUEST',
      title: 'INVALID AI REQUEST',
      reason: 'The request parameters or chart payload were rejected as invalid.',
      actions: [
        'Check prompt length, symbol hints, or image format (PNG, JPG, WEBP).',
        'Verify that the selected model supports this feature.',
      ],
      retryable: false,
      modelAttempted,
    };
  }

  // 500 / 503 Temporary provider errors
  return {
    httpStatus: status === 500 ? 500 : 503,
    code: 'SERVICE_UNAVAILABLE',
    title: 'AI SERVICE TEMPORARILY UNAVAILABLE',
    reason: 'The Gemini AI provider returned a temporary server error.',
    actions: [
      'Check API usage.',
      'Retry when available.',
    ],
    retryable: true,
    retryAfterSeconds: retryAfterSeconds ?? 3,
    modelAttempted,
  };
}

export class GeminiServiceError extends Error {
  public readonly structured: StructuredAIError;

  constructor(structured: StructuredAIError) {
    super(structured.reason);
    this.name = 'GeminiServiceError';
    this.structured = structured;
  }
}

export interface ExecuteRequestOptions<T> {
  task: AITaskType;
  dedupKey?: string;
  rateLimitKey: string;
  promptText?: string;
  userRequestedGrounding?: boolean;
  modelOverride?: string;
  timeoutMs?: number;
  runner: (ctx: {
    model: string;
    useSearchGrounding: boolean;
    groundingDecision: SearchGroundingDecision;
    signal: AbortSignal;
  }) => Promise<RawGeminiResult<T>>;
}

export interface ExecuteResult<T> {
  data: T;
  sources: { title: string; uri: string }[];
  meta: AIMetadataPayload;
}

export interface GeminiServiceDependencies {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  isConfigured?: () => boolean;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GeminiReliabilityService {
  private config: ServerModelConfig = {
    primaryModel: 'gemini-4-hydrogen',
    fallbackModel: null,
    allowFallback: false,
    projectBillingActive: false,
    searchGroundingPolicy: 'AUTO',
    perMinuteRateLimit: 12,
    requestTimeoutMs: DEFAULT_TIMEOUT_MS,
    updatedAt: new Date().toISOString(),
  };

  private readonly inFlight = new Map<string, Promise<ExecuteResult<any>>>();
  private readonly rateBuckets = new Map<string, number[]>();
  private readonly deps: Required<GeminiServiceDependencies>;

  private stats: AIUsageSummary = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    deduplicatedRequests: 0,
    rateLimitedRequests: 0,
    fallbackExecutions: 0,
    tokens: {
      promptTokens: 0,
      candidatesTokens: 0,
      thoughtsTokens: 0,
      totalTokens: 0,
    },
    recentEvents: [],
  };

  constructor(deps: GeminiServiceDependencies = {}) {
    this.deps = {
      sleep: deps.sleep ?? defaultSleep,
      random: deps.random ?? Math.random,
      now: deps.now ?? Date.now,
      isConfigured: deps.isConfigured ?? (() => Boolean(process.env.GEMINI_API_KEY)),
    };
  }

  public getModelCatalog(): (GeminiModelCatalogEntry & { availableInProject: boolean })[] {
    return GEMINI_MODEL_CATALOG.map((m) => ({
      ...m,
      availableInProject: m.tier === 'FREE_OR_STANDARD' || this.config.projectBillingActive,
    }));
  }

  public getConfig(): ServerModelConfig {
    return { ...this.config };
  }

  public updateConfig(
    patch: Partial<ServerModelConfig>,
    updatedBy = 'admin'
  ): { ok: true; config: ServerModelConfig } | { ok: false; error: StructuredAIError } {
    const nextPrimary = patch.primaryModel ?? this.config.primaryModel;
    const primaryMeta = GEMINI_MODEL_CATALOG.find((m) => m.id === nextPrimary);
    if (!primaryMeta || primaryMeta.supportsLiveVoice) {
      return {
        ok: false,
        error: {
          httpStatus: 400,
          code: 'INVALID_REQUEST',
          title: 'INVALID MODEL CONFIGURATION',
          reason: `Unsupported primary model "${nextPrimary}".`,
          actions: ['Select a valid model from the catalog.'],
          retryable: false,
        },
      };
    }

    const nextBilling =
      typeof patch.projectBillingActive === 'boolean'
        ? patch.projectBillingActive
        : this.config.projectBillingActive;

    if (primaryMeta.tier === 'PAID_ONLY' && !nextBilling) {
      return {
        ok: false,
        error: {
          httpStatus: 403,
          code: 'BILLING_REQUIRED',
          title: 'BILLING REQUIRED FOR SELECTED MODEL',
          reason: `Model "${primaryMeta.id}" requires an active paid billing project and is unavailable on the free tier.`,
          actions: [
            'Check project billing.',
            'Select gemini-4-hydrogen or gemini-3.1-flash-lite instead.',
          ],
          retryable: false,
        },
      };
    }

    let nextFallback: string | null =
      patch.fallbackModel === undefined ? this.config.fallbackModel : patch.fallbackModel;
    const nextAllowFallback =
      typeof patch.allowFallback === 'boolean' ? patch.allowFallback : this.config.allowFallback;

    if (nextFallback) {
      const fbMeta = GEMINI_MODEL_CATALOG.find((m) => m.id === nextFallback);
      if (!fbMeta || fbMeta.supportsLiveVoice) {
        return {
          ok: false,
          error: {
            httpStatus: 400,
            code: 'INVALID_REQUEST',
            title: 'INVALID FALLBACK MODEL',
            reason: `Fallback model "${nextFallback}" is not a valid request model.`,
            actions: ['Choose a valid fallback model or disable fallback.'],
            retryable: false,
          },
        };
      }
      if (fbMeta.id === nextPrimary) {
        nextFallback = null;
      } else if (fbMeta.tier === 'PAID_ONLY' && !nextBilling) {
        return {
          ok: false,
          error: {
            httpStatus: 403,
            code: 'BILLING_REQUIRED',
            title: 'FALLBACK MODEL UNAVAILABLE',
            reason: `Fallback model "${fbMeta.id}" requires paid project billing.`,
            actions: ['Select a project-available fallback model such as gemini-3.1-flash-lite.'],
            retryable: false,
          },
        };
      }
    }

    const nextPolicy = patch.searchGroundingPolicy ?? this.config.searchGroundingPolicy;
    if (!['AUTO', 'ALWAYS_OFF', 'ALLOW_WHEN_REQUESTED'].includes(nextPolicy)) {
      return {
        ok: false,
        error: {
          httpStatus: 400,
          code: 'INVALID_REQUEST',
          title: 'INVALID GROUNDING POLICY',
          reason: `Invalid searchGroundingPolicy "${nextPolicy}".`,
          actions: ['Use AUTO, ALLOW_WHEN_REQUESTED, or ALWAYS_OFF.'],
          retryable: false,
        },
      };
    }

    const nextRpm =
      typeof patch.perMinuteRateLimit === 'number' &&
      Number.isFinite(patch.perMinuteRateLimit) &&
      patch.perMinuteRateLimit >= 1 &&
      patch.perMinuteRateLimit <= 120
        ? Math.round(patch.perMinuteRateLimit)
        : this.config.perMinuteRateLimit;

    const nextTimeout =
      typeof patch.requestTimeoutMs === 'number' &&
      Number.isFinite(patch.requestTimeoutMs) &&
      patch.requestTimeoutMs >= 5000 &&
      patch.requestTimeoutMs <= 120000
        ? Math.round(patch.requestTimeoutMs)
        : this.config.requestTimeoutMs;

    this.config = {
      primaryModel: nextPrimary,
      fallbackModel: nextAllowFallback ? nextFallback : null,
      allowFallback: nextAllowFallback && Boolean(nextFallback),
      projectBillingActive: nextBilling,
      searchGroundingPolicy: nextPolicy,
      perMinuteRateLimit: nextRpm,
      requestTimeoutMs: nextTimeout,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };

    return { ok: true, config: this.getConfig() };
  }

  public getUsageSummary(): AIUsageSummary {
    return {
      ...this.stats,
      tokens: { ...this.stats.tokens },
      recentEvents: [...this.stats.recentEvents],
    };
  }

  public isFallbackEligibleForTask(fallbackModelId: string | null, task: AITaskType): boolean {
    if (!this.config.allowFallback || !fallbackModelId) return false;
    if (fallbackModelId === this.config.primaryModel) return false;

    const entry = GEMINI_MODEL_CATALOG.find((m) => m.id === fallbackModelId);
    if (!entry) return false;

    // Must be available in the current project
    if (entry.tier === 'PAID_ONLY' && !this.config.projectBillingActive) {
      return false;
    }

    // Must support the required task capabilities
    const reqs = TASK_CAPABILITY_REQUIREMENTS[task];
    if (reqs.requiresVision && !entry.supportsVision) return false;
    if (reqs.requiresJsonSchema && !entry.supportsJsonSchema) return false;
    if (reqs.requiresSearchGrounding && !entry.supportsSearchGrounding) return false;
    if (reqs.requiresLiveVoice && !entry.supportsLiveVoice) return false;

    // Must have separate request/usage limits from primary model
    const primaryEntry = GEMINI_MODEL_CATALOG.find((m) => m.id === this.config.primaryModel);
    if (!primaryEntry || primaryEntry.id === entry.id) return false;

    return true;
  }

  public checkRateLimit(rateLimitKey: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = this.deps.now();
    const windowMs = 60_000;
    const timestamps = (this.rateBuckets.get(rateLimitKey) || []).filter(
      (ts) => now - ts < windowMs
    );

    if (timestamps.length >= this.config.perMinuteRateLimit) {
      const oldest = timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
      this.rateBuckets.set(rateLimitKey, timestamps);
      return { allowed: false, retryAfterSeconds };
    }

    timestamps.push(now);
    this.rateBuckets.set(rateLimitKey, timestamps);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  public computeDedupKey(task: AITaskType, actorKey: string, payload: unknown): string {
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload ?? {}))
      .digest('hex')
      .slice(0, 24);
    return `${task}:${actorKey}:${hash}`;
  }

  private recordEvent(event: AIUsageSummary['recentEvents'][number], usage?: RawUsageMetadata) {
    if (usage) {
      this.stats.tokens.promptTokens += Number(usage.promptTokenCount || 0);
      this.stats.tokens.candidatesTokens += Number(usage.candidatesTokenCount || 0);
      this.stats.tokens.thoughtsTokens += Number(usage.thoughtsTokenCount || 0);
      this.stats.tokens.totalTokens += Number(usage.totalTokenCount || 0);
    }

    this.stats.recentEvents.unshift(event);
    if (this.stats.recentEvents.length > MAX_EVENT_LOG) {
      this.stats.recentEvents.length = MAX_EVENT_LOG;
    }

    if (event.status === 'ERROR') {
      console.error(
        `[GeminiAI] ERROR task=${event.task} model=${event.modelUsed} http=${event.httpStatus} code=${event.errorCode} latency=${event.latencyMs}ms`
      );
    } else {
      console.info(
        `[GeminiAI] ${event.status} task=${event.task} model=${event.modelUsed} grounding=${event.groundingStatus} tokens=${event.totalTokens} latency=${event.latencyMs}ms`
      );
    }
  }

  private async runWithTimeoutAndRetries<T>(params: {
    task: AITaskType;
    model: string;
    promptText?: string;
    userRequestedGrounding?: boolean;
    timeoutMs: number;
    runner: ExecuteRequestOptions<T>['runner'];
  }): Promise<{
    result: RawGeminiResult<T>;
    groundingDecision: SearchGroundingDecision;
  }> {
    const { task, model, promptText, userRequestedGrounding, timeoutMs, runner } = params;

    const groundingDecision = resolveSearchGroundingDecision({
      task,
      modelId: model,
      policy: this.config.searchGroundingPolicy,
      promptText,
      userRequestedGrounding,
    });

    let lastStructuredError: StructuredAIError | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            controller.abort();
            const timeoutErr: any = new Error(`Request timed out after ${timeoutMs}ms`);
            timeoutErr.code = 'AI_TIMEOUT';
            reject(timeoutErr);
          }, timeoutMs);
        });

        const result = await Promise.race([
          runner({
            model,
            useSearchGrounding: groundingDecision.enabled,
            groundingDecision,
            signal: controller.signal,
          }),
          timeoutPromise,
        ]);

        if (timeoutHandle) clearTimeout(timeoutHandle);
        return { result, groundingDecision };
      } catch (err: any) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        const classified = classifyGeminiError(err, model);
        lastStructuredError = classified;

        // Fail fast: never retry non-retryable quota/billing/400/401/403/404 errors
        if (!classified.retryable || attempt >= MAX_RETRIES) {
          throw new GeminiServiceError(classified);
        }

        // Exponential backoff with jitter, honoring Retry-After if supplied
        const baseBackoffMs = Math.min(8000, 600 * Math.pow(2, attempt));
        const jitterMs = Math.round(this.deps.random() * 400);
        const retryAfterMs = classified.retryAfterSeconds
          ? Math.min(15000, classified.retryAfterSeconds * 1000)
          : 0;
        const waitMs = Math.max(baseBackoffMs + jitterMs, retryAfterMs);

        await this.deps.sleep(waitMs);
      }
    }

    throw new GeminiServiceError(
      lastStructuredError ?? {
        httpStatus: 503,
        code: 'SERVICE_UNAVAILABLE',
        title: 'AI SERVICE TEMPORARILY UNAVAILABLE',
        reason: 'Gemini request failed after retries.',
        actions: ['Check API usage.', 'Retry when available.'],
        retryable: false,
        modelAttempted: model,
      }
    );
  }

  public async execute<T>(options: ExecuteRequestOptions<T>): Promise<ExecuteResult<T>> {
    this.stats.totalRequests += 1;

    if (!this.deps.isConfigured()) {
      this.stats.failedRequests += 1;
      const err: StructuredAIError = {
        httpStatus: 503,
        code: 'API_KEY_MISSING',
        title: 'AI SERVICE TEMPORARILY UNAVAILABLE',
        reason: 'Gemini API key is not configured on the server.',
        actions: [
          'Configure GEMINI_API_KEY in Settings > Secrets.',
          'Retry after server configuration is complete.',
        ],
        retryable: false,
      };
      this.recordEvent({
        timestamp: new Date().toISOString(),
        task: options.task,
        modelUsed: options.modelOverride || this.config.primaryModel,
        status: 'ERROR',
        httpStatus: err.httpStatus,
        errorCode: err.code,
        groundingStatus: 'DISABLED',
        totalTokens: 0,
        latencyMs: 0,
        fallbackUsed: false,
      });
      throw new GeminiServiceError(err);
    }

    const dedupKey = options.dedupKey;
    if (dedupKey && this.inFlight.has(dedupKey)) {
      this.stats.deduplicatedRequests += 1;
      return this.inFlight.get(dedupKey)!;
    }

    const rateCheck = this.checkRateLimit(options.rateLimitKey);
    if (!rateCheck.allowed) {
      this.stats.failedRequests += 1;
      this.stats.rateLimitedRequests += 1;
      const err: StructuredAIError = {
        httpStatus: 429,
        code: 'LOCAL_RATE_LIMITED',
        title: 'AI SERVICE TEMPORARILY UNAVAILABLE',
        reason: `Request rate limit reached (${this.config.perMinuteRateLimit} requests/minute).`,
        actions: [
          `Wait ${rateCheck.retryAfterSeconds}s and retry when available.`,
          'Avoid rapid duplicate submissions.',
        ],
        retryable: true,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      };
      this.recordEvent({
        timestamp: new Date().toISOString(),
        task: options.task,
        modelUsed: options.modelOverride || this.config.primaryModel,
        status: 'ERROR',
        httpStatus: 429,
        errorCode: 'LOCAL_RATE_LIMITED',
        groundingStatus: 'DISABLED',
        totalTokens: 0,
        latencyMs: 0,
        fallbackUsed: false,
      });
      throw new GeminiServiceError(err);
    }

    const primaryModel = options.modelOverride || this.config.primaryModel;
    const timeoutMs = options.timeoutMs ?? this.config.requestTimeoutMs;
    const startedAt = this.deps.now();

    const runPromise = (async (): Promise<ExecuteResult<T>> => {
      try {
        const { result, groundingDecision } = await this.runWithTimeoutAndRetries({
          task: options.task,
          model: primaryModel,
          promptText: options.promptText,
          userRequestedGrounding: options.userRequestedGrounding,
          timeoutMs,
          runner: options.runner,
        });

        const finalGroundingStatus: GroundingStatus = !groundingDecision.enabled
          ? groundingDecision.status
          : result.groundingUnavailableReason
          ? 'UNAVAILABLE'
          : 'GROUNDED';

        const finalGroundingReason = result.groundingUnavailableReason
          ? result.groundingUnavailableReason
          : groundingDecision.reason;

        const usage = result.usageMetadata || {};
        this.stats.successfulRequests += 1;
        this.recordEvent(
          {
            timestamp: new Date().toISOString(),
            task: options.task,
            modelUsed: primaryModel,
            status: 'SUCCESS',
            httpStatus: 200,
            groundingStatus: finalGroundingStatus,
            totalTokens: Number(usage.totalTokenCount || 0),
            latencyMs: Math.max(0, this.deps.now() - startedAt),
            fallbackUsed: false,
          },
          usage
        );

        return {
          data: result.data,
          sources: result.groundingSources || [],
          meta: {
            modelUsed: primaryModel,
            configuredPrimaryModel: primaryModel,
            fallbackUsed: false,
            groundingStatus: finalGroundingStatus,
            groundingReason: finalGroundingReason,
            usage: {
              promptTokens: Number(usage.promptTokenCount || 0),
              candidatesTokens: Number(usage.candidatesTokenCount || 0),
              thoughtsTokens: Number(usage.thoughtsTokenCount || 0),
              totalTokens: Number(usage.totalTokenCount || 0),
            },
          },
        };
      } catch (primaryErr: any) {
        const primaryStructured =
          primaryErr instanceof GeminiServiceError
            ? primaryErr.structured
            : classifyGeminiError(primaryErr, primaryModel);

        // Optional admin-configured fallback model ONLY when eligible for the task, project-available, and different limits
        const fallbackModel = this.config.fallbackModel;
        const canTryFallback =
          !options.modelOverride &&
          this.isFallbackEligibleForTask(fallbackModel, options.task) &&
          ['RATE_LIMIT_EXCEEDED', 'SERVICE_UNAVAILABLE', 'MODEL_OR_ENDPOINT_NOT_FOUND'].includes(
            primaryStructured.code
          );

        if (canTryFallback && fallbackModel) {
          try {
            const { result, groundingDecision } = await this.runWithTimeoutAndRetries({
              task: options.task,
              model: fallbackModel,
              promptText: options.promptText,
              userRequestedGrounding: options.userRequestedGrounding,
              timeoutMs,
              runner: options.runner,
            });

            const finalGroundingStatus: GroundingStatus = !groundingDecision.enabled
              ? groundingDecision.status
              : result.groundingUnavailableReason
              ? 'UNAVAILABLE'
              : 'GROUNDED';

            const usage = result.usageMetadata || {};
            this.stats.successfulRequests += 1;
            this.stats.fallbackExecutions += 1;
            this.recordEvent(
              {
                timestamp: new Date().toISOString(),
                task: options.task,
                modelUsed: fallbackModel,
                status: 'SUCCESS',
                httpStatus: 200,
                groundingStatus: finalGroundingStatus,
                totalTokens: Number(usage.totalTokenCount || 0),
                latencyMs: Math.max(0, this.deps.now() - startedAt),
                fallbackUsed: true,
              },
              usage
            );

            return {
              data: result.data,
              sources: result.groundingSources || [],
              meta: {
                modelUsed: fallbackModel,
                configuredPrimaryModel: primaryModel,
                fallbackUsed: true,
                fallbackNotice: `Admin-configured fallback model (${fallbackModel}) used because primary model (${primaryModel}) returned ${primaryStructured.code}.`,
                groundingStatus: finalGroundingStatus,
                groundingReason: result.groundingUnavailableReason || groundingDecision.reason,
                usage: {
                  promptTokens: Number(usage.promptTokenCount || 0),
                  candidatesTokens: Number(usage.candidatesTokenCount || 0),
                  thoughtsTokens: Number(usage.thoughtsTokenCount || 0),
                  totalTokens: Number(usage.totalTokenCount || 0),
                },
              },
            };
          } catch (fbErr: any) {
            const fbStructured =
              fbErr instanceof GeminiServiceError
                ? fbErr.structured
                : classifyGeminiError(fbErr, fallbackModel);
            this.stats.failedRequests += 1;
            if (fbStructured.httpStatus === 429) this.stats.rateLimitedRequests += 1;
            this.recordEvent({
              timestamp: new Date().toISOString(),
              task: options.task,
              modelUsed: fallbackModel,
              status: 'ERROR',
              httpStatus: fbStructured.httpStatus,
              errorCode: fbStructured.code,
              groundingStatus: 'DISABLED',
              totalTokens: 0,
              latencyMs: Math.max(0, this.deps.now() - startedAt),
              fallbackUsed: true,
            });
            throw new GeminiServiceError(fbStructured);
          }
        }

        this.stats.failedRequests += 1;
        if (primaryStructured.httpStatus === 429) this.stats.rateLimitedRequests += 1;
        this.recordEvent({
          timestamp: new Date().toISOString(),
          task: options.task,
          modelUsed: primaryModel,
          status: 'ERROR',
          httpStatus: primaryStructured.httpStatus,
          errorCode: primaryStructured.code,
          groundingStatus: 'DISABLED',
          totalTokens: 0,
          latencyMs: Math.max(0, this.deps.now() - startedAt),
          fallbackUsed: false,
        });
        throw new GeminiServiceError(primaryStructured);
      } finally {
        if (dedupKey) {
          this.inFlight.delete(dedupKey);
        }
      }
    })();

    if (dedupKey) {
      this.inFlight.set(dedupKey, runPromise);
    }

    return runPromise;
  }
}

export const geminiService = new GeminiReliabilityService();

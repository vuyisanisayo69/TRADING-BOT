export type GroundingPolicy = 'AUTO' | 'ALWAYS_OFF' | 'ALLOW_WHEN_REQUESTED';

export type GroundingStatus = 'GROUNDED' | 'DISABLED' | 'UNAVAILABLE';

export type AITaskType =
  | 'chat'
  | 'vision'
  | 'chart-intelligence'
  | 'setup-analysis'
  | 'market-summary'
  | 'journal-review'
  | 'live-voice';

export type AIErrorCode =
  | 'INVALID_REQUEST'
  | 'AUTH_OR_PERMISSION_DENIED'
  | 'MODEL_OR_ENDPOINT_NOT_FOUND'
  | 'RATE_LIMIT_EXCEEDED'
  | 'DAILY_QUOTA_EXHAUSTED'
  | 'BILLING_REQUIRED'
  | 'SERVICE_UNAVAILABLE'
  | 'NETWORK_TIMEOUT'
  | 'CONNECTION_FAILURE'
  | 'API_KEY_MISSING'
  | 'LOCAL_RATE_LIMITED';

export interface StructuredAIError {
  httpStatus: number;
  code: AIErrorCode;
  title: string;
  reason: string;
  actions: string[];
  retryable: boolean;
  retryAfterSeconds?: number;
  groundingStatus?: GroundingStatus;
  modelAttempted?: string;
}

export interface GeminiModelCatalogEntry {
  id: string;
  label: string;
  tier: 'FREE_OR_STANDARD' | 'PAID_ONLY';
  supportsText: boolean;
  supportsVision: boolean;
  supportsThinking: boolean;
  supportsSearchGrounding: boolean;
  supportsJsonSchema: boolean;
  supportsLiveVoice: boolean;
  rpmLimit: number;
  dailyRequestLimit: number;
  description: string;
}

export interface ServerModelConfig {
  primaryModel: string;
  fallbackModel: string | null;
  allowFallback: boolean;
  projectBillingActive: boolean;
  searchGroundingPolicy: GroundingPolicy;
  perMinuteRateLimit: number;
  requestTimeoutMs: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface AIUsageSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  deduplicatedRequests: number;
  rateLimitedRequests: number;
  fallbackExecutions: number;
  tokens: {
    promptTokens: number;
    candidatesTokens: number;
    thoughtsTokens: number;
    totalTokens: number;
  };
  recentEvents: {
    timestamp: string;
    task: AITaskType;
    modelUsed: string;
    status: 'SUCCESS' | 'ERROR' | 'DEDUPLICATED';
    httpStatus: number;
    errorCode?: AIErrorCode;
    groundingStatus: GroundingStatus;
    totalTokens: number;
    latencyMs: number;
    fallbackUsed: boolean;
  }[];
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface AIMetadataPayload {
  modelUsed: string;
  configuredPrimaryModel: string;
  fallbackUsed: boolean;
  fallbackNotice?: string;
  groundingStatus: GroundingStatus;
  groundingReason: string;
  usage: {
    promptTokens: number;
    candidatesTokens: number;
    thoughtsTokens: number;
    totalTokens: number;
  };
}

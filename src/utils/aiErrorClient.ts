import type { StructuredAIError } from '../lib/geminiTypes.ts';

export function parseStructuredAIError(
  payload: any,
  httpStatus = 500,
  fallbackReason?: string
): StructuredAIError {
  if (payload?.aiError && typeof payload.aiError === 'object') {
    return payload.aiError as StructuredAIError;
  }

  const rawText = String(payload?.error || fallbackReason || '');
  const looksLikeRawJsonOrStack =
    rawText.trim().startsWith('{') ||
    rawText.includes('RESOURCE_EXHAUSTED') ||
    rawText.includes('at ') ||
    rawText.includes('GoogleGenAI');

  if (httpStatus === 429 || rawText.includes('429') || rawText.includes('RESOURCE_EXHAUSTED')) {
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
    };
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      httpStatus,
      code: 'AUTH_OR_PERMISSION_DENIED',
      title: 'AI AUTHENTICATION OR PERMISSION ERROR',
      reason: looksLikeRawJsonOrStack
        ? 'Authentication or project permission check failed.'
        : rawText || 'Authentication or permissions failure.',
      actions: [
        'Sign in or verify permissions.',
        'Check project billing.',
      ],
      retryable: false,
    };
  }

  if (httpStatus === 404) {
    return {
      httpStatus: 404,
      code: 'MODEL_OR_ENDPOINT_NOT_FOUND',
      title: 'AI MODEL OR ENDPOINT UNAVAILABLE',
      reason: 'The requested Gemini model or AI endpoint is unavailable.',
      actions: ['Open AI Model Settings and select an available model.'],
      retryable: false,
    };
  }

  if (httpStatus === 400) {
    return {
      httpStatus: 400,
      code: 'INVALID_REQUEST',
      title: 'INVALID AI REQUEST',
      reason: looksLikeRawJsonOrStack
        ? 'The submitted AI request parameters are invalid.'
        : rawText || 'Invalid request.',
      actions: ['Review the input or image format and try again.'],
      retryable: false,
    };
  }

  return {
    httpStatus: httpStatus >= 400 ? httpStatus : 503,
    code: 'SERVICE_UNAVAILABLE',
    title: 'AI SERVICE TEMPORARILY UNAVAILABLE',
    reason: looksLikeRawJsonOrStack
      ? 'The AI service could not complete the request right now.'
      : rawText || 'Temporary AI service error.',
    actions: ['Check API usage.', 'Retry when available.'],
    retryable: true,
  };
}

export function normalizeCatchToAIError(err: unknown): StructuredAIError {
  if (err && typeof err === 'object' && 'aiError' in (err as any)) {
    return (err as any).aiError as StructuredAIError;
  }
  const msg = err instanceof Error ? err.message : String(err || '');
  return parseStructuredAIError({ error: msg }, 503, msg);
}

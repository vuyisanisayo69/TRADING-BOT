import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { adminAuth } from './firebase-admin.ts';
import { getOrCreateUser } from '../db/repository.ts';
import {
  classifyGeminiError,
  GEMINI_MODEL_CATALOG,
  GeminiServiceError,
} from './geminiService.ts';

dotenv.config();

let sharedAiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  sharedAiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function getAiClient(): GoogleGenAI | null {
  return sharedAiClient;
}

export async function resolveOptionalUser(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  if (!authHeader.startsWith('Bearer ')) {
    throw new GeminiServiceError({
      httpStatus: 401,
      code: 'AUTH_OR_PERMISSION_DENIED',
      title: 'AUTHENTICATION REQUIRED',
      reason: 'Authorization header format is invalid.',
      actions: ['Sign in again and retry.'],
      retryable: false,
    });
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return await getOrCreateUser(decoded.uid, decoded.email || 'trader@apex.local', decoded.name);
  } catch {
    throw new GeminiServiceError({
      httpStatus: 401,
      code: 'AUTH_OR_PERMISSION_DENIED',
      title: 'AUTHENTICATION FAILED',
      reason: 'Your authentication session is invalid or expired.',
      actions: ['Sign in again and retry.'],
      retryable: false,
    });
  }
}

export function getRateLimitActor(req: express.Request, user: { id: number } | null): string {
  if (user) return `user:${user.id}`;
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.ip || 'local';
  return `ip:${ip}`;
}

export function sendStructuredAIError(res: express.Response, error: unknown) {
  const structured =
    error instanceof GeminiServiceError ? error.structured : classifyGeminiError(error);
  res.status(structured.httpStatus).json({
    error: structured.reason,
    aiError: structured,
    groundingStatus: structured.groundingStatus || 'DISABLED',
  });
}

export function extractGroundingSources(response: any): { title: string; uri: string }[] {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const sources: { title: string; uri: string }[] = [];
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    const title = chunk?.web?.title || uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ title, uri });
    }
  }
  return sources;
}

export function modelSupportsThinking(modelId: string): boolean {
  return Boolean(GEMINI_MODEL_CATALOG.find((m) => m.id === modelId)?.supportsThinking);
}

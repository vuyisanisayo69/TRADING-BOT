import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GeminiReliabilityService,
  GeminiServiceError,
  classifyGeminiError,
  resolveSearchGroundingDecision,
} from './geminiService.ts';

function makeService(overrides: Partial<ConstructorParameters<typeof GeminiReliabilityService>[0]> = {}) {
  const sleepCalls: number[] = [];
  const service = new GeminiReliabilityService({
    sleep: async (ms) => {
      sleepCalls.push(ms);
    },
    random: () => 0.5,
    isConfigured: () => true,
    ...overrides,
  });
  return { service, sleepCalls };
}

test('1. Normal successful AI response tracks usage tokens and returns clean metadata', async () => {
  const { service } = makeService();
  const result = await service.execute({
    task: 'setup-analysis',
    rateLimitKey: 'user:1',
    promptText: 'Analyze XAU/USD setup',
    runner: async ({ model, useSearchGrounding }) => {
      assert.equal(model, 'gemini-4-hydrogen');
      assert.equal(useSearchGrounding, false);
      return {
        data: 'Structured institutional evaluation',
        usageMetadata: {
          promptTokenCount: 120,
          candidatesTokenCount: 250,
          thoughtsTokenCount: 80,
          totalTokenCount: 450,
        },
      };
    },
  });

  assert.equal(result.data, 'Structured institutional evaluation');
  assert.equal(result.meta.modelUsed, 'gemini-4-hydrogen');
  assert.equal(result.meta.fallbackUsed, false);
  assert.equal(result.meta.groundingStatus, 'DISABLED');
  assert.equal(result.meta.usage.totalTokens, 450);

  const summary = service.getUsageSummary();
  assert.equal(summary.successfulRequests, 1);
  assert.equal(summary.tokens.totalTokens, 450);
});

test('2. Transient 429 rate-limit retries up to max 3 times honoring Retry-After and succeeds', async () => {
  const { service, sleepCalls } = makeService();
  let attempts = 0;

  const result = await service.execute({
    task: 'chat',
    rateLimitKey: 'user:2',
    promptText: 'Summarize setup',
    runner: async () => {
      attempts += 1;
      if (attempts < 3) {
        const err: any = new Error('HTTP 429 Too Many Requests');
        err.status = 429;
        err.headers = { 'retry-after': '2' };
        throw err;
      }
      return {
        data: { reply: 'Recovered after transient rate limit' },
        usageMetadata: { totalTokenCount: 100 },
      };
    },
  });

  assert.equal(attempts, 3);
  assert.equal(sleepCalls.length, 2);
  assert.ok(sleepCalls[0] >= 2000);
  assert.equal(result.data.reply, 'Recovered after transient rate limit');
});

test('2b. Transient 429 stops after maximum 3 automatic retries', async () => {
  const { service, sleepCalls } = makeService();
  let attempts = 0;

  await assert.rejects(
    () =>
      service.execute({
        task: 'chat',
        rateLimitKey: 'user:2b',
        promptText: 'Test max retries',
        runner: async () => {
          attempts += 1;
          const err: any = new Error('HTTP 429 Too Many Requests');
          err.status = 429;
          throw err;
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof GeminiServiceError);
      assert.equal(err.structured.httpStatus, 429);
      assert.equal(err.structured.title, 'AI SERVICE TEMPORARILY UNAVAILABLE');
      return true;
    }
  );

  // Initial attempt + 3 retries = 4 total attempts
  assert.equal(attempts, 4);
  assert.equal(sleepCalls.length, 3);
});

test('3. Exhausted daily quota fails fast with 0 retries and structured notification', async () => {
  const { service, sleepCalls } = makeService();
  let attempts = 0;

  await assert.rejects(
    () =>
      service.execute({
        task: 'chart-intelligence',
        rateLimitKey: 'user:3',
        runner: async () => {
          attempts += 1;
          const err: any = new Error(
            'RESOURCE_EXHAUSTED: You exceeded your current quota, please check your plan and billing details. quota_metric: generativelanguage.googleapis.com/generate_content_free_tier_requests PerDay'
          );
          err.status = 429;
          throw err;
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof GeminiServiceError);
      assert.equal(err.structured.httpStatus, 429);
      assert.equal(err.structured.code, 'DAILY_QUOTA_EXHAUSTED');
      assert.equal(err.structured.title, 'AI SERVICE TEMPORARILY UNAVAILABLE');
      assert.equal(err.structured.reason, 'Gemini API quota or rate limit exceeded.');
      assert.deepEqual(err.structured.actions, [
        'Check API usage.',
        'Check project billing.',
        'Retry when available.',
      ]);
      assert.equal(err.structured.retryable, false);
      return true;
    }
  );

  assert.equal(attempts, 1);
  assert.equal(sleepCalls.length, 0);
});

test('4. Missing billing configuration fails fast with 0 retries and blocks paid model selection', async () => {
  const { service, sleepCalls } = makeService();

  // Admin tries to select paid-only model without billing active
  const cfgRes = service.updateConfig({ primaryModel: 'gemini-4-argon', projectBillingActive: false });
  assert.equal(cfgRes.ok, false);
  if (cfgRes.ok === false) {
    assert.equal(cfgRes.error.httpStatus, 403);
    assert.equal(cfgRes.error.code, 'BILLING_REQUIRED');
  }

  let attempts = 0;
  await assert.rejects(
    () =>
      service.execute({
        task: 'setup-analysis',
        rateLimitKey: 'user:4',
        runner: async () => {
          attempts += 1;
          const err: any = new Error('PERMISSION_DENIED: Billing account not configured for this project.');
          err.status = 403;
          throw err;
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof GeminiServiceError);
      assert.equal(err.structured.httpStatus, 403);
      assert.equal(err.structured.code, 'BILLING_REQUIRED');
      assert.equal(err.structured.retryable, false);
      return true;
    }
  );

  assert.equal(attempts, 1);
  assert.equal(sleepCalls.length, 0);
});

test('5. HTTP 503 temporary service failure retries cleanly and returns structured unavailable state', async () => {
  const { service, sleepCalls } = makeService();
  let attempts = 0;

  await assert.rejects(
    () =>
      service.execute({
        task: 'market-summary',
        rateLimitKey: 'user:5',
        runner: async () => {
          attempts += 1;
          const err: any = new Error('503 Service Unavailable {"stack":"internal trace"}');
          err.status = 503;
          throw err;
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof GeminiServiceError);
      assert.equal(err.structured.httpStatus, 503);
      assert.equal(err.structured.title, 'AI SERVICE TEMPORARILY UNAVAILABLE');
      assert.ok(!err.structured.reason.includes('internal trace'));
      return true;
    }
  );

  assert.equal(attempts, 4);
  assert.equal(sleepCalls.length, 3);
});

test('6. Network timeout triggers clean 504 structured timeout error', async () => {
  const { service } = makeService();

  await assert.rejects(
    () =>
      service.execute({
        task: 'vision',
        rateLimitKey: 'user:6',
        timeoutMs: 30,
        runner: async ({ signal }) => {
          return new Promise<{ data: string }>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              const e: any = new Error('Aborted');
              e.name = 'AbortError';
              reject(e);
            });
          });
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof GeminiServiceError);
      assert.equal(err.structured.httpStatus, 504);
      assert.equal(err.structured.code, 'NETWORK_TIMEOUT');
      return true;
    }
  );
});

test('7. Duplicate concurrent requests are deduplicated and per-minute rate limit enforced', async () => {
  const { service } = makeService();
  let runnerCalls = 0;
  const dedupKey = service.computeDedupKey('chat', 'user:7', { msg: 'same prompt' });

  const [r1, r2] = await Promise.all([
    service.execute({
      task: 'chat',
      rateLimitKey: 'user:7',
      dedupKey,
      promptText: 'Analyze SMMA 5/50',
      runner: async () => {
        runnerCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return { data: { reply: 'Shared response' }, usageMetadata: { totalTokenCount: 50 } };
      },
    }),
    service.execute({
      task: 'chat',
      rateLimitKey: 'user:7',
      dedupKey,
      promptText: 'Analyze SMMA 5/50',
      runner: async () => {
        runnerCalls += 1;
        return { data: { reply: 'Should not run twice' } };
      },
    }),
  ]);

  assert.equal(runnerCalls, 1);
  assert.equal(r1.data.reply, 'Shared response');
  assert.equal(r2.data.reply, 'Shared response');
  assert.equal(service.getUsageSummary().deduplicatedRequests, 1);

  // Rate limit enforcement (set limit to 2 per minute)
  service.updateConfig({ perMinuteRateLimit: 2 });
  await service.execute({
    task: 'chat',
    rateLimitKey: 'user:burst',
    runner: async () => ({ data: { reply: '1' } }),
  });
  await service.execute({
    task: 'chat',
    rateLimitKey: 'user:burst',
    runner: async () => ({ data: { reply: '2' } }),
  });
  await assert.rejects(
    () =>
      service.execute({
        task: 'chat',
        rateLimitKey: 'user:burst',
        runner: async () => ({ data: { reply: '3' } }),
      }),
    (err: unknown) => {
      assert.ok(err instanceof GeminiServiceError);
      assert.equal(err.structured.httpStatus, 429);
      assert.equal(err.structured.code, 'LOCAL_RATE_LIMITED');
      return true;
    }
  );
});

test('8. Search Grounding policy & unavailable reporting + admin fallback behavior', async () => {
  // Never automatically enable search for chart screenshots, static education, or indicator math
  const chartDecision = resolveSearchGroundingDecision({
    task: 'chart-intelligence',
    modelId: 'gemini-4-hydrogen',
    policy: 'AUTO',
    userRequestedGrounding: true,
  });
  assert.equal(chartDecision.enabled, false);
  assert.equal(chartDecision.status, 'DISABLED');

  const staticChatDecision = resolveSearchGroundingDecision({
    task: 'chat',
    modelId: 'gemini-4-hydrogen',
    policy: 'AUTO',
    promptText: 'What is a Fair Value Gap and how is SMMA 50 calculated?',
    userRequestedGrounding: true,
  });
  assert.equal(staticChatDecision.enabled, false);
  assert.equal(staticChatDecision.status, 'DISABLED');

  const macroChatDecision = resolveSearchGroundingDecision({
    task: 'chat',
    modelId: 'gemini-4-hydrogen',
    policy: 'AUTO',
    promptText: 'What macro news today and FOMC rate expectations are driving Gold?',
    userRequestedGrounding: true,
  });
  assert.equal(macroChatDecision.enabled, true);
  assert.equal(macroChatDecision.status, 'GROUNDED');

  // Model without search capability reports UNAVAILABLE
  const liteMacroDecision = resolveSearchGroundingDecision({
    task: 'market-summary',
    modelId: 'gemini-3.1-flash-lite',
    policy: 'AUTO',
    promptText: 'Live macro catalysts today',
    userRequestedGrounding: true,
  });
  assert.equal(liteMacroDecision.enabled, false);
  assert.equal(liteMacroDecision.status, 'UNAVAILABLE');

  // Admin-configured fallback ONLY triggers when enabled, supported for task, project-available, and reports modelUsed
  const { service } = makeService();
  service.updateConfig({
    primaryModel: 'gemini-4-hydrogen',
    fallbackModel: 'gemini-3.1-flash-lite',
    allowFallback: true,
  });

  // Fallback is NOT eligible for market-summary (requires Search Grounding, which flash-lite lacks)
  assert.equal(service.isFallbackEligibleForTask('gemini-3.1-flash-lite', 'market-summary'), false);
  // Fallback IS eligible for setup-analysis
  assert.equal(service.isFallbackEligibleForTask('gemini-3.1-flash-lite', 'setup-analysis'), true);

  const res = await service.execute({
    task: 'setup-analysis',
    rateLimitKey: 'user:fb',
    runner: async ({ model }) => {
      if (model === 'gemini-4-hydrogen') {
        const err: any = new Error('429 rate limit');
        err.status = 429;
        throw err;
      }
      return {
        data: 'Fallback setup analysis completed',
        usageMetadata: { totalTokenCount: 120 },
      };
    },
  });

  assert.equal(res.meta.fallbackUsed, true);
  assert.equal(res.meta.modelUsed, 'gemini-3.1-flash-lite');
  assert.ok(res.meta.fallbackNotice?.includes('gemini-3.1-flash-lite'));

  // 400 and 404 classification verification
  assert.equal(classifyGeminiError({ status: 400, message: 'INVALID_ARGUMENT' }).httpStatus, 400);
  assert.equal(classifyGeminiError({ status: 404, message: 'NOT_FOUND' }, 'bad-model').httpStatus, 404);
});

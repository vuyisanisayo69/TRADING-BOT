import express from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { LiveServerMessage, Modality } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { classifyGeminiError } from './src/lib/geminiService.ts';
import { getAiClient } from './src/lib/aiRouteHelpers.ts';
import { healthRouter } from './src/routes/health.ts';
import { workspaceRouter } from './src/routes/workspace.ts';
import { mt5DemoRouter } from './src/routes/mt5Demo.ts';
import { aiRouter } from './src/routes/ai.ts';
import { chartIntelligenceRouter } from './src/routes/chartIntelligence.ts';
import { cryptoResearchRouter } from './src/routes/cryptoResearch.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));

// Modular REST API Routes
app.use('/api/health', healthRouter);
app.use('/api', workspaceRouter);
app.use('/api/mt5-demo', mt5DemoRouter);
app.use('/api/ai', aiRouter);
app.use('/api/chart-intelligence', chartIntelligenceRouter);
app.use('/api/crypto-research', cryptoResearchRouter);

// Server, Vite Middleware, and Live API WebSocket Bridge (/api/live-voice)
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? request.url.split('?')[0] : '';
    if (pathname === '/api/live-voice') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    const aiClient = getAiClient();
    if (!aiClient) {
      const missingErr = classifyGeminiError(new Error('API_KEY_INVALID'), 'gemini-3.8-live');
      clientWs.send(
        JSON.stringify({
          error: 'Gemini API key is not configured on the server.',
          aiError: {
            ...missingErr,
            httpStatus: 503,
            code: 'API_KEY_MISSING',
            title: 'AI SERVICE TEMPORARILY UNAVAILABLE',
            reason: 'Gemini API key is not configured for Live Voice conversations.',
            actions: ['Configure GEMINI_API_KEY in Settings > Secrets.'],
          },
        })
      );
      clientWs.close();
      return;
    }

    let session: any = null;
    try {
      session = await aiClient.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction:
            'You are the Apex Trader AI Live Voice Trading Assistant. Speak clearly, concisely, and professionally with the trader about Gold (XAU/USD), Bitcoin (BTC/USD), Major Forex pairs, Classic SMMA 5/50/RSI/ATR setups, Brain Mode SMC signals (FVG, Liquidity Sweeps, Displacement, Order Blocks, Volume Profile POC), and strict risk management. Keep spoken answers crisp and practical.',
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ status: 'connected' }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;

            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ inputTranscript: content.inputTranscription.text })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ outputTranscript: content.outputTranscription.text })
              );
            }

            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }

            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ turnComplete: true }));
            }
          },
          onerror: (err: any) => {
            const classified = classifyGeminiError(err, 'gemini-3.8-live');
            console.error('[GeminiLive] error:', classified.code);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({ error: classified.reason, aiError: classified })
              );
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ status: 'closed' }));
            }
          },
        },
      });
    } catch (err: any) {
      const classified = classifyGeminiError(err, 'gemini-3.8-live');
      console.error('[GeminiLive] connect failure:', classified.code);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({ error: classified.reason, aiError: classified })
        );
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!session) return;
      try {
        const payload = JSON.parse(raw.toString());
        if (payload.audio) {
          session.sendRealtimeInput({
            audio: { data: payload.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (payload.text) {
          session.sendRealtimeInput({
            text: payload.text,
          });
        }
      } catch (err) {
        console.error('Error forwarding Live client message:', err);
      }
    });

    clientWs.on('close', () => {
      try {
        session?.close();
      } catch {
        // ignore close error
      }
    });
  });

  if (!isProd) {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: !hmrDisabled,
        ws: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Trader AI server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

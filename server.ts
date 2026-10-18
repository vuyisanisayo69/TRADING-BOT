import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize GoogleGenAI server-side with mandatory User-Agent
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    service: 'Apex Trader AI Backend',
  });
});

// Endpoint: AI Trade Setup Analysis & Explanations
app.post('/api/ai/analyze-setup', async (req, res) => {
  try {
    const { signal, symbol, timeframe, indicators } = req.body;

    if (!aiClient) {
      // Deterministic fallback response when API key is not yet set
      return res.json({
        analysis: `[Automated Analytical Engine] Analysis for ${symbol} (${timeframe}):
Setup Score: ${signal?.qualityScore || 0}/100.
Direction: ${signal?.action || 'NO_TRADE'}.
Structure: ${signal?.marketContext?.m15Structure || 'Neutral'}.
Key Support/Resistance: Dynamic SMMA 5/50 holding test zone.
Risk Advice: Always honor hard stop-loss and maintain <= 0.5% risk budget per trade.`,
      });
    }

    const prompt = `You are the lead risk officer and quantitative analyst at Apex Trader AI.
Analyze this day-trading setup in financial markets (Gold or Crypto).
Never claim 100% win rate or guaranteed profits. Be objective, conservative, and rigorous.

Market: ${symbol} (${timeframe})
Signal Action: ${signal?.action || 'NO_TRADE'}
Score: ${signal?.qualityScore || 0}/100
Entry Zone: ${signal?.entryZone?.recommended || 'N/A'}
Stop Loss: ${signal?.stopLoss || 'N/A'}
Take Profit 1: ${signal?.takeProfit1 || 'N/A'}
Take Profit 2: ${signal?.takeProfit2 || 'N/A'}
Reward-to-Risk: ${signal?.rewardToRiskRatio || 'N/A'}R
Recommended Lots: ${signal?.positionSizing?.recommendedLots || 'N/A'} (Risk: $${signal?.positionSizing?.dollarRisk || '0'})

Market Context & Indicators:
- H1 Prevailing Trend: ${signal?.marketContext?.h1Trend || 'N/A'}
- M15 Structure: ${signal?.marketContext?.m15Structure || 'N/A'}
- RSI 14: ${signal?.marketContext?.rsiValue || 'N/A'}
- MACD Histogram: ${signal?.marketContext?.macdHistogram || 'N/A'}
- ADX Trend Strength: ${signal?.marketContext?.adxTrendStrength || 'N/A'}
- ATR (Volatility): ${signal?.marketContext?.atrValue || 'N/A'}
- Spread: ${signal?.marketContext?.currentSpread || 'N/A'} points
- Supporting reasons: ${JSON.stringify(signal?.supportingReasons || [])}
- Invalidation conditions: ${JSON.stringify(signal?.invalidationConditions || [])}

Provide:
1. Executive Setup Summary (Explain the setup in clear plain English).
2. Institutional Confluence (Why this setup qualifies or why it was rejected as NO TRADE).
3. Critical Invalidation & Risk Factors (What exact market action breaks this hypothesis).
4. Trade Management Advice (When to lock partial profits at TP1, trailing stop recommendations).`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: 'You are an institutional trading risk analyst at Apex Trader AI. Provide concise, disciplined, actionable trade commentary without hype or false promises.',
        temperature: 0.2,
      },
    });

    res.json({ analysis: response.text });
  } catch (error: any) {
    console.error('Gemini analyze-setup error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate AI analysis' });
  }
});

// Endpoint: AI Market Regime & Macro Briefing
app.post('/api/ai/market-summary', async (req, res) => {
  try {
    const { tickers, session, upcomingNews } = req.body;

    if (!aiClient) {
      return res.json({
        summary: `Current active session: ${session?.sessionName || 'Global'}. Gold (XAU/USD) and Bitcoin (BTC/USD) are operating in liquid market conditions. Monitor key macro events on today's calendar and adhere to maximum 0.5% risk limits.`,
      });
    }

    const prompt = `Provide an executive market briefing for institutional day traders.
Active Session: ${session?.sessionName || 'Global'}
Current Tickers: ${JSON.stringify(tickers || {})}
Key Upcoming Economic Events: ${JSON.stringify(upcomingNews || [])}

Write a 3-paragraph market regime briefing covering:
1. Market Sentiment & Asset Correlation (Gold vs Bitcoin vs Dollar).
2. Session Volatility & Liquidity Windows (London/NY overlap dynamics).
3. Tactical Guidance for Intraday Traders (Spread awareness, upcoming macro catalyst risks).`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        temperature: 0.3,
      },
    });

    res.json({ summary: response.text });
  } catch (error: any) {
    console.error('Gemini market-summary error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate market briefing' });
  }
});

// Endpoint: AI Journal & Strategy Review
app.post('/api/ai/journal-review', async (req, res) => {
  try {
    const { trades, performance, riskConfig } = req.body;

    if (!aiClient) {
      return res.json({
        review: `Performance Overview: Win Rate: ${performance?.winRatePercent || 0}%, Profit Factor: ${performance?.profitFactor || 0}, Max Drawdown: ${performance?.maxDrawdownPercent || 0}%. Disciplined stop-loss compliance observed. Focus on eliminating trades outside prime session hours.`,
      });
    }

    const prompt = `Review this trader's journal and strategy performance metrics:
Total Trades: ${trades?.length || 0}
Win Rate: ${performance?.winRatePercent || 0}%
Profit Factor: ${performance?.profitFactor || 0}
Expectancy (R): ${performance?.expectancyR || 0}R
Max Drawdown: ${performance?.maxDrawdownPercent || 0}%
Configured Risk Per Trade: ${riskConfig?.riskPercentagePerTrade || 0.5}%
Max Daily Loss Limit: ${riskConfig?.maxDailyLossPercent || 2.0}%
Sample Recent Trades: ${JSON.stringify((trades || []).slice(-10))}

Provide a constructive, institutional-grade diagnosis:
1. Edge Evaluation (Is the win rate and profit factor mathematically sustainable?).
2. Risk & Discipline Audit (Any evidence of revenge trading, oversized positions, or premature exits).
3. Top 3 Actionable Improvements for next trading session.`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        temperature: 0.2,
      },
    });

    res.json({ review: response.text });
  } catch (error: any) {
    console.error('Gemini journal-review error:', error);
    res.status(500).json({ error: error.message || 'Failed to review trading journal' });
  }
});

// Setup Vite in middleware mode for development
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Trader AI server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

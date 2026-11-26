import { analyzeCandles, SYMBOLS } from './market-scan-core.mjs';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0',
  'access-control-allow-origin': '*'
};

function response(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

async function getCandles(symbol, apiKey) {
  const url = new URL('https://api.twelvedata.com/time_series');
  url.search = new URLSearchParams({
    symbol: SYMBOLS[symbol],
    interval: '1h',
    outputsize: '100',
    timezone: 'UTC',
    apikey: apiKey
  }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.status === 'error' || !Array.isArray(data.values)) {
      const message = data?.message || data?.code || `provider returned HTTP ${res.status}`;
      throw new Error(`${symbol} data request failed: ${String(message).slice(0, 180)}`);
    }
    return data.values.map(item => ({
      time: item.datetime,
      open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close)
    })).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`${symbol} data request timed out.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler() {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return response(503, { mode: 'unavailable', error: 'TWELVE_DATA_API_KEY is not configured in Netlify environment variables.' });
  try {
    // Fetch all markets concurrently; only publish a live result when all four succeed.
    const entries = await Promise.all(Object.keys(SYMBOLS).map(async symbol => {
      const candles = await getCandles(symbol, apiKey);
      return analyzeCandles(symbol, candles, new Date().toISOString());
    }));
    return response(200, { mode: 'live', provider: 'Twelve Data', timeframe: '1h', updatedAt: new Date().toISOString(), markets: entries });
  } catch (error) {
    console.error('market-scan error:', error.message);
    return response(502, { mode: 'unavailable', error: `Live market data could not be completed for all requested markets. ${error.message}` });
  }
}

export const config = { path: '/.netlify/functions/market-scan' };

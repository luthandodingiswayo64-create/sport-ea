export const SYMBOLS = Object.freeze({
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  XAUUSD: 'XAU/USD',
  BTCUSD: 'BTC/USD'
});

export function sma(values) {
  if (!values.length) return NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Wilder RSI with the standard initial average gain/loss and smoothing.
export function rsi(values, period = 14) {
  if (values.length <= period) return NaN;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    gain += Math.max(delta, 0);
    loss += Math.max(-delta, 0);
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(delta, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-delta, 0)) / period;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

function formatLevel(value, symbol) {
  const decimals = symbol === 'BTCUSD' || symbol === 'XAUUSD' ? 2 : 5;
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function analyzeCandles(symbol, candles, updatedAt = new Date().toISOString()) {
  if (!SYMBOLS[symbol]) throw new Error(`Unsupported market: ${symbol}`);
  if (!Array.isArray(candles) || candles.length < 60) throw new Error(`${symbol} provider returned fewer than 60 hourly candles.`);
  const closes = candles.map(c => Number(c.close));
  if (closes.some(v => !Number.isFinite(v) || v <= 0)) throw new Error(`${symbol} has invalid candle values.`);
  const highs = candles.map(c => Number(c.high));
  const lows = candles.map(c => Number(c.low));
  if ([...highs, ...lows].some(v => !Number.isFinite(v) || v <= 0)) throw new Error(`${symbol} has invalid candle ranges.`);
  const last = candles.length - 1;
  const close = closes[last];
  const fast = sma(closes.slice(-20));
  const slow = sma(closes.slice(-50));
  const momentum = rsi(closes, 14);
  const recent = candles.slice(-4, -1);
  const tolerance = 0.0015;
  const touchedForBuy = recent.some(c => Number(c.low) <= fast * (1 + tolerance));
  const touchedForSell = recent.some(c => Number(c.high) >= fast * (1 - tolerance));
  const bullish = close > fast && fast > slow;
  const bearish = close < fast && fast < slow;
  const buyPullback = bullish && touchedForBuy && momentum >= 50 && momentum <= 68 && close > Number(candles[last - 1].close);
  const sellPullback = bearish && touchedForSell && momentum >= 32 && momentum <= 50 && close < Number(candles[last - 1].close);
  const signal = buyPullback ? 'BUY' : sellPullback ? 'SELL' : 'WAIT';
  const direction = bullish ? 'Bullish' : bearish ? 'Bearish' : 'Mixed';
  const maFast = close > fast ? 'Above' : close < fast ? 'Below' : 'At';
  const maSlow = close > slow ? 'Above' : close < slow ? 'Below' : 'At';
  const levels = candles.slice(-25, -1);
  const support = Math.min(...levels.map(c => Number(c.low)));
  const resistance = Math.max(...levels.map(c => Number(c.high)));
  const pullback = signal === 'BUY' ? 'Recent test of fast average; rebound confirmed' : signal === 'SELL' ? 'Recent test of fast average; rejection confirmed' : 'No confirmed trend-aligned pullback';
  const alignedChecks = [bullish && momentum > 50 || bearish && momentum < 50, signal !== 'WAIT', momentum >= 30 && momentum <= 70].filter(Boolean).length;
  const confidence = Math.round(alignedChecks / 3 * 100);
  let explanation;
  if (signal === 'BUY') explanation = `Price is above the 20-hour and 50-hour averages, the recent candles tested the fast average and price has rebounded. RSI is ${momentum.toFixed(1)}. This rule-based bullish setup is conditional; reassess if structure changes.`;
  else if (signal === 'SELL') explanation = `Price is below the 20-hour and 50-hour averages, the recent candles tested the fast average and price has turned lower. RSI is ${momentum.toFixed(1)}. This rule-based bearish setup is conditional; reassess if structure changes.`;
  else explanation = `The H1 trend, pullback/rejection, and RSI conditions do not currently align for a confirmed setup. RSI is ${momentum.toFixed(1)}; wait for clearer evidence rather than inferring a direction.`;
  const referenceClose = closes[Math.max(0, last - 24)];
  const change24h = referenceClose ? (close / referenceClose - 1) * 100 : 0;
  return {
    symbol, price: close, change24h, signal, confidence, rsi: momentum,
    maFast, maSlow, trend: direction, support: formatLevel(support, symbol),
    resistance: formatLevel(resistance, symbol), pullback, explanation,
    points: closes.slice(-24), updatedAt
  };
}

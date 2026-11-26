import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCandles, rsi, sma } from '../netlify/functions/market-scan-core.mjs';

test('SMA returns the arithmetic mean', () => {
  assert.equal(sma([2, 4, 6]), 4);
});

test('RSI is bounded and returns 100 for only gains', () => {
  const result = rsi(Array.from({ length: 20 }, (_, i) => i + 1), 14);
  assert.equal(result, 100);
});

test('scanner returns the expected educational WAIT structure when no pullback confirms', () => {
  const candles = Array.from({ length: 80 }, (_, i) => {
    const close = 1.1 + i * 0.0001;
    return { open: close - 0.00002, high: close + 0.00005, low: close - 0.00005, close, time: new Date(Date.UTC(2025, 0, 1, i)).toISOString() };
  });
  const result = analyzeCandles('EURUSD', candles, '2025-01-04T08:00:00.000Z');
  assert.equal(result.symbol, 'EURUSD');
  assert.equal(result.signal, 'WAIT');
  assert.equal(result.trend, 'Bullish');
  assert.equal(result.points.length, 24);
  assert.ok(result.rsi >= 0 && result.rsi <= 100);
  assert.ok(result.support && result.resistance);
  assert.equal(result.updatedAt, '2025-01-04T08:00:00.000Z');
});

test('scanner rejects unsupported symbols and insufficient candles', () => {
  assert.throws(() => analyzeCandles('USDJPY', []), /Unsupported market/);
  assert.throws(() => analyzeCandles('EURUSD', []), /fewer than 60/);
});

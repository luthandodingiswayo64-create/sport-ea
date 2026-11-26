import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/market-scan.mjs';
import { SYMBOLS, analyzeCandles, rsi, sma } from '../netlify/functions/market-scan-core.mjs';

function restoreEnv(t, key) {
  const previous = process.env[key];
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
}

function providerValues(count = 80) {
  return Array.from({ length: count }, (_, i) => {
    const close = 1.1 + i * 0.0001;
    return {
      datetime: new Date(Date.UTC(2025, 0, 5, i)).toISOString(),
      open: String(close - 0.00002),
      high: String(close + 0.00005),
      low: String(close - 0.00005),
      close: String(close)
    };
  });
}

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

test('scanner rejects unsupported symbols, insufficient candles and invalid prices', () => {
  assert.throws(() => analyzeCandles('USDJPY', []), /Unsupported market/);
  assert.throws(() => analyzeCandles('EURUSD', []), /fewer than 60/);
  const invalid = Array.from({ length: 60 }, () => ({ open: 1, high: 1, low: 1, close: NaN }));
  assert.throws(() => analyzeCandles('EURUSD', invalid), /invalid candle values/);
});

test('Netlify handler clearly reports missing provider credentials', async t => {
  restoreEnv(t, 'TWELVE_DATA_API_KEY');
  delete process.env.TWELVE_DATA_API_KEY;
  const result = await handler();
  assert.equal(result.statusCode, 503);
  assert.equal(JSON.parse(result.body).mode, 'unavailable');
  assert.match(JSON.parse(result.body).error, /TWELVE_DATA_API_KEY/);
});

test('Netlify handler requests all four H1 markets and returns a complete live payload', async t => {
  restoreEnv(t, 'TWELVE_DATA_API_KEY');
  process.env.TWELVE_DATA_API_KEY = 'test-key-not-a-real-secret';
  const requested = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    requested.push(url);
    return new Response(JSON.stringify({ values: providerValues() }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  });

  const result = await handler();
  const payload = JSON.parse(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(payload.mode, 'live');
  assert.equal(payload.provider, 'Twelve Data');
  assert.deepEqual(payload.markets.map(m => m.symbol).sort(), Object.keys(SYMBOLS).sort());
  assert.equal(requested.length, 4);
  for (const url of requested) {
    assert.equal(url.hostname, 'api.twelvedata.com');
    assert.equal(url.pathname, '/time_series');
    assert.equal(url.searchParams.get('interval'), '1h');
    assert.equal(url.searchParams.get('apikey'), 'test-key-not-a-real-secret');
  }
  for (const market of payload.markets) {
    assert.ok(Number.isFinite(market.price));
    assert.ok(['BUY', 'SELL', 'WAIT'].includes(market.signal));
    assert.ok(Number.isFinite(market.rsi));
  }
});

test('Netlify handler does not report live when any provider market fails', async t => {
  restoreEnv(t, 'TWELVE_DATA_API_KEY');
  process.env.TWELVE_DATA_API_KEY = 'test-key-not-a-real-secret';
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    if (url.searchParams.get('symbol') === SYMBOLS.XAUUSD) {
      return new Response(JSON.stringify({ status: 'error', message: 'Test provider failure' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ values: providerValues() }), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  const result = await handler();
  const payload = JSON.parse(result.body);
  assert.equal(result.statusCode, 502);
  assert.equal(payload.mode, 'unavailable');
  assert.match(payload.error, /all requested markets/);
});

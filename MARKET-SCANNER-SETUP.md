# SPORT EA live H1 market scanner

The existing photo-chart app at `index.html` is preserved. The market scanner is added at `/market-scanner.html` and the Netlify function lives at `/.netlify/functions/market-scan`.

## Live data setup

1. Deploy this repository as a Netlify site (or connect the existing Netlify site to the `feature/live-market-scanner` branch). `netlify.toml` publishes the repository root and configures `netlify/functions`.
2. Create a Twelve Data API key at [twelvedata.com](https://twelvedata.com/). Confirm that your plan permits hourly time-series requests for forex, XAU/USD and BTC/USD. Provider quotas/pricing can change; check your account plan.
3. In Netlify, open **Site configuration → Environment variables** and add `TWELVE_DATA_API_KEY` with the API key. Do not put the key in browser code or commit it to Git.
4. Redeploy after setting the variable. Open `https://<your-site>/market-scanner.html` and press **Refresh scan**. The header should say **LIVE DATA** and the timestamp/prices should populate only if all four provider requests succeed.
5. For local development, install the Netlify CLI and run `netlify dev` from the repository root after setting `TWELVE_DATA_API_KEY` in your local shell. Do not commit `.env` files.

If the key is missing, a symbol is unavailable on your provider plan, the API quota is exceeded, or Netlify cannot reach the provider, the page displays **LIVE UNAVAILABLE** and no sample prices. Inspect Netlify function logs and Twelve Data's response/usage. The endpoint intentionally reports a failure rather than mixing live and placeholder data.

## Strategy and behavior

The function requests 100 hourly candles for EUR/USD, GBP/USD, XAU/USD and BTC/USD. It computes 20/50-hour simple moving averages, Wilder RSI(14), recent 24-hour price change, and support/resistance from the preceding 24 candles. A BUY/SELL requires aligned average trend, a recent test of the fast average, a confirming candle, and RSI in the configured range; otherwise it returns WAIT. This is a transparent educational heuristic, not a backtest or trading recommendation. Check symbol availability and candle conventions against your provider/account before relying on its output.

Signal changes and previous signal values are stored in the user's browser localStorage. Browser notifications require HTTPS, explicit permission, and the page to remain open; this implementation is not push messaging and cannot alert when the page/browser is closed. Notifications also vary by mobile browser.

## Tests

Run the pure strategy tests with Node.js 18 or newer:

```sh
node --test test/market-scan-core.test.mjs
```

This validates calculations and signal behavior without an API key. To test the actual provider connection, deploy with your own API key and call the deployed endpoint; automated tests do not claim provider credentials, quota, symbols, or network access have been verified.

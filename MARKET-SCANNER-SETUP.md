# SPORT EA live H1 market scanner

The existing photo-chart app at `index.html` is preserved. The market scanner is at `/market-scanner.html`; the Netlify function is `/.netlify/functions/market-scan`.

## Live data setup and deployment

1. Connect the repository to a Netlify site and select the `feature/live-market-scanner` branch for deployment.
2. Create a Twelve Data API key and verify the account supports hourly EUR/USD, GBP/USD, XAU/USD and BTC/USD calls.
3. Set secret site environment variable `TWELVE_DATA_API_KEY` in Netlify.
4. Redeploy and review deploy/function logs.
5. Open `/market-scanner.html` on HTTPS and press **Refresh scan**. It is live only if all four markets return valid candles.

`netlify.toml` publishes the repository root and configures `netlify/functions`. Local development requires Node.js 18+, Netlify CLI and `TWELVE_DATA_API_KEY`; run `netlify dev`. Never commit the key.

## Strategy and behavior

The function requests 100 hourly candles, computes 20/50-hour SMA, Wilder RSI(14), 24-hour change and 24-candle support/resistance. BUY/SELL requires aligned trend, pullback test and RSI bounds; otherwise WAIT. It is educational, not financial advice.

Signal changes use browser localStorage. Notifications require HTTPS and permission and work only while the page is open.

## Tests

```sh
npm test
```

Tests cover calculations, invalid inputs, missing credentials, successful mocked provider responses for all four markets, and fail-closed behavior. They do not verify real credentials, quotas, live symbols or a deployed Netlify site.

# Bybit Real-Time Market Scanner Dashboard

This project provides a real-time market scanner for Bybit USDT perpetual contracts. It monitors market data and alerts you when specific conditions are met, such as volume spikes, price breakouts, order book imbalances, and liquidity walls.

## Features

- Real-time monitoring of USDT perpetual markets
- Customizable filters for different market conditions
- Support for 1-minute and 5-minute timeframes
- Console-based output for easy monitoring

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Configure your API keys in `dashboardTemplate.js`:
   ```javascript
   const API_KEY = 'YOUR_API_KEY';
   const API_SECRET = 'YOUR_API_SECRET';
   ```

3. Run the dashboard:
   ```
   node dashboardTemplate.js
   ```

## Available Functions

### Data Fetching

- `fetchUSDTPerpetualSymbols()`: Gets all available USDT perpetual trading pairs
- `fetchCandlestickData(symbol, interval, limit)`: Gets candlestick data
- `fetchOrderBook(symbol, limit)`: Gets order book data

### Analysis

- `detectVolumeSpike(candles, threshold)`: Detects volume spikes
- `detectPriceBreakout(candles, threshold)`: Detects price breakouts
- `detectOrderBookImbalance(orderBook, threshold)`: Detects order book imbalances
- `detectLiquidityWalls(orderBook, threshold)`: Detects liquidity walls

### Dashboard Management

- `dashboardState.setTimeframe(timeframe)`: Switch between '1m' and '5m'
- `dashboardState.updateFilters(newFilters)`: Update filter settings
- `dashboardState.getFilteredMarketData()`: Get current filtered market data

## Customization

You can customize the dashboard by adjusting the filter settings:

```javascript
dashboardState.updateFilters({
  volumeSpikeThreshold: 1.5,      // 50% above average volume
  priceBreakoutThreshold: 1.01,   // 1% price movement
  spoofDetectionEnabled: true,
  whaleAlertsEnabled: true,
  liquidityWallsEnabled: true
});
```

## Example Usage

See `runDashboard.js` for examples of how to:
- Switch between timeframes
- Update filter settings
- Manually check for signals on specific symbols

## Notes

- The dashboard is currently configured to use the Bybit testnet. For production use, set `testnet: false` in the client initialization.
- By default, the dashboard monitors only 10 symbols to avoid rate limits. You can adjust this in the `initializeRealTimeData` function.
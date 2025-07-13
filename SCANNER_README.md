# Bybit Market Scanner

This is a real-time market scanner for Bybit USDT perpetual contracts. It monitors market data and alerts you when specific conditions are met, such as volume spikes, price breakouts, order book imbalances, and liquidity walls.

## Features

- **Real-time Monitoring**: Connects to Bybit via WebSockets for live market data
- **Customizable Filters**: Adjust thresholds for different market conditions
- **Timeframe Selection**: Switch between 1-minute and 5-minute candlesticks
- **Console Interface**: Easy-to-use command-line interface
- **Alert System**: Notifies you when market conditions match your criteria

## Setup

1. Install dependencies:
   ```
   npm install bybit-api axios crypto
   ```

2. Run the scanner:
   ```
   node marketScanner.js
   ```

## Available Commands

Once the scanner is running, you can use the following commands:

- `1m` - Switch to 1-minute timeframe
- `5m` - Switch to 5-minute timeframe
- `filters` - Show current filter settings
- `volume X` - Set volume spike threshold (e.g., `volume 1.5` for 50% above average)
- `breakout X` - Set price breakout threshold (e.g., `breakout 1.01` for 1% movement)
- `spoof on/off` - Enable/disable order book imbalance detection
- `walls on/off` - Enable/disable liquidity wall detection
- `help` - Show available commands
- `exit` - Exit the scanner

## Alert Types

The scanner monitors for the following market conditions:

1. **Volume Spikes**: Unusual trading volume compared to recent average
2. **Price Breakouts/Breakdowns**: Significant price movements up or down
3. **Order Book Imbalances**: Potential spoofing or market manipulation
4. **Liquidity Walls**: Large orders at specific price levels

## Example Alert

```
==================================================
MARKET ALERT: BTCUSDT
==================================================
Price: 29876.50000000 USDT
Move: 1.25%
Timeframe: 1m

Alert Reasons:
- Price Breakout ↑
- Volume Spike Detected ⚡
- Order Book Imbalance Detected 📊
--------------------------------------------------
```

## Notes

- The scanner is configured to use Bybit's testnet by default. For production use, change `testnet: true` to `testnet: false` in the client initialization.
- To avoid rate limits, the scanner monitors only the first 10 symbols by default. You can modify this in the `initializeWebSockets` function.
- Alerts for each symbol are rate-limited to once per minute to avoid spam.
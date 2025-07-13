/**
 * BTC and ETH Monitor
 * 
 * This script specifically monitors Bitcoin and Ethereum with very sensitive settings
 * to ensure you see market signals quickly.
 */

const { RestClientV5, WebsocketClient } = require('bybit-api');

// Configuration
const API_KEY = 'esUvA3iyrimc8nVihB';
const API_SECRET = '5GijOBsxPg9z66lvrBQGp41lgeSFoOK6NwvD';

// Initialize Bybit REST client
const restClient = new RestClientV5(
  API_KEY,
  API_SECRET,
  { testnet: true }
);

// Initialize Bybit WebSocket client
const wsClient = new WebsocketClient({
  key: API_KEY,
  secret: API_SECRET,
  testnet: true,
  market: 'v5'
});

// Symbols to monitor
const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];

// Market data storage
const marketData = {
  BTCUSDT: {
    klineData: null,
    orderBook: null,
    lastAlertTime: 0
  },
  ETHUSDT: {
    klineData: null,
    orderBook: null,
    lastAlertTime: 0
  }
};

/**
 * Initialize WebSocket connections
 */
function initializeWebSockets() {
  // Subscribe to 1-minute klines and orderbook for BTC and ETH
  const klineTopics = SYMBOLS.map(symbol => `kline.1.linear.${symbol}`);
  const orderbookTopics = SYMBOLS.map(symbol => `orderbook.50.linear.${symbol}`);
  
  // Set up WebSocket connection
  wsClient.on('open', () => {
    console.log('WebSocket connection established');
    
    // Subscribe to topics
    wsClient.subscribe(klineTopics);
    console.log('Subscribed to kline data for', SYMBOLS.join(', '));
    
    wsClient.subscribe(orderbookTopics);
    console.log('Subscribed to orderbook data for', SYMBOLS.join(', '));
  });
  
  // Handle incoming data
  wsClient.on('update', data => {
    processWebSocketData(data);
  });
  
  // Handle errors
  wsClient.on('error', error => {
    console.error('WebSocket error:', error);
  });
  
  // Handle connection close
  wsClient.on('close', () => {
    console.log('WebSocket connection closed');
    
    // Attempt to reconnect
    setTimeout(() => {
      console.log('Attempting to reconnect...');
      wsClient.connect();
    }, 5000);
  });
}

/**
 * Process incoming WebSocket data
 */
function processWebSocketData(data) {
  try {
    if (!data.topic) return;
    
    const topicParts = data.topic.split('.');
    const symbol = topicParts[3];   // e.g., BTCUSDT
    
    // Only process data for our monitored symbols
    if (!SYMBOLS.includes(symbol)) return;
    
    // Process kline data
    if (data.topic.includes('kline')) {
      marketData[symbol].klineData = data.data;
      checkForSignals(symbol);
    }
    
    // Process orderbook data
    else if (data.topic.includes('orderbook')) {
      marketData[symbol].orderBook = data.data;
      checkForSignals(symbol);
    }
    
  } catch (error) {
    console.error('Error processing WebSocket data:', error);
  }
}

/**
 * Check for market signals
 */
function checkForSignals(symbol) {
  const data = marketData[symbol];
  if (!data.klineData || !data.orderBook) return;
  
  // Only alert once every 10 seconds for a symbol (more frequent than the other scripts)
  const now = Date.now();
  if (now - data.lastAlertTime < 10000) return;
  
  // Run analysis with very sensitive settings
  const volumeSpike = detectVolumeSpike(data.klineData, 1.01);  // 1% above average
  const priceBreakout = detectPriceBreakout(data.klineData, 1.001); // 0.1% movement
  const orderBookImbalance = detectOrderBookImbalance(data.orderBook, 1.2); // 20% imbalance
  const liquidityWalls = detectLiquidityWalls(data.orderBook, 1.5); // 50% above average
  
  // Always log the current state (even without signals)
  const currentPrice = parseFloat(data.klineData[0][4]);
  const previousPrice = data.klineData.length > 1 ? parseFloat(data.klineData[1][4]) : currentPrice;
  const percentageMove = previousPrice > 0 ? ((currentPrice - previousPrice) / previousPrice) * 100 : 0;
  
  console.log(`\n${new Date().toISOString()} - ${symbol} Update`);
  console.log(`Price: ${currentPrice.toFixed(symbol === 'BTCUSDT' ? 1 : 2)} USDT (${percentageMove.toFixed(4)}%)`);
  
  // Check for signals
  let hasSignal = false;
  
  if (volumeSpike) {
    console.log('⚡ Volume Spike Detected');
    hasSignal = true;
  }
  
  if (priceBreakout.isBreakout) {
    console.log(`${priceBreakout.direction === 'up' ? '↑' : '↓'} Price ${priceBreakout.direction === 'up' ? 'Breakout' : 'Breakdown'}`);
    hasSignal = true;
  }
  
  if (orderBookImbalance.isImbalanced) {
    console.log(`📊 Order Book Imbalance: ${orderBookImbalance.direction === 'buy' ? 'Buy' : 'Sell'} pressure (${orderBookImbalance.ratio.toFixed(2)}x)`);
    hasSignal = true;
  }
  
  if (liquidityWalls.hasWalls) {
    if (liquidityWalls.walls.buy.length > 0) {
      console.log(`🧱 Buy Wall at ${liquidityWalls.walls.buy[0].price.toFixed(symbol === 'BTCUSDT' ? 1 : 2)} (${liquidityWalls.walls.buy[0].ratio.toFixed(1)}x volume)`);
    }
    if (liquidityWalls.walls.sell.length > 0) {
      console.log(`🧱 Sell Wall at ${liquidityWalls.walls.sell[0].price.toFixed(symbol === 'BTCUSDT' ? 1 : 2)} (${liquidityWalls.walls.sell[0].ratio.toFixed(1)}x volume)`);
    }
    hasSignal = true;
  }
  
  // If any signal was detected, update the last alert time
  if (hasSignal) {
    data.lastAlertTime = now;
    console.log('-'.repeat(40));
  }
}

/**
 * Detect volume spike
 */
function detectVolumeSpike(candles, threshold = 1.01) {
  if (!candles || candles.length < 5) return false;
  
  // Calculate average volume from previous candles (excluding current)
  const previousCandles = candles.slice(1);
  const avgVolume = previousCandles.reduce((sum, candle) => sum + parseFloat(candle[5]), 0) / previousCandles.length;
  
  // Current candle volume
  const currentVolume = parseFloat(candles[0][5]);
  
  return currentVolume > avgVolume * threshold;
}

/**
 * Detect price breakout/breakdown
 */
function detectPriceBreakout(candles, threshold = 1.001) {
  if (!candles || candles.length < 2) return { isBreakout: false, direction: null };
  
  const currentClose = parseFloat(candles[0][4]);
  const previousClose = parseFloat(candles[1][4]);
  
  const isBreakout = currentClose > previousClose * threshold;
  const isBreakdown = currentClose < previousClose / threshold;
  
  if (isBreakout) {
    return { isBreakout: true, direction: 'up' };
  } else if (isBreakdown) {
    return { isBreakout: true, direction: 'down' };
  } else {
    return { isBreakout: false, direction: null };
  }
}

/**
 * Detect order book imbalance
 */
function detectOrderBookImbalance(orderBook, threshold = 1.2) {
  if (!orderBook || !orderBook.b || !orderBook.a) return { isImbalanced: false };
  
  // Calculate total bid and ask volumes (top 10 levels)
  const bidVolume = orderBook.b.slice(0, 10).reduce((sum, level) => sum + parseFloat(level[1]), 0);
  const askVolume = orderBook.a.slice(0, 10).reduce((sum, level) => sum + parseFloat(level[1]), 0);
  
  const ratio = bidVolume / askVolume;
  
  return {
    isImbalanced: ratio > threshold || ratio < 1/threshold,
    direction: ratio > threshold ? 'buy' : ratio < 1/threshold ? 'sell' : null,
    ratio: ratio
  };
}

/**
 * Detect liquidity walls
 */
function detectLiquidityWalls(orderBook, threshold = 1.5) {
  if (!orderBook || !orderBook.b || !orderBook.a) return { hasWalls: false };
  
  const walls = {
    buy: [],
    sell: []
  };
  
  // Calculate average volume per level
  const avgBidVolume = orderBook.b.reduce((sum, level) => sum + parseFloat(level[1]), 0) / orderBook.b.length;
  const avgAskVolume = orderBook.a.reduce((sum, level) => sum + parseFloat(level[1]), 0) / orderBook.a.length;
  
  // Find bid walls
  orderBook.b.forEach((level, index) => {
    if (parseFloat(level[1]) > avgBidVolume * threshold) {
      walls.buy.push({
        price: parseFloat(level[0]),
        volume: parseFloat(level[1]),
        ratio: parseFloat(level[1]) / avgBidVolume
      });
    }
  });
  
  // Find ask walls
  orderBook.a.forEach((level, index) => {
    if (parseFloat(level[1]) > avgAskVolume * threshold) {
      walls.sell.push({
        price: parseFloat(level[0]),
        volume: parseFloat(level[1]),
        ratio: parseFloat(level[1]) / avgAskVolume
      });
    }
  });
  
  return {
    hasWalls: walls.buy.length > 0 || walls.sell.length > 0,
    walls: walls
  };
}

/**
 * Start the monitor
 */
function startMonitor() {
  console.log('Starting BTC and ETH Monitor with very sensitive settings...');
  console.log('This script will show frequent updates for Bitcoin and Ethereum');
  console.log('Press Ctrl+C to exit');
  console.log('-'.repeat(60));
  
  // Initialize WebSockets
  initializeWebSockets();
}

// Start the monitor
startMonitor();
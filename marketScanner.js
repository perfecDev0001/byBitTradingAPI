/**
 * Bybit Market Scanner
 * 
 * This script implements a real-time market scanner for Bybit USDT perpetual contracts
 * based on the specified requirements:
 * 
 * 1. Dashboard Page – Real-Time Market Scanner
 *    - Present live USDT perpetual data from Bybit using 1-minute and 5-minute candlesticks
 *    - Customizable filters for volume spikes, price breakouts, spoof detection, etc.
 *    - Console-based output for market signals
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

// Market scanner state
const scannerState = {
  timeframe: '1m',
  filters: {
    volumeSpikeThreshold: 1.05,    // 5% above average volume (more sensitive)
    priceBreakoutThreshold: 1.002,  // 0.2% price movement (more sensitive)
    spoofDetectionEnabled: true,
    whaleAlertsEnabled: true,
    liquidityWallsEnabled: true
  },
  symbols: [],
  marketData: {},
  
  // Update timeframe
  setTimeframe(newTimeframe) {
    if (newTimeframe !== this.timeframe) {
      this.timeframe = newTimeframe;
      console.log(`Timeframe changed to ${newTimeframe}`);
      
      // Re-initialize WebSocket subscriptions with new timeframe
      initializeWebSockets(this.symbols, newTimeframe);
    }
  },
  
  // Update filter settings
  updateFilters(newFilters) {
    this.filters = { ...this.filters, ...newFilters };
    console.log('Filters updated:', this.filters);
  }
};

/**
 * Fetch available USDT perpetual symbols
 */
async function fetchSymbols() {
  try {
    const response = await restClient.getInstrumentsInfo({
      category: 'linear',
      status: 'Trading'
    });
    
    // Filter for USDT perpetual symbols only
    const usdtSymbols = response.result.list.filter(
      item => item.quoteCoin === 'USDT' && item.contractType === 'LinearPerpetual'
    );
    
    return usdtSymbols.map(item => item.symbol);
  } catch (error) {
    console.error('Error fetching symbols:', error);
    return [];
  }
}

/**
 * Initialize WebSocket connections for real-time data
 */
function initializeWebSockets(symbols, timeframe) {
  // Convert timeframe to Bybit format
  const interval = timeframe === '1m' ? '1' : '5';
  
  // Limit to 10 symbols to avoid rate limits
  const monitoredSymbols = symbols.slice(0, 10);
  
  console.log(`Setting up WebSocket for ${monitoredSymbols.length} symbols with ${timeframe} timeframe`);
  
  // Prepare subscription topics
  const klineTopics = monitoredSymbols.map(symbol => `kline.${interval}.linear.${symbol}`);
  const orderbookTopics = monitoredSymbols.map(symbol => `orderbook.50.linear.${symbol}`);
  
  // Set up WebSocket connection
  wsClient.on('open', () => {
    console.log('WebSocket connection established');
    
    // Subscribe to topics
    if (klineTopics.length > 0) {
      console.log('Subscribing to kline data...');
      wsClient.subscribe(klineTopics);
    }
    
    if (orderbookTopics.length > 0) {
      console.log('Subscribing to orderbook data...');
      wsClient.subscribe(orderbookTopics);
    }
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
    const category = topicParts[2]; // linear
    const symbol = topicParts[3];   // e.g., BTCUSDT
    
    // Initialize market data for this symbol if it doesn't exist
    if (!scannerState.marketData[symbol]) {
      scannerState.marketData[symbol] = {
        klineData: null,
        orderBook: null,
        analysis: {
          volumeSpike: false,
          priceBreakout: { isBreakout: false, direction: null },
          orderBookImbalance: { isImbalanced: false },
          liquidityWalls: { hasWalls: false }
        },
        lastAlertTime: 0
      };
    }
    
    // Process kline data
    if (data.topic.includes('kline')) {
      scannerState.marketData[symbol].klineData = data.data;
      
      // Run analysis on kline data
      if (scannerState.filters.volumeSpikeThreshold > 0) {
        scannerState.marketData[symbol].analysis.volumeSpike = 
          detectVolumeSpike(data.data, scannerState.filters.volumeSpikeThreshold);
      }
      
      scannerState.marketData[symbol].analysis.priceBreakout = 
        detectPriceBreakout(data.data, scannerState.filters.priceBreakoutThreshold);
    }
    
    // Process orderbook data
    else if (data.topic.includes('orderbook')) {
      scannerState.marketData[symbol].orderBook = data.data;
      
      // Run analysis on orderbook data
      if (scannerState.filters.spoofDetectionEnabled) {
        scannerState.marketData[symbol].analysis.orderBookImbalance = 
          detectOrderBookImbalance(data.data);
      }
      
      if (scannerState.filters.liquidityWallsEnabled) {
        scannerState.marketData[symbol].analysis.liquidityWalls = 
          detectLiquidityWalls(data.data);
      }
    }
    
    // Check if we should alert for this symbol
    checkForAlerts(symbol);
    
  } catch (error) {
    console.error('Error processing WebSocket data:', error);
  }
}

/**
 * Check if any alerts should be triggered for a symbol
 */
function checkForAlerts(symbol) {
  const data = scannerState.marketData[symbol];
  if (!data || !data.klineData) return;
  
  // Only alert once every 60 seconds for a symbol
  const now = Date.now();
  if (now - data.lastAlertTime < 60000) return;
  
  let shouldAlert = false;
  
  // Check volume spike
  if (scannerState.filters.volumeSpikeThreshold > 0 && data.analysis.volumeSpike) {
    shouldAlert = true;
  }
  
  // Check price breakout
  if (data.analysis.priceBreakout.isBreakout) {
    shouldAlert = true;
  }
  
  // Check order book imbalance
  if (scannerState.filters.spoofDetectionEnabled && 
      data.analysis.orderBookImbalance.isImbalanced) {
    shouldAlert = true;
  }
  
  // Check liquidity walls
  if (scannerState.filters.liquidityWallsEnabled && 
      data.analysis.liquidityWalls.hasWalls) {
    shouldAlert = true;
  }
  
  // If any alert condition is met, log the alert
  if (shouldAlert) {
    // Calculate current price and percentage move
    const currentPrice = data.klineData.length > 0 ? 
      parseFloat(data.klineData[0][4]) : 0;
    
    const previousPrice = data.klineData.length > 1 ? 
      parseFloat(data.klineData[1][4]) : currentPrice;
    
    const percentageMove = previousPrice > 0 ? 
      ((currentPrice - previousPrice) / previousPrice) * 100 : 0;
    
    // Create alert data
    const alertData = {
      symbol,
      currentPrice,
      percentageMove,
      breakoutDirection: data.analysis.priceBreakout.direction,
      filters: {
        volumeSpike: data.analysis.volumeSpike,
        priceBreakout: data.analysis.priceBreakout.isBreakout,
        orderBookImbalance: data.analysis.orderBookImbalance.isImbalanced,
        liquidityWalls: data.analysis.liquidityWalls.hasWalls
      }
    };
    
    // Log the alert
    logMarketAlert(alertData);
    
    // Update last alert time
    data.lastAlertTime = now;
  }
}

/**
 * Log market alert to console
 */
function logMarketAlert(alertData) {
  const { symbol, currentPrice, percentageMove, breakoutDirection, filters } = alertData;
  
  // Create a formatted alert message
  console.log('\n' + '='.repeat(50));
  console.log(`MARKET ALERT: ${symbol}`);
  console.log('='.repeat(50));
  
  // Price information
  console.log(`Price: ${currentPrice.toFixed(8)} USDT`);
  console.log(`Move: ${percentageMove.toFixed(2)}%`);
  console.log(`Timeframe: ${scannerState.timeframe}`);
  
  // Alert reasons
  console.log('\nAlert Reasons:');
  if (filters.volumeSpike) {
    console.log('- Volume Spike Detected ⚡');
  }
  if (filters.priceBreakout) {
    console.log(`- Price ${breakoutDirection === 'up' ? 'Breakout ↑' : 'Breakdown ↓'}`);
  }
  if (filters.orderBookImbalance) {
    console.log('- Order Book Imbalance Detected 📊');
  }
  if (filters.liquidityWalls) {
    console.log('- Liquidity Walls Detected 🧱');
  }
  
  console.log('-'.repeat(50));
}

/**
 * Detect volume spike
 */
function detectVolumeSpike(candles, threshold = 1.2) {
  if (!candles || candles.length < 10) return false;
  
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
function detectPriceBreakout(candles, threshold = 1.01) {
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
 * Detect order book imbalance (spoofing)
 */
function detectOrderBookImbalance(orderBook, threshold = 1.5) { // More sensitive: 1.5 instead of 2.0
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
 * Detect liquidity walls in order book
 */
function detectLiquidityWalls(orderBook, threshold = 2.0) { // More sensitive: 2.0 instead of 3.0
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
 * Display available commands
 */
function showHelp() {
  console.log('\n=== Bybit Market Scanner Commands ===');
  console.log('1. Switch to 1m timeframe: type "1m"');
  console.log('2. Switch to 5m timeframe: type "5m"');
  console.log('3. Show current filters: type "filters"');
  console.log('4. Update volume spike threshold: type "volume X" (e.g., volume 1.5)');
  console.log('5. Update breakout threshold: type "breakout X" (e.g., breakout 1.01)');
  console.log('6. Toggle spoof detection: type "spoof on/off"');
  console.log('7. Toggle liquidity walls: type "walls on/off"');
  console.log('8. Show this help: type "help"');
  console.log('9. Exit: type "exit" or press Ctrl+C');
  console.log('=======================================\n');
}

/**
 * Process user commands
 */
function processCommand(cmd) {
  cmd = cmd.trim().toLowerCase();
  
  if (cmd === 'help') {
    showHelp();
  }
  else if (cmd === '1m') {
    scannerState.setTimeframe('1m');
  }
  else if (cmd === '5m') {
    scannerState.setTimeframe('5m');
  }
  else if (cmd === 'filters') {
    console.log('\nCurrent Filter Settings:');
    console.log(JSON.stringify(scannerState.filters, null, 2));
  }
  else if (cmd.startsWith('volume ')) {
    const threshold = parseFloat(cmd.split(' ')[1]);
    if (!isNaN(threshold) && threshold > 0) {
      scannerState.updateFilters({ volumeSpikeThreshold: threshold });
    } else {
      console.log('Invalid threshold value. Please use a positive number.');
    }
  }
  else if (cmd.startsWith('breakout ')) {
    const threshold = parseFloat(cmd.split(' ')[1]);
    if (!isNaN(threshold) && threshold > 1) {
      scannerState.updateFilters({ priceBreakoutThreshold: threshold });
    } else {
      console.log('Invalid threshold value. Please use a number greater than 1.');
    }
  }
  else if (cmd === 'spoof on') {
    scannerState.updateFilters({ spoofDetectionEnabled: true });
  }
  else if (cmd === 'spoof off') {
    scannerState.updateFilters({ spoofDetectionEnabled: false });
  }
  else if (cmd === 'walls on') {
    scannerState.updateFilters({ liquidityWallsEnabled: true });
  }
  else if (cmd === 'walls off') {
    scannerState.updateFilters({ liquidityWallsEnabled: false });
  }
  else if (cmd === 'exit') {
    console.log('Exiting...');
    process.exit(0);
  }
  else {
    console.log('Unknown command. Type "help" for available commands.');
  }
}

/**
 * Initialize the market scanner
 */
async function initializeMarketScanner() {
  console.log('Initializing Bybit Market Scanner...');
  
  try {
    // Fetch available symbols
    const symbols = await fetchSymbols();
    console.log(`Found ${symbols.length} USDT perpetual symbols`);
    
    // Store symbols in scanner state
    scannerState.symbols = symbols;
    
    // Initialize WebSockets
    initializeWebSockets(symbols, scannerState.timeframe);
    
    // Show help
    showHelp();
    
    // Set up command processing
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'bybit> '
    });
    
    rl.prompt();
    
    rl.on('line', (line) => {
      processCommand(line);
      rl.prompt();
    }).on('close', () => {
      console.log('Exiting Bybit Market Scanner');
      process.exit(0);
    });
    
    console.log('Market scanner initialized successfully');
    console.log('Monitoring for market signals...');
    
  } catch (error) {
    console.error('Error initializing market scanner:', error);
  }
}

// Start the market scanner
initializeMarketScanner();
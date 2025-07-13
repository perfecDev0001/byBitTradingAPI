const { RestClientV5, WebsocketClient } = require('bybit-api');
const crypto = require('crypto');
const axios = require('axios');

// Configuration
const API_KEY = 'esUvA3iyrimc8nVihB';
const API_SECRET = '5GijOBsxPg9z66lvrBQGp41lgeSFoOK6NwvD';

// Initialize Bybit REST client
const restClient = new RestClientV5(
  API_KEY,
  API_SECRET,
  // Use testnet for development, change to true for production
  { testnet: true }
);

// Initialize Bybit WebSocket client for real-time data
const wsClient = new WebsocketClient({
  key: API_KEY,
  secret: API_SECRET,
  testnet: true, // Set to false for production
  market: 'v5' // Use v5 for the latest API version
});

// ==========================================
// 1. DATA FETCHING FUNCTIONS
// ==========================================

/**
 * Fetch available USDT perpetual symbols
 * @returns {Promise<Array>} List of available symbols
 */
async function fetchUSDTPerpetualSymbols() {
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
 * Fetch kline/candlestick data for a specific symbol and timeframe
 * @param {string} symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param {string} interval - Kline interval ('1', '5' for 1m, 5m)
 * @param {number} limit - Number of candles to fetch
 * @returns {Promise<Array>} Candlestick data
 */
async function fetchCandlestickData(symbol, interval, limit = 100) {
  try {
    const response = await restClient.getKline({
      category: 'linear',
      symbol: symbol,
      interval: interval,
      limit: limit
    });
    
    return response.result.list;
  } catch (error) {
    console.error(`Error fetching candlestick data for ${symbol}:`, error);
    return [];
  }
}

/**
 * Fetch order book data for a specific symbol
 * @param {string} symbol - Trading pair symbol
 * @param {number} limit - Depth of the order book
 * @returns {Promise<Object>} Order book data
 */
async function fetchOrderBook(symbol, limit = 50) {
  try {
    const response = await restClient.getOrderbook({
      category: 'linear',
      symbol: symbol,
      limit: limit
    });
    
    return response.result;
  } catch (error) {
    console.error(`Error fetching order book for ${symbol}:`, error);
    return null;
  }
}

// ==========================================
// 2. DATA ANALYSIS FUNCTIONS
// ==========================================

/**
 * Calculate volume spike based on average volume
 * @param {Array} candles - Candlestick data
 * @param {number} threshold - Volume spike threshold multiplier
 * @returns {boolean} True if current volume exceeds threshold
 */
function detectVolumeSpike(candles, threshold = 1.2) {
  if (candles.length < 10) return false;
  
  // Calculate average volume from previous candles (excluding current)
  const previousCandles = candles.slice(1);
  const avgVolume = previousCandles.reduce((sum, candle) => sum + parseFloat(candle[5]), 0) / previousCandles.length;
  
  // Current candle volume
  const currentVolume = parseFloat(candles[0][5]);
  
  return currentVolume > avgVolume * threshold;
}

/**
 * Detect price breakout/breakdown
 * @param {Array} candles - Candlestick data
 * @param {number} threshold - Breakout percentage threshold (e.g., 1.01 for 1%)
 * @returns {Object} Breakout information
 */
function detectPriceBreakout(candles, threshold = 1.01) {
  if (candles.length < 2) return { isBreakout: false, direction: null };
  
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
 * @param {Object} orderBook - Order book data
 * @param {number} threshold - Imbalance threshold ratio
 * @returns {Object} Imbalance information
 */
function detectOrderBookImbalance(orderBook, threshold = 2.0) {
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
 * @param {Object} orderBook - Order book data
 * @param {number} threshold - Volume threshold for wall detection
 * @returns {Object} Liquidity wall information
 */
function detectLiquidityWalls(orderBook, threshold = 3.0) {
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

// ==========================================
// 3. REAL-TIME DATA HANDLING
// ==========================================

/**
 * Initialize WebSocket connections for real-time data
 * @param {Array} symbols - List of symbols to subscribe to
 * @param {string} timeframe - Candlestick timeframe ('1m' or '5m')
 * @param {Function} onUpdate - Callback function for data updates
 */
function initializeRealTimeData(symbols, timeframe, onUpdate) {
  // Convert timeframe to Bybit format
  const interval = timeframe === '1m' ? '1' : '5';
  
  // For V5 API, we need to use the correct topic format
  // Subscribe to kline data for each symbol (limit to 10 symbols for testing)
  const testSymbols = symbols.slice(0, 10); // Limit to 10 symbols to avoid rate limits
  
  console.log(`Subscribing to ${testSymbols.length} symbols for real-time data...`);
  
  // Create subscription arrays for batch subscription
  const klineTopics = [];
  const orderbookTopics = [];
  
  // Prepare topics for subscription
  testSymbols.forEach(symbol => {
    klineTopics.push(`kline.${interval}.linear.${symbol}`);
    orderbookTopics.push(`orderbook.50.linear.${symbol}`);
  });
  
  // Connect event handler
  wsClient.on('open', () => {
    console.log('WebSocket connection established');
    
    // Subscribe in batches to avoid rate limits
    try {
      if (klineTopics.length > 0) {
        console.log('Subscribing to kline topics...');
        wsClient.subscribe(klineTopics);
      }
      
      if (orderbookTopics.length > 0) {
        console.log('Subscribing to orderbook topics...');
        wsClient.subscribe(orderbookTopics);
      }
    } catch (error) {
      console.error('Error subscribing to topics:', error);
    }
  });
  
  // Handle incoming WebSocket messages
  wsClient.on('update', data => {
    try {
      if (data.topic && data.topic.includes('kline')) {
        const parts = data.topic.split('.');
        const symbol = parts[3]; // In V5 format: kline.{interval}.linear.{symbol}
        onUpdate({
          type: 'kline',
          symbol: symbol,
          data: data.data
        });
      } else if (data.topic && data.topic.includes('orderbook')) {
        const parts = data.topic.split('.');
        const symbol = parts[3]; // In V5 format: orderbook.{depth}.linear.{symbol}
        onUpdate({
          type: 'orderbook',
          symbol: symbol,
          data: data.data
        });
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });
  
  wsClient.on('error', err => {
    console.error('WebSocket error:', err);
  });
  
  wsClient.on('close', () => {
    console.log('WebSocket connection closed');
    // Attempt to reconnect
    setTimeout(() => {
      console.log('Attempting to reconnect WebSocket...');
      wsClient.connect();
    }, 5000);
  });
}

// ==========================================
// 4. DASHBOARD DATA MANAGEMENT
// ==========================================

/**
 * Dashboard state management
 */
const dashboardState = {
  timeframe: '1m',
  filters: {
    volumeSpikeThreshold: 1.05,     // More sensitive: 5% above average volume
    priceBreakoutThreshold: 1.002,  // More sensitive: 0.2% price movement
    spoofDetectionEnabled: true,
    whaleAlertsEnabled: true,
    liquidityWallsEnabled: true
  },
  symbols: ['USDT'],
  marketData: {}, // Stores latest data for each symbol
  
  // Update timeframe
  setTimeframe(newTimeframe) {
    this.timeframe = newTimeframe;
    // Re-initialize real-time data with new timeframe
    initializeRealTimeData(this.symbols, newTimeframe, this.updateMarketData.bind(this));
  },
  
  // Update filter settings
  updateFilters(newFilters) {
    this.filters = { ...this.filters, ...newFilters };
  },
  
  // Process incoming market data
  updateMarketData(update) {
    const { type, symbol, data } = update;
    
    if (!this.marketData[symbol]) {
      this.marketData[symbol] = {
        klineData: [],
        orderBook: null,
        analysis: {
          volumeSpike: false,
          priceBreakout: { isBreakout: false, direction: null },
          orderBookImbalance: { isImbalanced: false },
          liquidityWalls: { hasWalls: false }
        }
      };
    }
    
    // Update the appropriate data type
    if (type === 'kline') {
      this.marketData[symbol].klineData = data;
      
      // Run analysis on new kline data
      if (this.filters.volumeSpikeThreshold > 0) {
        this.marketData[symbol].analysis.volumeSpike = 
          detectVolumeSpike(data, this.filters.volumeSpikeThreshold);
      }
      
      this.marketData[symbol].analysis.priceBreakout = 
        detectPriceBreakout(data, this.filters.priceBreakoutThreshold);
    } 
    else if (type === 'orderbook') {
      this.marketData[symbol].orderBook = data;
      
      // Run analysis on new order book data
      if (this.filters.spoofDetectionEnabled) {
        this.marketData[symbol].analysis.orderBookImbalance = 
          detectOrderBookImbalance(data);
      }
      
      if (this.filters.liquidityWallsEnabled) {
        this.marketData[symbol].analysis.liquidityWalls = 
          detectLiquidityWalls(data);
      }
    }
  },
  
  // Get filtered market data based on current filters
  getFilteredMarketData() {
    const result = [];
    
    for (const symbol in this.marketData) {
      const data = this.marketData[symbol];
      let shouldInclude = false;
      
      // Apply filters
      if (this.filters.volumeSpikeThreshold > 0 && data.analysis.volumeSpike) {
        shouldInclude = true;
      }
      
      if (data.analysis.priceBreakout.isBreakout) {
        shouldInclude = true;
      }
      
      if (this.filters.spoofDetectionEnabled && data.analysis.orderBookImbalance.isImbalanced) {
        shouldInclude = true;
      }
      
      if (this.filters.liquidityWallsEnabled && data.analysis.liquidityWalls.hasWalls) {
        shouldInclude = true;
      }
      
      if (shouldInclude) {
        // Calculate current price and percentage move
        const currentPrice = data.klineData.length > 0 ? parseFloat(data.klineData[0][4]) : 0;
        const previousPrice = data.klineData.length > 1 ? parseFloat(data.klineData[1][4]) : currentPrice;
        const percentageMove = previousPrice > 0 ? ((currentPrice - previousPrice) / previousPrice) * 100 : 0;
        
        result.push({
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
        });
      }
    }
    
    return result;
  }
};

// ==========================================
// 5. CONSOLE LOGGING FUNCTIONS
// ==========================================

/**
 * Log market data to console
 * @param {string} symbol - Trading pair symbol
 * @param {Object} marketData - Market data for the symbol
 */
function logMarketData(symbol, marketData) {
  const payload = {
    symbol,
    timestamp: new Date().toISOString(),
    price: marketData.currentPrice,
    percentageMove: marketData.percentageMove.toFixed(2) + '%',
    timeframe: dashboardState.timeframe,
    signals: {
      volumeSpike: marketData.filters.volumeSpike,
      priceBreakout: marketData.filters.priceBreakout,
      breakoutDirection: marketData.breakoutDirection,
      orderBookImbalance: marketData.filters.orderBookImbalance,
      liquidityWalls: marketData.filters.liquidityWalls
    }
  };
  
  console.log('='.repeat(50));
  console.log(`MARKET ALERT: ${symbol}`);
  console.log('='.repeat(50));
  console.log(JSON.stringify(payload, null, 2));
  console.log('-'.repeat(50));
  
  return true;
}

// ==========================================
// 6. INITIALIZATION AND SETUP
// ==========================================

/**
 * Initialize the dashboard
 */
async function initializeDashboard() {
  try {
    // Fetch available symbols
    const symbols = await fetchUSDTPerpetualSymbols();
    console.log(`Found ${symbols.length} USDT perpetual symbols`);
    
    // Store symbols in dashboard state
    dashboardState.symbols = symbols;
    
    // Initialize real-time data
    initializeRealTimeData(
      symbols, 
      dashboardState.timeframe, 
      dashboardState.updateMarketData.bind(dashboardState)
    );
    
    // Set up periodic console logging of filtered market data
    setInterval(() => {
      const filteredData = dashboardState.getFilteredMarketData();
      console.log(`\n${new Date().toISOString()} - Found ${filteredData.length} signals`);
      
      if (filteredData.length > 0) {
        filteredData.forEach(data => {
          logMarketData(data.symbol, data);
        });
      }
    }, 10000); // Log every 10 seconds
    
    console.log('Dashboard initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing dashboard:', error);
    return false;
  }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Core functions
  initializeDashboard,
  dashboardState,
  
  // Data fetching
  fetchUSDTPerpetualSymbols,
  fetchCandlestickData,
  fetchOrderBook,
  
  // Analysis functions
  detectVolumeSpike,
  detectPriceBreakout,
  detectOrderBookImbalance,
  detectLiquidityWalls,
  
  // Console logging
  logMarketData
};

// Example usage:
// Run this to start the dashboard
initializeDashboard().then(() => {
  console.log('Dashboard ready and monitoring market data...');
  console.log('Press Ctrl+C to exit');
});
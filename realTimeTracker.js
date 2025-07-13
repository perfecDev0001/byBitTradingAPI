/**
 * Real-Time Market Tracker
 * 
 * This script tracks real-time market data for Bitcoin and Ethereum
 * and displays every update without any filtering.
 */

const { RestClientV5, WebsocketClient } = require('bybit-api');

// Configuration
const API_KEY = 'esUvA3iyrimc8nVihB';
const API_SECRET = '5GijOBsxPg9z66lvrBQGp41lgeSFoOK6NwvD';

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
    price: null,
    lastUpdate: null,
    updates: 0
  },
  ETHUSDT: {
    price: null,
    lastUpdate: null,
    updates: 0
  }
};

// Statistics
let totalUpdates = 0;
const startTime = Date.now();

/**
 * Initialize WebSocket connection
 */
function initializeWebSocket() {
  console.log('Initializing WebSocket connection...');
  
  // Create subscription topics
  const topics = [];
  
  // Subscribe to ticker data (most frequent updates)
  SYMBOLS.forEach(symbol => {
    topics.push(`tickers.${symbol}`);
  });
  
  // Set up connection handlers
  wsClient.on('open', () => {
    console.log('WebSocket connection established');
    
    // Subscribe to topics
    try {
      wsClient.subscribe(topics);
      console.log(`Subscribed to ticker data for ${SYMBOLS.join(', ')}`);
      console.log('\nWaiting for real-time updates...');
      console.log('(You should see updates within a few seconds)\n');
    } catch (error) {
      console.error('Error subscribing to topics:', error);
    }
  });
  
  // Handle incoming data
  wsClient.on('update', data => {
    processTickerData(data);
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
 * Process ticker data
 */
function processTickerData(data) {
  try {
    if (!data.topic || !data.data) return;
    
    // Check if this is ticker data
    if (data.topic.startsWith('tickers.')) {
      const symbol = data.topic.split('.')[1];
      
      // Only process data for our monitored symbols
      if (!SYMBOLS.includes(symbol)) return;
      
      // Update market data
      const ticker = data.data;
      const currentPrice = ticker.lastPrice;
      const previousPrice = marketData[symbol].price;
      
      marketData[symbol].price = currentPrice;
      marketData[symbol].lastUpdate = Date.now();
      marketData[symbol].updates++;
      
      totalUpdates++;
      
      // Calculate price change if we have a previous price
      let priceChange = null;
      let changeSymbol = '';
      
      if (previousPrice !== null) {
        priceChange = ((currentPrice - previousPrice) / previousPrice) * 100;
        changeSymbol = priceChange >= 0 ? '↑' : '↓';
      }
      
      // Display update
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${symbol}: ${currentPrice} USDT ${changeSymbol} ${priceChange !== null ? priceChange.toFixed(6) + '%' : ''}`);
      
      // Display statistics every 10 updates
      if (totalUpdates % 10 === 0) {
        displayStatistics();
      }
    }
  } catch (error) {
    console.error('Error processing ticker data:', error);
  }
}

/**
 * Display statistics
 */
function displayStatistics() {
  const runningTime = (Date.now() - startTime) / 1000; // in seconds
  
  console.log('\n--- STATISTICS ---');
  console.log(`Running time: ${runningTime.toFixed(1)} seconds`);
  console.log(`Total updates: ${totalUpdates}`);
  console.log(`Updates per second: ${(totalUpdates / runningTime).toFixed(2)}`);
  
  SYMBOLS.forEach(symbol => {
    console.log(`${symbol} updates: ${marketData[symbol].updates}`);
  });
  
  console.log('-----------------\n');
}

/**
 * Start the tracker
 */
function startTracker() {
  console.log('Starting Real-Time Market Tracker...');
  console.log('This script will show every price update for BTC and ETH');
  console.log('Press Ctrl+C to exit');
  console.log('-'.repeat(60));
  
  // Initialize WebSocket
  initializeWebSocket();
  
  // Display statistics every 30 seconds
  setInterval(displayStatistics, 30000);
}

// Start the tracker
startTracker();
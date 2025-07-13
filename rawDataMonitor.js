/**
 * Raw Data Monitor for Bybit
 * 
 * This script displays all raw market data without any filtering.
 * It will show you every update received from the Bybit API.
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

// Symbols to monitor - we'll focus on the most active ones
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

/**
 * Fetch current market prices for our symbols
 */
async function fetchCurrentPrices() {
  try {
    console.log('Fetching current market prices...');
    
    console.log('\nCurrent Market Prices:');
    console.log('======================');
    
    // Fetch each symbol individually to avoid issues
    for (const symbol of SYMBOLS) {
      try {
        const response = await restClient.getTickers({
          category: 'linear',
          symbol: symbol
        });
        
        if (response.retCode === 0 && response.result.list && response.result.list.length > 0) {
          const ticker = response.result.list[0];
          console.log(`${ticker.symbol}: ${ticker.lastPrice} USDT (24h Change: ${ticker.price24hPcnt}%)`);
        } else {
          console.log(`${symbol}: Failed to fetch data - ${response.retMsg}`);
        }
      } catch (err) {
        console.log(`${symbol}: Error fetching data - ${err.message}`);
      }
    }
    
    console.log('======================\n');
  } catch (error) {
    console.error('Error fetching market prices:', error);
  }
}

/**
 * Initialize WebSocket connections
 */
function initializeWebSockets() {
  // Subscribe to 1-minute klines and orderbook
  const klineTopics = SYMBOLS.map(symbol => `kline.1.linear.${symbol}`);
  const orderbookTopics = SYMBOLS.map(symbol => `orderbook.50.linear.${symbol}`);
  const tradeTopics = SYMBOLS.map(symbol => `publicTrade.linear.${symbol}`);
  
  // Set up WebSocket connection
  wsClient.on('open', () => {
    console.log('WebSocket connection established');
    
    // Subscribe to topics
    try {
      wsClient.subscribe(klineTopics);
      console.log('Subscribed to kline data for', SYMBOLS.join(', '));
      
      wsClient.subscribe(orderbookTopics);
      console.log('Subscribed to orderbook data for', SYMBOLS.join(', '));
      
      wsClient.subscribe(tradeTopics);
      console.log('Subscribed to trade data for', SYMBOLS.join(', '));
    } catch (error) {
      console.error('Error subscribing to topics:', error);
    }
  });
  
  // Handle incoming data
  wsClient.on('update', data => {
    displayRawData(data);
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
 * Display raw data from WebSocket
 */
function displayRawData(data) {
  try {
    if (!data.topic) return;
    
    const topicParts = data.topic.split('.');
    const dataType = topicParts[0];   // kline, orderbook, or publicTrade
    const symbol = topicParts[3];     // e.g., BTCUSDT
    
    // Only process data for our monitored symbols
    if (!SYMBOLS.includes(symbol)) return;
    
    const timestamp = new Date().toISOString();
    
    // Process kline data
    if (dataType === 'kline') {
      const candle = data.data[0];
      if (candle) {
        console.log(`\n[${timestamp}] KLINE UPDATE - ${symbol}`);
        console.log(`  Open: ${candle[1]}`);
        console.log(`  High: ${candle[2]}`);
        console.log(`  Low: ${candle[3]}`);
        console.log(`  Close: ${candle[4]}`);
        console.log(`  Volume: ${candle[5]}`);
        console.log(`  Turnover: ${candle[6]}`);
      }
    }
    
    // Process orderbook data
    else if (dataType === 'orderbook') {
      console.log(`\n[${timestamp}] ORDERBOOK UPDATE - ${symbol}`);
      
      if (data.data && data.data.b && data.data.b.length > 0) {
        console.log(`  Top 3 Bids:`);
        data.data.b.slice(0, 3).forEach((bid, i) => {
          console.log(`    ${i+1}. Price: ${bid[0]}, Size: ${bid[1]}`);
        });
      }
      
      if (data.data && data.data.a && data.data.a.length > 0) {
        console.log(`  Top 3 Asks:`);
        data.data.a.slice(0, 3).forEach((ask, i) => {
          console.log(`    ${i+1}. Price: ${ask[0]}, Size: ${ask[1]}`);
        });
      }
    }
    
    // Process trade data
    else if (dataType === 'publicTrade') {
      console.log(`\n[${timestamp}] TRADE UPDATE - ${symbol}`);
      
      if (Array.isArray(data.data) && data.data.length > 0) {
        data.data.slice(0, 3).forEach((trade, i) => {
          console.log(`  Trade ${i+1}:`);
          console.log(`    Price: ${trade.p}`);
          console.log(`    Size: ${trade.v}`);
          console.log(`    Side: ${trade.S}`);
          console.log(`    Time: ${new Date(trade.T).toISOString()}`);
        });
      }
    }
    
  } catch (error) {
    console.error('Error displaying raw data:', error);
  }
}

/**
 * Start the monitor
 */
async function startMonitor() {
  console.log('Starting Raw Data Monitor for Bybit...');
  console.log('This script will show all raw market data without filtering');
  console.log('Press Ctrl+C to exit');
  console.log('-'.repeat(60));
  
  // Fetch current market prices
  await fetchCurrentPrices();
  
  // Initialize WebSockets
  initializeWebSockets();
  
  // Periodically fetch current prices
  setInterval(fetchCurrentPrices, 60000); // Update prices every minute
}

// Start the monitor
startMonitor();
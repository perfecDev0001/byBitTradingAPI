/**
 * Price Poller
 * 
 * This script polls the Bybit API every second to get the latest prices
 * for Bitcoin and Ethereum and displays them in real-time.
 */

const { RestClientV5 } = require('bybit-api');

// Configuration
const API_KEY = 'esUvA3iyrimc8nVihB';
const API_SECRET = '5GijOBsxPg9z66lvrBQGp41lgeSFoOK6NwvD';

// Initialize Bybit REST client
const restClient = new RestClientV5(
  API_KEY,
  API_SECRET,
  { testnet: true }
);

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
 * Fetch latest prices
 */
async function fetchLatestPrices() {
  try {
    for (const symbol of SYMBOLS) {
      const response = await restClient.getTickers({
        category: 'linear',
        symbol: symbol
      });
      
      if (response.retCode === 0 && response.result.list && response.result.list.length > 0) {
        const ticker = response.result.list[0];
        const currentPrice = ticker.lastPrice;
        const previousPrice = marketData[symbol].price;
        
        // Only log if price has changed
        if (currentPrice !== previousPrice) {
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
        }
      }
    }
  } catch (error) {
    console.error('Error fetching prices:', error);
  }
}

/**
 * Display statistics
 */
function displayStatistics() {
  const runningTime = (Date.now() - startTime) / 1000; // in seconds
  
  console.log('\n--- STATISTICS ---');
  console.log(`Running time: ${runningTime.toFixed(1)} seconds`);
  console.log(`Total price changes: ${totalUpdates}`);
  console.log(`Changes per minute: ${(totalUpdates / (runningTime / 60)).toFixed(2)}`);
  
  SYMBOLS.forEach(symbol => {
    console.log(`${symbol} price changes: ${marketData[symbol].updates}`);
    console.log(`Current price: ${marketData[symbol].price} USDT`);
  });
  
  console.log('-----------------\n');
}

/**
 * Start the price poller
 */
function startPricePoller() {
  console.log('Starting Price Poller...');
  console.log('This script will poll for price changes every second');
  console.log('Press Ctrl+C to exit');
  console.log('-'.repeat(60));
  
  // Initial fetch
  fetchLatestPrices();
  
  // Poll every second
  setInterval(fetchLatestPrices, 1000);
  
  // Display statistics every 30 seconds
  setInterval(displayStatistics, 30000);
}

// Start the price poller
startPricePoller();
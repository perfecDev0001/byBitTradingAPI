/**
 * Simple Market Data Display
 * 
 * This script simply fetches and displays current market data for Bitcoin and Ethereum
 * without any WebSocket connections or filtering.
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

/**
 * Fetch and display current market data
 */
async function fetchMarketData() {
  try {
    // 1. Fetch current ticker data
    console.log('Fetching current market data...\n');
    
    const tickerResponse = await restClient.getTickers({
      category: 'linear',
      symbol: SYMBOLS.join(',')
    });
    
    if (tickerResponse.retCode === 0 && tickerResponse.result.list) {
      console.log('CURRENT MARKET PRICES:');
      console.log('=====================');
      
      tickerResponse.result.list.forEach(ticker => {
        console.log(`${ticker.symbol}: ${ticker.lastPrice} USDT`);
        console.log(`24h Change: ${ticker.price24hPcnt}%`);
        console.log(`24h High: ${ticker.highPrice24h}`);
        console.log(`24h Low: ${ticker.lowPrice24h}`);
        console.log(`24h Volume: ${ticker.volume24h}`);
        console.log('---------------------');
      });
    }
    
    // 2. Fetch recent kline data
    for (const symbol of SYMBOLS) {
      const klineResponse = await restClient.getKline({
        category: 'linear',
        symbol: symbol,
        interval: '1',  // 1 minute
        limit: 5        // Last 5 candles
      });
      
      if (klineResponse.retCode === 0 && klineResponse.result.list) {
        console.log(`\nRECENT PRICE MOVEMENT FOR ${symbol}:`);
        console.log('================================');
        
        // Reverse to show oldest first
        const candles = klineResponse.result.list.reverse();
        
        candles.forEach((candle, index) => {
          const timestamp = new Date(parseInt(candle[0])).toLocaleTimeString();
          const open = parseFloat(candle[1]);
          const high = parseFloat(candle[2]);
          const low = parseFloat(candle[3]);
          const close = parseFloat(candle[4]);
          const volume = parseFloat(candle[5]);
          
          console.log(`Candle ${index + 1} (${timestamp}):`);
          console.log(`  Open: ${open}`);
          console.log(`  High: ${high}`);
          console.log(`  Low: ${low}`);
          console.log(`  Close: ${close}`);
          console.log(`  Volume: ${volume}`);
          console.log('  -----------------');
        });
      }
    }
    
    // 3. Fetch order book data
    for (const symbol of SYMBOLS) {
      const orderbookResponse = await restClient.getOrderbook({
        category: 'linear',
        symbol: symbol,
        limit: 5  // Top 5 levels
      });
      
      if (orderbookResponse.retCode === 0 && orderbookResponse.result) {
        console.log(`\nCURRENT ORDER BOOK FOR ${symbol}:`);
        console.log('==============================');
        
        console.log('Top 5 Asks (Sell Orders):');
        orderbookResponse.result.a.slice(0, 5).forEach((ask, index) => {
          console.log(`  ${index + 1}. Price: ${ask[0]}, Size: ${ask[1]}`);
        });
        
        console.log('\nTop 5 Bids (Buy Orders):');
        orderbookResponse.result.b.slice(0, 5).forEach((bid, index) => {
          console.log(`  ${index + 1}. Price: ${bid[0]}, Size: ${bid[1]}`);
        });
      }
    }
    
    console.log('\nData fetch complete. Run the script again to get updated data.');
    
  } catch (error) {
    console.error('Error fetching market data:', error);
  }
}

// Run the function
fetchMarketData();
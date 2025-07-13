/**
 * Simple Console Monitor for Bybit Market Scanner
 * 
 * This script provides a simple console-based interface for monitoring
 * market signals from the Bybit dashboard.
 */

const { RestClientV5 } = require('bybit-api');
const dashboard = require('./dashboardTemplate');

// Configuration
const API_KEY = 'esUvA3iyrimc8nVihB';
const API_SECRET = '5GijOBsxPg9z66lvrBQGp41lgeSFoOK6NwvD';

// Initialize REST client for direct API calls
const restClient = new RestClientV5(
  API_KEY,
  API_SECRET,
  { testnet: true }
);

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
  console.log('8. Check specific symbol: type "check SYMBOL" (e.g., check BTCUSDT)');
  console.log('9. Show this help: type "help"');
  console.log('10. Exit: type "exit" or press Ctrl+C');
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
    console.log('Switching to 1-minute timeframe...');
    dashboard.dashboardState.setTimeframe('1m');
    console.log('Now using 1-minute timeframe');
  }
  else if (cmd === '5m') {
    console.log('Switching to 5-minute timeframe...');
    dashboard.dashboardState.setTimeframe('5m');
    console.log('Now using 5-minute timeframe');
  }
  else if (cmd === 'filters') {
    console.log('\nCurrent Filter Settings:');
    console.log(JSON.stringify(dashboard.dashboardState.filters, null, 2));
  }
  else if (cmd.startsWith('volume ')) {
    const threshold = parseFloat(cmd.split(' ')[1]);
    if (!isNaN(threshold) && threshold > 0) {
      console.log(`Setting volume spike threshold to ${threshold}...`);
      dashboard.dashboardState.updateFilters({ volumeSpikeThreshold: threshold });
      console.log('Volume spike threshold updated');
    } else {
      console.log('Invalid threshold value. Please use a positive number.');
    }
  }
  else if (cmd.startsWith('breakout ')) {
    const threshold = parseFloat(cmd.split(' ')[1]);
    if (!isNaN(threshold) && threshold > 1) {
      console.log(`Setting breakout threshold to ${threshold}...`);
      dashboard.dashboardState.updateFilters({ priceBreakoutThreshold: threshold });
      console.log('Breakout threshold updated');
    } else {
      console.log('Invalid threshold value. Please use a number greater than 1.');
    }
  }
  else if (cmd === 'spoof on') {
    console.log('Enabling spoof detection...');
    dashboard.dashboardState.updateFilters({ spoofDetectionEnabled: true });
    console.log('Spoof detection enabled');
  }
  else if (cmd === 'spoof off') {
    console.log('Disabling spoof detection...');
    dashboard.dashboardState.updateFilters({ spoofDetectionEnabled: false });
    console.log('Spoof detection disabled');
  }
  else if (cmd === 'walls on') {
    console.log('Enabling liquidity walls detection...');
    dashboard.dashboardState.updateFilters({ liquidityWallsEnabled: true });
    console.log('Liquidity walls detection enabled');
  }
  else if (cmd === 'walls off') {
    console.log('Disabling liquidity walls detection...');
    dashboard.dashboardState.updateFilters({ liquidityWallsEnabled: false });
    console.log('Liquidity walls detection disabled');
  }
  else if (cmd.startsWith('check ')) {
    const symbol = cmd.split(' ')[1].toUpperCase();
    checkSymbol(symbol);
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
 * Check a specific symbol manually
 */
async function checkSymbol(symbol) {
  console.log(`\nChecking ${symbol}...`);
  
  try {
    // Fetch latest data
    const interval = dashboard.dashboardState.timeframe === '1m' ? '1' : '5';
    
    const candleData = await dashboard.fetchCandlestickData(symbol, interval, 20);
    if (!candleData || candleData.length === 0) {
      console.log(`No candle data available for ${symbol}`);
      return;
    }
    
    const orderBookData = await dashboard.fetchOrderBook(symbol);
    if (!orderBookData) {
      console.log(`No order book data available for ${symbol}`);
      return;
    }
    
    // Run analysis
    const volumeSpike = dashboard.detectVolumeSpike(
      candleData, 
      dashboard.dashboardState.filters.volumeSpikeThreshold
    );
    
    const priceBreakout = dashboard.detectPriceBreakout(
      candleData, 
      dashboard.dashboardState.filters.priceBreakoutThreshold
    );
    
    const orderBookImbalance = dashboard.detectOrderBookImbalance(orderBookData);
    
    const liquidityWalls = dashboard.detectLiquidityWalls(orderBookData);
    
    // Calculate current price and move
    const currentPrice = parseFloat(candleData[0][4]);
    const previousPrice = candleData.length > 1 ? parseFloat(candleData[1][4]) : currentPrice;
    const percentageMove = previousPrice > 0 ? 
      ((currentPrice - previousPrice) / previousPrice) * 100 : 0;
    
    // Create market data object
    const marketData = {
      symbol,
      currentPrice,
      percentageMove,
      breakoutDirection: priceBreakout.direction,
      filters: {
        volumeSpike,
        priceBreakout: priceBreakout.isBreakout,
        orderBookImbalance: orderBookImbalance.isImbalanced,
        liquidityWalls: liquidityWalls.hasWalls
      }
    };
    
    // Log the data
    dashboard.logMarketData(symbol, marketData);
    
  } catch (error) {
    console.error(`Error checking ${symbol}:`, error);
  }
}

/**
 * Initialize the console monitor
 */
async function initializeConsoleMonitor() {
  console.log('Initializing Bybit Market Scanner Console Monitor...');
  
  // Set more sensitive filters before initializing
  dashboard.dashboardState.updateFilters({
    volumeSpikeThreshold: 1.05,     // 5% above average volume
    priceBreakoutThreshold: 1.002,  // 0.2% price movement
    spoofDetectionEnabled: true,
    whaleAlertsEnabled: true,
    liquidityWallsEnabled: true
  });
  
  console.log('Using more sensitive filter settings to detect signals');
  
  // Initialize the dashboard
  await dashboard.initializeDashboard();
  
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
    console.log('Exiting Bybit Market Scanner Console Monitor');
    process.exit(0);
  });
}

// Start the console monitor
initializeConsoleMonitor();
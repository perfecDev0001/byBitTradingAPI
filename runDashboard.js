const dashboard = require('./dashboardTemplate');

// Example of how to change timeframe
setTimeout(() => {
  console.log('\n\nSwitching to 5-minute timeframe...');
  dashboard.dashboardState.setTimeframe('5m');
}, 60000); // After 1 minute, switch to 5m timeframe

// Example of how to update filter settings
setTimeout(() => {
  console.log('\n\nUpdating filter settings...');
  dashboard.dashboardState.updateFilters({
    volumeSpikeThreshold: 1.5,      // More sensitive volume spike detection
    priceBreakoutThreshold: 1.005,  // More sensitive price breakout (0.5%)
    spoofDetectionEnabled: true,
    whaleAlertsEnabled: true,
    liquidityWallsEnabled: true
  });
  console.log('New filter settings applied');
}, 120000); // After 2 minutes, update filter settings

// Example of how to manually check for signals on a specific symbol
setTimeout(async () => {
  console.log('\n\nManually checking BTC signals...');
  
  try {
    // Fetch latest data for BTCUSDT
    const candleData = await dashboard.fetchCandlestickData('BTCUSDT', 
      dashboard.dashboardState.timeframe === '1m' ? '1' : '5', 
      20);
    
    const orderBookData = await dashboard.fetchOrderBook('BTCUSDT');
    
    // Run analysis
    const volumeSpike = dashboard.detectVolumeSpike(candleData, 
      dashboard.dashboardState.filters.volumeSpikeThreshold);
    
    const priceBreakout = dashboard.detectPriceBreakout(candleData, 
      dashboard.dashboardState.filters.priceBreakoutThreshold);
    
    const orderBookImbalance = dashboard.detectOrderBookImbalance(orderBookData);
    
    const liquidityWalls = dashboard.detectLiquidityWalls(orderBookData);
    
    // Log results
    console.log('Manual BTC Analysis:');
    console.log('- Volume Spike:', volumeSpike);
    console.log('- Price Breakout:', priceBreakout);
    console.log('- Order Book Imbalance:', orderBookImbalance);
    console.log('- Liquidity Walls:', liquidityWalls.hasWalls);
    if (liquidityWalls.hasWalls) {
      console.log('  Buy Walls:', liquidityWalls.walls.buy.length);
      console.log('  Sell Walls:', liquidityWalls.walls.sell.length);
    }
  } catch (error) {
    console.error('Error in manual check:', error);
  }
}, 180000); // After 3 minutes, do a manual check

// The dashboard is already initialized in dashboardTemplate.js
console.log('Dashboard runner started');
console.log('You will see market alerts in the console');
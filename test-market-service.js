/**
 * Test script for MarketDataService
 * Run this to test if the service is working correctly
 */

require('dotenv').config();
const MarketDataService = require('./services/MarketDataService');

async function testMarketService() {
  console.log('🧪 Testing MarketDataService...');
  
  const service = new MarketDataService();
  
  // Listen for events
  service.on('marketUpdate', (data) => {
    console.log('✅ Received marketUpdate:', {
      symbol: data.symbol,
      price: data.price,
      change24h: data.change24h,
      volume24h: data.volume24h
    });
  });
  
  service.on('signals', (data) => {
    console.log('🚨 Received signal:', {
      symbol: data.symbol,
      signals: data.signals.map(s => s.type)
    });
  });
  
  try {
    await service.initialize();
    console.log('✅ Service initialized successfully');
    
    // Keep the script running for 30 seconds to see data
    console.log('⏳ Waiting for data (30 seconds)...');
    setTimeout(() => {
      console.log('🏁 Test completed');
      process.exit(0);
    }, 30000);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testMarketService();
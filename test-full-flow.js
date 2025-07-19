/**
 * Test script to verify the full flow from MarketDataService to SocketIOService
 */

require('dotenv').config();
const http = require('http');
const MarketDataService = require('./services/MarketDataService');
const SocketIOService = require('./services/SocketIOService');

async function testFullFlow() {
  console.log('🧪 Testing full flow: MarketDataService -> SocketIOService...');
  
  // Create a simple HTTP server
  const server = http.createServer();
  
  // Initialize services
  const marketDataService = new MarketDataService();
  const socketService = new SocketIOService(server);
  
  // Connect services
  socketService.setMarketDataService(marketDataService);
  
  // Start server
  server.listen(3002, async () => {
    console.log('🚀 Test server running on port 3002');
    
    try {
      await marketDataService.initialize();
      console.log('✅ Services initialized successfully');
      
      // Keep the script running for 60 seconds to see data flow
      console.log('⏳ Monitoring data flow (60 seconds)...');
      setTimeout(() => {
        console.log('🏁 Test completed');
        process.exit(0);
      }, 60000);
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      process.exit(1);
    }
  });
}

testFullFlow();
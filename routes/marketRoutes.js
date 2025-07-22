/**
 * Market Routes
 * Handles all market data related endpoints
 */

const express = require('express');
const router = express.Router();

// This will be injected by the main server
let marketDataService = null;

// Middleware to ensure market data service is available
const ensureMarketService = (req, res, next) => {
  if (!marketDataService) {
    return res.status(503).json({ error: 'Market data service not available' });
  }
  next();
};

// Set market data service (called from main server)
router.setMarketDataService = (service) => {
  marketDataService = service;
};

// GET /api/market/data - Get current market data
router.get('/data', ensureMarketService, async (req, res) => {
  try {
    const { limit = 50, sort = 'volume', demo = 'false' } = req.query;
    let data = await marketDataService.getMarketData();
    
    // If no signals detected and demo mode requested, add some sample data
    if (data.length === 0 && demo === 'true') {
      const allData = await marketDataService.getAllMarketData();
      if (allData.length > 0) {
        // Take first 3 coins and add sample filter data
        data = allData.slice(0, 3).map((coin, index) => {
          const sampleFilters = [
            // First coin - Volume spike + Price breakout
            index === 0 ? [
              {
                type: 'volume_spike',
                icon: '📈',
                label: 'Volume Spike',
                description: '15.2% above average',
                severity: 'high'
              },
              {
                type: 'price_breakout',
                icon: '🚀',
                label: 'Price Breakout',
                description: 'Upward price movement detected',
                severity: 'high'
              }
            ] : [],
            // Second coin - Order book imbalance + Whale activity
            index === 1 ? [
              {
                type: 'spoof_detection',
                icon: '⚠️',
                label: 'Order Book Imbalance',
                description: 'Buy pressure (1.25x ratio)',
                severity: 'medium'
              },
              {
                type: 'whale_alert',
                icon: '🐋',
                label: 'Whale Activity',
                description: 'large_volume_movement: $2.1M bullish',
                severity: 'critical'
              }
            ] : [],
            // Third coin - Liquidity walls
            index === 2 ? [
              {
                type: 'liquidity_imbalance',
                icon: '🧱',
                label: 'Liquidity Walls',
                description: 'Buy & Sell walls detected',
                severity: 'high'
              }
            ] : []
          ];
          
          return {
            ...coin,
            hasSignals: sampleFilters[index].length > 0,
            activeFilters: sampleFilters[index],
            filterCount: sampleFilters[index].length
          };
        });
      }
    }
    
    let sortedData = data;
    if (sort === 'volume') {
      sortedData = data.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
    } else if (sort === 'change') {
      sortedData = data.sort((a, b) => Math.abs(b.change24h || 0) - Math.abs(a.change24h || 0));
    }

    res.json({
      success: true,
      data: sortedData.slice(0, parseInt(limit)),
      timestamp: Date.now(),
      demoMode: demo === 'true' && data.length > 0
    });
  } catch (error) {
    console.error('❌ Error fetching market data:', error);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

// GET /api/market/kline/:symbol - Get kline data for a specific symbol
router.get('/kline/:symbol', ensureMarketService, async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = '1m', limit = 100 } = req.query;
    
    const data = await marketDataService.getKlineData(symbol, interval, parseInt(limit));
    
    res.json({
      success: true,
      symbol,
      interval,
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Error fetching kline data:', error);
    res.status(500).json({ error: 'Failed to fetch kline data' });
  }
});

// GET /api/market/movers - Get top movers
router.get('/movers', ensureMarketService, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const data = await marketDataService.getTopMovers(parseInt(limit));
    
    res.json({
      success: true,
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Error fetching top movers:', error);
    res.status(500).json({ error: 'Failed to fetch top movers' });
  }
});

// GET /api/market/filters - Get current scanner filters
router.get('/filters', ensureMarketService, async (req, res) => {
  try {
    const filters = marketDataService.getFilters();
    
    res.json({
      success: true,
      filters,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Error fetching filters:', error);
    res.status(500).json({ error: 'Failed to fetch filters' });
  }
});

// PUT /api/market/filters - Update scanner filters
router.put('/filters', ensureMarketService, async (req, res) => {
  try {
    const { filters } = req.body;
    
    if (!filters || typeof filters !== 'object') {
      return res.status(400).json({ error: 'Invalid filters data' });
    }

    marketDataService.updateFilters(filters);
    const updatedFilters = marketDataService.getFilters();
    
    res.json({
      success: true,
      message: 'Filters updated successfully',
      filters: updatedFilters,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Error updating filters:', error);
    res.status(500).json({ error: 'Failed to update filters' });
  }
});

// POST /api/market/webhook - Send signal to webhook
router.post('/webhook', async (req, res) => {
  try {
    const { symbol, signal, data } = req.body;
    
    if (!symbol || !signal) {
      return res.status(400).json({ error: 'Symbol and signal are required' });
    }

    // Here you would implement webhook sending logic
    const webhookUrl = process.env.WEBHOOK_URL;
    
    if (!webhookUrl) {
      return res.status(400).json({ error: 'Webhook URL not configured' });
    }

    const payload = {
      symbol,
      signal,
      data,
      timestamp: Date.now()
    };

    // Send to webhook (you can use axios or fetch)
    const axios = require('axios');
    
    try {
      await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      res.json({
        success: true,
        message: 'Signal sent to webhook successfully',
        payload,
        timestamp: Date.now()
      });
    } catch (webhookError) {
      console.error('❌ Webhook error:', webhookError.message);
      res.status(500).json({ 
        error: 'Failed to send to webhook',
        details: webhookError.message 
      });
    }

  } catch (error) {
    console.error('❌ Error sending webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook request' });
  }
});

// GET /api/market/status - Get market service status
router.get('/status', (req, res) => {
  const status = {
    marketServiceAvailable: !!marketDataService,
    isInitialized: marketDataService ? marketDataService.isInitialized : false,
    timestamp: Date.now()
  };

  res.json({
    success: true,
    status
  });
});

// GET /api/market/symbols - Get available symbols
router.get('/symbols', ensureMarketService, async (req, res) => {
  try {
    const data = await marketDataService.getMarketData();
    const symbols = data.map(item => ({
      symbol: item.symbol,
      price: item.price,
      change24h: item.change24h,
      volume24h: item.volume24h
    }));

    res.json({
      success: true,
      symbols,
      count: symbols.length,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Error fetching symbols:', error);
    res.status(500).json({ error: 'Failed to fetch symbols' });
  }
});

// GET /api/market/all-data - Get all market data (for debugging)
router.get('/all-data', ensureMarketService, async (req, res) => {
  try {
    const { limit = 50, sort = 'volume' } = req.query;
    const data = await marketDataService.getAllMarketData();
    
    let sortedData = data;
    if (sort === 'volume') {
      sortedData = data.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
    } else if (sort === 'change') {
      sortedData = data.sort((a, b) => Math.abs(b.change24h || 0) - Math.abs(a.change24h || 0));
    }

    res.json({
      success: true,
      data: sortedData.slice(0, parseInt(limit)),
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Error fetching all market data:', error);
    res.status(500).json({ error: 'Failed to fetch all market data' });
  }
});

// GET /api/market/signals - Get current signals
router.get('/signals', ensureMarketService, async (req, res) => {
  try {
    const signals = await marketDataService.getSignals();
    
    res.json({
      success: true,
      signals,
      count: signals.length,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Error fetching signals:', error);
    res.status(500).json({ error: 'Failed to fetch signals' });
  }
});

// GET /api/market/filter-settings - Show current filter settings
router.get('/filter-settings', ensureMarketService, (req, res) => {
  try {
    const settings = marketDataService.scannerFilters;
    res.json({
      success: true,
      settings: settings,
      message: 'Current scanner filter settings',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Error getting filter settings:', error);
    res.status(500).json({ error: 'Failed to get filter settings' });
  }
});

// GET /api/market/test-filters - Test endpoint to show filter icons
router.get('/test-filters', (req, res) => {
  try {
    // Simulate coins with different filter combinations
    const testData = [
      {
        symbol: 'BTCUSDT',
        price: 120000.1,
        change24h: 2.5,
        volume24h: 82561.311,
        turnover24h: 12056280365.5551,
        timestamp: Date.now(),
        hasSignals: true,
        activeFilters: [
          {
            type: 'volume_spike',
            icon: '📈',
            label: 'Volume Spike',
            description: '25.3% above average',
            severity: 'high'
          },
          {
            type: 'price_breakout',
            icon: '🚀',
            label: 'Price Breakout',
            description: 'Upward price movement detected',
            severity: 'high'
          }
        ],
        filterCount: 2
      },
      {
        symbol: 'ETHUSDT',
        price: 4564.17,
        change24h: -1.2,
        volume24h: 11580147.51,
        turnover24h: 71696503214.0839,
        timestamp: Date.now(),
        hasSignals: true,
        activeFilters: [
          {
            type: 'spoof_detection',
            icon: '⚠️',
            label: 'Order Book Imbalance',
            description: 'Sell pressure (1.45x ratio)',
            severity: 'medium'
          },
          {
            type: 'whale_alert',
            icon: '🐋',
            label: 'Whale Activity',
            description: 'large_volume_movement: $7,169,650,321 bearish',
            severity: 'critical'
          }
        ],
        filterCount: 2
      },
      {
        symbol: 'BNBUSDT',
        price: 833.5,
        change24h: 0.8,
        volume24h: 48595.21,
        turnover24h: 37441196.543,
        timestamp: Date.now(),
        hasSignals: true,
        activeFilters: [
          {
            type: 'liquidity_imbalance',
            icon: '🧱',
            label: 'Liquidity Walls',
            description: 'Buy & Sell walls detected',
            severity: 'high'
          }
        ],
        filterCount: 1
      }
    ];

    res.json({
      success: true,
      data: testData,
      message: 'Test data showing different filter combinations',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Error generating test data:', error);
    res.status(500).json({ error: 'Failed to generate test data' });
  }
});

module.exports = router;
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
    const { limit = 50, sort = 'volume' } = req.query;
    const data = await marketDataService.getMarketData();
    
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

module.exports = router;
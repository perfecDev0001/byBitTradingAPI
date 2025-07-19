/**
 * Webhook Routes
 * Handles webhook functionality for external integrations
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();

// Store webhook history (in production, use a database)
let webhookHistory = [];
const MAX_HISTORY = 1000;

// POST /api/webhook/send - Send data to webhook
router.post('/send', async (req, res) => {
  try {
    const {
      url,
      data,
      headers = {},
      timeout = 5000,
      retries = 3
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Webhook URL is required' });
    }

    if (!data) {
      return res.status(400).json({ error: 'Data payload is required' });
    }

    const webhookPayload = {
      timestamp: Date.now(),
      source: 'bybit-trading-dashboard',
      ...data
    };

    let lastError = null;
    let success = false;
    let response = null;

    // Retry logic
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 Webhook attempt ${attempt}/${retries} to ${url}`);
        
        const startTime = Date.now();
        response = await axios.post(url, webhookPayload, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Bybit-Trading-Dashboard/1.0',
            ...headers
          },
          timeout
        });

        const duration = Date.now() - startTime;
        
        // Log successful webhook
        const historyEntry = {
          id: `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          url,
          payload: webhookPayload,
          status: 'success',
          statusCode: response.status,
          duration,
          attempt,
          response: {
            status: response.status,
            statusText: response.statusText,
            data: response.data
          }
        };

        addToHistory(historyEntry);
        success = true;
        
        console.log(`✅ Webhook sent successfully in ${duration}ms`);
        break;

      } catch (error) {
        lastError = error;
        const duration = Date.now() - startTime;
        
        console.error(`❌ Webhook attempt ${attempt} failed:`, error.message);

        // Log failed attempt
        const historyEntry = {
          id: `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          url,
          payload: webhookPayload,
          status: 'failed',
          statusCode: error.response?.status || 0,
          duration,
          attempt,
          error: {
            message: error.message,
            code: error.code,
            response: error.response ? {
              status: error.response.status,
              statusText: error.response.statusText,
              data: error.response.data
            } : null
          }
        };

        addToHistory(historyEntry);

        // Wait before retry (exponential backoff)
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (success) {
      res.json({
        success: true,
        message: 'Webhook sent successfully',
        url,
        statusCode: response.status,
        attempts: webhookHistory.filter(h => h.url === url && h.timestamp > Date.now() - 60000).length,
        timestamp: Date.now()
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Webhook failed after all retries',
        url,
        lastError: lastError.message,
        attempts: retries,
        timestamp: Date.now()
      });
    }

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Webhook request failed' });
  }
});

// POST /api/webhook/test - Test webhook endpoint
router.post('/test', async (req, res) => {
  try {
    const { url, timeout = 5000 } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Webhook URL is required' });
    }

    const testPayload = {
      type: 'test',
      message: 'This is a test webhook from Bybit Trading Dashboard',
      timestamp: Date.now(),
      source: 'bybit-trading-dashboard'
    };

    const startTime = Date.now();
    
    try {
      const response = await axios.post(url, testPayload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Bybit-Trading-Dashboard/1.0'
        },
        timeout
      });

      const duration = Date.now() - startTime;

      res.json({
        success: true,
        message: 'Webhook test successful',
        url,
        statusCode: response.status,
        statusText: response.statusText,
        duration,
        response: response.data,
        timestamp: Date.now()
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      res.status(400).json({
        success: false,
        error: 'Webhook test failed',
        url,
        message: error.message,
        statusCode: error.response?.status || 0,
        duration,
        timestamp: Date.now()
      });
    }

  } catch (error) {
    console.error('❌ Webhook test error:', error);
    res.status(500).json({ error: 'Webhook test failed' });
  }
});

// GET /api/webhook/history - Get webhook history
router.get('/history', (req, res) => {
  try {
    const {
      limit = 50,
      status,
      url,
      startDate,
      endDate
    } = req.query;

    let filteredHistory = [...webhookHistory];

    // Apply filters
    if (status) {
      filteredHistory = filteredHistory.filter(h => h.status === status);
    }

    if (url) {
      filteredHistory = filteredHistory.filter(h => h.url.includes(url));
    }

    if (startDate) {
      const start = new Date(startDate).getTime();
      filteredHistory = filteredHistory.filter(h => h.timestamp >= start);
    }

    if (endDate) {
      const end = new Date(endDate).getTime();
      filteredHistory = filteredHistory.filter(h => h.timestamp <= end);
    }

    // Sort by timestamp (newest first) and limit
    const result = filteredHistory
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      history: result,
      total: filteredHistory.length,
      filters: { limit, status, url, startDate, endDate },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error fetching webhook history:', error);
    res.status(500).json({ error: 'Failed to fetch webhook history' });
  }
});

// GET /api/webhook/stats - Get webhook statistics
router.get('/stats', (req, res) => {
  try {
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);
    const last1h = now - (60 * 60 * 1000);

    const recent24h = webhookHistory.filter(h => h.timestamp >= last24h);
    const recent1h = webhookHistory.filter(h => h.timestamp >= last1h);

    const stats = {
      total: {
        all: webhookHistory.length,
        last24h: recent24h.length,
        last1h: recent1h.length
      },
      success: {
        all: webhookHistory.filter(h => h.status === 'success').length,
        last24h: recent24h.filter(h => h.status === 'success').length,
        last1h: recent1h.filter(h => h.status === 'success').length
      },
      failed: {
        all: webhookHistory.filter(h => h.status === 'failed').length,
        last24h: recent24h.filter(h => h.status === 'failed').length,
        last1h: recent1h.filter(h => h.status === 'failed').length
      },
      avgDuration: {
        all: calculateAvgDuration(webhookHistory),
        last24h: calculateAvgDuration(recent24h),
        last1h: calculateAvgDuration(recent1h)
      },
      successRate: {
        all: calculateSuccessRate(webhookHistory),
        last24h: calculateSuccessRate(recent24h),
        last1h: calculateSuccessRate(recent1h)
      }
    };

    res.json({
      success: true,
      stats,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error calculating webhook stats:', error);
    res.status(500).json({ error: 'Failed to calculate webhook stats' });
  }
});

// DELETE /api/webhook/history - Clear webhook history
router.delete('/history', (req, res) => {
  try {
    const { olderThan } = req.query;

    if (olderThan) {
      const cutoff = new Date(olderThan).getTime();
      const originalLength = webhookHistory.length;
      webhookHistory = webhookHistory.filter(h => h.timestamp >= cutoff);
      const removed = originalLength - webhookHistory.length;

      res.json({
        success: true,
        message: `Removed ${removed} webhook entries older than ${olderThan}`,
        remaining: webhookHistory.length,
        timestamp: Date.now()
      });
    } else {
      const cleared = webhookHistory.length;
      webhookHistory = [];

      res.json({
        success: true,
        message: `Cleared ${cleared} webhook entries`,
        timestamp: Date.now()
      });
    }

  } catch (error) {
    console.error('❌ Error clearing webhook history:', error);
    res.status(500).json({ error: 'Failed to clear webhook history' });
  }
});

// POST /api/webhook/signal - Send trading signal to webhook
router.post('/signal', async (req, res) => {
  try {
    const {
      symbol,
      signal,
      price,
      volume,
      filters,
      confidence,
      webhookUrl
    } = req.body;

    if (!symbol || !signal) {
      return res.status(400).json({ error: 'Symbol and signal are required' });
    }

    const url = webhookUrl || process.env.WEBHOOK_URL;
    
    if (!url) {
      return res.status(400).json({ error: 'Webhook URL not provided' });
    }

    const signalPayload = {
      type: 'trading_signal',
      symbol,
      signal,
      price,
      volume,
      filters,
      confidence,
      timestamp: Date.now(),
      source: 'bybit-trading-dashboard'
    };

    // Use the existing send logic
    req.body = {
      url,
      data: signalPayload,
      timeout: 5000,
      retries: 2
    };

    // Forward to send endpoint
    return router.handle({ ...req, method: 'POST', url: '/send' }, res);

  } catch (error) {
    console.error('❌ Error sending signal webhook:', error);
    res.status(500).json({ error: 'Failed to send signal webhook' });
  }
});

// Helper functions
function addToHistory(entry) {
  webhookHistory.unshift(entry);
  
  // Keep only the last MAX_HISTORY entries
  if (webhookHistory.length > MAX_HISTORY) {
    webhookHistory = webhookHistory.slice(0, MAX_HISTORY);
  }
}

function calculateAvgDuration(history) {
  if (history.length === 0) return 0;
  const total = history.reduce((sum, h) => sum + (h.duration || 0), 0);
  return Math.round(total / history.length);
}

function calculateSuccessRate(history) {
  if (history.length === 0) return 0;
  const successful = history.filter(h => h.status === 'success').length;
  return Math.round((successful / history.length) * 10000) / 100; // 2 decimal places
}

module.exports = router;
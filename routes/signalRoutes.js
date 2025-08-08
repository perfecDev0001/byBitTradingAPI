/**
 * Signal Routes
 * API endpoints for signal generation and management
 */

const express = require('express');
const router = express.Router();

// Signal service will be injected
let signalService = null;

// Initialize signal service
const initializeSignalService = (service) => {
  signalService = service;
};

// GET /api/signals - Get active signals
router.get('/', (req, res) => {
  try {
    if (!signalService) {
      return res.status(500).json({ error: 'Signal service not initialized' });
    }

    const signals = signalService.getActiveSignals();
    
    res.json({
      success: true,
      data: signals,
      count: signals.length
    });
  } catch (error) {
    console.error('Error getting signals:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/signals/history - Get signal history
router.get('/history', (req, res) => {
  try {
    if (!signalService) {
      return res.status(500).json({ error: 'Signal service not initialized' });
    }

    const limit = parseInt(req.query.limit) || 100;
    const history = signalService.getSignalHistory(limit);
    
    res.json({
      success: true,
      data: history,
      count: history.length
    });
  } catch (error) {
    console.error('Error getting signal history:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/signals/statistics - Get signal statistics
router.get('/statistics', (req, res) => {
  try {
    if (!signalService) {
      return res.status(500).json({ error: 'Signal service not initialized' });
    }

    const stats = signalService.getSignalStatistics();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting signal statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/signals/start - Start signal generation
router.post('/start', (req, res) => {
  try {
    if (!signalService) {
      return res.status(500).json({ error: 'Signal service not initialized' });
    }

    const { coins } = req.body;
    const result = signalService.startSignalGeneration(coins);
    
    res.json(result);
  } catch (error) {
    console.error('Error starting signal generation:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/signals/stop - Stop signal generation
router.post('/stop', (req, res) => {
  try {
    if (!signalService) {
      return res.status(500).json({ error: 'Signal service not initialized' });
    }

    const result = signalService.stopSignalGeneration();
    
    res.json(result);
  } catch (error) {
    console.error('Error stopping signal generation:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/signals/:id/status - Update signal status
router.put('/:id/status', (req, res) => {
  try {
    if (!signalService) {
      return res.status(500).json({ error: 'Signal service not initialized' });
    }

    const { id } = req.params;
    const { status, hitPrice } = req.body;
    
    const updatedSignal = signalService.updateSignalStatus(id, status, hitPrice);
    
    if (!updatedSignal) {
      return res.status(404).json({ error: 'Signal not found' });
    }
    
    res.json({
      success: true,
      data: updatedSignal
    });
  } catch (error) {
    console.error('Error updating signal status:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/signals/settings - Get signal settings
router.get('/settings', (req, res) => {
  try {
    if (!signalService) {
      return res.status(500).json({ error: 'Signal service not initialized' });
    }

    const settings = signalService.getSettings();
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error getting signal settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/signals/settings - Update signal settings
router.put('/settings', (req, res) => {
  try {
    if (!signalService) {
      return res.status(500).json({ error: 'Signal service not initialized' });
    }

    const result = signalService.updateSettings(req.body);
    
    res.json(result);
  } catch (error) {
    console.error('Error updating signal settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/signals/coins - Update selected coins
router.put('/coins', (req, res) => {
  try {
    if (!signalService) {
      return res.status(500).json({ error: 'Signal service not initialized' });
    }

    const { coins } = req.body;
    
    if (!Array.isArray(coins)) {
      return res.status(400).json({ error: 'Coins must be an array' });
    }
    
    const result = signalService.updateSelectedCoins(coins);
    
    res.json(result);
  } catch (error) {
    console.error('Error updating selected coins:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/signals/:id/cordly - Format signal for Cordly
router.post('/:id/cordly', (req, res) => {
  try {
    if (!signalService) {
      return res.status(500).json({ error: 'Signal service not initialized' });
    }

    const { id } = req.params;
    const signals = signalService.getActiveSignals();
    const signal = signals.find(s => s.id === id);
    
    if (!signal) {
      return res.status(404).json({ error: 'Signal not found' });
    }
    
    const cordlyFormat = signalService.formatForCordly(signal);
    
    res.json({
      success: true,
      data: cordlyFormat
    });
  } catch (error) {
    console.error('Error formatting signal for Cordly:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/signals/webhook/cordly - Webhook endpoint for Cordly
router.post('/webhook/cordly', (req, res) => {
  try {
    // This endpoint can be used by external services to send signals to Cordly
    const { webhookUrl, signal } = req.body;
    
    if (!webhookUrl || !signal) {
      return res.status(400).json({ error: 'Webhook URL and signal data required' });
    }
    
    // In a real implementation, you would send the signal to the webhook URL
    console.log('Sending signal to Cordly webhook:', webhookUrl, signal);
    
    res.json({
      success: true,
      message: 'Signal sent to Cordly webhook'
    });
  } catch (error) {
    console.error('Error sending to Cordly webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/signals/clear - Clear all signals (for testing)
router.delete('/clear', (req, res) => {
  try {
    if (!signalService) {
      return res.status(500).json({ error: 'Signal service not initialized' });
    }

    const result = signalService.clearAllSignals();
    
    res.json(result);
  } catch (error) {
    console.error('Error clearing signals:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, initializeSignalService };
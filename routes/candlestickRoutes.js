/**
 * Candlestick Analysis Routes
 * Handles candlestick pattern analysis and signal generation
 */

const express = require('express');
const CandlestickService = require('../services/CandlestickService');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const candlestickService = new CandlestickService();
const settingsFile = path.join(__dirname, '../data/settings.json');

// Helper function to load settings
async function loadSettings() {
  try {
    const data = await fs.readFile(settingsFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Error loading settings:', error);
    return null;
  }
}

// POST /api/candlestick/analyze - Analyze candlestick data
router.post('/analyze', async (req, res) => {
  try {
    const { candleData, symbol, interval, customSettings } = req.body;

    if (!candleData || !Array.isArray(candleData)) {
      return res.status(400).json({ 
        error: 'Invalid candleData. Expected array of OHLCV data.' 
      });
    }

    // Load current settings
    const settings = await loadSettings();
    const candlestickSettings = customSettings || settings?.candlestickLogic || {};

    // Perform analysis
    const analysis = candlestickService.analyzeCandlesticks(candleData, candlestickSettings);
    const formattedResults = candlestickService.formatResults(analysis);

    res.json({
      success: true,
      symbol: symbol || 'UNKNOWN',
      interval: interval || '1m',
      dataPoints: candleData.length,
      analysis: formattedResults,
      settings: {
        patternRecognition: candlestickSettings.patternRecognition?.enabled || false,
        trendAnalysis: candlestickSettings.trendAnalysis?.enabled || false,
        volumeAnalysis: candlestickSettings.volumeAnalysis || false
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Candlestick analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze candlestick data',
      details: error.message 
    });
  }
});

// GET /api/candlestick/patterns - Get available patterns
router.get('/patterns', (req, res) => {
  try {
    const patterns = {
      doji: {
        name: 'Doji',
        type: 'reversal',
        description: 'Market indecision, potential reversal signal',
        reliability: 'medium'
      },
      hammer: {
        name: 'Hammer',
        type: 'bullish_reversal',
        description: 'Bullish reversal pattern with long lower shadow',
        reliability: 'high'
      },
      shootingStar: {
        name: 'Shooting Star',
        type: 'bearish_reversal',
        description: 'Bearish reversal pattern with long upper shadow',
        reliability: 'high'
      },
      engulfing: {
        name: 'Engulfing',
        type: 'reversal',
        description: 'Strong reversal pattern where current candle engulfs previous',
        reliability: 'very_high'
      },
      harami: {
        name: 'Harami',
        type: 'reversal',
        description: 'Reversal pattern with small candle inside previous large candle',
        reliability: 'medium'
      }
    };

    res.json({
      success: true,
      patterns,
      count: Object.keys(patterns).length,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error getting patterns:', error);
    res.status(500).json({ error: 'Failed to get pattern information' });
  }
});

// POST /api/candlestick/test - Test analysis with sample data
router.post('/test', async (req, res) => {
  try {
    // Generate sample candlestick data
    const sampleData = generateSampleCandleData(50);
    
    // Load settings
    const settings = await loadSettings();
    const candlestickSettings = settings?.candlestickLogic || {};

    // Perform analysis
    const analysis = candlestickService.analyzeCandlesticks(sampleData, candlestickSettings);
    const formattedResults = candlestickService.formatResults(analysis);

    res.json({
      success: true,
      message: 'Test analysis completed',
      sampleData: sampleData.slice(-5), // Return last 5 candles
      analysis: formattedResults,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Test analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to run test analysis',
      details: error.message 
    });
  }
});

// GET /api/candlestick/settings - Get current candlestick settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await loadSettings();
    const candlestickSettings = settings?.candlestickLogic || {};

    res.json({
      success: true,
      settings: candlestickSettings,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error getting candlestick settings:', error);
    res.status(500).json({ error: 'Failed to get candlestick settings' });
  }
});

// POST /api/candlestick/validate-settings - Validate candlestick settings
router.post('/validate-settings', (req, res) => {
  try {
    const { settings } = req.body;
    const errors = [];
    const warnings = [];

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings data' });
    }

    // Validate intervals
    if (settings.intervals && Array.isArray(settings.intervals)) {
      const validIntervals = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
      const invalidIntervals = settings.intervals.filter(i => !validIntervals.includes(i));
      if (invalidIntervals.length > 0) {
        errors.push(`Invalid intervals: ${invalidIntervals.join(', ')}`);
      }
    }

    // Validate default interval
    if (settings.defaultInterval && !settings.intervals?.includes(settings.defaultInterval)) {
      errors.push('Default interval must be included in intervals array');
    }

    // Validate pattern recognition settings
    if (settings.patternRecognition?.patterns) {
      Object.entries(settings.patternRecognition.patterns).forEach(([pattern, config]) => {
        if (config.sensitivity && (config.sensitivity < 0.01 || config.sensitivity > 1)) {
          errors.push(`${pattern} sensitivity must be between 0.01 and 1`);
        }
      });
    }

    // Validate trend analysis settings
    if (settings.trendAnalysis?.periods) {
      const periods = settings.trendAnalysis.periods;
      if (!Array.isArray(periods) || periods.some(p => p < 5 || p > 500)) {
        errors.push('Trend analysis periods must be between 5 and 500');
      }
    }

    // Validate volatility thresholds
    if (settings.volatilityThresholds) {
      const { low, medium, high } = settings.volatilityThresholds;
      if (low >= medium || medium >= high) {
        errors.push('Volatility thresholds must be in ascending order: low < medium < high');
      }
    }

    // Performance warnings
    if (settings.intervals?.length > 4) {
      warnings.push('Using many intervals may impact performance');
    }

    if (settings.trendAnalysis?.periods?.some(p => p > 200)) {
      warnings.push('Large trend analysis periods may require more historical data');
    }

    const isValid = errors.length === 0;

    res.json({
      success: true,
      valid: isValid,
      errors,
      warnings,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Settings validation error:', error);
    res.status(500).json({ error: 'Settings validation failed' });
  }
});

// POST /api/candlestick/signals - Generate trading signals
router.post('/signals', async (req, res) => {
  try {
    const { candleData, symbol, filters } = req.body;

    if (!candleData || !Array.isArray(candleData)) {
      return res.status(400).json({ 
        error: 'Invalid candleData. Expected array of OHLCV data.' 
      });
    }

    // Load settings
    const settings = await loadSettings();
    const candlestickSettings = settings?.candlestickLogic || {};
    const filterSettings = settings?.filters || {};

    // Perform analysis
    const analysis = candlestickService.analyzeCandlesticks(candleData, candlestickSettings);

    // Filter signals based on user preferences
    let filteredSignals = analysis.signals || [];
    
    if (filters?.minConfidence) {
      filteredSignals = filteredSignals.filter(s => s.confidence >= filters.minConfidence);
    }

    if (filters?.signalTypes) {
      filteredSignals = filteredSignals.filter(s => filters.signalTypes.includes(s.type));
    }

    // Apply risk filters
    const riskSettings = settings?.riskManagement || {};
    const signalsWithRisk = filteredSignals.map(signal => ({
      ...signal,
      riskAssessment: {
        stopLoss: riskSettings.defaultStopLoss || 0.02,
        positionSize: riskSettings.defaultPositionSize || 100,
        leverage: riskSettings.defaultLeverage || 1
      }
    }));

    res.json({
      success: true,
      symbol: symbol || 'UNKNOWN',
      totalSignals: analysis.signals?.length || 0,
      filteredSignals: signalsWithRisk.length,
      signals: signalsWithRisk,
      confidence: analysis.confidence,
      filters: {
        applied: !!filters,
        minConfidence: filters?.minConfidence,
        signalTypes: filters?.signalTypes
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Signal generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate signals',
      details: error.message 
    });
  }
});

// Helper function to generate sample candlestick data
function generateSampleCandleData(count = 50) {
  const data = [];
  let price = 50000; // Starting price
  
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.02; // ±1% change
    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = Math.random() * 1000000;
    
    data.push({
      timestamp: Date.now() - (count - i) * 60000, // 1 minute intervals
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(volume)
    });
    
    price = close;
  }
  
  return data;
}

module.exports = router;
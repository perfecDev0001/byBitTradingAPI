/**
 * Backtesting Routes
 * Handles all backtesting related endpoints
 */

const express = require('express');
const BacktestingService = require('../services/BacktestingService');
const router = express.Router();

const backtestingService = new BacktestingService();

// POST /api/backtesting/run - Run a backtest
router.post('/run', async (req, res) => {
  try {
    const {
      symbols,
      startDate,
      endDate,
      filters,
      riskSettings,
      capital
    } = req.body;

    // Validation
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'Symbols array is required' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }

    if (!capital || capital <= 0) {
      return res.status(400).json({ error: 'Valid capital amount is required' });
    }

    // Default values
    const backtestParams = {
      symbols,
      startDate,
      endDate,
      filters: {
        volumeSpike: true,
        volumeSpikeThreshold: filters?.volumeSpikeThreshold || 1.2,
        priceBreakout: true,
        priceBreakoutThreshold: filters?.priceBreakoutThreshold || 0.01,
        spoofDetection: filters?.spoofDetection || false,
        whaleAlerts: filters?.whaleAlerts || false,
        liquidityImbalance: filters?.liquidityImbalance || false,
        ...filters
      },
      riskSettings: {
        stopLoss: riskSettings?.stopLoss || 0.02, // 2%
        tp1: riskSettings?.tp1 || 0.015, // 1.5%
        tp2: riskSettings?.tp2 || 0.03, // 3%
        leverage: riskSettings?.leverage || 1,
        riskPerTrade: riskSettings?.riskPerTrade || 0.02, // 2%
        maxSignalsPerDay: riskSettings?.maxSignalsPerDay || 10,
        ...riskSettings
      },
      capital
    };

    console.log('🔄 Starting backtest with params:', backtestParams);

    const results = await backtestingService.runBacktest(backtestParams);

    res.json({
      success: true,
      results,
      params: backtestParams,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Backtest error:', error);
    res.status(500).json({ 
      error: 'Backtest failed',
      message: error.message 
    });
  }
});

// GET /api/backtesting/presets - Get preset configurations
router.get('/presets', (req, res) => {
  const presets = {
    conservative: {
      name: 'Conservative',
      description: 'Low risk, steady returns',
      filters: {
        volumeSpikeThreshold: 1.5,
        priceBreakoutThreshold: 0.005,
        spoofDetection: true,
        whaleAlerts: true,
        liquidityImbalance: true
      },
      riskSettings: {
        stopLoss: 0.015, // 1.5%
        tp1: 0.01, // 1%
        tp2: 0.02, // 2%
        leverage: 1,
        riskPerTrade: 0.01, // 1%
        maxSignalsPerDay: 5
      }
    },
    moderate: {
      name: 'Moderate',
      description: 'Balanced risk and reward',
      filters: {
        volumeSpikeThreshold: 1.2,
        priceBreakoutThreshold: 0.01,
        spoofDetection: true,
        whaleAlerts: false,
        liquidityImbalance: true
      },
      riskSettings: {
        stopLoss: 0.02, // 2%
        tp1: 0.015, // 1.5%
        tp2: 0.03, // 3%
        leverage: 2,
        riskPerTrade: 0.02, // 2%
        maxSignalsPerDay: 10
      }
    },
    aggressive: {
      name: 'Aggressive',
      description: 'High risk, high reward potential',
      filters: {
        volumeSpikeThreshold: 1.1,
        priceBreakoutThreshold: 0.015,
        spoofDetection: false,
        whaleAlerts: false,
        liquidityImbalance: false
      },
      riskSettings: {
        stopLoss: 0.03, // 3%
        tp1: 0.02, // 2%
        tp2: 0.05, // 5%
        leverage: 5,
        riskPerTrade: 0.03, // 3%
        maxSignalsPerDay: 20
      }
    }
  };

  res.json({
    success: true,
    presets,
    timestamp: Date.now()
  });
});

// GET /api/backtesting/symbols - Get available symbols for backtesting
router.get('/symbols', async (req, res) => {
  try {
    // This would typically come from your market data service
    // For now, return a list of popular USDT pairs
    const symbols = [
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT',
      'SOLUSDT', 'DOTUSDT', 'DOGEUSDT', 'AVAXUSDT', 'MATICUSDT',
      'LINKUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'FILUSDT',
      'ETCUSDT', 'XLMUSDT', 'VETUSDT', 'TRXUSDT', 'ICPUSDT'
    ];

    res.json({
      success: true,
      symbols: symbols.map(symbol => ({
        symbol,
        name: symbol.replace('USDT', ''),
        category: 'linear'
      })),
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error fetching symbols:', error);
    res.status(500).json({ error: 'Failed to fetch symbols' });
  }
});

// POST /api/backtesting/validate - Validate backtest parameters
router.post('/validate', (req, res) => {
  try {
    const {
      symbols,
      startDate,
      endDate,
      filters,
      riskSettings,
      capital
    } = req.body;

    const errors = [];
    const warnings = [];

    // Validate symbols
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      errors.push('At least one symbol is required');
    } else if (symbols.length > 20) {
      warnings.push('Testing more than 20 symbols may take a long time');
    }

    // Validate dates
    if (!startDate || !endDate) {
      errors.push('Start date and end date are required');
    } else {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const now = new Date();

      if (start >= end) {
        errors.push('Start date must be before end date');
      }

      if (end > now) {
        errors.push('End date cannot be in the future');
      }

      const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
      if (daysDiff > 365) {
        warnings.push('Backtesting periods longer than 1 year may take significant time');
      }

      if (daysDiff < 7) {
        warnings.push('Short backtesting periods may not provide reliable results');
      }
    }

    // Validate capital
    if (!capital || capital <= 0) {
      errors.push('Capital must be a positive number');
    } else if (capital < 100) {
      warnings.push('Small capital amounts may not reflect realistic trading conditions');
    }

    // Validate risk settings
    if (riskSettings) {
      if (riskSettings.leverage && (riskSettings.leverage < 1 || riskSettings.leverage > 100)) {
        errors.push('Leverage must be between 1 and 100');
      }

      if (riskSettings.stopLoss && (riskSettings.stopLoss <= 0 || riskSettings.stopLoss > 0.5)) {
        errors.push('Stop loss must be between 0% and 50%');
      }

      if (riskSettings.tp1 && riskSettings.tp2 && riskSettings.tp1 >= riskSettings.tp2) {
        errors.push('Take Profit 1 must be less than Take Profit 2');
      }

      if (riskSettings.leverage && riskSettings.leverage > 10) {
        warnings.push('High leverage increases risk significantly');
      }
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
    console.error('❌ Validation error:', error);
    res.status(500).json({ error: 'Validation failed' });
  }
});

// GET /api/backtesting/history - Get backtest history (if you want to store results)
router.get('/history', (req, res) => {
  // This would typically fetch from a database
  // For now, return empty array
  res.json({
    success: true,
    history: [],
    message: 'Backtest history feature coming soon',
    timestamp: Date.now()
  });
});

module.exports = router;
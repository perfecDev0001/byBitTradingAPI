/**
 * Settings Routes
 * Handles all application settings and configuration endpoints
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const settingsFile = path.join(__dirname, '../data/settings.json');

// Default settings
const defaultSettings = {
  filters: {
    volumeSpike: {
      enabled: true,
      threshold: 1.2
    },
    priceBreakout: {
      enabled: true,
      threshold: 0.01
    },
    spoofDetection: {
      enabled: false,
      sensitivity: 0.5
    },
    whaleAlerts: {
      enabled: false,
      minAmount: 100000
    },
    liquidityImbalance: {
      enabled: false,
      threshold: 0.3
    }
  },
  candlestickLogic: {
    intervals: ['1m', '5m'],
    defaultInterval: '1m',
    volumeAnalysis: true,
    priceActionAnalysis: true,
    supportResistanceAnalysis: false
  },
  riskManagement: {
    defaultStopLoss: 0.02, // 2%
    defaultTakeProfit1: 0.015, // 1.5%
    defaultTakeProfit2: 0.03, // 3%
    defaultLeverage: 1,
    defaultPositionSize: 100, // USD
    maxPositionSize: 1000, // USD
    maxDailyLoss: 500, // USD
    maxOpenPositions: 5
  },
  notifications: {
    webhook: {
      enabled: false,
      url: '',
      timeout: 5000,
      retries: 3
    },
    email: {
      enabled: false,
      recipients: [],
      onSignal: true,
      onTrade: true,
      dailySummary: false
    },
    discord: {
      enabled: false,
      webhookUrl: '',
      onSignal: true,
      onTrade: false
    }
  },
  display: {
    theme: 'dark',
    currency: 'USD',
    timezone: 'UTC',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: '24h',
    decimalPlaces: 2
  },
  scanner: {
    maxSymbols: 50,
    updateInterval: 1000, // ms
    autoRefresh: true,
    soundAlerts: false,
    popupAlerts: true
  },
  api: {
    bybit: {
      testnet: process.env.BYBIT_TESTNET === 'true',
      timeout: 10000,
      retries: 3
    },
    rateLimit: {
      enabled: true,
      requestsPerMinute: 100
    }
  }
};

// Helper function to load settings
async function loadSettings() {
  try {
    // Create data directory if it doesn't exist
    const dataDir = path.dirname(settingsFile);
    await fs.mkdir(dataDir, { recursive: true });

    const data = await fs.readFile(settingsFile, 'utf8');
    return { ...defaultSettings, ...JSON.parse(data) };
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, create with defaults
      await saveSettings(defaultSettings);
      return defaultSettings;
    }
    throw error;
  }
}

// Helper function to save settings
async function saveSettings(settings) {
  try {
    await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('❌ Error saving settings:', error);
    throw error;
  }
}

// GET /api/settings - Get all settings
router.get('/', async (req, res) => {
  try {
    const settings = await loadSettings();
    
    res.json({
      success: true,
      settings,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error loading settings:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// GET /api/settings/:category - Get specific category settings
router.get('/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const settings = await loadSettings();

    if (!settings[category]) {
      return res.status(404).json({ error: 'Settings category not found' });
    }

    res.json({
      success: true,
      category,
      settings: settings[category],
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error loading category settings:', error);
    res.status(500).json({ error: 'Failed to load category settings' });
  }
});

// PUT /api/settings - Update all settings
router.put('/', async (req, res) => {
  try {
    const { settings: newSettings } = req.body;

    if (!newSettings || typeof newSettings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings data' });
    }

    // Merge with existing settings
    const currentSettings = await loadSettings();
    const updatedSettings = { ...currentSettings, ...newSettings };

    await saveSettings(updatedSettings);

    res.json({
      success: true,
      settings: updatedSettings,
      message: 'Settings updated successfully',
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// PUT /api/settings/:category - Update specific category settings
router.put('/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const { settings: categorySettings } = req.body;

    if (!categorySettings || typeof categorySettings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings data' });
    }

    const currentSettings = await loadSettings();

    if (!currentSettings[category]) {
      return res.status(404).json({ error: 'Settings category not found' });
    }

    // Update specific category
    currentSettings[category] = { ...currentSettings[category], ...categorySettings };

    await saveSettings(currentSettings);

    res.json({
      success: true,
      category,
      settings: currentSettings[category],
      message: `${category} settings updated successfully`,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error updating category settings:', error);
    res.status(500).json({ error: 'Failed to update category settings' });
  }
});

// POST /api/settings/reset - Reset settings to defaults
router.post('/reset', async (req, res) => {
  try {
    const { category } = req.body;

    if (category) {
      // Reset specific category
      const currentSettings = await loadSettings();
      
      if (!defaultSettings[category]) {
        return res.status(404).json({ error: 'Settings category not found' });
      }

      currentSettings[category] = defaultSettings[category];
      await saveSettings(currentSettings);

      res.json({
        success: true,
        category,
        settings: currentSettings[category],
        message: `${category} settings reset to defaults`,
        timestamp: Date.now()
      });
    } else {
      // Reset all settings
      await saveSettings(defaultSettings);

      res.json({
        success: true,
        settings: defaultSettings,
        message: 'All settings reset to defaults',
        timestamp: Date.now()
      });
    }

  } catch (error) {
    console.error('❌ Error resetting settings:', error);
    res.status(500).json({ error: 'Failed to reset settings' });
  }
});

// GET /api/settings/defaults - Get default settings
router.get('/defaults', (req, res) => {
  res.json({
    success: true,
    defaults: defaultSettings,
    timestamp: Date.now()
  });
});

// POST /api/settings/validate - Validate settings
router.post('/validate', (req, res) => {
  try {
    const { settings } = req.body;
    const errors = [];
    const warnings = [];

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings data' });
    }

    // Validate filters
    if (settings.filters) {
      if (settings.filters.volumeSpike?.threshold && 
          (settings.filters.volumeSpike.threshold < 1 || settings.filters.volumeSpike.threshold > 10)) {
        errors.push('Volume spike threshold must be between 1 and 10');
      }

      if (settings.filters.priceBreakout?.threshold && 
          (settings.filters.priceBreakout.threshold < 0.001 || settings.filters.priceBreakout.threshold > 0.1)) {
        errors.push('Price breakout threshold must be between 0.1% and 10%');
      }
    }

    // Validate risk management
    if (settings.riskManagement) {
      const rm = settings.riskManagement;

      if (rm.defaultStopLoss && (rm.defaultStopLoss < 0.005 || rm.defaultStopLoss > 0.5)) {
        errors.push('Default stop loss must be between 0.5% and 50%');
      }

      if (rm.defaultLeverage && (rm.defaultLeverage < 1 || rm.defaultLeverage > 100)) {
        errors.push('Default leverage must be between 1 and 100');
      }

      if (rm.defaultPositionSize && rm.defaultPositionSize < 1) {
        errors.push('Default position size must be at least $1');
      }

      if (rm.maxOpenPositions && (rm.maxOpenPositions < 1 || rm.maxOpenPositions > 50)) {
        errors.push('Max open positions must be between 1 and 50');
      }

      if (rm.defaultLeverage && rm.defaultLeverage > 10) {
        warnings.push('High leverage increases risk significantly');
      }
    }

    // Validate notifications
    if (settings.notifications?.webhook?.enabled && !settings.notifications.webhook.url) {
      errors.push('Webhook URL is required when webhook notifications are enabled');
    }

    if (settings.notifications?.email?.enabled && 
        (!settings.notifications.email.recipients || settings.notifications.email.recipients.length === 0)) {
      errors.push('Email recipients are required when email notifications are enabled');
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

// POST /api/settings/export - Export settings
router.post('/export', async (req, res) => {
  try {
    const settings = await loadSettings();
    const exportData = {
      settings,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=bybit-dashboard-settings.json');
    res.json(exportData);

  } catch (error) {
    console.error('❌ Error exporting settings:', error);
    res.status(500).json({ error: 'Failed to export settings' });
  }
});

// POST /api/settings/import - Import settings
router.post('/import', async (req, res) => {
  try {
    const { settings: importedSettings, overwrite = false } = req.body;

    if (!importedSettings || typeof importedSettings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings data' });
    }

    let finalSettings;
    
    if (overwrite) {
      finalSettings = { ...defaultSettings, ...importedSettings };
    } else {
      const currentSettings = await loadSettings();
      finalSettings = { ...currentSettings, ...importedSettings };
    }

    await saveSettings(finalSettings);

    res.json({
      success: true,
      settings: finalSettings,
      message: 'Settings imported successfully',
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error importing settings:', error);
    res.status(500).json({ error: 'Failed to import settings' });
  }
});

module.exports = router;
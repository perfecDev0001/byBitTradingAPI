/**
 * Signal Service
 * Handles signal generation and management for trading
 */

const EventEmitter = require('events');

class SignalService extends EventEmitter {
  constructor() {
    super();
    this.signals = new Map(); // Active signals
    this.signalHistory = []; // Historical signals
    this.isGenerating = false;
    this.selectedCoins = [
      'BTCUSDT', 'ETHUSDT', 'REZUSDT', 'QUICKUSDT', 'HMSTRUSDT', 
      'AINUSDT', 'JASMYUSDT', 'LINKUSDT', 'SLFUSDT', 'GODSUSDT', 
      'DOGEUSDT', 'ICPUSDT', 'CATIUSDT', 'XRPUSDT', 'GMTUSDT', 
      'ORDERUSDT', 'BLURUSDT', 'MAVUSDT'
    ];
    this.signalInterval = null; // Interval for signal generation
    this.marketDataService = null; // Will be injected
    this.settings = {
      minConfidence: 10, // Ultra-low threshold to ensure signals are generated
      leverage: '20x',
      signalTypes: {
        volumeSpike: true,
        priceBreakout: true,
        whaleAlert: true,
        spoofDetection: true,
        liquidityImbalance: true
      },
      tpLevels: 4, // Always 4 TP levels for Cordly
      riskRewardRatio: {
        tp1: 0.02, // 2%
        tp2: 0.04, // 4%
        tp3: 0.06, // 6%
        tp4: 0.08, // 8%
        sl: 0.035  // 3.5%
      }
    };
  }

  // Start signal generation
  startSignalGeneration(coins = null) {
    if (coins && Array.isArray(coins) && coins.length > 0) {
      this.selectedCoins = coins;
      console.log(`🎯 Signal generation started for selected coins: ${coins.join(', ')}`);
    } else {
      console.log(`🎯 Signal generation started - no specific coins selected`);
    }
    
    this.isGenerating = true;
    
    // Start the signal generation interval
    this.startSignalGenerationLoop();
    
    this.emit('generationStarted', {
      coins: this.selectedCoins,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      message: `Signal generation started for ${this.selectedCoins.length} coins`,
      coins: this.selectedCoins
    };
  }

  // Stop signal generation
  stopSignalGeneration() {
    console.log(`🛑 Signal generation stopped`);
    this.isGenerating = false;
    
    // Clear the signal generation interval
    if (this.signalInterval) {
      clearInterval(this.signalInterval);
      this.signalInterval = null;
    }
    
    console.log('⏸️ Signal generation stopped');
    
    this.emit('generationStopped', {
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      message: 'Signal generation stopped'
    };
  }

  // Generate signal from market data
  generateSignal(marketData, signalTypes = []) {
    if (!this.isGenerating) return null;
    
    const { symbol, price, change24h, volume24h } = marketData;
    
    // Only generate signals for selected coins from frontend
    if (this.selectedCoins.length > 0 && !this.selectedCoins.includes(symbol)) return null;
    
    // Calculate confidence based on signal strength
    const confidence = this.calculateConfidence(marketData, signalTypes);
    
    // Check minimum confidence threshold
    console.log(`📊 Signal confidence for ${symbol}: ${confidence}% (min: ${this.settings.minConfidence}%)`);
    if (confidence < this.settings.minConfidence) {
      console.log(`❌ Signal rejected for ${symbol}: confidence ${confidence}% < ${this.settings.minConfidence}%`);
      return null;
    }
    
    // Determine signal direction
    const direction = this.determineDirection(marketData, signalTypes);
    
    // Calculate entry price and levels
    const entry = price;
    const levels = this.calculateTradingLevels(entry, direction);
    
    const signal = {
      id: `signal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      direction,
      leverage: this.settings.leverage,
      entry: parseFloat(entry.toFixed(2)),
      tp1: parseFloat(levels.tp1.toFixed(2)),
      tp2: parseFloat(levels.tp2.toFixed(2)),
      tp3: parseFloat(levels.tp3.toFixed(2)),
      tp4: parseFloat(levels.tp4.toFixed(2)),
      sl: parseFloat(levels.sl.toFixed(2)),
      timestamp: new Date().toISOString(),
      status: 'active',
      confidence,
      signalType: signalTypes,
      marketData: {
        price,
        change24h,
        volume24h
      }
    };
    
    // Store signal
    this.signals.set(signal.id, signal);
    
    // Emit signal event
    this.emit('newSignal', signal);
    
    console.log(`📊 New ${direction} signal generated for ${symbol} (${confidence}% confidence)`);
    
    return signal;
  }

  // Calculate confidence based on signal strength
  calculateConfidence(marketData, signalTypes) {
    let baseConfidence = 30; // Lower base confidence to ensure signals are generated
    
    // Volume spike adds confidence
    if (signalTypes.includes('volumeSpike') || signalTypes.includes('volume_spike')) {
      baseConfidence += 15;
    }
    
    // Price breakout adds confidence
    if (signalTypes.includes('priceBreakout') || signalTypes.includes('price_breakout')) {
      baseConfidence += 20;
    }
    
    // Whale activity adds confidence
    if (signalTypes.includes('whaleAlert') || signalTypes.includes('whale_alert')) {
      baseConfidence += 10;
    }
    
    // Spoof detection adds confidence
    if (signalTypes.includes('spoofDetection') || signalTypes.includes('spoof_detection')) {
      baseConfidence += 12;
    }
    
    // Liquidity imbalance adds confidence
    if (signalTypes.includes('liquidityImbalance') || signalTypes.includes('liquidity_imbalance')) {
      baseConfidence += 8;
    }
    
    // Basic activity adds minimal confidence (fallback)
    if (signalTypes.includes('basic_activity')) {
      baseConfidence += 5;
    }
    
    // Multiple signal types increase confidence
    if (signalTypes.length > 2) {
      baseConfidence += 10;
    }
    
    // Use actual market data to adjust confidence
    const { change24h, volume24h } = marketData;
    
    // Strong price movement increases confidence
    if (Math.abs(change24h) > 5) {
      baseConfidence += 5;
    }
    
    // High volume increases confidence
    if (volume24h > 100000000) { // 100M+ volume
      baseConfidence += 5;
    }
    
    return Math.min(95, Math.max(50, Math.round(baseConfidence)));
  }

  // Determine signal direction
  determineDirection(marketData, signalTypes) {
    const { change24h } = marketData;
    
    // Use price change as primary indicator
    if (change24h > 0) {
      return 'LONG';
    } else {
      return 'SHORT';
    }
  }

  // Calculate trading levels (TP1-4 and SL)
  calculateTradingLevels(entry, direction) {
    const { riskRewardRatio } = this.settings;
    
    if (direction === 'LONG') {
      return {
        tp1: entry * (1 + riskRewardRatio.tp1),
        tp2: entry * (1 + riskRewardRatio.tp2),
        tp3: entry * (1 + riskRewardRatio.tp3),
        tp4: entry * (1 + riskRewardRatio.tp4),
        sl: entry * (1 - riskRewardRatio.sl)
      };
    } else {
      return {
        tp1: entry * (1 - riskRewardRatio.tp1),
        tp2: entry * (1 - riskRewardRatio.tp2),
        tp3: entry * (1 - riskRewardRatio.tp3),
        tp4: entry * (1 - riskRewardRatio.tp4),
        sl: entry * (1 + riskRewardRatio.sl)
      };
    }
  }

  // Update signal status (TP hit, SL hit, etc.)
  updateSignalStatus(signalId, status, hitPrice = null) {
    const signal = this.signals.get(signalId);
    if (!signal) return null;
    
    signal.status = status;
    signal.updatedAt = new Date().toISOString();
    
    if (hitPrice) {
      signal.exitPrice = hitPrice;
    }
    
    // Move to history if signal is closed
    if (['tp1_hit', 'tp2_hit', 'tp3_hit', 'tp4_hit', 'sl_hit', 'expired'].includes(status)) {
      this.signalHistory.push(signal);
      this.signals.delete(signalId);
      
      // Keep only last 1000 historical signals
      if (this.signalHistory.length > 1000) {
        this.signalHistory = this.signalHistory.slice(-1000);
      }
    }
    
    this.emit('signalUpdated', signal);
    
    return signal;
  }

  // Get active signals
  getActiveSignals() {
    return Array.from(this.signals.values()).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  // Get signal history
  getSignalHistory(limit = 100) {
    return this.signalHistory
      .slice(-limit)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // Get signal statistics
  getSignalStatistics() {
    const activeSignals = this.getActiveSignals();
    const historicalSignals = this.signalHistory;
    
    const totalSignals = activeSignals.length + historicalSignals.length;
    const successfulSignals = historicalSignals.filter(s => s.status.includes('tp')).length;
    const failedSignals = historicalSignals.filter(s => s.status === 'sl_hit').length;
    
    const successRate = (successfulSignals + failedSignals) > 0 
      ? (successfulSignals / (successfulSignals + failedSignals)) * 100 
      : 0;
    
    return {
      totalSignals,
      activeSignals: activeSignals.length,
      successfulSignals,
      failedSignals,
      successRate: parseFloat(successRate.toFixed(1)),
      isGenerating: this.isGenerating,
      selectedCoins: this.selectedCoins
    };
  }

  // Format signal for Cordly
  formatForCordly(signal) {
    return {
      symbol: signal.symbol,
      leverage: signal.leverage,
      direction: signal.direction,
      entry: signal.entry,
      tp1: signal.tp1,
      tp2: signal.tp2,
      tp3: signal.tp3,
      tp4: signal.tp4,
      sl: signal.sl,
      timestamp: signal.timestamp,
      confidence: signal.confidence
    };
  }

  // Update settings
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    
    this.emit('settingsUpdated', this.settings);
    
    return {
      success: true,
      settings: this.settings
    };
  }

  // Get current settings
  getSettings() {
    return this.settings;
  }

  // Update selected coins
  updateSelectedCoins(coins) {
    this.selectedCoins = coins;
    
    this.emit('coinsUpdated', this.selectedCoins);
    
    return {
      success: true,
      selectedCoins: this.selectedCoins
    };
  }

  // Clear all signals (for testing/reset)
  clearAllSignals() {
    this.signals.clear();
    this.signalHistory = [];
    
    this.emit('signalsCleared');
    
    return {
      success: true,
      message: 'All signals cleared'
    };
  }

  // Set market data service reference
  setMarketDataService(marketDataService) {
    this.marketDataService = marketDataService;
  }

  // Start signal generation loop
  startSignalGenerationLoop() {
    if (this.signalInterval) {
      clearInterval(this.signalInterval);
    }

    console.log('🔄 Starting real-time signal generation with market data...');
    
    // Only use real market data - no demo mode
    if (this.marketDataService) {
      this.useRealMarketData();
    } else {
      console.log('❌ No MarketDataService available - cannot generate signals without real data');
      this.isGenerating = false;
      return;
    }
  }

  // Use real market data for signal generation
  useRealMarketData() {
    console.log('📊 Using real market data for signal generation');
    
    // Listen to market data updates
    this.marketDataService.on('marketUpdate', (marketData) => {
      if (!this.isGenerating) return;
      
      // Only process selected coins from frontend
      if (this.selectedCoins.length > 0 && !this.selectedCoins.includes(marketData.symbol)) return;
      
      // Generate signals for any market data (ultra-aggressive mode)
      if (marketData && marketData.symbol && marketData.price) {
        // Always try to generate a signal regardless of filters
        const signalTypes = ['basic_activity']; // Default signal type
        
        // Add specific signal types if filters exist
        if (marketData.activeFilters && marketData.activeFilters.length > 0) {
          signalTypes.push(...marketData.activeFilters.map(filter => filter.type));
        }
        
        console.log(`🎯 Attempting signal generation for ${marketData.symbol}:`, signalTypes);
        
        const signal = this.generateSignal(marketData, signalTypes);
        if (signal) {
          console.log(`✅ Generated signal: ${signal.symbol} ${signal.direction} (${signal.confidence}% confidence)`);
        }
      }
    });

    // Periodically check for signals in all coins
    this.signalInterval = setInterval(async () => {
      if (!this.isGenerating) return;
      
      try {
        // Get fresh market data for all coins
        const allMarketData = await this.marketDataService.getMarketData();
        
        if (allMarketData && allMarketData.length > 0) {
          // Only process selected coins from frontend
          const selectedCoinsData = allMarketData.filter(coin => 
            this.selectedCoins.length === 0 || this.selectedCoins.includes(coin.symbol)
          );
          
          console.log(`🔍 Processing ${selectedCoinsData.length} selected coins for signal generation`);
          console.log(`📋 Selected coins: ${this.selectedCoins.join(', ') || 'None selected'}`);
          
          for (const coinData of selectedCoinsData) {
            if (coinData && coinData.symbol && coinData.price) {
              // Always try to generate signals
              const signalTypes = ['basic_activity'];
              
              // Add specific signal types if filters exist
              if (coinData.activeFilters && coinData.activeFilters.length > 0) {
                signalTypes.push(...coinData.activeFilters.map(filter => filter.type));
              }
              
              console.log(`🎯 Periodic signal attempt for ${coinData.symbol}:`, signalTypes);
              
              const signal = this.generateSignal(coinData, signalTypes);
              if (signal) {
                console.log(`✅ Periodic signal generated: ${signal.symbol} ${signal.direction} (${signal.confidence}% confidence)`);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching market data for signals:', error);
      }
    }, 30000); // Check every 30 seconds
  }


}

module.exports = SignalService;
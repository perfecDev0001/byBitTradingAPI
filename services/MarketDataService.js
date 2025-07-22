/**
 * Market Data Service
 * Handles real-time market data from Bybit API
 */

const { RestClientV5, WebsocketClient } = require('bybit-api');
const EventEmitter = require('events');

class MarketDataService extends EventEmitter {
  constructor() {
    super();
    this.client = new RestClientV5({
      key: process.env.BYBIT_API_KEY,
      secret: process.env.BYBIT_API_SECRET,
      testnet: process.env.BYBIT_TESTNET === 'true'
    });
    
    this.wsClient = null;
    this.marketData = new Map();
    this.klineData = new Map();
    this.volumeData = new Map();
    this.orderBookData = new Map();
    this.signalData = new Map(); // Store detected signals for each symbol
    this.isInitialized = false;
    this.scannerFilters = {
      volumeSpike: 1.01,    // 1% volume spike (extremely sensitive)
      priceBreakout: 1.001, // 0.1% price movement (extremely sensitive)
      spoofDetection: true,
      whaleAlerts: true,
      liquidityImbalance: true
    };
  }

  async initialize() {
    try {
      console.log('🔄 Initializing Market Data Service...');
      console.log('🔧 Environment check:');
      console.log('  - API Key:', process.env.BYBIT_API_KEY ? 'Set' : 'Missing');
      console.log('  - API Secret:', process.env.BYBIT_API_SECRET ? 'Set' : 'Missing');
      console.log('  - Testnet:', process.env.BYBIT_TESTNET);
      
      // Test REST API connection first
      console.log('🔍 Testing REST API connection...');
      await this.testRestConnection();
      
      // Initialize WebSocket connection
      console.log('🔌 Initializing WebSocket connection...');
      this.wsClient = new WebsocketClient({
        key: process.env.BYBIT_API_KEY,
        secret: process.env.BYBIT_API_SECRET,
        testnet: process.env.BYBIT_TESTNET === 'true',
        market: 'v5'
      });

      // Set up WebSocket event handlers
      this.wsClient.on('update', (data) => {
        console.log('📊 WebSocket update received:', JSON.stringify(data, null, 2));
        this.handleWebSocketUpdate(data);
      });

      this.wsClient.on('open', () => {
        console.log('✅ WebSocket connection opened');
      });

      this.wsClient.on('close', () => {
        console.log('🔌 WebSocket connection closed');
      });

      this.wsClient.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });

      this.wsClient.on('response', (data) => {
        console.log('📡 WebSocket response:', JSON.stringify(data, null, 2));
      });

      // Get initial market data
      await this.fetchInitialData();
      
      // Start REST fallback as backup (will run alongside WebSocket)
      await this.startRestFallback();
      
      this.isInitialized = true;
      console.log('✅ Market Data Service initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize Market Data Service:', error);
      console.error('Error details:', error.message);
      
      // If initialization fails, try REST-only mode
      console.log('🔄 Attempting REST-only mode...');
      try {
        await this.startRestFallback();
        this.isInitialized = true;
        console.log('✅ Market Data Service initialized in REST-only mode');
      } catch (restError) {
        console.error('❌ REST-only mode also failed:', restError.message);
        throw error;
      }
    }
  }

  async testRestConnection() {
    try {
      console.log('🔍 Testing REST API connection to Bybit...');
      const response = await this.client.getServerTime();
      console.log('✅ REST API connection successful');
      console.log('📅 Server time:', response.result?.timeSecond ? new Date(response.result.timeSecond * 1000).toISOString() : 'Unknown');
      return true;
    } catch (error) {
      console.error('❌ REST API connection failed:', error.message);
      throw new Error(`REST API connection failed: ${error.message}`);
    }
  }

  async fetchInitialData() {
    try {
      console.log('📊 Fetching initial market data...');
      
      // Get all USDT perpetual symbols
      const symbolsResponse = await this.client.getInstrumentsInfo({
        category: 'linear',
        baseCoin: 'USDT'
      });

      console.log('📊 Symbols response:', {
        retCode: symbolsResponse.retCode,
        retMsg: symbolsResponse.retMsg,
        symbolCount: symbolsResponse.result?.list?.length || 0
      });

      if (symbolsResponse.retCode === 0) {
        const symbols = symbolsResponse.result.list
          .filter(symbol => this.isValidSymbol(symbol.symbol))
          .sort((a, b) => {
            // Sort by priority first, then by volume
            const priorityA = this.getSymbolPriority(a.symbol);
            const priorityB = this.getSymbolPriority(b.symbol);
            
            if (priorityA !== priorityB) {
              return priorityB - priorityA; // Higher priority first
            }
            
            // If same priority, sort by volume (if available)
            return 0; // Keep original order for same priority
          })
          .slice(0, 50); // Increase to 50 symbols to get more main pairs

        console.log('📊 Selected symbols:', symbols.map(s => s.symbol));

        // Subscribe to real-time data for these symbols
        const symbolNames = symbols.map(s => s.symbol);
        await this.subscribeToSymbols(symbolNames);
        
        console.log(`📊 Subscribed to ${symbolNames.length} symbols`);
      } else {
        console.error('❌ Failed to fetch symbols:', symbolsResponse.retMsg);
      }
    } catch (error) {
      console.error('❌ Error fetching initial data:', error);
      console.error('Error details:', error.message);
    }
  }

  async subscribeToSymbols(symbols) {
    try {
      console.log('📡 Starting WebSocket subscriptions...');
      
      // Subscribe to ticker data for all linear instruments
      console.log('📡 Subscribing to tickers.linear...');
      const tickerResult = await this.wsClient.subscribeV5('tickers.linear', 'linear');
      console.log('📡 Ticker subscription result:', tickerResult);
      
      // Subscribe to kline data and order book for selected symbols
      console.log('📡 Subscribing to kline and orderbook data for symbols:', symbols);
      for (const symbol of symbols.slice(0, 10)) { // Increase to 10 symbols for better coverage
        console.log(`📡 Subscribing to kline.1.${symbol}...`);
        const klineResult = await this.wsClient.subscribeV5(`kline.1.${symbol}`, 'linear');
        console.log(`📡 Kline subscription result for ${symbol}:`, klineResult);
        
        // Subscribe to order book data (50 levels)
        console.log(`📡 Subscribing to orderbook.50.${symbol}...`);
        const orderbookResult = await this.wsClient.subscribeV5(`orderbook.50.${symbol}`, 'linear');
        console.log(`📡 Orderbook subscription result for ${symbol}:`, orderbookResult);
        
        // Add a small delay between subscriptions
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log('📡 All subscriptions completed');
    } catch (error) {
      console.error('❌ Error subscribing to symbols:', error);
      console.error('Error details:', error.message);
    }
  }

  handleWebSocketUpdate(data) {
    try {
      console.log('📊 Processing WebSocket update:', {
        topic: data.topic,
        type: data.type,
        dataLength: data.data?.length || 0
      });
      
      if (data.topic && data.topic.startsWith('tickers')) {
        console.log('📊 Processing ticker update...');
        this.handleTickerUpdate(data);
      } else if (data.topic && data.topic.startsWith('kline')) {
        console.log('📊 Processing kline update...');
        this.handleKlineUpdate(data);
      } else if (data.topic && data.topic.startsWith('orderbook')) {
        console.log('📊 Processing orderbook update...');
        this.handleOrderBookUpdate(data);
      } else {
        console.log('📊 Unknown topic:', data.topic);
      }
    } catch (error) {
      console.error('❌ Error handling WebSocket update:', error);
      console.error('Error details:', error.message);
    }
  }

  handleTickerUpdate(data) {
    if (data.data) {
      console.log(`📊 Processing ${data.data.length} ticker updates`);
      
      data.data.forEach((ticker, index) => {
        const symbol = ticker.symbol;
        
        // Filter out unwanted symbols
        if (!this.isValidSymbol(symbol)) return;
        
        const currentData = this.marketData.get(symbol) || {};
        
        const updatedData = {
          ...currentData,
          symbol,
          price: parseFloat(ticker.lastPrice),
          change24h: parseFloat(ticker.price24hPcnt),
          volume24h: parseFloat(ticker.volume24h),
          turnover24h: parseFloat(ticker.turnover24h),
          timestamp: Date.now()
        };

        this.marketData.set(symbol, updatedData);
        
        // Log first few updates for debugging
        if (index < 3) {
          console.log(`📊 Updated ${symbol}:`, {
            price: updatedData.price,
            change24h: updatedData.change24h,
            volume24h: updatedData.volume24h
          });
        }
        
        // Emit update for real-time clients
        console.log(`📡 Emitting marketUpdate for ${symbol}`);
        this.emit('marketUpdate', updatedData);
        
        // Check for signals (both old and new methods)
        this.checkForSignals(updatedData);
        this.checkForSignalsAdvanced(symbol);
      });
      
      console.log(`📊 Total market data entries: ${this.marketData.size}`);
    } else {
      console.log('📊 No ticker data in update');
    }
  }

  handleKlineUpdate(data) {
    if (data.data) {
      data.data.forEach(kline => {
        const symbol = kline.symbol;
        
        // Filter out unwanted symbols
        if (!this.isValidSymbol(symbol)) return;
        
        const interval = data.topic.includes('kline.1.') ? '1m' : '5m';
        
        const klineKey = `${symbol}_${interval}`;
        const klineArray = this.klineData.get(klineKey) || [];
        
        const klineData = {
          timestamp: parseInt(kline.start),
          open: parseFloat(kline.open),
          high: parseFloat(kline.high),
          low: parseFloat(kline.low),
          close: parseFloat(kline.close),
          volume: parseFloat(kline.volume),
          interval
        };

        // Update or add new kline
        const existingIndex = klineArray.findIndex(k => k.timestamp === klineData.timestamp);
        if (existingIndex >= 0) {
          klineArray[existingIndex] = klineData;
        } else {
          klineArray.push(klineData);
          // Keep only last 100 candles
          if (klineArray.length > 100) {
            klineArray.shift();
          }
        }

        this.klineData.set(klineKey, klineArray);
        
        // Emit kline update
        this.emit('klineUpdate', { symbol, interval, data: klineData });
        
        // Check for signals after kline update
        this.checkForSignalsAdvanced(symbol);
      });
    }
  }

  handleOrderBookUpdate(data) {
    if (data.data) {
      const symbol = data.topic.split('.')[2]; // Extract symbol from topic like "orderbook.50.BTCUSDT"
      
      // Filter out unwanted symbols
      if (!this.isValidSymbol(symbol)) return;
      
      console.log(`📊 Processing orderbook update for ${symbol}`);
      
      // Store order book data
      this.orderBookData.set(symbol, {
        bids: data.data.b || [], // Buy orders
        asks: data.data.a || [], // Sell orders
        timestamp: Date.now()
      });
      
      // Check for signals after orderbook update
      this.checkForSignalsAdvanced(symbol);
    }
  }

  // Advanced signal checking based on btcEthMonitor.js logic
  checkForSignalsAdvanced(symbol) {
    const klineKey = `${symbol}_1m`;
    const klineArray = this.klineData.get(klineKey) || [];
    const orderBook = this.orderBookData.get(symbol);
    const marketData = this.marketData.get(symbol);
    
    // Always try to analyze with whatever data we have
    if (!marketData) return; // Only skip if we have no market data at all
    
    // Convert kline data to the format expected by btcEthMonitor functions (if available)
    const candles = klineArray.length > 0 ? klineArray.slice(-10).reverse().map(k => [
      k.timestamp,
      k.open,
      k.high,
      k.low,
      k.close,
      k.volume
    ]) : null;
    
    // Convert orderbook to expected format (if available)
    const orderBookFormatted = orderBook ? {
      b: orderBook.bids, // bids
      a: orderBook.asks  // asks
    } : null;
    
    // Run signal detection with current filter settings (handle missing data gracefully)
    const volumeSpike = candles ? this.detectVolumeSpike(candles, this.scannerFilters.volumeSpike) : false;
    const priceBreakout = candles ? this.detectPriceBreakout(candles, this.scannerFilters.priceBreakout) : { isBreakout: false, direction: null };
    const orderBookImbalance = orderBookFormatted ? this.detectOrderBookImbalance(orderBookFormatted, 1.01) : { isImbalanced: false };
    const liquidityWalls = orderBookFormatted ? this.detectLiquidityWalls(orderBookFormatted, 1.02) : { hasWalls: false };
    const whaleActivity = this.detectWhaleActivityAdvanced(marketData, candles); // Whale detection (can work with just market data)
    
    // Check if any signals were detected
    let hasSignal = false;
    const detectedSignals = [];
    
    // Calculate actual values for display
    const actualValues = this.calculateActualFilterValues(symbol, candles, orderBookFormatted, marketData);
    
    // Debug logging
    console.log(`🔍 Analyzing ${symbol}:`, {
      volumeSpike: volumeSpike,
      priceBreakout: priceBreakout?.isBreakout,
      orderBookImbalance: orderBookImbalance?.isImbalanced,
      liquidityWalls: liquidityWalls?.hasWalls,
      whaleActivity: !!whaleActivity,
      actualValues: actualValues
    });
    
    if (volumeSpike) {
      hasSignal = true;
      detectedSignals.push({ type: 'volume_spike', data: { detected: true } });
    }
    
    if (priceBreakout.isBreakout) {
      hasSignal = true;
      detectedSignals.push({ 
        type: 'price_breakout', 
        data: { 
          direction: priceBreakout.direction,
          detected: true 
        } 
      });
    }
    
    if (orderBookImbalance.isImbalanced && this.scannerFilters.spoofDetection) {
      hasSignal = true;
      detectedSignals.push({ 
        type: 'spoof_detection', 
        data: { 
          direction: orderBookImbalance.direction,
          ratio: orderBookImbalance.ratio,
          detected: true 
        } 
      });
    }
    
    if (liquidityWalls.hasWalls && this.scannerFilters.liquidityImbalance) {
      hasSignal = true;
      detectedSignals.push({ 
        type: 'liquidity_imbalance', 
        data: { 
          walls: liquidityWalls.walls,
          detected: true 
        } 
      });
    }
    
    if (whaleActivity && this.scannerFilters.whaleAlerts) {
      hasSignal = true;
      detectedSignals.push({ 
        type: 'whale_alert', 
        data: { 
          ...whaleActivity,
          detected: true 
        } 
      });
    }
    
    // Always create detailed filter information for display (both active and inactive)
    const allFilters = [];
    
    // Volume Spike Filter (always show)
    allFilters.push({
      type: 'volume_spike',
      icon: '📈',
      label: 'Volume Spike',
      description: actualValues.volumeRatio !== undefined ? 
        `${actualValues.volumeRatio.toFixed(2)}x avg (${actualValues.volumePercentage > 0 ? '+' : ''}${actualValues.volumePercentage.toFixed(1)}%)` :
        `24h volume: ${this.formatVolume(actualValues.volume24h || 0)}`,
      severity: volumeSpike ? 'high' : 'inactive',
      threshold: `${((this.scannerFilters.volumeSpike - 1) * 100).toFixed(1)}%`,
      actualValue: actualValues.volumePercentage !== undefined ? 
        (actualValues.volumePercentage > 0 ? '+' : '') + actualValues.volumePercentage.toFixed(1) + '%' :
        this.formatVolume(actualValues.volume24h || 0),
      isActive: volumeSpike
    });
    
    // Price Breakout Filter (always show)
    allFilters.push({
      type: 'price_breakout',
      icon: priceBreakout?.direction === 'up' ? '🚀' : priceBreakout?.direction === 'down' ? '📉' : '📊',
      label: priceBreakout?.direction === 'up' ? 'Price Breakout' : priceBreakout?.direction === 'down' ? 'Price Breakdown' : 'Price Movement',
      description: actualValues.priceChangePercentage !== undefined ? 
        `${actualValues.priceChangePercentage > 0 ? '+' : ''}${actualValues.priceChangePercentage.toFixed(2)}% change` :
        'No price data',
      severity: priceBreakout?.isBreakout ? 'high' : 'inactive',
      threshold: `${((this.scannerFilters.priceBreakout - 1) * 100).toFixed(1)}%`,
      actualValue: actualValues.priceChangePercentage !== undefined ? 
        (actualValues.priceChangePercentage > 0 ? '+' : '') + actualValues.priceChangePercentage.toFixed(2) + '%' : 'N/A',
      isActive: priceBreakout?.isBreakout
    });
    
    // Order Book Imbalance Filter (always show)
    allFilters.push({
      type: 'spoof_detection',
      icon: '⚠️',
      label: 'Order Book Imbalance',
      description: actualValues.orderBookRatio !== undefined ? 
        `${actualValues.orderBookRatio.toFixed(2)}:1 ratio (${actualValues.orderBookImbalance > 0 ? 'Buy' : actualValues.orderBookImbalance < 0 ? 'Sell' : 'Balanced'} pressure)` :
        'Balanced orderbook',
      severity: orderBookImbalance?.isImbalanced ? 'medium' : 'inactive',
      threshold: '1%',
      actualValue: actualValues.orderBookImbalance !== undefined ? 
        (actualValues.orderBookImbalance > 0 ? '+' : '') + actualValues.orderBookImbalance.toFixed(1) + '%' : '0%',
      isActive: orderBookImbalance?.isImbalanced
    });
    
    // Whale Activity Filter (always show)
    allFilters.push({
      type: 'whale_alert',
      icon: '🐋',
      label: 'Whale Activity',
      description: whaleActivity ? 
        `${whaleActivity.type}: ${this.formatVolume(actualValues.turnover24h)} ${whaleActivity.direction || ''}` :
        `${this.formatVolume(actualValues.turnover24h)} turnover, ${actualValues.change24h?.toFixed(2)}% change`,
      severity: whaleActivity ? 'critical' : 'inactive',
      threshold: '$10K + 0.1%',
      actualValue: this.formatVolume(actualValues.turnover24h || 0),
      isActive: !!whaleActivity
    });
    
    // Store signal data for this symbol (always store, regardless of hasSignal)
    this.signalData.set(symbol, {
      signals: detectedSignals,
      timestamp: Date.now(),
      volumeSpike: volumeSpike,
      priceBreakout: priceBreakout.isBreakout,
      spoofDetection: orderBookImbalance.isImbalanced,
      liquidityImbalance: liquidityWalls.hasWalls,
      allFilters: allFilters, // Include all filter information
      actualValues: actualValues
    });
    
    // Only active filters for backwards compatibility
    const activeFilters = allFilters.filter(filter => filter.isActive);
    
    if (hasSignal) {
      // Create detailed filter information for display
      const legacyActiveFilters = [];
      
      if (volumeSpike) {
        activeFilters.push({
          type: 'volume_spike',
          icon: '📈',
          label: 'Volume Spike',
          description: `${((candles[0][5] / (candles.slice(1).reduce((sum, c) => sum + c[5], 0) / (candles.length - 1))) * 100 - 100).toFixed(1)}% above average`,
          severity: 'high'
        });
      }
      
      if (priceBreakout.isBreakout) {
        activeFilters.push({
          type: 'price_breakout',
          icon: priceBreakout.direction === 'up' ? '🚀' : '📉',
          label: `Price ${priceBreakout.direction === 'up' ? 'Breakout' : 'Breakdown'}`,
          description: `${priceBreakout.direction === 'up' ? 'Upward' : 'Downward'} price movement detected`,
          severity: priceBreakout.direction === 'up' ? 'high' : 'medium'
        });
      }
      
      if (orderBookImbalance.isImbalanced) {
        activeFilters.push({
          type: 'spoof_detection',
          icon: '⚠️',
          label: 'Order Book Imbalance',
          description: `${orderBookImbalance.direction === 'buy' ? 'Buy' : 'Sell'} pressure (${orderBookImbalance.ratio.toFixed(2)}x ratio)`,
          severity: 'medium'
        });
      }
      
      if (liquidityWalls.hasWalls) {
        const wallTypes = [];
        if (liquidityWalls.walls.buy.length > 0) wallTypes.push('Buy');
        if (liquidityWalls.walls.sell.length > 0) wallTypes.push('Sell');
        
        activeFilters.push({
          type: 'liquidity_imbalance',
          icon: '🧱',
          label: 'Liquidity Walls',
          description: `${wallTypes.join(' & ')} wall${wallTypes.length > 1 ? 's' : ''} detected`,
          severity: 'high'
        });
      }
      
      if (whaleActivity) {
        activeFilters.push({
          type: 'whale_alert',
          icon: '🐋',
          label: 'Whale Activity',
          description: `${whaleActivity.type}: $${(whaleActivity.estimatedSize || 0).toLocaleString()} ${whaleActivity.direction}`,
          severity: 'critical'
        });
      }

      // Update market data with signal flags and filter details
      const updatedMarketData = {
        ...marketData,
        volumeSpike: volumeSpike,
        priceBreakout: priceBreakout.isBreakout,
        priceBreakoutDirection: priceBreakout.direction,
        spoofDetection: orderBookImbalance.isImbalanced,
        spoofDirection: orderBookImbalance.direction,
        spoofRatio: orderBookImbalance.ratio,
        whaleAlert: !!whaleActivity,
        whaleActivity: whaleActivity,
        liquidityImbalance: liquidityWalls.hasWalls,
        liquidityWalls: liquidityWalls.walls,
        hasSignals: true,
        activeFilters: activeFilters,
        filterCount: activeFilters.length
      };
      
      this.marketData.set(symbol, updatedMarketData);
      
      // Emit signals
      this.emit('signals', {
        symbol,
        signals: detectedSignals,
        timestamp: Date.now(),
        price: marketData.price,
        volume: marketData.volume24h,
        change: marketData.change24h
      });
      
      console.log(`🚨 Signals detected for ${symbol}:`, detectedSignals.map(s => s.type).join(', '));
    } else {
      // Remove from signal data if no signals
      this.signalData.delete(symbol);
    }
  }

  checkForSignals(marketData) {
    const signals = [];
    
    // Volume spike detection
    if (this.scannerFilters.volumeSpike) {
      const volumeSpike = this.detectVolumeSpike(marketData);
      if (volumeSpike) {
        signals.push({ type: 'volume_spike', data: volumeSpike, confidence: 0.7 });
      }
    }

    // Price breakout detection
    if (this.scannerFilters.priceBreakout) {
      const breakout = this.detectPriceBreakout(marketData);
      if (breakout) {
        signals.push({ type: 'price_breakout', data: breakout, confidence: 0.8 });
      }
    }

    // Spoof detection
    if (this.scannerFilters.spoofDetection) {
      const spoof = this.detectSpoof(marketData);
      if (spoof) {
        signals.push({ type: 'spoof_detection', data: spoof, confidence: 0.6 });
      }
    }

    // Whale alerts
    if (this.scannerFilters.whaleAlerts) {
      const whale = this.detectWhaleActivity(marketData);
      if (whale) {
        signals.push({ type: 'whale_alert', data: whale, confidence: 0.9 });
      }
    }

    // Liquidity imbalance
    if (this.scannerFilters.liquidityImbalance) {
      const liquidity = this.detectLiquidityImbalance(marketData);
      if (liquidity) {
        signals.push({ type: 'liquidity_imbalance', data: liquidity, confidence: 0.5 });
      }
    }

    if (signals.length > 0) {
      this.emit('signals', { 
        symbol: marketData.symbol, 
        signals, 
        timestamp: Date.now(),
        price: marketData.price,
        volume: marketData.volume24h,
        change: marketData.change24h
      });
    }
  }

  detectVolumeSpike(marketData) {
    // Simple volume spike detection logic
    const symbol = marketData.symbol;
    const currentVolume = marketData.volume24h;
    
    // Get historical volume data (simplified)
    const historicalData = this.volumeData.get(symbol) || [];
    if (historicalData.length < 5) {
      historicalData.push(currentVolume);
      this.volumeData.set(symbol, historicalData);
      return null;
    }

    const avgVolume = historicalData.reduce((a, b) => a + b, 0) / historicalData.length;
    const spikeRatio = currentVolume / avgVolume;

    if (spikeRatio >= this.scannerFilters.volumeSpike) {
      return {
        currentVolume,
        avgVolume,
        spikeRatio: spikeRatio.toFixed(2)
      };
    }

    // Update historical data
    historicalData.push(currentVolume);
    if (historicalData.length > 20) {
      historicalData.shift();
    }
    this.volumeData.set(symbol, historicalData);

    return null;
  }

  detectPriceBreakout(marketData) {
    const symbol = marketData.symbol;
    const klineKey = `${symbol}_1m`;
    const klineArray = this.klineData.get(klineKey) || [];
    
    if (klineArray.length < 2) return null;

    const currentCandle = klineArray[klineArray.length - 1];
    const previousCandle = klineArray[klineArray.length - 2];
    
    const breakoutRatio = currentCandle.close / previousCandle.close;
    
    if (breakoutRatio >= this.scannerFilters.priceBreakout || breakoutRatio <= (2 - this.scannerFilters.priceBreakout)) {
      return {
        direction: breakoutRatio >= this.scannerFilters.priceBreakout ? 'up' : 'down',
        ratio: breakoutRatio.toFixed(4),
        previousPrice: previousCandle.close,
        currentPrice: currentCandle.close
      };
    }

    return null;
  }

  detectSpoof(marketData) {
    // Simple spoof detection based on order book imbalance
    // In a real implementation, you would analyze order book data
    const symbol = marketData.symbol;
    const currentPrice = marketData.price;
    const volume = marketData.volume24h;
    
    // Mock spoof detection logic
    if (volume > 1000000 && Math.random() < 0.1) { // 10% chance for high volume coins
      return {
        type: 'large_order_imbalance',
        side: Math.random() > 0.5 ? 'buy' : 'sell',
        imbalanceRatio: (Math.random() * 5 + 2).toFixed(2), // 2-7x imbalance
        estimatedSize: Math.floor(volume * 0.1),
        confidence: 0.6
      };
    }
    
    return null;
  }

  detectWhaleActivity(marketData) {
    // Whale detection based on large volume movements
    const symbol = marketData.symbol;
    const volume = marketData.volume24h;
    const change = Math.abs(marketData.change24h || 0);
    
    // Detect whale activity if high volume with significant price movement
    if (volume > 5000000 && change > 3) { // $5M+ volume and >3% change
      return {
        type: 'large_volume_movement',
        volume: volume,
        priceImpact: change,
        direction: marketData.change24h > 0 ? 'bullish' : 'bearish',
        estimatedSize: Math.floor(volume * 0.15),
        confidence: 0.8
      };
    }
    
    return null;
  }

  detectLiquidityImbalance(marketData) {
    // Liquidity wall detection
    const symbol = marketData.symbol;
    const volume = marketData.volume24h;
    const klineKey = `${symbol}_1m`;
    const klineArray = this.klineData.get(klineKey) || [];
    
    if (klineArray.length < 5) return null;
    
    // Check for unusual volume patterns
    const recentCandles = klineArray.slice(-5);
    const avgVolume = recentCandles.reduce((sum, candle) => sum + candle.volume, 0) / 5;
    const lastCandle = recentCandles[recentCandles.length - 1];
    
    if (lastCandle.volume > avgVolume * 3) { // 3x average volume
      return {
        type: 'liquidity_wall',
        side: lastCandle.close > lastCandle.open ? 'buy_wall' : 'sell_wall',
        volumeRatio: (lastCandle.volume / avgVolume).toFixed(2),
        wallSize: Math.floor(lastCandle.volume * marketData.price),
        priceLevel: lastCandle.close,
        confidence: 0.7
      };
    }
    
    return null;
  }

  // Calculate actual filter values for display
  calculateActualFilterValues(symbol, candles, orderBook, marketData) {
    const values = {};
    
    // Volume spike calculation
    if (candles && candles.length >= 2) {
      const previousCandles = candles.slice(1);
      const avgVolume = previousCandles.reduce((sum, candle) => sum + parseFloat(candle[5]), 0) / previousCandles.length;
      const currentVolume = parseFloat(candles[0][5]);
      values.volumeRatio = avgVolume > 0 ? (currentVolume / avgVolume) : 0;
      values.volumePercentage = avgVolume > 0 ? ((currentVolume / avgVolume - 1) * 100) : 0;
    } else if (marketData && marketData.volume24h) {
      // Fallback: use 24h volume data if no kline data
      values.volumeRatio = 1.0; // Assume normal volume
      values.volumePercentage = 0; // No comparison available
    }
    
    // Price breakout calculation
    if (candles && candles.length >= 2) {
      const currentClose = parseFloat(candles[0][4]);
      const previousClose = parseFloat(candles[1][4]);
      values.priceChangeRatio = previousClose > 0 ? (currentClose / previousClose) : 1;
      values.priceChangePercentage = previousClose > 0 ? ((currentClose / previousClose - 1) * 100) : 0;
    } else if (marketData && marketData.change24h !== undefined) {
      // Fallback: use 24h change data
      values.priceChangeRatio = 1 + (marketData.change24h / 100);
      values.priceChangePercentage = marketData.change24h;
    }
    
    // Order book imbalance calculation
    if (orderBook && orderBook.b && orderBook.a && orderBook.b.length > 0 && orderBook.a.length > 0) {
      const bidVolume = orderBook.b.slice(0, 10).reduce((sum, level) => sum + parseFloat(level[1]), 0);
      const askVolume = orderBook.a.slice(0, 10).reduce((sum, level) => sum + parseFloat(level[1]), 0);
      values.orderBookRatio = askVolume > 0 ? (bidVolume / askVolume) : 0;
      values.orderBookImbalance = askVolume > 0 ? ((bidVolume / askVolume - 1) * 100) : 0;
    } else {
      // Fallback: assume balanced orderbook
      values.orderBookRatio = 1.0;
      values.orderBookImbalance = 0;
    }
    
    // Whale activity calculation (always available from market data)
    if (marketData) {
      values.turnover24h = marketData.turnover24h || 0;
      values.volume24h = marketData.volume24h || 0;
      values.change24h = Math.abs(marketData.change24h || 0);
    }
    
    return values;
  }

  // Detection methods from btcEthMonitor.js
  detectVolumeSpike(candles, threshold = 1.2) {
    if (!candles || candles.length < 2) return false;
    
    // If we have less than 5 candles, use what we have
    const previousCandles = candles.slice(1);
    if (previousCandles.length === 0) return false;
    
    const avgVolume = previousCandles.reduce((sum, candle) => sum + parseFloat(candle[5]), 0) / previousCandles.length;
    
    // Current candle volume
    const currentVolume = parseFloat(candles[0][5]);
    
    // If avgVolume is 0 or very small, consider any volume as a spike
    if (avgVolume === 0) return currentVolume > 0;
    
    const isSpike = currentVolume > avgVolume * threshold;
    
    // Debug log for volume spike detection
    if (isSpike) {
      console.log(`📈 Volume spike detected: current=${currentVolume}, avg=${avgVolume}, ratio=${(currentVolume/avgVolume).toFixed(2)}`);
    }
    
    return isSpike;
  }

  detectPriceBreakout(candles, threshold = 1.01) {
  if (!candles || candles.length < 2) return { isBreakout: false, direction: null };
  
  const currentClose = parseFloat(candles[0][4]);
  const previousClose = parseFloat(candles[1][4]);
  
  const isBreakout = currentClose > previousClose * threshold;
  const isBreakdown = currentClose < previousClose / threshold;
  
  if (isBreakout) {
    console.log(`🚀 Price breakout detected: ${previousClose} -> ${currentClose} (${((currentClose/previousClose - 1) * 100).toFixed(2)}%)`);
    return { isBreakout: true, direction: 'up' };
  } else if (isBreakdown) {
    console.log(`📉 Price breakdown detected: ${previousClose} -> ${currentClose} (${((currentClose/previousClose - 1) * 100).toFixed(2)}%)`);
    return { isBreakout: true, direction: 'down' };
  } else {
    return { isBreakout: false, direction: null };
  }
}


  detectOrderBookImbalance(orderBook, threshold = 1.2) {
    if (!orderBook || !orderBook.b || !orderBook.a) return { isImbalanced: false };
    
    // Calculate total bid and ask volumes (top 10 levels)
    const bidVolume = orderBook.b.slice(0, 10).reduce((sum, level) => sum + parseFloat(level[1]), 0);
    const askVolume = orderBook.a.slice(0, 10).reduce((sum, level) => sum + parseFloat(level[1]), 0);
    
    const ratio = bidVolume / askVolume;
    
    return {
      isImbalanced: ratio > threshold || ratio < 1/threshold,
      direction: ratio > threshold ? 'buy' : ratio < 1/threshold ? 'sell' : null,
      ratio: ratio
    };
  }

  detectLiquidityWalls(orderBook, threshold = 1.5) {
    if (!orderBook || !orderBook.b || !orderBook.a) return { hasWalls: false };
    
    const walls = {
      buy: [],
      sell: []
    };
    
    // Calculate average volume per level
    const avgBidVolume = orderBook.b.reduce((sum, level) => sum + parseFloat(level[1]), 0) / orderBook.b.length;
    const avgAskVolume = orderBook.a.reduce((sum, level) => sum + parseFloat(level[1]), 0) / orderBook.a.length;
    
    // Find bid walls
    orderBook.b.forEach((level, index) => {
      if (parseFloat(level[1]) > avgBidVolume * threshold) {
        walls.buy.push({
          price: parseFloat(level[0]),
          volume: parseFloat(level[1]),
          ratio: parseFloat(level[1]) / avgBidVolume
        });
      }
    });
    
    // Find ask walls
    orderBook.a.forEach((level, index) => {
      if (parseFloat(level[1]) > avgAskVolume * threshold) {
        walls.sell.push({
          price: parseFloat(level[0]),
          volume: parseFloat(level[1]),
          ratio: parseFloat(level[1]) / avgAskVolume
        });
      }
    });
    
    return {
      hasWalls: walls.buy.length > 0 || walls.sell.length > 0,
      walls: walls
    };
  }

  detectWhaleActivityAdvanced(marketData, candles) {
    if (!marketData || !candles || candles.length < 2) return null;
    
    const volume24h = marketData.volume24h || 0;
    const turnover24h = marketData.turnover24h || 0;
    const change24h = Math.abs(marketData.change24h || 0);
    const currentVolume = parseFloat(candles[0][5]);
    
    // Calculate average volume from recent candles
    const avgVolume = candles.slice(1, 6).reduce((sum, candle) => sum + parseFloat(candle[5]), 0) / Math.min(5, candles.length - 1);
    
    // Whale detection criteria (extremely sensitive)
    const highVolumeThreshold = 10000; // $10K+ turnover (extremely low threshold)
    const volumeSpikeThreshold = 1.1; // 1.1x average volume (extremely sensitive)
    const priceImpactThreshold = 0.1; // 0.1% price change (extremely sensitive)
    
    // Check for whale activity (any significant price change)
    if (turnover24h > highVolumeThreshold && Math.abs(change24h) > priceImpactThreshold) {
      return {
        type: 'large_volume_movement',
        volume: volume24h,
        turnover: turnover24h,
        priceImpact: change24h,
        direction: marketData.change24h > 0 ? 'bullish' : 'bearish',
        estimatedSize: Math.floor(turnover24h * 0.1), // Estimate 10% of turnover
        confidence: 0.7
      };
    }
    
    // Check for volume spike whale activity
    if (currentVolume > avgVolume * volumeSpikeThreshold && turnover24h > highVolumeThreshold * 0.5) {
      return {
        type: 'volume_spike_whale',
        volume: currentVolume,
        volumeRatio: (currentVolume / avgVolume).toFixed(2),
        turnover: turnover24h,
        direction: candles[0][4] > candles[0][1] ? 'bullish' : 'bearish',
        estimatedSize: Math.floor(currentVolume * marketData.price * 0.15),
        confidence: 0.6
      };
    }
    
    return null;
  }

  // Helper method to validate symbols
  isValidSymbol(symbol) {
    // Filter for USDT pairs
    if (!symbol.endsWith('USDT')) return false;
    
    // Filter out derivative/leveraged tokens with numerical prefixes
    if (/^\d+/.test(symbol)) return false; // Starts with numbers like 1000, 10000
    
    // Filter out some other unwanted patterns
    if (symbol.includes('UP') || symbol.includes('DOWN')) return false; // Leveraged tokens
    if (symbol.includes('BEAR') || symbol.includes('BULL')) return false; // Leveraged tokens
    
    return true;
  }

  // Helper method to get priority for symbols (higher number = higher priority)
  getSymbolPriority(symbol) {
    const priorityCoins = [
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT', 
      'XRPUSDT', 'DOTUSDT', 'DOGEUSDT', 'AVAXUSDT', 'MATICUSDT',
      'LINKUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'FILUSDT',
      'TRXUSDT', 'ETCUSDT', 'XLMUSDT', 'VETUSDT', 'ICPUSDT'
    ];
    
    const index = priorityCoins.indexOf(symbol);
    return index >= 0 ? (priorityCoins.length - index) : 0;
  }

  // Enhanced API Methods
  async getMarketData() {
    const data = Array.from(this.marketData.values());
    
    // Always return all coins with their filter information (both active and inactive)
    const enrichedData = data.map(coin => {
      const signalData = this.signalData.get(coin.symbol);
      
      if (signalData && signalData.allFilters) {
        // Return coin with all filter information
        return {
          ...coin,
          hasSignals: signalData.signals && signalData.signals.length > 0,
          activeFilters: signalData.allFilters.filter(f => f.isActive), // Only active filters
          allFilters: signalData.allFilters, // All filters (active and inactive)
          filterCount: signalData.allFilters.filter(f => f.isActive).length,
          actualValues: signalData.actualValues
        };
      } else {
        // Return coin with empty filter information
        return {
          ...coin,
          hasSignals: false,
          activeFilters: [],
          allFilters: [
            {
              type: 'volume_spike',
              icon: '📈',
              label: 'Volume Spike',
              description: 'No data available',
              severity: 'inactive',
              threshold: '1%',
              actualValue: 'N/A',
              isActive: false
            },
            {
              type: 'price_breakout',
              icon: '📊',
              label: 'Price Movement',
              description: 'No data available',
              severity: 'inactive',
              threshold: '0.1%',
              actualValue: 'N/A',
              isActive: false
            },
            {
              type: 'spoof_detection',
              icon: '⚠️',
              label: 'Order Book Imbalance',
              description: 'No data available',
              severity: 'inactive',
              threshold: '1%',
              actualValue: 'N/A',
              isActive: false
            },
            {
              type: 'whale_alert',
              icon: '🐋',
              label: 'Whale Activity',
              description: 'No data available',
              severity: 'inactive',
              threshold: '$10K + 0.1%',
              actualValue: 'N/A',
              isActive: false
            }
          ],
          filterCount: 0,
          actualValues: {}
        };
      }
    });
    
    console.log(`📊 Returning ${enrichedData.length} coins with filter information`);
    
    return enrichedData.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
  }

  // Get all market data (for debugging)
  async getAllMarketData() {
    const data = Array.from(this.marketData.values());
    return data.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
  }

  // Get current signals
  async getSignals() {
    const signals = Array.from(this.signalData.entries()).map(([symbol, data]) => ({
      symbol,
      ...data
    }));
    return signals.sort((a, b) => b.timestamp - a.timestamp);
  }

  async getKlineData(symbol, interval = '1m', limit = 100) {
    const klineKey = `${symbol}_${interval}`;
    return this.klineData.get(klineKey) || [];
  }

  async getTopMovers(limit = 10) {
    const data = Array.from(this.marketData.values());
    return data
      .sort((a, b) => Math.abs(b.change24h || 0) - Math.abs(a.change24h || 0))
      .slice(0, limit);
  }

  updateFilters(newFilters) {
    this.scannerFilters = { ...this.scannerFilters, ...newFilters };
    console.log('📊 Scanner filters updated:', this.scannerFilters);
  }

  formatVolume(volume) {
    if (volume >= 1e9) return `$${(volume / 1e9).toFixed(1)}B`;
    if (volume >= 1e6) return `$${(volume / 1e6).toFixed(1)}M`;
    if (volume >= 1e3) return `$${(volume / 1e3).toFixed(1)}K`;
    return `$${volume.toFixed(0)}`;
  }

  getFilters() {
    return this.scannerFilters;
  }

  // REST API fallback method
  async startRestFallback() {
    console.log('🔄 Starting REST API fallback...');
    
    // Get market data every 5 seconds as fallback
    this.restFallbackInterval = setInterval(async () => {
      try {
        await this.fetchRestMarketData();
      } catch (error) {
        console.error('❌ REST fallback error:', error.message);
      }
    }, 5000);
  }

  async fetchRestMarketData() {
    try {
      // Get ticker data for top USDT pairs
      const tickerResponse = await this.client.getTickers({
        category: 'linear'
      });

      if (tickerResponse.retCode === 0) {
        const tickers = tickerResponse.result.list
          .filter(ticker => this.isValidSymbol(ticker.symbol))
          .sort((a, b) => {
            // Sort by priority first, then by volume
            const priorityA = this.getSymbolPriority(a.symbol);
            const priorityB = this.getSymbolPriority(b.symbol);
            
            if (priorityA !== priorityB) {
              return priorityB - priorityA; // Higher priority first
            }
            
            // If same priority, sort by volume
            const volumeA = parseFloat(a.volume24h) || 0;
            const volumeB = parseFloat(b.volume24h) || 0;
            return volumeB - volumeA;
          })
          .slice(0, 50); // Top 50 pairs

        console.log(`📊 REST: Processing ${tickers.length} tickers`);

        tickers.forEach((ticker, index) => {
          const updatedData = {
            symbol: ticker.symbol,
            price: parseFloat(ticker.lastPrice),
            change24h: parseFloat(ticker.price24hPcnt),
            volume24h: parseFloat(ticker.volume24h),
            turnover24h: parseFloat(ticker.turnover24h),
            timestamp: Date.now()
          };

          this.marketData.set(ticker.symbol, updatedData);

          // Log first few for debugging
          if (index < 3) {
            console.log(`📊 REST: Updated ${ticker.symbol}:`, {
              price: updatedData.price,
              change24h: updatedData.change24h,
              volume24h: updatedData.volume24h
            });
          }

          // Emit update for real-time clients
          this.emit('marketUpdate', updatedData);
        });

        console.log(`📊 REST: Total market data entries: ${this.marketData.size}`);
      }
    } catch (error) {
      console.error('❌ Error fetching REST market data:', error.message);
    }
  }

  stopRestFallback() {
    if (this.restFallbackInterval) {
      clearInterval(this.restFallbackInterval);
      this.restFallbackInterval = null;
      console.log('🔄 REST API fallback stopped');
    }
  }
}

module.exports = MarketDataService;
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
    this.isInitialized = false;
    this.scannerFilters = {
      volumeSpike: 1.2,
      priceBreakout: 1.01,
      spoofDetection: true,
      whaleAlerts: true,
      liquidityImbalance: true
    };
  }

  async initialize() {
    try {
      console.log('🔄 Initializing Market Data Service...');
      
      // Initialize WebSocket connection
      this.wsClient = new WebsocketClient({
        key: process.env.BYBIT_API_KEY,
        secret: process.env.BYBIT_API_SECRET,
        testnet: process.env.BYBIT_TESTNET === 'true',
        market: 'v5'
      });

      // Set up WebSocket event handlers
      this.wsClient.on('update', (data) => {
        this.handleWebSocketUpdate(data);
      });

      this.wsClient.on('open', () => {
        console.log('✅ WebSocket connection opened');
      });

      this.wsClient.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });

      // Get initial market data
      await this.fetchInitialData();
      
      this.isInitialized = true;
      console.log('✅ Market Data Service initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize Market Data Service:', error);
      throw error;
    }
  }

  async fetchInitialData() {
    try {
      // Get all USDT perpetual symbols
      const symbolsResponse = await this.client.getInstrumentsInfo({
        category: 'linear',
        baseCoin: 'USDT'
      });

      if (symbolsResponse.retCode === 0) {
        const symbols = symbolsResponse.result.list
          .filter(symbol => symbol.symbol.endsWith('USDT'))
          .slice(0, 50); // Limit to top 50 for performance

        // Subscribe to real-time data for these symbols
        const symbolNames = symbols.map(s => s.symbol);
        await this.subscribeToSymbols(symbolNames);
        
        console.log(`📊 Subscribed to ${symbolNames.length} symbols`);
      }
    } catch (error) {
      console.error('❌ Error fetching initial data:', error);
    }
  }

  async subscribeToSymbols(symbols) {
    try {
      // Subscribe to ticker data
      await this.wsClient.subscribeV5('tickers.linear', 'linear');
      
      // Subscribe to kline data for 1m and 5m intervals
      for (const symbol of symbols) {
        await this.wsClient.subscribeV5(`kline.1.${symbol}`, 'linear');
        await this.wsClient.subscribeV5(`kline.5.${symbol}`, 'linear');
      }
    } catch (error) {
      console.error('❌ Error subscribing to symbols:', error);
    }
  }

  handleWebSocketUpdate(data) {
    try {
      if (data.topic && data.topic.startsWith('tickers')) {
        this.handleTickerUpdate(data);
      } else if (data.topic && data.topic.startsWith('kline')) {
        this.handleKlineUpdate(data);
      }
    } catch (error) {
      console.error('❌ Error handling WebSocket update:', error);
    }
  }

  handleTickerUpdate(data) {
    if (data.data) {
      data.data.forEach(ticker => {
        const symbol = ticker.symbol;
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
        
        // Emit update for real-time clients
        this.emit('marketUpdate', updatedData);
        
        // Check for signals
        this.checkForSignals(updatedData);
      });
    }
  }

  handleKlineUpdate(data) {
    if (data.data) {
      data.data.forEach(kline => {
        const symbol = kline.symbol;
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
      });
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

  // Enhanced API Methods
  async getMarketData() {
    const data = Array.from(this.marketData.values());
    return data.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
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

  getFilters() {
    return this.scannerFilters;
  }
}

module.exports = MarketDataService;
/**
 * Candlestick Analysis Service
 * Handles candlestick pattern recognition and technical analysis
 */

class CandlestickService {
  constructor() {
    this.patterns = {
      doji: this.detectDoji.bind(this),
      hammer: this.detectHammer.bind(this),
      shootingStar: this.detectShootingStar.bind(this),
      engulfing: this.detectEngulfing.bind(this),
      harami: this.detectHarami.bind(this)
    };
  }

  /**
   * Analyze candlestick data with given settings
   * @param {Array} candleData - Array of OHLCV data
   * @param {Object} settings - Candlestick analysis settings
   * @returns {Object} Analysis results
   */
  analyzeCandlesticks(candleData, settings) {
    if (!candleData || candleData.length < 2) {
      return { patterns: [], signals: [], confidence: 0 };
    }

    const results = {
      patterns: [],
      signals: [],
      trendAnalysis: null,
      volatilityAnalysis: null,
      confidence: 0,
      timestamp: Date.now()
    };

    try {
      // Pattern Recognition
      if (settings.patternRecognition?.enabled) {
        results.patterns = this.recognizePatterns(candleData, settings.patternRecognition);
      }

      // Trend Analysis
      if (settings.trendAnalysis?.enabled) {
        results.trendAnalysis = this.analyzeTrend(candleData, settings.trendAnalysis);
      }

      // Volatility Analysis
      if (settings.volatilityThresholds) {
        results.volatilityAnalysis = this.analyzeVolatility(candleData, settings.volatilityThresholds);
      }

      // Volume Analysis
      if (settings.volumeAnalysis) {
        results.volumeAnalysis = this.analyzeVolume(candleData);
      }

      // Generate trading signals
      results.signals = this.generateSignals(results, settings);
      results.confidence = this.calculateConfidence(results);

      return results;
    } catch (error) {
      console.error('❌ Candlestick analysis error:', error);
      return { patterns: [], signals: [], confidence: 0, error: error.message };
    }
  }

  /**
   * Recognize candlestick patterns
   * @param {Array} candleData - OHLCV data
   * @param {Object} patternSettings - Pattern recognition settings
   * @returns {Array} Detected patterns
   */
  recognizePatterns(candleData, patternSettings) {
    const patterns = [];
    const { patterns: patternConfig } = patternSettings;

    for (let i = 1; i < candleData.length; i++) {
      const current = candleData[i];
      const previous = candleData[i - 1];

      // Check each enabled pattern
      Object.keys(patternConfig).forEach(patternName => {
        const config = patternConfig[patternName];
        if (config.enabled && this.patterns[patternName]) {
          const pattern = this.patterns[patternName](current, previous, config.sensitivity);
          if (pattern) {
            patterns.push({
              name: patternName,
              type: pattern.type,
              strength: pattern.strength,
              index: i,
              timestamp: current.timestamp || Date.now(),
              description: pattern.description
            });
          }
        }
      });
    }

    return patterns;
  }

  /**
   * Detect Doji pattern
   * @param {Object} candle - Current candle
   * @param {Object} previous - Previous candle
   * @param {number} sensitivity - Detection sensitivity
   * @returns {Object|null} Pattern result
   */
  detectDoji(candle, previous, sensitivity = 0.1) {
    const { open, high, low, close } = candle;
    const bodySize = Math.abs(close - open);
    const totalRange = high - low;
    
    if (totalRange === 0) return null;
    
    const bodyRatio = bodySize / totalRange;
    
    if (bodyRatio <= sensitivity) {
      return {
        type: 'reversal',
        strength: 1 - bodyRatio,
        description: 'Doji - Market indecision, potential reversal'
      };
    }
    
    return null;
  }

  /**
   * Detect Hammer pattern
   * @param {Object} candle - Current candle
   * @param {Object} previous - Previous candle
   * @param {number} sensitivity - Detection sensitivity
   * @returns {Object|null} Pattern result
   */
  detectHammer(candle, previous, sensitivity = 0.15) {
    const { open, high, low, close } = candle;
    const bodySize = Math.abs(close - open);
    const lowerShadow = Math.min(open, close) - low;
    const upperShadow = high - Math.max(open, close);
    const totalRange = high - low;
    
    if (totalRange === 0) return null;
    
    const lowerShadowRatio = lowerShadow / totalRange;
    const upperShadowRatio = upperShadow / totalRange;
    const bodyRatio = bodySize / totalRange;
    
    // Hammer: long lower shadow, small body, small upper shadow
    if (lowerShadowRatio >= 0.6 && bodyRatio <= 0.3 && upperShadowRatio <= sensitivity) {
      return {
        type: 'bullish_reversal',
        strength: lowerShadowRatio,
        description: 'Hammer - Bullish reversal signal'
      };
    }
    
    return null;
  }

  /**
   * Detect Shooting Star pattern
   * @param {Object} candle - Current candle
   * @param {Object} previous - Previous candle
   * @param {number} sensitivity - Detection sensitivity
   * @returns {Object|null} Pattern result
   */
  detectShootingStar(candle, previous, sensitivity = 0.15) {
    const { open, high, low, close } = candle;
    const bodySize = Math.abs(close - open);
    const lowerShadow = Math.min(open, close) - low;
    const upperShadow = high - Math.max(open, close);
    const totalRange = high - low;
    
    if (totalRange === 0) return null;
    
    const lowerShadowRatio = lowerShadow / totalRange;
    const upperShadowRatio = upperShadow / totalRange;
    const bodyRatio = bodySize / totalRange;
    
    // Shooting Star: long upper shadow, small body, small lower shadow
    if (upperShadowRatio >= 0.6 && bodyRatio <= 0.3 && lowerShadowRatio <= sensitivity) {
      return {
        type: 'bearish_reversal',
        strength: upperShadowRatio,
        description: 'Shooting Star - Bearish reversal signal'
      };
    }
    
    return null;
  }

  /**
   * Detect Engulfing pattern
   * @param {Object} candle - Current candle
   * @param {Object} previous - Previous candle
   * @param {number} sensitivity - Detection sensitivity
   * @returns {Object|null} Pattern result
   */
  detectEngulfing(candle, previous, sensitivity = 0.05) {
    const currentBody = Math.abs(candle.close - candle.open);
    const previousBody = Math.abs(previous.close - previous.open);
    
    const currentBullish = candle.close > candle.open;
    const previousBullish = previous.close > previous.open;
    
    // Bullish Engulfing
    if (currentBullish && !previousBullish && 
        candle.open < previous.close && 
        candle.close > previous.open &&
        currentBody > previousBody * (1 + sensitivity)) {
      return {
        type: 'bullish_reversal',
        strength: currentBody / previousBody,
        description: 'Bullish Engulfing - Strong bullish reversal'
      };
    }
    
    // Bearish Engulfing
    if (!currentBullish && previousBullish && 
        candle.open > previous.close && 
        candle.close < previous.open &&
        currentBody > previousBody * (1 + sensitivity)) {
      return {
        type: 'bearish_reversal',
        strength: currentBody / previousBody,
        description: 'Bearish Engulfing - Strong bearish reversal'
      };
    }
    
    return null;
  }

  /**
   * Detect Harami pattern
   * @param {Object} candle - Current candle
   * @param {Object} previous - Previous candle
   * @param {number} sensitivity - Detection sensitivity
   * @returns {Object|null} Pattern result
   */
  detectHarami(candle, previous, sensitivity = 0.1) {
    const currentBody = Math.abs(candle.close - candle.open);
    const previousBody = Math.abs(previous.close - previous.open);
    
    // Current candle body should be smaller and within previous candle body
    if (currentBody < previousBody * (1 - sensitivity) &&
        candle.high <= previous.high &&
        candle.low >= previous.low &&
        Math.max(candle.open, candle.close) <= Math.max(previous.open, previous.close) &&
        Math.min(candle.open, candle.close) >= Math.min(previous.open, previous.close)) {
      
      return {
        type: 'reversal',
        strength: 1 - (currentBody / previousBody),
        description: 'Harami - Potential trend reversal'
      };
    }
    
    return null;
  }

  /**
   * Analyze trend using moving averages
   * @param {Array} candleData - OHLCV data
   * @param {Object} trendSettings - Trend analysis settings
   * @returns {Object} Trend analysis
   */
  analyzeTrend(candleData, trendSettings) {
    const { periods, trendStrength } = trendSettings;
    const closes = candleData.map(c => c.close);
    
    const trends = {};
    
    periods.forEach(period => {
      if (closes.length >= period) {
        const ma = this.calculateMovingAverage(closes, period);
        const currentPrice = closes[closes.length - 1];
        const maValue = ma[ma.length - 1];
        
        const deviation = (currentPrice - maValue) / maValue;
        
        let trend = 'neutral';
        if (deviation > trendStrength) trend = 'bullish';
        else if (deviation < -trendStrength) trend = 'bearish';
        
        trends[`ma${period}`] = {
          value: maValue,
          trend,
          strength: Math.abs(deviation),
          deviation: deviation * 100
        };
      }
    });
    
    // Overall trend consensus
    const trendVotes = Object.values(trends).map(t => t.trend);
    const bullishVotes = trendVotes.filter(t => t === 'bullish').length;
    const bearishVotes = trendVotes.filter(t => t === 'bearish').length;
    
    let overallTrend = 'neutral';
    if (bullishVotes > bearishVotes) overallTrend = 'bullish';
    else if (bearishVotes > bullishVotes) overallTrend = 'bearish';
    
    return {
      overall: overallTrend,
      strength: Math.max(...Object.values(trends).map(t => t.strength)),
      details: trends,
      consensus: {
        bullish: bullishVotes,
        bearish: bearishVotes,
        neutral: trendVotes.length - bullishVotes - bearishVotes
      }
    };
  }

  /**
   * Analyze volatility
   * @param {Array} candleData - OHLCV data
   * @param {Object} thresholds - Volatility thresholds
   * @returns {Object} Volatility analysis
   */
  analyzeVolatility(candleData, thresholds) {
    if (candleData.length < 2) return null;
    
    const returns = [];
    for (let i = 1; i < candleData.length; i++) {
      const returnRate = (candleData[i].close - candleData[i - 1].close) / candleData[i - 1].close;
      returns.push(Math.abs(returnRate));
    }
    
    const avgVolatility = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    
    let level = 'low';
    if (avgVolatility > thresholds.high) level = 'high';
    else if (avgVolatility > thresholds.medium) level = 'medium';
    
    return {
      level,
      value: avgVolatility,
      percentage: avgVolatility * 100,
      thresholds
    };
  }

  /**
   * Analyze volume patterns
   * @param {Array} candleData - OHLCV data
   * @returns {Object} Volume analysis
   */
  analyzeVolume(candleData) {
    if (candleData.length < 10) return null;
    
    const volumes = candleData.map(c => c.volume || 0);
    const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    const currentVolume = volumes[volumes.length - 1];
    
    const volumeRatio = currentVolume / avgVolume;
    
    let signal = 'normal';
    if (volumeRatio > 2) signal = 'high';
    else if (volumeRatio < 0.5) signal = 'low';
    
    return {
      current: currentVolume,
      average: avgVolume,
      ratio: volumeRatio,
      signal,
      trend: this.calculateVolumeTrend(volumes.slice(-5))
    };
  }

  /**
   * Calculate volume trend
   * @param {Array} recentVolumes - Recent volume data
   * @returns {string} Volume trend
   */
  calculateVolumeTrend(recentVolumes) {
    if (recentVolumes.length < 3) return 'neutral';
    
    let increasing = 0;
    let decreasing = 0;
    
    for (let i = 1; i < recentVolumes.length; i++) {
      if (recentVolumes[i] > recentVolumes[i - 1]) increasing++;
      else if (recentVolumes[i] < recentVolumes[i - 1]) decreasing++;
    }
    
    if (increasing > decreasing) return 'increasing';
    if (decreasing > increasing) return 'decreasing';
    return 'neutral';
  }

  /**
   * Generate trading signals based on analysis
   * @param {Object} analysis - Complete analysis results
   * @param {Object} settings - Analysis settings
   * @returns {Array} Trading signals
   */
  generateSignals(analysis, settings) {
    const signals = [];
    
    // Pattern-based signals
    if (analysis.patterns) {
      analysis.patterns.forEach(pattern => {
        if (pattern.strength > 0.7) {
          signals.push({
            type: 'pattern',
            signal: pattern.type,
            strength: pattern.strength,
            source: pattern.name,
            description: pattern.description,
            confidence: pattern.strength * 0.8
          });
        }
      });
    }
    
    // Trend-based signals
    if (analysis.trendAnalysis && analysis.trendAnalysis.strength > 0.02) {
      signals.push({
        type: 'trend',
        signal: analysis.trendAnalysis.overall,
        strength: analysis.trendAnalysis.strength,
        source: 'trend_analysis',
        description: `${analysis.trendAnalysis.overall} trend detected`,
        confidence: Math.min(analysis.trendAnalysis.strength * 10, 1)
      });
    }
    
    // Volume-based signals
    if (analysis.volumeAnalysis && analysis.volumeAnalysis.ratio > 1.5) {
      signals.push({
        type: 'volume',
        signal: 'breakout_potential',
        strength: Math.min(analysis.volumeAnalysis.ratio / 2, 1),
        source: 'volume_analysis',
        description: 'High volume detected - potential breakout',
        confidence: Math.min(analysis.volumeAnalysis.ratio / 3, 0.8)
      });
    }
    
    return signals;
  }

  /**
   * Calculate overall confidence score
   * @param {Object} analysis - Analysis results
   * @returns {number} Confidence score (0-1)
   */
  calculateConfidence(analysis) {
    let totalConfidence = 0;
    let signalCount = 0;
    
    if (analysis.signals) {
      analysis.signals.forEach(signal => {
        totalConfidence += signal.confidence || 0;
        signalCount++;
      });
    }
    
    // Boost confidence if multiple signals agree
    const signalTypes = analysis.signals?.map(s => s.signal) || [];
    const bullishSignals = signalTypes.filter(s => s.includes('bullish')).length;
    const bearishSignals = signalTypes.filter(s => s.includes('bearish')).length;
    
    let consensus = 0;
    if (bullishSignals > 1 || bearishSignals > 1) {
      consensus = 0.2; // Boost for signal consensus
    }
    
    const baseConfidence = signalCount > 0 ? totalConfidence / signalCount : 0;
    return Math.min(baseConfidence + consensus, 1);
  }

  /**
   * Calculate simple moving average
   * @param {Array} data - Price data
   * @param {number} period - Moving average period
   * @returns {Array} Moving average values
   */
  calculateMovingAverage(data, period) {
    const ma = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      ma.push(sum / period);
    }
    return ma;
  }

  /**
   * Format analysis results for API response
   * @param {Object} analysis - Raw analysis results
   * @returns {Object} Formatted results
   */
  formatResults(analysis) {
    return {
      timestamp: analysis.timestamp,
      patterns: analysis.patterns.map(p => ({
        name: p.name,
        type: p.type,
        strength: Math.round(p.strength * 100) / 100,
        description: p.description
      })),
      signals: analysis.signals.map(s => ({
        type: s.type,
        signal: s.signal,
        strength: Math.round(s.strength * 100) / 100,
        confidence: Math.round(s.confidence * 100) / 100,
        description: s.description
      })),
      trend: analysis.trendAnalysis ? {
        direction: analysis.trendAnalysis.overall,
        strength: Math.round(analysis.trendAnalysis.strength * 100) / 100,
        consensus: analysis.trendAnalysis.consensus
      } : null,
      volatility: analysis.volatilityAnalysis ? {
        level: analysis.volatilityAnalysis.level,
        percentage: Math.round(analysis.volatilityAnalysis.percentage * 100) / 100
      } : null,
      volume: analysis.volumeAnalysis ? {
        signal: analysis.volumeAnalysis.signal,
        ratio: Math.round(analysis.volumeAnalysis.ratio * 100) / 100,
        trend: analysis.volumeAnalysis.trend
      } : null,
      confidence: Math.round(analysis.confidence * 100) / 100
    };
  }
}

module.exports = CandlestickService;
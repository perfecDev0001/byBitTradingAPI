/**
 * Enhanced Volume Analysis Module
 * 
 * This module provides advanced volume analysis functions for the Bybit Trading API.
 * It includes multiple approaches to volume spike detection:
 * 1. Volatility-adjusted thresholds
 * 2. Weighted average volume calculation
 * 3. Volume acceleration detection
 * 4. Time-based volume analysis
 * 5. Comprehensive analysis combining multiple methods
 */

/**
 * Detect volume spike with dynamic threshold based on price volatility
 * @param {Array} candles - Candlestick data
 * @param {number} baseThreshold - Base threshold multiplier
 * @returns {Object} Volume spike analysis
 */
function detectVolumeSpikeEnhanced(candles, baseThreshold = 1.05) {
  if (!candles || candles.length < 10) return { 
    isSpike: false, 
    currentVolume: 0, 
    avgVolume: 0,
    ratio: 0,
    adjustedThreshold: baseThreshold
  };
  
  // Calculate average volume from previous candles (excluding current)
  const previousCandles = candles.slice(1, 10); // Use last 9 candles for average
  const avgVolume = previousCandles.reduce((sum, candle) => sum + parseFloat(candle[5]), 0) / previousCandles.length;
  
  // Current candle volume
  const currentVolume = parseFloat(candles[0][5]);
  
  // Calculate price volatility (using standard deviation of price changes)
  const priceChanges = [];
  for (let i = 0; i < previousCandles.length - 1; i++) {
    const currentClose = parseFloat(previousCandles[i][4]);
    const prevClose = parseFloat(previousCandles[i + 1][4]);
    const percentChange = Math.abs((currentClose - prevClose) / prevClose);
    priceChanges.push(percentChange);
  }
  
  // Calculate standard deviation of price changes
  const avgChange = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
  const variance = priceChanges.reduce((sum, change) => sum + Math.pow(change - avgChange, 2), 0) / priceChanges.length;
  const volatility = Math.sqrt(variance);
  
  // Adjust threshold based on volatility
  // Higher volatility = higher threshold (less sensitive)
  // Lower volatility = lower threshold (more sensitive)
  const volatilityFactor = 1 + (volatility * 10); // Scale volatility to make it meaningful
  const adjustedThreshold = baseThreshold * volatilityFactor;
  
  // Calculate volume ratio
  const ratio = currentVolume / avgVolume;
  
  return {
    isSpike: ratio > adjustedThreshold,
    currentVolume,
    avgVolume,
    ratio,
    adjustedThreshold,
    volatility
  };
}

/**
 * Detect volume spike using weighted average
 * @param {Array} candles - Candlestick data
 * @param {number} threshold - Threshold multiplier
 * @returns {Object} Volume spike analysis
 */
function detectVolumeSpikeWeighted(candles, threshold = 1.05) {
  if (!candles || candles.length < 10) return { 
    isSpike: false, 
    currentVolume: 0, 
    weightedAvgVolume: 0,
    ratio: 0 
  };
  
  // Use previous candles (excluding current)
  const previousCandles = candles.slice(1, 10); // Use last 9 candles
  
  // Calculate weighted average (more recent candles have higher weight)
  let totalWeight = 0;
  let weightedSum = 0;
  
  previousCandles.forEach((candle, index) => {
    // Weight decreases as we go further back in time
    // Most recent candle (index 0) has highest weight
    const weight = previousCandles.length - index;
    totalWeight += weight;
    weightedSum += parseFloat(candle[5]) * weight;
  });
  
  const weightedAvgVolume = weightedSum / totalWeight;
  
  // Current candle volume
  const currentVolume = parseFloat(candles[0][5]);
  
  // Calculate ratio
  const ratio = currentVolume / weightedAvgVolume;
  
  return {
    isSpike: ratio > threshold,
    currentVolume,
    weightedAvgVolume,
    ratio
  };
}

/**
 * Detect volume acceleration
 * @param {Array} candles - Candlestick data
 * @param {number} accelerationThreshold - Threshold for acceleration
 * @returns {Object} Volume acceleration analysis
 */
function detectVolumeAcceleration(candles, accelerationThreshold = 1.3) {
  if (!candles || candles.length < 5) return { 
    isAccelerating: false, 
    accelerationFactor: 0 
  };
  
  // Get volumes of the most recent candles
  const volumes = candles.slice(0, 5).map(candle => parseFloat(candle[5]));
  
  // Calculate volume change rates between consecutive candles
  const changeRates = [];
  for (let i = 0; i < volumes.length - 1; i++) {
    // Skip if previous volume is 0 to avoid division by zero
    if (volumes[i+1] === 0) continue;
    
    const rate = volumes[i] / volumes[i+1];
    changeRates.push(rate);
  }
  
  // Calculate acceleration factor (are change rates increasing?)
  // Compare the most recent change rate to the average of previous rates
  if (changeRates.length < 2) return { isAccelerating: false, accelerationFactor: 0 };
  
  const mostRecentRate = changeRates[0];
  const previousRatesAvg = changeRates.slice(1).reduce((sum, rate) => sum + rate, 0) / (changeRates.length - 1);
  
  const accelerationFactor = mostRecentRate / previousRatesAvg;
  
  return {
    isAccelerating: accelerationFactor > accelerationThreshold,
    accelerationFactor
  };
}

/**
 * Detect volume spike with time-based adjustment
 * @param {Array} candles - Candlestick data
 * @param {number} threshold - Base threshold multiplier
 * @returns {Object} Volume spike analysis with time adjustment
 */
function detectVolumeSpikeTimeAdjusted(candles, threshold = 1.05) {
  if (!candles || candles.length < 10) return { 
    isSpike: false, 
    timeAdjustedThreshold: threshold 
  };
  
  // Extract timestamp from current candle (timestamp is at index 0)
  const timestamp = parseInt(candles[0][0]);
  const date = new Date(timestamp);
  const hour = date.getUTCHours();
  
  // Adjust threshold based on time of day
  // Higher threshold during typical high-volume hours
  // Lower threshold during typically quiet hours
  let timeAdjustmentFactor = 1.0;
  
  // Example: Major market hours (simplified)
  // Asian session: 0-8 UTC
  // European session: 8-16 UTC
  // US session: 13-21 UTC
  
  // Highest volume typically occurs when markets overlap
  if (hour >= 13 && hour <= 16) {
    // European and US overlap - highest volume expected
    timeAdjustmentFactor = 1.3;
  } else if ((hour >= 8 && hour < 13) || (hour > 16 && hour <= 21)) {
    // Single major market open - medium volume expected
    timeAdjustmentFactor = 1.1;
  } else {
    // Off-hours - lower volume expected, so be more sensitive
    timeAdjustmentFactor = 0.9;
  }
  
  const timeAdjustedThreshold = threshold * timeAdjustmentFactor;
  
  // Calculate average volume from previous candles (excluding current)
  const previousCandles = candles.slice(1);
  const avgVolume = previousCandles.reduce((sum, candle) => sum + parseFloat(candle[5]), 0) / previousCandles.length;
  
  // Current candle volume
  const currentVolume = parseFloat(candles[0][5]);
  
  // Calculate ratio with time-adjusted threshold
  const ratio = currentVolume / avgVolume;
  
  return {
    isSpike: ratio > timeAdjustedThreshold,
    currentVolume,
    avgVolume,
    ratio,
    timeAdjustedThreshold,
    timeAdjustmentFactor
  };
}

/**
 * Comprehensive volume analysis combining multiple detection methods
 * @param {Array} candles - Candlestick data
 * @param {Object} options - Configuration options
 * @returns {Object} Comprehensive volume analysis
 */
function analyzeVolume(candles, options = {}) {
  // Default options
  const config = {
    baseThreshold: options.baseThreshold || 1.05,
    useVolatilityAdjustment: options.useVolatilityAdjustment !== false,
    useWeightedAverage: options.useWeightedAverage !== false,
    detectAcceleration: options.detectAcceleration !== false,
    useTimeAdjustment: options.useTimeAdjustment !== false,
    accelerationThreshold: options.accelerationThreshold || 1.3
  };
  
  if (!candles || candles.length < 10) {
    return { 
      isVolumeSignal: false,
      details: "Insufficient data"
    };
  }
  
  // Run individual analyses
  const volatilityAnalysis = config.useVolatilityAdjustment ? 
    detectVolumeSpikeEnhanced(candles, config.baseThreshold) : 
    { isSpike: false };
    
  const weightedAnalysis = config.useWeightedAverage ? 
    detectVolumeSpikeWeighted(candles, config.baseThreshold) : 
    { isSpike: false };
    
  const accelerationAnalysis = config.detectAcceleration ? 
    detectVolumeAcceleration(candles, config.accelerationThreshold) : 
    { isAccelerating: false };
    
  const timeAnalysis = config.useTimeAdjustment ? 
    detectVolumeSpikeTimeAdjusted(candles, config.baseThreshold) : 
    { isSpike: false };
  
  // Combine results (different strategies for combining could be used)
  // Here we use a simple approach: if any two methods detect a spike, consider it valid
  let signalCount = 0;
  if (volatilityAnalysis.isSpike) signalCount++;
  if (weightedAnalysis.isSpike) signalCount++;
  if (accelerationAnalysis.isAccelerating) signalCount++;
  if (timeAnalysis.isSpike) signalCount++;
  
  const isVolumeSignal = signalCount >= 2; // At least 2 methods must agree
  
  // Calculate current volume and average for reference
  const currentVolume = parseFloat(candles[0][5]);
  const avgVolume = candles.slice(1, 10).reduce((sum, candle) => sum + parseFloat(candle[5]), 0) / 9;
  const simpleRatio = currentVolume / avgVolume;
  
  // Prepare detailed analysis result
  return {
    isVolumeSignal,
    signalStrength: signalCount / 4, // 0.25 to 1.0 scale
    simpleAnalysis: {
      currentVolume,
      avgVolume,
      ratio: simpleRatio,
      isSpike: simpleRatio > config.baseThreshold
    },
    detailedAnalysis: {
      volatilityAdjusted: volatilityAnalysis,
      weightedAverage: weightedAnalysis,
      acceleration: accelerationAnalysis,
      timeAdjusted: timeAnalysis
    }
  };
}

// Export the functions
module.exports = {
  detectVolumeSpikeEnhanced,
  detectVolumeSpikeWeighted,
  detectVolumeAcceleration,
  detectVolumeSpikeTimeAdjusted,
  analyzeVolume
};
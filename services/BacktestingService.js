/**
 * Backtesting Service
 * Handles backtesting functionality for trading strategies
 */

const { RestClientV5 } = require('bybit-api');

class BacktestingService {
  constructor() {
    this.client = new RestClientV5({
      key: process.env.BYBIT_API_KEY,
      secret: process.env.BYBIT_API_SECRET,
      testnet: process.env.BYBIT_TESTNET === 'true'
    });
  }

  async runBacktest(params) {
    const {
      symbols,
      startDate,
      endDate,
      filters,
      riskSettings,
      capital
    } = params;

    console.log('🔄 Starting backtest...', params);

    try {
      const results = {
        summary: {
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          totalPnL: 0,
          winRate: 0,
          avgTimeInTrade: 0,
          maxDrawdown: 0,
          sharpeRatio: 0
        },
        trades: [],
        dailyPnL: [],
        equityCurve: []
      };

      // Get historical data for each symbol
      for (const symbol of symbols) {
        const historicalData = await this.getHistoricalData(symbol, startDate, endDate);
        const symbolTrades = await this.simulateTrading(symbol, historicalData, filters, riskSettings, capital);
        results.trades.push(...symbolTrades);
      }

      // Calculate summary statistics
      results.summary = this.calculateSummary(results.trades, capital);
      results.dailyPnL = this.calculateDailyPnL(results.trades);
      results.equityCurve = this.calculateEquityCurve(results.trades, capital);

      console.log('✅ Backtest completed:', results.summary);
      return results;

    } catch (error) {
      console.error('❌ Backtest error:', error);
      throw error;
    }
  }

  async getHistoricalData(symbol, startDate, endDate, interval = '1') {
    try {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      
      const response = await this.client.getKline({
        category: 'linear',
        symbol: symbol,
        interval: interval,
        start: start,
        end: end,
        limit: 1000
      });

      if (response.retCode === 0) {
        return response.result.list.map(kline => ({
          timestamp: parseInt(kline[0]),
          open: parseFloat(kline[1]),
          high: parseFloat(kline[2]),
          low: parseFloat(kline[3]),
          close: parseFloat(kline[4]),
          volume: parseFloat(kline[5])
        })).reverse(); // Bybit returns data in descending order
      }

      return [];
    } catch (error) {
      console.error(`❌ Error fetching historical data for ${symbol}:`, error);
      return [];
    }
  }

  async simulateTrading(symbol, historicalData, filters, riskSettings, capital) {
    const trades = [];
    let currentPosition = null;
    
    for (let i = 1; i < historicalData.length; i++) {
      const currentCandle = historicalData[i];
      const previousCandle = historicalData[i - 1];
      
      // Check for entry signals
      if (!currentPosition) {
        const signal = this.checkEntrySignal(currentCandle, previousCandle, filters);
        
        if (signal) {
          currentPosition = {
            symbol,
            entryTime: currentCandle.timestamp,
            entryPrice: currentCandle.close,
            direction: signal.direction,
            size: this.calculatePositionSize(capital, currentCandle.close, riskSettings),
            stopLoss: this.calculateStopLoss(currentCandle.close, signal.direction, riskSettings),
            takeProfit1: this.calculateTakeProfit(currentCandle.close, signal.direction, riskSettings.tp1),
            takeProfit2: this.calculateTakeProfit(currentCandle.close, signal.direction, riskSettings.tp2)
          };
        }
      } else {
        // Check for exit conditions
        const exitResult = this.checkExitConditions(currentPosition, currentCandle, riskSettings);
        
        if (exitResult) {
          const trade = {
            ...currentPosition,
            exitTime: currentCandle.timestamp,
            exitPrice: exitResult.price,
            exitReason: exitResult.reason,
            pnl: this.calculatePnL(currentPosition, exitResult.price),
            timeInTrade: currentCandle.timestamp - currentPosition.entryTime
          };
          
          trades.push(trade);
          currentPosition = null;
        }
      }
    }

    return trades;
  }

  checkEntrySignal(currentCandle, previousCandle, filters) {
    // Volume spike check
    if (filters.volumeSpike && currentCandle.volume > previousCandle.volume * filters.volumeSpikeThreshold) {
      // Price breakout check
      const priceChange = (currentCandle.close - previousCandle.close) / previousCandle.close;
      
      if (Math.abs(priceChange) >= filters.priceBreakoutThreshold) {
        return {
          direction: priceChange > 0 ? 'long' : 'short',
          strength: Math.abs(priceChange)
        };
      }
    }

    return null;
  }

  checkExitConditions(position, currentCandle, riskSettings) {
    const currentPrice = currentCandle.close;
    
    // Stop loss check
    if (position.direction === 'long' && currentPrice <= position.stopLoss) {
      return { price: position.stopLoss, reason: 'stop_loss' };
    }
    
    if (position.direction === 'short' && currentPrice >= position.stopLoss) {
      return { price: position.stopLoss, reason: 'stop_loss' };
    }

    // Take profit checks
    if (position.direction === 'long') {
      if (currentPrice >= position.takeProfit2) {
        return { price: position.takeProfit2, reason: 'take_profit_2' };
      }
      if (currentPrice >= position.takeProfit1) {
        return { price: position.takeProfit1, reason: 'take_profit_1' };
      }
    }

    if (position.direction === 'short') {
      if (currentPrice <= position.takeProfit2) {
        return { price: position.takeProfit2, reason: 'take_profit_2' };
      }
      if (currentPrice <= position.takeProfit1) {
        return { price: position.takeProfit1, reason: 'take_profit_1' };
      }
    }

    return null;
  }

  calculatePositionSize(capital, price, riskSettings) {
    const riskAmount = capital * (riskSettings.riskPerTrade || 0.02); // 2% default risk
    const leverage = riskSettings.leverage || 1;
    return (riskAmount * leverage) / price;
  }

  calculateStopLoss(entryPrice, direction, riskSettings) {
    const stopLossPercent = riskSettings.stopLoss || 0.02; // 2% default
    
    if (direction === 'long') {
      return entryPrice * (1 - stopLossPercent);
    } else {
      return entryPrice * (1 + stopLossPercent);
    }
  }

  calculateTakeProfit(entryPrice, direction, tpPercent) {
    if (direction === 'long') {
      return entryPrice * (1 + tpPercent);
    } else {
      return entryPrice * (1 - tpPercent);
    }
  }

  calculatePnL(position, exitPrice) {
    const priceDiff = position.direction === 'long' 
      ? exitPrice - position.entryPrice 
      : position.entryPrice - exitPrice;
    
    return (priceDiff / position.entryPrice) * position.size * position.entryPrice;
  }

  calculateSummary(trades, initialCapital) {
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.pnl > 0).length;
    const losingTrades = trades.filter(t => t.pnl < 0).length;
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const avgTimeInTrade = totalTrades > 0 
      ? trades.reduce((sum, t) => sum + t.timeInTrade, 0) / totalTrades 
      : 0;

    // Calculate max drawdown
    let peak = initialCapital;
    let maxDrawdown = 0;
    let runningCapital = initialCapital;

    trades.forEach(trade => {
      runningCapital += trade.pnl;
      if (runningCapital > peak) {
        peak = runningCapital;
      }
      const drawdown = (peak - runningCapital) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      totalPnL: Math.round(totalPnL * 100) / 100,
      winRate: Math.round(winRate * 100) / 100,
      avgTimeInTrade: Math.round(avgTimeInTrade / (1000 * 60)), // Convert to minutes
      maxDrawdown: Math.round(maxDrawdown * 10000) / 100, // Convert to percentage
      finalBalance: Math.round((initialCapital + totalPnL) * 100) / 100
    };
  }

  calculateDailyPnL(trades) {
    const dailyPnL = {};
    
    trades.forEach(trade => {
      const date = new Date(trade.exitTime).toISOString().split('T')[0];
      if (!dailyPnL[date]) {
        dailyPnL[date] = 0;
      }
      dailyPnL[date] += trade.pnl;
    });

    return Object.entries(dailyPnL).map(([date, pnl]) => ({
      date,
      pnl: Math.round(pnl * 100) / 100
    })).sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  calculateEquityCurve(trades, initialCapital) {
    const curve = [{ timestamp: Date.now() - (trades.length * 24 * 60 * 60 * 1000), balance: initialCapital }];
    let runningBalance = initialCapital;

    trades.forEach(trade => {
      runningBalance += trade.pnl;
      curve.push({
        timestamp: trade.exitTime,
        balance: Math.round(runningBalance * 100) / 100
      });
    });

    return curve;
  }
}

module.exports = BacktestingService;
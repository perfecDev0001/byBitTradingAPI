/**
 * PnL Service
 * Handles profit and loss tracking and analysis
 */

const fs = require('fs').promises;
const path = require('path');

class PnLService {
  constructor() {
    this.tradesFile = path.join(__dirname, '../data/trades.json');
    this.trades = [];
    this.initialize();
  }

  async initialize() {
    try {
      await this.loadTrades();
      console.log('PnL Service initialized');
    } catch (error) {
      console.error('Error initializing PnL Service:', error);
      this.trades = [];
    }
  }

  async loadTrades() {
    try {
      // Create data directory if it doesn't exist
      const dataDir = path.dirname(this.tradesFile);
      await fs.mkdir(dataDir, { recursive: true });

      // Try to load existing trades
      const data = await fs.readFile(this.tradesFile, 'utf8');
      this.trades = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, start with empty array
        this.trades = [];
        await this.saveTrades();
      } else {
        throw error;
      }
    }
  }

  async saveTrades() {
    try {
      await fs.writeFile(this.tradesFile, JSON.stringify(this.trades, null, 2));
    } catch (error) {
      console.error('Error saving trades:', error);
    }
  }

  async addTrade(tradeData) {
    const trade = {
      id: this.generateTradeId(),
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0],
      ...tradeData,
      createdAt: new Date().toISOString()
    };

    this.trades.push(trade);
    await this.saveTrades();
    
    console.log('💰 New trade added:', trade.symbol, trade.result);
    return trade;
  }

  async updateTrade(tradeId, updateData) {
    const tradeIndex = this.trades.findIndex(t => t.id === tradeId);
    
    if (tradeIndex === -1) {
      throw new Error('Trade not found');
    }

    this.trades[tradeIndex] = {
      ...this.trades[tradeIndex],
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    await this.saveTrades();
    return this.trades[tradeIndex];
  }

  async deleteTrade(tradeId) {
    const tradeIndex = this.trades.findIndex(t => t.id === tradeId);
    
    if (tradeIndex === -1) {
      throw new Error('Trade not found');
    }

    const deletedTrade = this.trades.splice(tradeIndex, 1)[0];
    await this.saveTrades();
    
    return deletedTrade;
  }

  getAllTrades(filters = {}) {
    let filteredTrades = [...this.trades];

    // Apply filters
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filteredTrades = filteredTrades.filter(t => new Date(t.timestamp) >= startDate);
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      filteredTrades = filteredTrades.filter(t => new Date(t.timestamp) <= endDate);
    }

    if (filters.symbol) {
      filteredTrades = filteredTrades.filter(t => 
        t.symbol.toLowerCase().includes(filters.symbol.toLowerCase())
      );
    }

    if (filters.result) {
      filteredTrades = filteredTrades.filter(t => t.result === filters.result);
    }

    // Sort by timestamp (newest first)
    return filteredTrades.sort((a, b) => b.timestamp - a.timestamp);
  }

  getTradeById(tradeId) {
    return this.trades.find(t => t.id === tradeId);
  }

  calculateSummaryStats(filters = {}) {
    const trades = this.getAllTrades(filters);
    
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalPnL: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        largestWin: 0,
        largestLoss: 0
      };
    }

    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);
    
    const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    
    const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
    
    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0;

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      totalPnL: Math.round(totalPnL * 100) / 100,
      winRate: Math.round((winningTrades.length / trades.length) * 10000) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      profitFactor: avgLoss > 0 ? Math.round((avgWin / avgLoss) * 100) / 100 : 0,
      largestWin: Math.round(largestWin * 100) / 100,
      largestLoss: Math.round(largestLoss * 100) / 100
    };
  }

  calculateDailyPnL(filters = {}) {
    const trades = this.getAllTrades(filters);
    const dailyPnL = {};

    trades.forEach(trade => {
      const date = trade.date;
      if (!dailyPnL[date]) {
        dailyPnL[date] = {
          date,
          pnl: 0,
          trades: 0,
          wins: 0,
          losses: 0
        };
      }

      dailyPnL[date].pnl += trade.pnl || 0;
      dailyPnL[date].trades += 1;
      
      if (trade.pnl > 0) {
        dailyPnL[date].wins += 1;
      } else if (trade.pnl < 0) {
        dailyPnL[date].losses += 1;
      }
    });

    return Object.values(dailyPnL)
      .map(day => ({
        ...day,
        pnl: Math.round(day.pnl * 100) / 100
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  calculateCumulativePnL(filters = {}) {
    const trades = this.getAllTrades(filters).reverse(); // Oldest first
    const cumulativePnL = [];
    let runningTotal = 0;

    trades.forEach(trade => {
      runningTotal += trade.pnl || 0;
      cumulativePnL.push({
        timestamp: trade.timestamp,
        date: trade.date,
        cumulativePnL: Math.round(runningTotal * 100) / 100,
        tradePnL: Math.round((trade.pnl || 0) * 100) / 100
      });
    });

    return cumulativePnL;
  }

  calculateMonthlyStats(filters = {}) {
    const trades = this.getAllTrades(filters);
    const monthlyStats = {};

    trades.forEach(trade => {
      const date = new Date(trade.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = {
          month: monthKey,
          trades: 0,
          wins: 0,
          losses: 0,
          totalPnL: 0
        };
      }

      monthlyStats[monthKey].trades += 1;
      monthlyStats[monthKey].totalPnL += trade.pnl || 0;
      
      if (trade.pnl > 0) {
        monthlyStats[monthKey].wins += 1;
      } else if (trade.pnl < 0) {
        monthlyStats[monthKey].losses += 1;
      }
    });

    return Object.values(monthlyStats)
      .map(month => ({
        ...month,
        totalPnL: Math.round(month.totalPnL * 100) / 100,
        winRate: month.trades > 0 ? Math.round((month.wins / month.trades) * 10000) / 100 : 0
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  getTopPerformingSymbols(limit = 10, filters = {}) {
    const trades = this.getAllTrades(filters);
    const symbolStats = {};

    trades.forEach(trade => {
      if (!symbolStats[trade.symbol]) {
        symbolStats[trade.symbol] = {
          symbol: trade.symbol,
          trades: 0,
          wins: 0,
          losses: 0,
          totalPnL: 0
        };
      }

      symbolStats[trade.symbol].trades += 1;
      symbolStats[trade.symbol].totalPnL += trade.pnl || 0;
      
      if (trade.pnl > 0) {
        symbolStats[trade.symbol].wins += 1;
      } else if (trade.pnl < 0) {
        symbolStats[trade.symbol].losses += 1;
      }
    });

    return Object.values(symbolStats)
      .map(symbol => ({
        ...symbol,
        totalPnL: Math.round(symbol.totalPnL * 100) / 100,
        winRate: symbol.trades > 0 ? Math.round((symbol.wins / symbol.trades) * 10000) / 100 : 0,
        avgPnL: symbol.trades > 0 ? Math.round((symbol.totalPnL / symbol.trades) * 100) / 100 : 0
      }))
      .sort((a, b) => b.totalPnL - a.totalPnL)
      .slice(0, limit);
  }

  generateTradeId() {
    return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Simulate adding some sample trades for testing
  async addSampleTrades() {
    const sampleTrades = [
      {
        symbol: 'BTCUSDT',
        entryPrice: 45000,
        exitPrice: 46350,
        result: 'win',
        pnl: 135.50,
        leverage: 10,
        positionSize: 0.1
      },
      {
        symbol: 'ETHUSDT',
        entryPrice: 3200,
        exitPrice: 3100,
        result: 'loss',
        pnl: -95.25,
        leverage: 5,
        positionSize: 0.5
      },
      {
        symbol: 'ADAUSDT',
        entryPrice: 0.45,
        exitPrice: 0.48,
        result: 'win',
        pnl: 67.80,
        leverage: 20,
        positionSize: 1000
      }
    ];

    for (const trade of sampleTrades) {
      await this.addTrade(trade);
    }


  }
}

module.exports = PnLService;
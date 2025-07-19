/**
 * PnL Routes
 * Handles all profit and loss tracking endpoints
 */

const express = require('express');
const PnLService = require('../services/PnLService');
const router = express.Router();

const pnlService = new PnLService();

// GET /api/pnl/trades - Get all trades with optional filters
router.get('/trades', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      symbol,
      result,
      page = 1,
      limit = 50
    } = req.query;

    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (symbol) filters.symbol = symbol;
    if (result) filters.result = result;

    const allTrades = pnlService.getAllTrades(filters);
    
    // Pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedTrades = allTrades.slice(startIndex, endIndex);

    res.json({
      success: true,
      trades: paginatedTrades,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: allTrades.length,
        totalPages: Math.ceil(allTrades.length / parseInt(limit))
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

// GET /api/pnl/trades/:id - Get specific trade by ID
router.get('/trades/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const trade = pnlService.getTradeById(id);

    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    res.json({
      success: true,
      trade,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error fetching trade:', error);
    res.status(500).json({ error: 'Failed to fetch trade' });
  }
});

// POST /api/pnl/trades - Add new trade
router.post('/trades', async (req, res) => {
  try {
    const tradeData = req.body;

    // Validation
    const requiredFields = ['symbol', 'entryPrice', 'exitPrice', 'result', 'pnl'];
    const missingFields = requiredFields.filter(field => !tradeData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        missingFields 
      });
    }

    // Validate result field
    if (!['win', 'loss'].includes(tradeData.result)) {
      return res.status(400).json({ 
        error: 'Result must be either "win" or "loss"' 
      });
    }

    // Validate PnL matches result
    if ((tradeData.result === 'win' && tradeData.pnl <= 0) ||
        (tradeData.result === 'loss' && tradeData.pnl >= 0)) {
      return res.status(400).json({ 
        error: 'PnL value does not match result type' 
      });
    }

    const trade = await pnlService.addTrade(tradeData);

    res.status(201).json({
      success: true,
      trade,
      message: 'Trade added successfully',
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error adding trade:', error);
    res.status(500).json({ error: 'Failed to add trade' });
  }
});

// PUT /api/pnl/trades/:id - Update existing trade
router.put('/trades/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate result field if provided
    if (updateData.result && !['win', 'loss'].includes(updateData.result)) {
      return res.status(400).json({ 
        error: 'Result must be either "win" or "loss"' 
      });
    }

    const updatedTrade = await pnlService.updateTrade(id, updateData);

    res.json({
      success: true,
      trade: updatedTrade,
      message: 'Trade updated successfully',
      timestamp: Date.now()
    });

  } catch (error) {
    if (error.message === 'Trade not found') {
      return res.status(404).json({ error: 'Trade not found' });
    }
    
    console.error('❌ Error updating trade:', error);
    res.status(500).json({ error: 'Failed to update trade' });
  }
});

// DELETE /api/pnl/trades/:id - Delete trade
router.delete('/trades/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedTrade = await pnlService.deleteTrade(id);

    res.json({
      success: true,
      trade: deletedTrade,
      message: 'Trade deleted successfully',
      timestamp: Date.now()
    });

  } catch (error) {
    if (error.message === 'Trade not found') {
      return res.status(404).json({ error: 'Trade not found' });
    }
    
    console.error('❌ Error deleting trade:', error);
    res.status(500).json({ error: 'Failed to delete trade' });
  }
});

// GET /api/pnl/summary - Get summary statistics
router.get('/summary', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      symbol,
      result
    } = req.query;

    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (symbol) filters.symbol = symbol;
    if (result) filters.result = result;

    const summary = pnlService.calculateSummaryStats(filters);

    res.json({
      success: true,
      summary,
      filters,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error calculating summary:', error);
    res.status(500).json({ error: 'Failed to calculate summary' });
  }
});

// GET /api/pnl/daily - Get daily PnL data
router.get('/daily', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      symbol
    } = req.query;

    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (symbol) filters.symbol = symbol;

    const dailyPnL = pnlService.calculateDailyPnL(filters);

    res.json({
      success: true,
      dailyPnL,
      filters,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error calculating daily PnL:', error);
    res.status(500).json({ error: 'Failed to calculate daily PnL' });
  }
});

// GET /api/pnl/cumulative - Get cumulative PnL data
router.get('/cumulative', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      symbol
    } = req.query;

    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (symbol) filters.symbol = symbol;

    const cumulativePnL = pnlService.calculateCumulativePnL(filters);

    res.json({
      success: true,
      cumulativePnL,
      filters,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error calculating cumulative PnL:', error);
    res.status(500).json({ error: 'Failed to calculate cumulative PnL' });
  }
});

// GET /api/pnl/monthly - Get monthly statistics
router.get('/monthly', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      symbol
    } = req.query;

    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (symbol) filters.symbol = symbol;

    const monthlyStats = pnlService.calculateMonthlyStats(filters);

    res.json({
      success: true,
      monthlyStats,
      filters,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error calculating monthly stats:', error);
    res.status(500).json({ error: 'Failed to calculate monthly stats' });
  }
});

// GET /api/pnl/top-symbols - Get top performing symbols
router.get('/top-symbols', async (req, res) => {
  try {
    const {
      limit = 10,
      startDate,
      endDate
    } = req.query;

    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const topSymbols = pnlService.getTopPerformingSymbols(parseInt(limit), filters);

    res.json({
      success: true,
      topSymbols,
      filters,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error fetching top symbols:', error);
    res.status(500).json({ error: 'Failed to fetch top symbols' });
  }
});

// POST /api/pnl/sample-data - Add sample trades for testing
router.post('/sample-data', async (req, res) => {
  try {
    await pnlService.addSampleTrades();

    res.json({
      success: true,
      message: 'Sample trades added successfully',
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Error adding sample data:', error);
    res.status(500).json({ error: 'Failed to add sample data' });
  }
});

// GET /api/pnl/export - Export trades data
router.get('/export', async (req, res) => {
  try {
    const {
      format = 'json',
      startDate,
      endDate,
      symbol
    } = req.query;

    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (symbol) filters.symbol = symbol;

    const trades = pnlService.getAllTrades(filters);

    if (format === 'csv') {
      // Convert to CSV format
      const csvHeader = 'Date,Symbol,Entry Price,Exit Price,Result,PnL,Leverage,Position Size\n';
      const csvData = trades.map(trade => 
        `${trade.date},${trade.symbol},${trade.entryPrice},${trade.exitPrice},${trade.result},${trade.pnl},${trade.leverage || 1},${trade.positionSize || 0}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=trades.csv');
      res.send(csvHeader + csvData);
    } else {
      // JSON format
      res.json({
        success: true,
        trades,
        count: trades.length,
        filters,
        exportedAt: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

module.exports = router;
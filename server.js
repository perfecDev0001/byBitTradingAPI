/**
 * Bybit Trading Dashboard Backend Server
 * 
 * Main Express server that provides REST API endpoints for the trading dashboard
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
const http = require('http');

// Import route modules
const marketRoutes = require('./routes/marketRoutes');
const backtestingRoutes = require('./routes/backtestingRoutes');
const pnlRoutes = require('./routes/pnlRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const { router: signalRoutes, initializeSignalService } = require('./routes/signalRoutes');
const candlestickRoutes = require('./routes/candlestickRoutes');

// Import services
const MarketDataService = require('./services/MarketDataService');
const SocketIOService = require('./services/SocketIOService');
const SignalService = require('./services/SignalService');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:3000',
    'http://localhost:4173',
    'https://workable-relieved-snipe.ngrok-free.app',
    'https://bybitrading.netlify.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/market', marketRoutes);
app.use('/api/backtesting', backtestingRoutes);
app.use('/api/pnl', pnlRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/candlestick', candlestickRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize services
const marketDataService = new MarketDataService();
const socketService = new SocketIOService(server);
const signalService = new SignalService();

// Connect services
socketService.setMarketDataService(marketDataService);
marketRoutes.setMarketDataService(marketDataService);
initializeSignalService(signalService);

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`Bybit Trading Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`Socket.IO server available at http://localhost:${PORT}`);
  
  // Initialize market data service
  try {
    await marketDataService.initialize();
    console.log('Market Data Service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Market Data Service:', error);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

module.exports = app;
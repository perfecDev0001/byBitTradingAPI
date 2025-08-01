/**
 * WebSocket Service
 * Handles real-time communication with frontend clients
 */

const WebSocket = require('ws');

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws'
    });
    
    this.clients = new Set();
    this.marketDataService = null;
    
    this.initialize();
  }

  initialize() {
    this.wss.on('connection', (ws, req) => {
      this.clients.add(ws);

      // Send initial connection message
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to Bybit Trading Dashboard',
        timestamp: Date.now()
      }));

      // Handle client messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(ws, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        this.clients.delete(ws);
      });
    });

    console.log(`🔌 WebSocket server initialized on path /ws`);
  }

  handleClientMessage(ws, data) {
    switch (data.type) {
      case 'subscribe':
        this.handleSubscription(ws, data);
        break;
      case 'unsubscribe':
        this.handleUnsubscription(ws, data);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      default:
        console.log('📨 Unknown message type:', data.type);
    }
  }

  handleSubscription(ws, data) {
    const { channels } = data;
    
    if (!ws.subscriptions) {
      ws.subscriptions = new Set();
    }

    channels.forEach(channel => {
      ws.subscriptions.add(channel);

    });

    // Send confirmation
    ws.send(JSON.stringify({
      type: 'subscription_confirmed',
      channels,
      timestamp: Date.now()
    }));
  }

  handleUnsubscription(ws, data) {
    const { channels } = data;
    
    if (ws.subscriptions) {
      channels.forEach(channel => {
        ws.subscriptions.delete(channel);
  
      });
    }

    // Send confirmation
    ws.send(JSON.stringify({
      type: 'unsubscription_confirmed',
      channels,
      timestamp: Date.now()
    }));
  }

  setMarketDataService(marketDataService) {
    this.marketDataService = marketDataService;
    
    // Listen to market data events
    marketDataService.on('marketUpdate', (data) => {
      this.broadcast('market_update', data, 'market');
    });

    marketDataService.on('klineUpdate', (data) => {
      this.broadcast('kline_update', data, 'kline');
    });

    marketDataService.on('signals', (data) => {
      this.broadcast('signals', data, 'signals');
    });
  }

  broadcast(type, data, channel = null) {
    const message = JSON.stringify({
      type,
      data,
      channel,
      timestamp: Date.now()
    });

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        // Check if client is subscribed to this channel
        if (!channel || !client.subscriptions || client.subscriptions.has(channel)) {
          try {
            client.send(message);
          } catch (error) {
            console.error('❌ Error sending message to client:', error);
            this.clients.delete(client);
          }
        }
      } else {
        this.clients.delete(client);
      }
    });
  }

  sendToClient(client, type, data) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify({
          type,
          data,
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error('❌ Error sending message to specific client:', error);
        this.clients.delete(client);
      }
    }
  }

  getConnectedClientsCount() {
    return this.clients.size;
  }
}

module.exports = WebSocketService;
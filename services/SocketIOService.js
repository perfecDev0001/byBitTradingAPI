/**
 * Socket.IO Service
 * Handles real-time communication with frontend clients using Socket.IO
 */

const { Server } = require('socket.io');

class SocketIOService {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: [
          process.env.FRONTEND_URL || 'http://localhost:5173',
          'http://localhost:8080',
          'http://localhost:3000',
          'http://localhost:4173'
        ],
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });
    
    this.clients = new Map();
    this.marketDataService = null;
    
    this.initialize();
  }

  initialize() {
    this.io.on('connection', (socket) => {
      console.log(`🔌 New Socket.IO client connected: ${socket.id}`);
      
      // Store client with subscriptions
      this.clients.set(socket.id, {
        socket,
        subscriptions: new Set()
      });

      // Send initial connection message
      socket.emit('connection', {
        message: 'Connected to Bybit Trading Dashboard',
        timestamp: Date.now(),
        clientId: socket.id
      });

      // Handle client subscription
      socket.on('subscribe', (data) => {
        this.handleSubscription(socket, data);
      });

      // Handle client unsubscription
      socket.on('unsubscribe', (data) => {
        this.handleUnsubscription(socket, data);
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Handle custom events
      socket.on('market_request', (data) => {
        this.handleMarketRequest(socket, data);
      });

      // Handle client disconnect
      socket.on('disconnect', (reason) => {
        console.log(`🔌 Socket.IO client disconnected: ${socket.id}, reason: ${reason}`);
        this.clients.delete(socket.id);
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error(`❌ Socket.IO error for client ${socket.id}:`, error);
        this.clients.delete(socket.id);
      });
    });

    console.log(`🔌 Socket.IO server initialized`);
  }

  handleSubscription(socket, data) {
    const { channels } = data;
    const client = this.clients.get(socket.id);
    
    if (!client) return;

    channels.forEach(channel => {
      client.subscriptions.add(channel);
      console.log(`📡 Client ${socket.id} subscribed to: ${channel}`);
    });

    // Send confirmation
    socket.emit('subscription_confirmed', {
      channels,
      timestamp: Date.now()
    });
  }

  handleUnsubscription(socket, data) {
    const { channels } = data;
    const client = this.clients.get(socket.id);
    
    if (!client) return;

    channels.forEach(channel => {
      client.subscriptions.delete(channel);
      console.log(`📡 Client ${socket.id} unsubscribed from: ${channel}`);
    });

    // Send confirmation
    socket.emit('unsubscription_confirmed', {
      channels,
      timestamp: Date.now()
    });
  }

  handleMarketRequest(socket, data) {
    // Handle specific market data requests
    console.log(`📊 Market data request from ${socket.id}:`, data);
    
    // You can add custom logic here to handle specific market data requests
    socket.emit('market_response', {
      requestId: data.requestId,
      data: 'Market data response',
      timestamp: Date.now()
    });
  }

  setMarketDataService(marketDataService) {
    this.marketDataService = marketDataService;
    console.log('🔗 Connecting MarketDataService to SocketIOService...');
    
    // Listen to market data events
    marketDataService.on('marketUpdate', (data) => {
      console.log(`📡 SocketIO: Received marketUpdate for ${data.symbol}, broadcasting to ${this.clients.size} clients`);
      this.broadcast('market_update', data, 'market');
    });

    marketDataService.on('klineUpdate', (data) => {
      console.log(`📡 SocketIO: Received klineUpdate for ${data.symbol}, broadcasting to ${this.clients.size} clients`);
      this.broadcast('kline_update', data, 'kline');
    });

    marketDataService.on('signals', (data) => {
      console.log(`📡 SocketIO: Received signals for ${data.symbol}, broadcasting to ${this.clients.size} clients`);
      this.broadcast('signals', data, 'signals');
    });
    
    console.log('✅ MarketDataService event listeners set up');
  }

  broadcast(event, data, channel = null) {
    const payload = {
      data,
      channel,
      timestamp: Date.now()
    };

    let sentCount = 0;
    this.clients.forEach((client, clientId) => {
      // Check if client is subscribed to this channel
      if (!channel || client.subscriptions.has(channel)) {
        try {
          client.socket.emit(event, payload);
          sentCount++;
        } catch (error) {
          console.error(`❌ Error sending message to client ${clientId}:`, error);
          this.clients.delete(clientId);
        }
      }
    });
    
    if (sentCount > 0) {
      console.log(`📡 SocketIO: Broadcasted ${event} to ${sentCount} clients (channel: ${channel || 'all'})`);
    }
  }

  sendToClient(clientId, event, data) {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.socket.emit(event, {
          data,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error(`❌ Error sending message to specific client ${clientId}:`, error);
        this.clients.delete(clientId);
      }
    }
  }

  // Send to all clients in a specific room
  broadcastToRoom(room, event, data) {
    this.io.to(room).emit(event, {
      data,
      timestamp: Date.now()
    });
  }

  // Join a client to a room
  joinRoom(clientId, room) {
    const client = this.clients.get(clientId);
    if (client) {
      client.socket.join(room);
      console.log(`📡 Client ${clientId} joined room: ${room}`);
    }
  }

  // Remove a client from a room
  leaveRoom(clientId, room) {
    const client = this.clients.get(clientId);
    if (client) {
      client.socket.leave(room);
      console.log(`📡 Client ${clientId} left room: ${room}`);
    }
  }

  getConnectedClientsCount() {
    return this.clients.size;
  }

  getClientSubscriptions(clientId) {
    const client = this.clients.get(clientId);
    return client ? Array.from(client.subscriptions) : [];
  }

  getAllClients() {
    return Array.from(this.clients.keys());
  }
}

module.exports = SocketIOService;
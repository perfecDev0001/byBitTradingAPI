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
        this.clients.delete(socket.id);
      });

      // Handle errors
      socket.on('error', (error) => {
        console.error(`Socket.IO error for client ${socket.id}:`, error);
        this.clients.delete(socket.id);
      });
    });


  }

  handleSubscription(socket, data) {
    const { channels } = data;
    const client = this.clients.get(socket.id);
    
    if (!client) return;

    channels.forEach(channel => {
      client.subscriptions.add(channel);
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
    });

    // Send confirmation
    socket.emit('unsubscription_confirmed', {
      channels,
      timestamp: Date.now()
    });
  }

  handleMarketRequest(socket, data) {
    // Handle specific market data requests
    
    // You can add custom logic here to handle specific market data requests
    socket.emit('market_response', {
      requestId: data.requestId,
      data: 'Market data response',
      timestamp: Date.now()
    });
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
    }
  }

  // Remove a client from a room
  leaveRoom(clientId, room) {
    const client = this.clients.get(clientId);
    if (client) {
      client.socket.leave(room);
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
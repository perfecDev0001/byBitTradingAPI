/**
 * Socket.IO Connection Test
 * Simple test to verify Socket.IO server is working
 */

const { Server } = require('socket.io');
const http = require('http');

// Create a simple HTTP server
const server = http.createServer();

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);
  
  // Send welcome message
  socket.emit('welcome', {
    message: 'Welcome to Socket.IO test server!',
    timestamp: Date.now(),
    clientId: socket.id
  });
  
  // Handle test events
  socket.on('test_message', (data) => {
    console.log('📨 Received test message:', data);
    socket.emit('test_response', {
      message: 'Test message received!',
      originalData: data,
      timestamp: Date.now()
    });
  });
  
  socket.on('disconnect', (reason) => {
    console.log(`❌ Client disconnected: ${socket.id}, reason: ${reason}`);
  });
});

const PORT = 3002;
server.listen(PORT, () => {
  console.log(`🔌 Socket.IO test server running on port ${PORT}`);
  console.log(`🌐 Connect to: http://localhost:${PORT}`);
});
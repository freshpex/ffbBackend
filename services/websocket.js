import { Server } from 'socket.io';
import { WebSocket } from 'ws';
import logger from '../middleware/logger.js';

// Create the WebSocket service
const setupWebsocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"]
    }
  });

  // Store connected clients
  const connectedClients = new Map();

  io.on('connection', (socket) => {
    logger.info(`WebSocket client connected: ${socket.id}`);
    
    // Store client info
    connectedClients.set(socket.id, {
      id: socket.id,
      joinedAt: new Date()
    });

    // Send welcome message
    socket.emit('welcome', {
      message: 'Connected to FFB WebSocket server',
      clientId: socket.id
    });

    // Handle client authentication
    socket.on('authenticate', (data) => {
      try {
        // Here you would verify the token and update client info
        const clientInfo = connectedClients.get(socket.id);
        
        if (clientInfo && data.userId) {
          clientInfo.userId = data.userId;
          clientInfo.authenticated = true;
          
          logger.info(`WebSocket client authenticated: ${socket.id} (User: ${data.userId})`);
          
          // Join user-specific room for targeted updates
          socket.join(`user:${data.userId}`);
          
          socket.emit('authenticated', { status: 'success' });
        }
      } catch (error) {
        logger.error(`WebSocket authentication error: ${error.message}`);
        socket.emit('authenticated', { 
          status: 'error',
          message: 'Authentication failed'
        });
      }
    });

    // Handle market data subscriptions
    socket.on('subscribe', (data) => {
      if (data.channel) {
        socket.join(data.channel);
        logger.info(`Client ${socket.id} subscribed to ${data.channel}`);
        socket.emit('subscribed', { channel: data.channel });
      }
    });

    // Handle unsubscribe requests
    socket.on('unsubscribe', (data) => {
      if (data.channel) {
        socket.leave(data.channel);
        logger.info(`Client ${socket.id} unsubscribed from ${data.channel}`);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`WebSocket client disconnected: ${socket.id}`);
      connectedClients.delete(socket.id);
    });
  });

  // Method to broadcast market updates
  const broadcastMarketData = (data) => {
    if (data.symbol) {
      io.to(`market:${data.symbol}`).emit('marketUpdate', data);
    } else {
      io.to('market:all').emit('marketUpdate', data);
    }
  };

  // Method to send notification to specific user
  const sendUserNotification = (userId, notification) => {
    if (userId) {
      io.to(`user:${userId}`).emit('notification', notification);
      return true;
    }
    return false;
  };

  // Method to broadcast system announcements
  const broadcastAnnouncement = (announcement) => {
    io.emit('announcement', announcement);
  };

  logger.info("WebSocket service initialized successfully");

  // Return methods that can be used elsewhere in the application
  return {
    broadcastMarketData,
    sendUserNotification,
    broadcastAnnouncement,
    io
  };
};

// Make it available with both default and named exports for backward compatibility
export { setupWebsocket };
export default setupWebsocket;

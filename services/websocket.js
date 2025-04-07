import { Server } from 'socket.io';
import logger from '../middleware/logger.js';

const setupWebsocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST']
    }
  });
  
  const connectedClients = new Map();

  io.on('connection', (socket) => {
    connectedClients.set(socket.id, { 
      id: socket.id, 
      authenticated: false,
      userId: null,
      joinedAt: new Date()
    });

    // Handle authentication
    socket.on('authenticate', async (data) => {
      try {
        if (data.token) {
          const clientInfo = connectedClients.get(socket.id);
          clientInfo.userId = data.userId;
          clientInfo.authenticated = true;
          
          // Join user-specific room for targeted updates
          socket.join(`user:${data.userId}`);
          
          socket.emit('authenticated', { status: 'success' });
        }
      } catch (error) {
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
        socket.emit('subscribed', { channel: data.channel });
      }
    });

    // Handle unsubscribe requests
    socket.on('unsubscribe', (data) => {
      if (data.channel) {
        socket.leave(data.channel);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
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

  const setupAdminNotificationSocket = (io) => {
    const adminNamespace = io.of('/admin');
    
    adminNamespace.on('connection', (socket) => {
      console.log('Admin connected to notification socket');
      
      socket.on('join', (data) => {
        // You could use an admin token to verify access here
        if (data.adminToken) {
          socket.join('admin-notifications');
          console.log('Admin joined notification channel');
        }
      });
      
      socket.on('disconnect', () => {
        console.log('Admin disconnected from notification socket');
      });
    });
    
    return adminNamespace;
  };
  
  // Function to emit admin notification to connected admins
  const emitAdminNotification = (io, notification) => {
    const adminNamespace = io.of('/admin');
    adminNamespace.to('admin-notifications').emit('notification', notification);
  };

  // Return methods that can be used elsewhere in the application
  return {
    io,
    broadcastMarketData,
    sendUserNotification,
    broadcastAnnouncement,
    setupAdminNotificationSocket,
    emitAdminNotification,
    getConnectedClients: () => connectedClients.size
  };
};

export default setupWebsocket;

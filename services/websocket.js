import { WebSocket } from 'ws';
import logger from '../middleware/logger.js';
import { Server } from 'socket.io';

class WebsocketService {
  constructor() {
    this.connections = new Map();
    this.socketServer = null;
    this.streams = new Set();
    this.connectedClients = new Set();
    this.wsBaseUrl = process.env.NODE_ENV === 'production' 
      ? 'wss://stream.binance.com:9443/ws' 
      : 'wss://testnet.binance.vision/ws';
    this.reconnectInterval = 5000; // 5 seconds
    this.heartbeatInterval = 30000; // 30 seconds
  }

  initialize(server) {
    this.socketServer = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.socketServer.on('connection', (client) => {
      logger.info('Client connected to websocket server');
      this.connectedClients.add(client);

      // Set up event handlers
      client.on('subscribe', (data) => this.handleSubscribe(client, data));
      client.on('unsubscribe', (data) => this.handleUnsubscribe(client, data));
      client.on('disconnect', () => this.handleDisconnect(client));
    });

    logger.info('WebSocket server initialized');
  }

  // Handle client subscription request
  handleSubscribe(client, data) {
    try {
      const { stream, symbol } = data;
      
      if (!stream || !symbol) {
        return client.emit('error', { message: 'Invalid subscription data' });
      }
      
      const streamName = `${symbol.toLowerCase()}@${stream}`;
      
      // Track this subscription for the client
      if (!client.subscriptions) {
        client.subscriptions = new Set();
      }
      
      client.subscriptions.add(streamName);
      
      // Create connection if it doesn't exist
      if (!this.connections.has(streamName)) {
        this.connectToStream(streamName);
      }
      
      logger.info(`Client subscribed to ${streamName}`);
      client.emit('subscribed', { stream: streamName });
    } catch (error) {
      logger.error('Error handling subscription:', error);
      client.emit('error', { message: 'Failed to subscribe to stream' });
    }
  }

  // Handle client unsubscription request
  handleUnsubscribe(client, data) {
    try {
      const { stream, symbol } = data;
      
      if (!stream || !symbol) {
        return client.emit('error', { message: 'Invalid unsubscription data' });
      }
      
      const streamName = `${symbol.toLowerCase()}@${stream}`;
      
      // Remove subscription for this client
      if (client.subscriptions) {
        client.subscriptions.delete(streamName);
      }
      
      // Check if any clients are still subscribed to this stream
      let stillSubscribed = false;
      this.connectedClients.forEach(c => {
        if (c.subscriptions && c.subscriptions.has(streamName)) {
          stillSubscribed = true;
        }
      });
      
      // If no clients are subscribed, close the connection
      if (!stillSubscribed && this.connections.has(streamName)) {
        const ws = this.connections.get(streamName);
        ws.close();
        this.connections.delete(streamName);
        logger.info(`Closed connection to ${streamName}`);
      }
      
      logger.info(`Client unsubscribed from ${streamName}`);
      client.emit('unsubscribed', { stream: streamName });
    } catch (error) {
      logger.error('Error handling unsubscription:', error);
      client.emit('error', { message: 'Failed to unsubscribe from stream' });
    }
  }

  // Handle client disconnect
  handleDisconnect(client) {
    try {
      logger.info('Client disconnected from websocket server');
      
      // Clean up client subscriptions
      if (client.subscriptions) {
        client.subscriptions.forEach(streamName => {
          // Check if any other clients are still subscribed
          let stillSubscribed = false;
          this.connectedClients.forEach(c => {
            if (c !== client && c.subscriptions && c.subscriptions.has(streamName)) {
              stillSubscribed = true;
            }
          });
          
          // If no clients are subscribed, close the connection
          if (!stillSubscribed && this.connections.has(streamName)) {
            const ws = this.connections.get(streamName);
            ws.close();
            this.connections.delete(streamName);
            logger.info(`Closed connection to ${streamName} after client disconnect`);
          }
        });
      }
      
      this.connectedClients.delete(client);
    } catch (error) {
      logger.error('Error handling disconnect:', error);
    }
  }

  // Connect to Binance WebSocket stream
  connectToStream(streamName) {
    try {
      const ws = new WebSocket(`${this.wsBaseUrl}/${streamName}`);
      
      // Set up WebSocket event handlers
      ws.on('open', () => {
        logger.info(`Connected to Binance stream: ${streamName}`);
        this.setupHeartbeat(ws, streamName);
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          
          // Broadcast to all clients subscribed to this stream
          this.connectedClients.forEach(client => {
            if (client.subscriptions && client.subscriptions.has(streamName)) {
              client.emit('stream', {
                stream: streamName,
                data: message
              });
            }
          });
        } catch (error) {
          logger.error(`Error processing message from ${streamName}:`, error);
        }
      });
      
      ws.on('error', (error) => {
        logger.error(`WebSocket error for ${streamName}:`, error);
        this.handleReconnect(streamName);
      });
      
      ws.on('close', () => {
        logger.info(`Connection closed for ${streamName}`);
        this.handleReconnect(streamName);
      });
      
      // Store the connection
      this.connections.set(streamName, ws);
    } catch (error) {
      logger.error(`Error connecting to stream ${streamName}:`, error);
      this.handleReconnect(streamName);
    }
  }

  // Set up heartbeat to keep connection alive
  setupHeartbeat(ws, streamName) {
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(heartbeat);
      }
    }, this.heartbeatInterval);
    
    ws.on('close', () => clearInterval(heartbeat));
  }

  // Handle reconnection logic
  handleReconnect(streamName) {
    // Check if any clients are still subscribed to this stream
    let stillSubscribed = false;
    this.connectedClients.forEach(client => {
      if (client.subscriptions && client.subscriptions.has(streamName)) {
        stillSubscribed = true;
      }
    });
    
    if (stillSubscribed) {
      logger.info(`Attempting to reconnect to ${streamName} in ${this.reconnectInterval / 1000}s`);
      
      setTimeout(() => {
        if (this.connections.has(streamName)) {
          const ws = this.connections.get(streamName);
          if (ws.readyState === WebSocket.CLOSED) {
            this.connections.delete(streamName);
            this.connectToStream(streamName);
          }
        } else {
          this.connectToStream(streamName);
        }
      }, this.reconnectInterval);
    }
  }
}

// Create the singleton instance
const websocketService = new WebsocketService();

// Add the setupWebSockets function that index.js is importing
export const setupWebSockets = (server) => {
  try {
    websocketService.initialize(server);
    logger.info('WebSocket service initialized successfully');
    return websocketService;
  } catch (error) {
    logger.error('Failed to initialize WebSocket service:', error);
    throw error;
  }
};

// Export the service instance as default
export default websocketService;

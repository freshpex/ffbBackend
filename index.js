import http from 'http';
import { Server } from 'socket.io';
import config from './config/config.js';
import logger from './middleware/logger.js';
import { connectDatabase } from './utils/dbConnect.js';
import { setupWebSockets } from './services/websocket.js';
import app from './app.js';

// Create HTTP server
const server = http.createServer(app);

// Start the server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDatabase();
    
    // Setup WebSockets
    const io = new Server(server, {
      cors: {
        origin: config.cors.origin,
        methods: ['GET', 'POST']
      }
    });
    setupWebSockets(io);
    
    // Start listening
    const PORT = config.app.port;
    server.listen(PORT, () => {
      logger.info(`Server running in ${config.app.env} mode on port ${PORT}`);
    });
    
    // Handle server errors
    server.on('error', (error) => {
      logger.error('Server error:', error);
      process.exit(1);
    });
    
    // Handle graceful shutdown
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown function
function gracefulShutdown() {
  logger.info('Received shutdown signal, closing connections...');
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
    
    // Force exit after 10 seconds if connections don't close properly
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  });
}

// Handle uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer();

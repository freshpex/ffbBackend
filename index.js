import dotenv from 'dotenv';
import http from 'http';
import app from './app.js';
import mongoose from 'mongoose';
import setupWebsocket from './services/websocket.js';
import logger from './middleware/logger.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5000;
const ENV = process.env.NODE_ENV || 'development';
const MONGO_URI = process.env.MONGODB_URI;

logger.info(`Environment: ${ENV}`);
logger.info(`MongoDB URI: ${MONGO_URI ? 'is defined' : 'is NOT defined'}`);

// Create HTTP server
const server = http.createServer(app);

// Connect to MongoDB with retry logic
const connectDB = async (retryCount = 0) => {
  const MAX_RETRIES = 3;
  
  try {
    if (!MONGO_URI) {
      throw new Error('MongoDB URI is not defined in environment variables');
    }
    
    logger.info(`Connecting to MongoDB... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
    
    const conn = await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });
    
    logger.info(`MongoDB connected: ${conn.connection.host}`);
    
    // Log available collections for debugging
    const collections = await mongoose.connection.db.listCollections().toArray();
    logger.info(`Available collections: ${collections.map(c => c.name).join(', ')}`);
    
    return conn;
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    
    if (retryCount < MAX_RETRIES - 1) {
      // Exponential backoff: 2^retryCount * 1000ms
      const retryDelay = Math.pow(2, retryCount) * 1000;
      logger.info(`Retrying in ${retryDelay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return connectDB(retryCount + 1);
    }
    
    logger.error('Failed to connect to MongoDB after multiple attempts.');
    process.exit(1);
  }
};

// Initialize server
const initServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Initialize WebSocket server
    const websocketService = setupWebsocket(server);
    logger.info('WebSocket server initialized');
    
    // Start the server
    server.listen(PORT, () => {
      logger.info(`Server running in ${ENV} mode on port ${PORT}`);
      
      // Log detailed server information
      const serverInfo = {
        nodeVersion: process.version,
        platform: process.platform,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        pid: process.pid,
        env: ENV
      };
      
      logger.debug('Server details:', serverInfo);
      
      // Log all registered routes for debugging
      const routes = [];
      app._router.stack.forEach(middleware => {
        if(middleware.route) { // routes registered directly on the app
          routes.push({
            path: middleware.route.path,
            methods: Object.keys(middleware.route.methods)
          });
        } else if(middleware.name === 'router') { // router middleware
          middleware.handle.stack.forEach(handler => {
            if(handler.route) {
              routes.push({
                path: handler.route.path,
                methods: Object.keys(handler.route.methods),
                middleware: middleware.regexp.toString()
              });
            }
          });
        }
      });
      
      logger.debug('Registered API routes:', routes);
    });
  } catch (error) {
    logger.error(`Server initialization error: ${error.message}`);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Promise Rejection: ${err.message}`);
  logger.error(err.stack);
  // Don't crash the server, but log it seriously
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
  // Give the server time to log the error before shutting down
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Initialize server
initServer();

export default server;

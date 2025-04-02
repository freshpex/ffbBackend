import http from 'http';
import mongoose from 'mongoose';
import app from './app.js';
import setupWebsocket from './services/websocket.js';
import logger from './middleware/logger.js';

const PORT = process.env.PORT || 5000;
const ENV = process.env.NODE_ENV || 'development';
const MONGO_URI = process.env.MONGODB_URI;

// Create HTTP server
const server = http.createServer(app);

// Connect to MongoDB with retry logic
const connectDB = async (retryCount = 0) => {
  const MAX_RETRIES = 3;
  
  try {
    if (!MONGO_URI) {
      throw new Error('MongoDB URI is not defined in environment variables');
    }
    
    const conn = await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });
    
    return conn;
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    
    if (retryCount < MAX_RETRIES - 1) {
      const retryDelay = Math.pow(2, retryCount) * 1000;
      
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
    
    // Start the server
    server.listen(PORT, () => {
      logger.info(`Server running in ${ENV} mode on port ${PORT}`);
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
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
  
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Initialize server
initServer();

export default server;

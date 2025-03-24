import mongoose from 'mongoose';
import config from '../config/config.js';
import logger from '../middleware/logger.js';

// Maximum number of connection attempts - reduced from 5 to 3
const MAX_CONNECTION_ATTEMPTS = 3;

// Connect to MongoDB with retry logic
export const connectDatabase = async (attempt = 1) => {
  try {
    if (!config.db.uri) {
      throw new Error('MongoDB URI is not defined. Please check your environment variables.');
    }
    
    logger.info(`Connecting to MongoDB... (Attempt ${attempt}/${MAX_CONNECTION_ATTEMPTS})`);
    
    // Connect with timeout handling
    const connection = await Promise.race([
      mongoose.connect(config.db.uri, config.db.options),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 15000)
      )
    ]);
    
    // Check if connection is successful
    if (!connection || !mongoose.connection.readyState) {
      throw new Error('MongoDB connection failed');
    }
    
    // Get proper connection information
    const host = mongoose.connection.host || 
                 connection.connection?.host || 
                 new URL(config.db.uri).hostname;
                 
    // Log successful connection
    logger.info(`MongoDB connected: ${host}`);
    
    // List available collections
    const collections = await listCollections();
    logger.info(`Available collections: ${collections.join(', ') || 'none'}`);
    
    return mongoose.connection;
  } catch (error) {
    logger.error(`MongoDB connection error (Attempt ${attempt}/${MAX_CONNECTION_ATTEMPTS}):`, {
      message: error.message,
      code: error.code,
      name: error.name
    });
    
    // Try to reconnect with exponential backoff if we haven't reached max attempts
    if (attempt < MAX_CONNECTION_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Exponential backoff with 30s max
      logger.info(`Retrying connection in ${delay/1000} seconds...`);
      
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(connectDatabase(attempt + 1));
        }, delay);
      });
    } else {
      logger.error(`Failed to connect to MongoDB after ${MAX_CONNECTION_ATTEMPTS} attempts. Stopping retry attempts.`);
      process.exit(1);
    }
  }
};

// Get list of collections - more robust implementation
async function listCollections() {
  try {
    // Make sure we have a connection
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return [];
    }
    
    // Get the database from the connection
    const db = mongoose.connection.db;
    if (!db) {
      logger.warn('Cannot access database from mongoose connection');
      return [];
    }
    
    // Get collections
    const collections = await db.listCollections().toArray();
    return collections.map(collection => collection.name);
  } catch (error) {
    logger.error('Error listing collections:', { message: error.message });
    return [];
  }
}

// Monitor database connection events and handle reconnections
export const monitorDatabase = () => {
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected. Attempting to reconnect...');
    
    // Attempt to reconnect after a brief delay
    setTimeout(() => {
      connectDatabase()
        .then(() => logger.info('MongoDB reconnected successfully'))
        .catch(err => logger.error('MongoDB reconnection failed:', { message: err.message }));
    }, 5000);
  });
  
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB error:', { message: err.message, code: err.code });
    
    // If the error is critical, attempt to reconnect
    if (err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError') {
      logger.info('Attempting to reconnect due to network error...');
      
      setTimeout(() => {
        connectDatabase()
          .catch(reconnectErr => logger.error('MongoDB reconnection failed:', { message: reconnectErr.message }));
      }, 5000);
    }
  });
  
  // Handle application termination - close connection gracefully
  process.on('SIGINT', async () => {
    try {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed due to app termination');
      process.exit(0);
    } catch (error) {
      logger.error('Error closing MongoDB connection:', { message: error.message });
      process.exit(1);
    }
  });
};

export default { connectDatabase, monitorDatabase };

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  app: {
    port: process.env.PORT || 5000,
    env: process.env.NODE_ENV || 'development',
    baseUrl: process.env.BASE_URL || 'http://localhost:5173',
    apiUrl: process.env.API_URL || 'http://localhost:5000/api',
  },
  
  db: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ffb',
    options: {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4
      maxPoolSize: 10, // Maximum number of connections in the pool
      minPoolSize: 1,  // Minimum number of connections in the pool
    }
  },
  
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'your_secure_jwt_secret_key_here',
    jwtExpiry: process.env.JWT_EXPIRY || '24h'
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  },

  // rateLimit: {
  //   windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 5) * 60 * 1000, // 5 minutes
  //   max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100 // 100 requests per window
  // },

  rateLimit: {
    windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 15) * 60 * 1000,
    max: process.env.NODE_ENV === 'development' 
      ? Infinity
      : parseInt(process.env.RATE_LIMIT_MAX, 10) || 100 // 100 requests per window in other environments
  },
  
  uploads: {
    dir: path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
    maxSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5242880 // 5MB
  },
  
  logs: {
    level: process.env.LOG_LEVEL || 'info',
    dir: path.join(process.cwd(), 'logs')
  },
  
  binance: {
    apiUrls: [
      process.env.BINANCE_API_URL,        // Primary working link
      'https://testnet.binance.vision/api/v3', // Testnet as fallback
    ],
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
    useMockData: process.env.USE_MOCK_DATA === 'true'
  },
  
  // redis: {
  //   enabled: process.env.USE_REDIS === 'true',
  //   url: process.env.REDIS_URL || 'redis://localhost:6379'
  // }
};

export default config;

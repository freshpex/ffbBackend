import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import config from './config/config.js';
import logger, {
  requestLogger,
  errorLogger
} from './middleware/logger.js';
import {
  performanceMonitor,
  memoryMonitor
} from './middleware/performance.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { verifyToken } from './middleware/auth.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import marketRoutes from './routes/market.js';
import transactionRoutes from './routes/transactions.js';
import investmentRoutes from './routes/investments.js';
import adminRoutes from './routes/admin.js';
import tradingRoutes from './routes/trading.js';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://cdn.example.com"],
      connectSrc: ["'self'", "https://api.binance.com", "https://api4.binance.com"]
    }
  }
}));
app.use(cors(config.cors));
app.use(compression());

// JSON parser with size limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Performance monitoring
app.use(performanceMonitor());
app.use(memoryMonitor);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs || 15 * 60 * 1000,
  max: config.rateLimit.max || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later'
});
app.use(limiter);

// Request logging
app.use(requestLogger);

// Use morgan with minimal format
app.use(morgan('tiny', { 
  stream: { 
    write: message => logger.info(message.trim()) 
  } 
}));

// Static files
app.use('/uploads', express.static(config.uploads.dir));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', verifyToken, userRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/transactions', verifyToken, transactionRoutes);
app.use('/api/investments', verifyToken, investmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/trading', verifyToken, tradingRoutes);

// Health check endpoint
app.get('/', (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    environment: config.server.env
  };
  
  res.status(200).json(healthStatus);
});

// Error handling middleware
app.use(errorLogger);
app.use(errorHandler);

// 404 handler for undefined routes
app.use(notFoundHandler);

export default app;

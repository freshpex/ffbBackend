import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import logger, { requestLogger, errorLogger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { performanceMonitor, memoryMonitor } from './middleware/performance.js';
import config from './config/config.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import marketRoutes from './routes/market.js';
import transactionRoutes from './routes/transactions.js';
import investmentRoutes from './routes/investments.js';
import adminRoutes from './routes/admin.js';
import tradingRoutes from './routes/trading.js';

// Import middleware
import { verifyToken } from './middleware/auth.js';

const app = express();

// Security and optimization middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
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
app.use(performanceMonitor);
app.use(memoryMonitor);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later'
});
app.use(limiter);

// Request logging
app.use(requestLogger);

// Static files
app.use('/uploads', express.static(config.uploads.dir));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', verifyToken, userRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/transactions', verifyToken, transactionRoutes);
app.use('/api/investments', verifyToken, investmentRoutes);
app.use('/api/admin', verifyToken, adminRoutes);
app.use('/api/trading', verifyToken, tradingRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    environment: config.app.env,
    memoryUsage: {
      rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    }
  };
  
  res.status(200).json(healthStatus);
});

// Error handling middleware
app.use(errorLogger);
app.use(errorHandler);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ 
    message: 'Resource not found',
    path: req.originalUrl
  });
});

export default app;

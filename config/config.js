import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load environment variables from .env file
dotenv.config();

// Configuration with defaults for various environments
const config = {
  server: {
    port: process.env.PORT || 5000,
    env: process.env.NODE_ENV || "development",
    apiPrefix: process.env.API_PREFIX || "/api",
    isProduction: process.env.NODE_ENV === "production",
    isDevelopment: process.env.NODE_ENV === "development",
    isTest: process.env.NODE_ENV === "test",
  },

  // Database configuration
  db: {
    uri: process.env.MONGODB_URI,
    options: {},
  },

  // Authentication settings
  auth: {
    jwtSecret: process.env.JWT_SECRET || "your_jwt_secret",
    jwtExpiry: process.env.JWT_EXPIRY || "24h",
    bcryptSaltRounds: 10,
  },

  // Redis settings
  redis: {
    enabled: process.env.USE_REDIS === "true",
    url: process.env.REDIS_URL || "redis://localhost:6379",
    ttl: parseInt(process.env.REDIS_TTL) || 60 * 60, // Default to 1 hour
  },

  // Market Data API settings
  marketData: {
    alphaVantage: {
      apiKey: process.env.ALPHA_VANTAGE_API_KEY || "",
      baseUrl: "https://www.alphavantage.co/query",
    },
    cryptoCompare: {
      apiKey: process.env.CRYPTOCOMPARE_API_KEY || "",
      baseUrl: "https://min-api.cryptocompare.com/data",
    },
      coinMarketCap: {
        apiKey: process.env.COINMARKETCAP_API_KEY,
        baseUrl: "https://pro-api.coinmarketcap.com",
      },
    finnhub: {
      apiKey: process.env.FINNHUB_API_KEY || "",
      baseUrl: "https://finnhub.io/api/v1",
    },
    useMockData: process.env.USE_MOCK_DATA === "false",
  },

  // Binance API settings
  binance: {
    apiKey: process.env.BINANCE_API_KEY || "",
    apiSecret: process.env.BINANCE_API_SECRET || "",
    useTestnet: process.env.NODE_ENV !== "production",
    baseUrl: process.env.BINANCE_API_URL || "https://api.binance.com",
    testnetUrl:
      process.env.BINANCE_TESTNET_URL || "https://testnet.binance.vision",
  },

  // Logging settings
  logging: {
    level:
      process.env.LOG_LEVEL ||
      (process.env.NODE_ENV === "production" ? "info" : "debug"),
    filename: process.env.LOG_FILENAME || "app.log",
  },

  // CORS settings
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  },

  // Rate limiting
  rateLimit: {
    window: parseInt(process.env.RATE_LIMIT_WINDOW) || 15, // minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 10000,
    trustProxy: process.env.TRUST_PROXY === "true",
    trustedIPs: process.env.TRUSTED_IPS
      ? process.env.TRUSTED_IPS.split(",")
      : [],
  },

  // File upload settings
  upload: {
    tempDir:
      process.env.NODE_ENV === "production" ? "/tmp/uploads" : "./uploads",
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE) || 5 * 1024 * 1024, // 5MB default
    allowedTypes: ["image/jpeg", "image/png", "application/pdf"],
  },

  // Add uploads property to match app.js expectations
  uploads: {
    dir: process.env.NODE_ENV === "production" ? "/tmp/uploads" : "./uploads",
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE) || 5 * 1024 * 1024, // 5MB default
  },

  // Crypto settings
  crypto: {
    cryptocompareApiKey: process.env.VITE_APP_CRYPTOCOMPARE_API_KEY || "",
  },

  // Firebase configuration
  firebase: {
    apiKey: process.env.VITE_FIREBASE_API_KEY || "",
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.VITE_FIREBASE_APP_ID || "",
    measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "",
  },

  // External service endpoints
  services: {
    // Add any external service URLs here
  },

  // Get config for specific environment
  getEnvConfig() {
    return this[this.server.env] || {};
  },

  // Validate required environment variables
  validate() {
    const requiredVars = ["JWT_SECRET", "MONGODB_URI"];

    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`,
      );
    }

    return true;
  },
};

// Try to validate config (will throw error if missing critical variables)
try {
  config.validate();
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  // In production, we might want to exit the process
  if (config.server.isProduction) {
    process.exit(1);
  }
}

export default config;

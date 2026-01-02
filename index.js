import http from "http";
import mongoose from "mongoose";
import app from "./app.js";
import setupWebsocket from "./services/websocket.js";
import priceAlertService from "./services/priceAlertService.js";
import logger from "./middleware/logger.js";
import { seedEducationFromYoutube } from "./services/educationSeeder.js";

const PORT = process.env.PORT || 5000;
const ENV = process.env.NODE_ENV || "development";
const MONGO_URI = process.env.MONGODB_URI;

// Create HTTP server
const server = http.createServer(app);

// Track server initialization state
let isServerInitializing = false;
let isServerRunning = false;

// Connect to MongoDB with retry logic
const connectDB = async (retryCount = 0) => {
  const MAX_RETRIES = 3;

  try {
    if (!MONGO_URI) {
      throw new Error("MongoDB URI is not defined in environment variables");
    }

    const conn = await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    return conn;
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);

    if (retryCount < MAX_RETRIES - 1) {
      const retryDelay = Math.pow(2, retryCount) * 1000;

      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return connectDB(retryCount + 1);
    }

    logger.error("Failed to connect to MongoDB after multiple attempts.");
    process.exit(1);
  }
};

// Initialize server
const initServer = async () => {
  try {
    // Prevent concurrent initialization attempts
    if (isServerInitializing || isServerRunning) {
      logger.warn(
        "Server initialization already in progress or server is already running",
      );
      return;
    }

    isServerInitializing = true;

    // Connect to database
    await connectDB();

    // Auto-seed Education content (non-blocking)
    seedEducationFromYoutube().catch((err) => {
      logger.error("Education auto-seed error:", err);
    });

    // Initialize WebSocket server
    const websocketService = setupWebsocket(server);

    // Start the price alert checking service (check every 5 minutes)
    priceAlertService.start(5 * 60 * 1000);

    // Start the server
    server.listen(PORT, () => {
      isServerRunning = true;
      isServerInitializing = false;
      logger.info(`Server running in ${ENV} mode on port ${PORT}`);
    });

    // Handle server errors
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        logger.error(`Port ${PORT} is already in use. Server could not start.`);
      } else {
        logger.error(`Server error: ${error.message}`);
      }
      isServerInitializing = false;
      process.exit(1);
    });
  } catch (error) {
    logger.error(`Server initialization error: ${error.message}`);
    isServerInitializing = false;
    isServerRunning = false;
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Promise Rejection: ${err.message}`);
  logger.error(err.stack);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);

  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");

  // Stop the price alert service
  priceAlertService.stop();

  if (isServerRunning) {
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Initialize server only if this is the main module (not imported by another module)
if (process.env.NODE_ENV !== "test") {
  initServer();
}

// Do not export server to prevent multiple initializations

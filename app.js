import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { fileURLToPath } from "url";
import path from "path";
import { dirname } from "path";
import { errorHandler } from "./middleware/errorHandler.js";
import { setupPerformanceMonitoring } from "./middleware/performance.js";
import logger from "./middleware/logger.js";

// Import routes
import authRouter from "./routes/auth.js";
import userRouter from "./routes/users.js";
import adminRouter from "./routes/admin.js";
import transactionRouter from "./routes/transactions.js";
import depositRouter from "./routes/deposits.js";
import withdrawalRouter from "./routes/withdrawals.js";
import investmentRouter from "./routes/investments.js";
import supportRouter from "./routes/support.js";
import atmCardsRouter from "./routes/atmCards.js";
import educationRouter from "./routes/education.js";
import referralRouter from "./routes/referrals.js";
import notificationRouter from "./routes/notifications.js";
import dashboardRouter from "./routes/dashboard.js";
import priceAlertsRouter from "./routes/priceAlerts.js";
import marketNewsRouter from "./routes/marketNews.js";
import adminAnalyticsRouter from "./routes/adminAnalytics.js";
import tradingRouter from "./routes/trading.js";
import visitorRouter from "./routes/visitors.js";
import tasksRouter from "./routes/tasks.js";
import kycRouter from "./routes/kyc.js";
import productsRouter from "./routes/products.js";
import cartRouter from "./routes/cart.js";
import shopOrdersRouter from "./routes/shopOrders.js";

// Initialize Express app
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Setup middleware
const allowedOrigin = "*";
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigin === "*") return callback(null, true);
    const allowed = allowedOrigin.split(",").map((s) => s.trim());
    if (allowed.indexOf(origin) !== -1) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 204,
  maxAge: 600,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log requests
app.use(morgan("dev"));

// Setup performance monitoring
setupPerformanceMonitoring(app);

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API health check
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Register routes
app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/admin", adminRouter);
app.use("/api/transactions", transactionRouter);
app.use("/api/deposits", depositRouter);
app.use("/api/withdrawals", withdrawalRouter);
app.use("/api/investments", investmentRouter);
app.use("/api/support", supportRouter);
app.use("/api/atm-cards", atmCardsRouter);
app.use("/api/education", educationRouter);
app.use("/api/referrals", referralRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/price-alerts", priceAlertsRouter);
app.use("/api/market-news", marketNewsRouter);
app.use("/api/admin/analytics", adminAnalyticsRouter);
app.use("/api/trading", tradingRouter);
app.use("/api/tracking", visitorRouter);
app.use("/api/tasks", tasksRouter);
// KYC routes (user-facing)
app.use("/api/users/kyc", kycRouter);
// Shop routes
app.use("/api/products", productsRouter);
app.use("/api/cart", cartRouter);
app.use("/api/shop/orders", shopOrdersRouter);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

export default app;

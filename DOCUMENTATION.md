# Fidelity First Brokers - Backend Documentation

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture Overview](#architecture-overview)
3. [Setup and Installation](#setup-and-installation)
4. [API Reference](#api-reference)
5. [Database Models](#database-models)
6. [Authentication System](#authentication-system)
7. [Middleware](#middleware)
8. [Controllers](#controllers)
9. [Services](#services)
10. [Error Handling](#error-handling)
11. [Validation](#validation)
12. [Logging](#logging)
13. [External Integrations](#external-integrations)
14. [Testing](#testing)
15. [Deployment](#deployment)
16. [Performance Optimization](#performance-optimization)
17. [Security Considerations](#security-considerations)
18. [Database Maintenance](#database-maintenance)
19. [Development Guidelines](#development-guidelines)
20. [Troubleshooting](#troubleshooting)

## Introduction

Fidelity First Brokers (FFB) Backend is a Node.js API server that powers the FFB financial platform. This documentation provides detailed technical information for developers working on the backend system.

The backend serves as the central business logic layer handling all data processing, authentication, market data integration, and administration functionality required by the FFB platform.

## Architecture Overview

### High-Level Architecture

The FFB Backend follows a modular architecture based on the MVC (Model-View-Controller) pattern, with the following core components:

- **Models**: MongoDB schemas and document models powered by Mongoose
- **Controllers**: Request handlers that process API requests and return responses
- **Routes**: API endpoint definitions and routing logic
- **Middleware**: Cross-cutting functionalities like authentication, validation, error handling
- **Services**: External integrations and business logic
- **Utilities**: Helper functions and shared code

### Data Flow

1. Client request reaches the Node.js server
2. Request passes through middleware chain (auth, validation, etc.)
3. Router directs request to appropriate controller
4. Controller processes the request, interacting with models and services
5. Response is generated and returned to client

### Technology Stack Details

- **Runtime**: Node.js 14+
- **Framework**: Express.js 4.17+
- **Database**: MongoDB 4.4+ with Mongoose 6.0+ ODM
- **Authentication**: JWT (jsonwebtoken), bcrypt for password hashing
- **Validation**: Express Validator
- **Logging**: Winston with daily rotation
- **API Documentation**: Swagger/OpenAPI
- **External APIs**: Binance, Trading View, etc.
- **Caching**: Redis (optional)
- **Testing**: Jest, Supertest

## Setup and Installation

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn package manager
- Redis (optional, for caching)
- Git

### Development Environment Setup

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd ffbBackend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   - Create a `.env` file in the root directory
   - Copy the contents from `.env.example` (if available)
   - Fill in all required values (see configuration section)

4. Start MongoDB:

   - If using local MongoDB: `mongod --dbpath <your-db-path>`
   - If using MongoDB Atlas or other cloud provider, no action needed

5. Start the development server:

   ```bash
   npm run dev
   ```

6. Create an admin user (if needed):
   ```bash
   npm run create-admin
   ```

### Configuration

The application configuration is managed through environment variables and the `config.js` file. Key configuration items include:

#### Environment Variables

| Variable           | Description                                 | Default                        | Required |
| ------------------ | ------------------------------------------- | ------------------------------ | -------- |
| PORT               | Server port                                 | 5000                           | No       |
| NODE_ENV           | Environment (development, production, test) | development                    | No       |
| MONGODB_URI        | MongoDB connection string                   | None                           | Yes      |
| JWT_SECRET         | Secret key for JWT tokens                   | None                           | Yes      |
| JWT_EXPIRY         | JWT token expiration time                   | 24h                            | No       |
| LOG_LEVEL          | Logging level                               | info (production), debug (dev) | No       |
| BINANCE_API_KEY    | Binance API key                             | None                           | No       |
| BINANCE_API_SECRET | Binance API secret                          | None                           | No       |
| USE_REDIS          | Enable Redis caching                        | false                          | No       |
| REDIS_URL          | Redis connection URL                        | redis://localhost:6379         | No       |
| CORS_ORIGIN        | CORS allowed origins                        | \*                             | No       |
| UPLOAD_MAX_SIZE    | Max upload file size in bytes               | 5242880 (5MB)                  | No       |

#### Configuration Structure

The `config.js` file in the `config` directory provides application configuration with sensible defaults. It reads from environment variables and exposes a structured configuration object.

Main configuration sections:

- Server settings
- Database options
- Authentication parameters
- External API credentials
- Logging configuration
- Security settings
- Upload limits and directories

## API Reference

The FFB Backend exposes a RESTful API. All endpoints are prefixed with `/api`.

### Authentication Endpoints

#### Register User

- **URL**: `/api/auth/register`
- **Method**: `POST`
- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "securePassword123",
    "firstName": "John",
    "lastName": "Doe"
  }
  ```
- **Response**: User object with JWT token

#### Login User

- **URL**: `/api/auth/login`
- **Method**: `POST`
- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "securePassword123"
  }
  ```
- **Response**: User object with JWT token

#### Additional Auth Endpoints

- `POST /api/auth/refresh-token`: Refresh JWT token
- `POST /api/auth/forgot-password`: Initiate password reset
- `POST /api/auth/reset-password`: Complete password reset
- `POST /api/auth/logout`: Logout user (blacklist token)
- `GET /api/auth/verify-email/:token`: Verify user email

### User Endpoints

#### Get User Profile

- **URL**: `/api/users/profile`
- **Method**: `GET`
- **Auth Required**: Yes
- **Response**: User profile object

#### Update User Profile

- **URL**: `/api/users/profile`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Request Body**:
  ```json
  {
    "firstName": "Updated",
    "lastName": "Name",
    "phone": "+1234567890",
    "address": {
      "street": "123 Main St",
      "city": "New York",
      "country": "USA",
      "postalCode": "10001"
    }
  }
  ```
- **Response**: Updated user object

#### Additional User Endpoints

- `GET /api/users/security`: Get security settings
- `PUT /api/users/security`: Update security settings
- `GET /api/users/payment-methods`: Get user payment methods
- `POST /api/users/payment-methods`: Add new payment method
- `GET /api/users/login-activity`: Get login history
- `PUT /api/users/profile-image`: Upload profile image

### Financial Operations Endpoints

#### Get Dashboard Data

- **URL**: `/api/dashboard`
- **Method**: `GET`
- **Auth Required**: Yes
- **Response**: Dashboard data object

#### Deposits

- `POST /api/deposits`: Create deposit request
- `GET /api/deposits`: Get deposit history
- `GET /api/deposits/:id`: Get deposit details

#### Withdrawals

- `POST /api/withdrawals`: Create withdrawal request
- `GET /api/withdrawals`: Get withdrawal history
- `GET /api/withdrawals/:id`: Get withdrawal details

#### Investments

- `GET /api/investments`: Get investment options
- `GET /api/investments/plans`: Get available investment plans
- `POST /api/investments`: Make new investment
- `GET /api/investments/user`: Get user's investments

#### Trading Operations

- `GET /api/trading/market`: Get market data
- `POST /api/trading/orders`: Place new order
- `GET /api/trading/orders`: Get user's orders
- `GET /api/trading/orders/:id`: Get order details

#### Price Alerts

- `POST /api/price-alerts`: Create new price alert
- `GET /api/price-alerts`: Get user's price alerts
- `DELETE /api/price-alerts/:id`: Delete price alert

### Admin Endpoints

#### User Management

- `GET /api/admin/users`: Get all users (with filtering)
- `GET /api/admin/users/:id`: Get user details
- `POST /api/admin/users`: Create new user
- `PUT /api/admin/users/:id`: Update user
- `DELETE /api/admin/users/:id`: Delete user

#### Transaction Management

- `GET /api/admin/transactions`: Get all transactions
- `GET /api/admin/transactions/:id`: Get transaction details
- `PUT /api/admin/transactions/:id`: Process transaction

#### KYC Management

- `GET /api/admin/kyc`: Get all KYC requests
- `GET /api/admin/kyc/:id`: Get KYC request details
- `PUT /api/admin/kyc/:id/approve`: Approve KYC request
- `PUT /api/admin/kyc/:id/reject`: Reject KYC request

#### Support Tickets

- `GET /api/admin/support`: Get all support tickets
- `GET /api/admin/support/:id`: Get ticket details
- `PUT /api/admin/support/:id`: Update ticket status
- `POST /api/admin/support/:id/reply`: Add reply to ticket

#### Analytics

- `GET /api/admin/analytics/overview`: Get analytics overview
- `GET /api/admin/analytics/users`: Get user growth analytics
- `GET /api/admin/analytics/financial`: Get financial analytics
- `GET /api/admin/analytics/transactions`: Get transaction analytics
- `GET /api/admin/analytics/performance`: Get performance analytics

#### System Settings

- `GET /api/admin/settings`: Get all system settings
- `PUT /api/admin/settings`: Update system settings
- `POST /api/admin/settings`: Create new setting
- `DELETE /api/admin/settings/:key`: Delete setting

## Database Models

The application uses MongoDB with Mongoose ODM. Below are the key models and their schemas.

### User Model

The `User` model represents platform users including end-users and administrators.

```javascript
{
  uid: String,                  // Unique user identifier
  email: String,                // User email (unique)
  password: String,             // Hashed password
  firstName: String,            // First name
  lastName: String,             // Last name
  role: {                       // User role
    type: String,
    enum: ['user', 'admin', 'superadmin'],
    default: 'user'
  },
  status: {                     // Account status
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  phone: String,                // Phone number
  address: {                    // Address information
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },
  profileImage: String,         // Profile image URL
  balance: Number,              // Account balance
  referralCode: String,         // Unique referral code
  referredBy: {                 // Who referred this user
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  kycStatus: {                  // KYC verification status
    type: String,
    enum: ['not_submitted', 'pending', 'approved', 'rejected'],
    default: 'not_submitted'
  },
  kycVerified: {                // KYC verification flag
    type: Boolean,
    default: false
  },
  kycDocuments: {               // KYC document URLs
    idCard: {
      url: String,
      verifiedAt: Date
    },
    proofOfAddress: {
      url: String,
      verifiedAt: Date
    }
  },
  emailVerified: {              // Email verification flag
    type: Boolean,
    default: false
  },
  resetToken: String,           // Password reset token
  resetTokenExpiry: Date,       // Reset token expiration
  lastLoginAt: Date,            // Last login timestamp
  loginAttempts: Number,        // Failed login attempts
  lockUntil: Date,              // Account lock timestamp
  apiKeys: [{                   // API keys for external access
    key: String,
    secret: String,
    permissions: [String],
    createdAt: Date,
    lastUsedAt: Date
  }],
  createdAt: Date,              // Account creation timestamp
  updatedAt: Date               // Last update timestamp
}
```

### Transaction Model

The `Transaction` model represents financial transactions in the system.

```javascript
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'investment', 'referral', 'transfer', 'fee'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'rejected'],
    default: 'pending'
  },
  method: {
    type: String,
    enum: ['bank_transfer', 'credit_card', 'paypal', 'bitcoin', 'ethereum', 'other'],
    required: true
  },
  description: String,
  reference: String,
  adminNotes: String,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: Date,
  metadata: Object,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}
```

### Investment Model

The `Investment` model represents user investments in the platform.

```javascript
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InvestmentPlan',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: Date,
  returns: {
    expected: Number,
    current: {
      type: Number,
      default: 0
    }
  },
  transactions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  }],
  lastProfitUpdate: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}
```

### KYC Request Model

The `KycRequest` model tracks Know Your Customer verification requests.

```javascript
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  documents: {
    idCard: {
      url: String,
      type: String,
      uploadedAt: Date
    },
    proofOfAddress: {
      url: String,
      type: String,
      uploadedAt: Date
    },
    selfie: {
      url: String,
      uploadedAt: Date
    },
    additionalDocuments: [{
      url: String,
      type: String,
      description: String,
      uploadedAt: Date
    }]
  },
  personalInfo: {
    dob: Date,
    nationality: String,
    occupation: String
  },
  rejectionReason: String,
  adminNotes: String,
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}
```

### Support Ticket Model

The `SupportTicket` model manages customer support tickets.

```javascript
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  department: {
    type: String,
    enum: ['general', 'technical', 'billing', 'compliance'],
    default: 'general'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  replies: [{
    message: String,
    sender: {
      type: String,
      enum: ['user', 'admin'],
      required: true
    },
    attachment: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  adminNotes: String,
  firstResponseAt: Date,
  resolvedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}
```

## Authentication System

The FFB Backend uses a JWT-based authentication system with role-based access control.

### Authentication Flow

1. User registers or logs in
2. Server validates credentials
3. Server generates JWT token with user information and permissions
4. Token is returned to client
5. Client includes token in Authorization header for subsequent requests
6. Server validates token and extracts user information for protected routes

### JWT Token Structure

```
Header: {
  "alg": "HS256",
  "typ": "JWT"
}

Payload: {
  "id": "user_mongodb_id",
  "email": "user@example.com",
  "role": "user",
  "iat": 1619631774,
  "exp": 1619718174
}

Signature: HMACSHA256(
  base64UrlEncode(header) + "." +
  base64UrlEncode(payload),
  JWT_SECRET
)
```

### Authentication Middleware

The `auth.js` middleware verifies JWT tokens and populates the request with user information:

```javascript
// Simplified example
const authenticateUser = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: "authentication_required",
        message: "Authentication required",
      },
    });
  }

  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: "invalid_token",
        message: "Invalid or expired token",
      },
    });
  }
};
```

### Role-Based Access Control

The `checkRole` middleware verifies that a user has the required role:

```javascript
// Simplified example
const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "authentication_required",
          message: "Authentication required",
        },
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "permission_denied",
          message: "You do not have permission to access this resource",
        },
      });
    }

    next();
  };
};
```

## Middleware

The application uses various middleware for cross-cutting concerns:

### Authentication Middleware

Location: `middleware/auth.js`

Provides:

- JWT validation
- Role-based access control
- API key authentication

### Error Handling Middleware

Location: `middleware/errorHandler.js`

Features:

- Centralized error handling
- Standardized error responses
- Error classification
- Error logging

### Validation Middleware

Location: `middleware/validate.js`

Features:

- Input validation using express-validator
- Schema-based validation
- Custom validation rules
- Error formatting

### Rate Limiting Middleware

Location: `middleware/rateLimiter.js`

Features:

- Request rate limiting
- Protection against brute force attacks
- IP-based or user-based limiting
- Configurable limits and windows

### Logging Middleware

Location: `middleware/logger.js`

Features:

- Request logging
- Response time measurement
- User activity tracking
- Integration with Winston logger

### Performance Monitoring

Location: `middleware/performance.js`

Features:

- Response time tracking
- Slow request identification
- Performance metrics collection

### Circuit Breaker

Location: `middleware/circuitBreaker.js`

Features:

- Protection for external service calls
- Automatic failure detection
- Service degradation handling
- Recovery attempts

### Caching Middleware

Location: `middleware/cache.js`

Features:

- Response caching
- Cache invalidation strategies
- TTL configuration
- Redis integration (optional)

## Controllers

Controllers handle the application logic for each API endpoint. They are organized by domain:

### Authentication Controllers

Location: `controllers/authController.js`

Key functions:

- `register`: User registration
- `login`: User authentication
- `refreshToken`: JWT token renewal
- `forgotPassword`: Password reset initiation
- `resetPassword`: Password reset completion

### User Controllers

Location: `controllers/User*.js`

Key modules:

- `UserProfileController`: Profile management
- `UserSecurityController`: Security settings
- `UserPaymentMethodsController`: Payment methods
- `UserNotificationController`: Notifications

### Financial Controllers

Key modules:

- `DepositController`: Deposit processing
- `WithdrawalController`: Withdrawal processing
- `InvestmentController`: Investment operations
- `DashboardController`: User dashboard data

### Admin Controllers

Location: `controllers/Admin*.js`

Key modules:

- `AdminUserController`: User management
- `AdminTransactionController`: Transaction processing
- `AdminKycController`: KYC verification
- `AdminSupportController`: Support ticket management
- `AdminAnalyticsController`: Analytics data
- `AdminSettingsController`: System settings

### Market Data Controllers

Key modules:

- `MarketNewsController`: Market news
- `PriceAlertController`: Price alerts
- `OrderController`: Trading orders

## Services

Services handle external integrations and complex business logic:

### Binance Service

Location: `services/binanceService.js`

Features:

- Market data retrieval
- Price information
- Trading chart data

### WebSocket Service

Location: `services/websocket.js`

Features:

- Real-time data streaming
- Market updates
- Trading notifications

## Error Handling

The application implements a comprehensive error handling strategy:

### Error Types

- `ValidationError`: Input validation failures
- `AuthenticationError`: Authentication issues
- `AuthorizationError`: Permission problems
- `NotFoundError`: Resource not found
- `ServiceError`: External service failures
- `DatabaseError`: Database operation issues
- `SystemError`: Internal server errors

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "error_code",
    "message": "User-friendly error message",
    "details": [
      {
        "field": "affected_field",
        "message": "Field-specific error message"
      }
    ]
  }
}
```

### Error Handling Implementation

The `errorHandler.js` middleware processes errors and formats responses:

```javascript
// Simplified example
export const errorHandler = (err, req, res, next) => {
  logger.error(`Error: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    user: req.user?.id,
  });

  // Determine error type and response
  if (err instanceof ValidationError) {
    return res.status(400).json({
      success: false,
      error: {
        code: "validation_error",
        message: "Validation failed",
        details: err.details,
      },
    });
  }

  // Handle other error types...

  // Default error response
  return res.status(500).json({
    success: false,
    error: {
      code: "server_error",
      message: "An unexpected error occurred",
    },
  });
};
```

## Validation

The application uses express-validator for input validation:

### Validation Approach

1. Define validation rules for each endpoint
2. Apply validation middleware to routes
3. Check for validation errors in controller
4. Return formatted error response if validation fails

### Example Validation Schema

```javascript
// User creation validation schema
const createUserValidation = [
  body("email")
    .isEmail()
    .withMessage("Must be a valid email address")
    .normalizeEmail(),
  body("firstName")
    .notEmpty()
    .withMessage("First name is required")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters"),
  body("lastName")
    .notEmpty()
    .withMessage("Last name is required")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters"),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
    ),
];
```

### Validation Middleware

The `validate.js` middleware checks validation results:

```javascript
// Simplified example
export const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));

    const errors = validationResult(req);

    if (errors.isEmpty()) {
      return next();
    }

    // Format validation errors
    const errorMessages = errors.array().map((err) => ({
      field: err.param,
      message: err.msg,
    }));

    return res.status(400).json({
      success: false,
      error: {
        code: "validation_error",
        message: "Validation failed",
        details: errorMessages,
      },
    });
  };
};
```

## Logging

The application uses Winston for logging with daily rotation:

### Logging Configuration

```javascript
// Simplified example
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.DailyRotateFile({
      filename: "logs/application-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "14d",
    }),
  ],
});
```

### Logging Levels

- `error`: Error events that might still allow the application to continue
- `warn`: Warning events
- `info`: Informational messages highlighting application progress
- `debug`: Detailed debugging information
- `verbose`: More detailed debugging information

### Usage Examples

```javascript
// Error logging
logger.error("Failed to process transaction", {
  transactionId: tx.id,
  userId: user.id,
  error: err.message,
});

// Info logging
logger.info("User logged in successfully", {
  userId: user.id,
  ipAddress: req.ip,
});

// Debug logging
logger.debug("Processing deposit request", {
  amount: req.body.amount,
  method: req.body.method,
});
```

## External Integrations

The application integrates with various external services:

### Binance API

- **Purpose**: Get cryptocurrency market data and prices
- **Integration**: REST API and WebSocket
- **Configuration**: API key and secret in environment variables
- **Service**: `services/binanceService.js`

### File Storage

- **Local Storage**: For development environment
- **Cloud Storage**: (AWS S3, etc.) for production environment
- **Configuration**: Upload limits and paths in config file
- **Utility**: `utils/fileHandler.js`

## Testing

The application uses Jest for testing:

### Test Types

- **Unit Tests**: Test individual functions and modules
- **Integration Tests**: Test API endpoints and database operations
- **End-to-End Tests**: Test complete user workflows

### Test Setup

- **Test Database**: Separate MongoDB instance for testing
- **Test Environment**: `.env.test` file with test-specific configuration
- **Test Data**: Seed data for consistent test scenarios

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/auth.test.js

# Run with coverage report
npm test -- --coverage
```

## Deployment

The application supports multiple deployment options:

### Vercel Deployment

- **Configuration**: `vercel.json` file
- **Build Command**: `npm run build`
- **Environment Variables**: Set in Vercel dashboard

### Traditional Server Deployment

- **Process Manager**: PM2 for Node.js process management
- **Web Server**: Nginx as reverse proxy
- **SSL**: Let's Encrypt for HTTPS
- **Monitoring**: PM2 monitoring and alerts

### Docker Deployment

- **Dockerfile**: For containerization
- **Docker Compose**: For multi-container setup
- **Environment**: Docker environment variables

## Performance Optimization

The application implements several performance optimization strategies:

### Database Optimization

- **Indexing**: Proper MongoDB indexes for frequent queries
- **Projection**: Select only required fields
- **Pagination**: Limit results for large datasets
- **Aggregation Pipeline**: Efficient data processing

### Caching Strategies

- **Response Caching**: Cache API responses
- **Data Caching**: Cache frequently accessed data
- **Redis**: Optional Redis integration for distributed caching
- **Cache Invalidation**: TTL-based and event-based invalidation

### Code Optimization

- **Asynchronous Operations**: Non-blocking I/O with async/await
- **Batch Processing**: Group operations where possible
- **Connection Pooling**: Reuse database connections
- **Compression**: gzip/deflate compression for responses

## Security Considerations

The application implements comprehensive security measures:

### Authentication Security

- **Password Hashing**: bcrypt with appropriate salt rounds
- **JWT Security**: Short-lived tokens with secure signing
- **Rate Limiting**: Prevent brute force attacks
- **Account Lockout**: Temporary lockout after failed attempts

### Data Security

- **Input Validation**: Validate all user inputs
- **Output Sanitization**: Prevent XSS attacks
- **CORS Policy**: Restrict cross-origin requests
- **Content Security Policy**: Limit resource loading
- **HTTPS Only**: Enforce secure connections in production

### API Security

- **API Rate Limiting**: Prevent abuse and DoS attacks
- **Request Validation**: Validate all API parameters
- **Role-Based Access**: Proper permission checks
- **API Keys**: Secure API key management
- **Audit Logging**: Track security-relevant events

## Database Maintenance

Guidelines for database maintenance:

### Backups

- **Automated Backups**: Daily database backups
- **Backup Retention**: Store backups for at least 30 days
- **Backup Testing**: Regularly test backup restoration
- **Off-site Storage**: Store backups in separate location

### Monitoring

- **Performance Monitoring**: Track database performance
- **Space Monitoring**: Monitor disk space usage
- **Query Monitoring**: Identify slow queries
- **Connection Monitoring**: Track connection usage

### Indexing

- **Index Analysis**: Regularly review index usage
- **Missing Indexes**: Add indexes for frequent queries
- **Unused Indexes**: Remove unused indexes
- **Compound Indexes**: Use for multi-field queries

## Development Guidelines

Best practices for developers working on the project:

### Code Style

- **ESLint Configuration**: Follow ESLint rules
- **Prettier**: Use for consistent formatting
- **Naming Conventions**: Clear and consistent naming
- **Comments**: Document complex logic and public APIs

### Git Workflow

- **Branch Naming**: Use descriptive branch names
- **Commit Messages**: Follow conventional commits
- **Pull Requests**: Require code review
- **CI/CD**: Automated testing for all PRs

### Documentation

- **JSDoc Comments**: Document functions and parameters
- **API Documentation**: Keep API docs updated
- **README Updates**: Update for new features
- **Change Log**: Maintain version history

### Error Handling

- **Comprehensive Errors**: Handle all potential errors
- **User-Friendly Messages**: Clear error messages
- **Logging**: Log errors with context
- **Fail Gracefully**: Maintain system stability

## Troubleshooting

Common issues and solutions:

### Authentication Issues

**Problem**: JWT token validation fails

**Solution**:

1. Check JWT secret in environment variables
2. Verify token expiration time
3. Ensure clocks are synchronized
4. Check token format in Authorization header

### Database Connection Issues

**Problem**: Cannot connect to MongoDB

**Solution**:

1. Verify MongoDB URI in environment variables
2. Check MongoDB server status
3. Verify network connectivity
4. Check MongoDB user credentials
5. Verify IP allowlist in MongoDB Atlas

### API Response Issues

**Problem**: API returns 500 errors

**Solution**:

1. Check application logs for errors
2. Verify input validation
3. Check external service connectivity
4. Test with minimal payload
5. Verify database queries

### Performance Issues

**Problem**: Slow API responses

**Solution**:

1. Check database queries and indexes
2. Review caching implementation
3. Monitor external API response times
4. Check server resources (CPU, memory)
5. Implement pagination for large datasets

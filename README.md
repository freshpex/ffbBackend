# Fidelity First Brokers - Backend

## Project Overview

Fidelity First Brokers (FFB) Backend is a secure, high-performance API server built to power the FFB financial platform. It provides comprehensive functionality for investment services, trading operations, user account management, and administrative controls.

## Key Features

### Authentication & Authorization

- Secure JWT-based authentication system
- Role-based access control (user, admin, superadmin)
- Firebase authentication integration
- Password encryption with bcrypt
- API key management for third-party integrations

### User Management

- User registration and profile management
- KYC verification workflow
- Security settings and login activity tracking
- Payment method management

### Financial Operations

- Deposit and withdrawal processing
- Investment plans and user investments
- Trading functionality
- Transaction history and reporting
- Referral program management

### Admin Dashboard API

- Complete administrative functions
- User management and oversight
- Transaction processing and monitoring
- KYC verification administration
- Support ticket system
- System settings management
- Comprehensive analytics

### Market Data

- Real-time cryptocurrency price data
- Trading view data integration
- Market news API
- Price alerts system

### Security Features

- Rate limiting to prevent abuse
- Circuit breaker for external API protection
- Validation for all inputs
- Detailed error handling
- API access logging
- Performance monitoring

## Technical Stack

- **Framework**: Node.js with Express
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT and Firebase Auth
- **API Documentation**: Swagger/OpenAPI
- **External Integrations**: Binance API, Trading View
- **Logging**: Winston logger with daily rotation
- **Caching**: Redis (optional) for performance
- **Testing**: Jest for unit and integration tests

## Project Structure

The backend application follows an MVC-like architecture with the following structure:

```
ffbBackend/
├── app.js                 # Express application setup
├── index.js               # Application entry point
├── config/                # Configuration files
│   └── config.js          # Application configuration
├── controllers/           # API controllers
│   ├── Admin/             # Admin-specific controllers
│   └── User/              # User-specific controllers
├── middleware/            # Express middleware
│   ├── auth.js            # Authentication middleware
│   ├── errorHandler.js    # Error handling middleware
│   ├── validate.js        # Validation middleware
│   └── ...                # Other middleware
├── models/                # Mongoose data models
│   ├── User.js            # User model
│   ├── Transaction.js     # Transaction model
│   └── ...                # Other models
├── routes/                # API routes
│   ├── admin.js           # Admin routes
│   ├── auth.js            # Authentication routes
│   └── ...                # Other routes
├── services/              # External service integrations
│   ├── binanceService.js  # Binance API integration
│   └── websocket.js       # WebSocket service
├── utils/                 # Utility functions
│   ├── apiHelper.js       # API response helpers
│   ├── dbConnect.js       # Database connection
│   └── ...                # Other utilities
├── scripts/               # Utility scripts
│   └── checkAndCreateAdmin.js # Admin user creation script
├── logs/                  # Application logs
└── uploads/               # File uploads directory
    └── kyc/              # KYC document uploads
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn package manager
- Redis (optional, for caching)

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure environment variables:

   - Create a `.env` file based on `.env.example`
   - Set the MongoDB connection string
   - Configure JWT secret key
   - Add other required API keys

4. Start the development server:

   ```
   npm run dev
   ```

5. Run database initialization (if needed):
   ```
   npm run init-db
   ```

### Building for Production

```
npm run build
```

### Deployment

The application is configured for deployment on Vercel, AWS, or traditional servers.

## Environment Variables

Key environment variables include:

- `PORT`: Server port (default: 5000)
- `NODE_ENV`: Environment (development, production, test)
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `JWT_EXPIRY`: JWT token expiration time
- `BINANCE_API_KEY`: Binance API key
- `BINANCE_API_SECRET`: Binance API secret
- `USE_REDIS`: Enable Redis caching (true/false)
- `REDIS_URL`: Redis connection URL
- `LOG_LEVEL`: Logging level

## API Documentation

The API follows RESTful conventions and includes the following main endpoints:

### Authentication

- `POST /api/auth/register`: Register a new user
- `POST /api/auth/login`: User login
- `POST /api/auth/refresh-token`: Refresh JWT token
- `POST /api/auth/forgot-password`: Password recovery

### User API

- `GET /api/users/profile`: Get user profile
- `PUT /api/users/profile`: Update user profile
- `GET /api/users/transactions`: Get user transactions
- `GET /api/dashboard`: Get user dashboard data

### Financial Operations

- `POST /api/deposits`: Create deposit request
- `GET /api/deposits`: Get deposit history
- `POST /api/withdrawals`: Create withdrawal request
- `GET /api/investments`: Get investment options
- `POST /api/investments`: Make new investment

### Admin API

- `GET /api/admin/users`: Get all users
- `GET /api/admin/transactions`: Get all transactions
- `PUT /api/admin/transactions/:id`: Process transaction
- `GET /api/admin/kyc`: Get KYC requests
- `PUT /api/admin/kyc/:id`: Process KYC request
- `GET /api/admin/analytics`: Get admin analytics

## Error Handling

The API uses consistent error responses with the following format:

```json
{
  "success": false,
  "error": {
    "code": "validation_error",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Must be a valid email address"
      }
    ]
  }
}
```

## Security Measures

- All passwords are hashed using bcrypt
- JWT tokens with limited validity period
- HTTPS-only in production
- Rate limiting to prevent brute force attacks
- Input validation on all endpoints
- Sanitization of user-provided data
- Comprehensive error logging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a pull request

## License

[License Information]

## Contact

For inquiries and support, please contact support@fidelityfirstbrokers.com

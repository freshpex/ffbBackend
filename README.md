# Fidelity First Brokers Backend API

This is the backend API for the Fidelity First Brokers platform, a modern investment and trading application.

## Features

- User authentication with JWT
- Trading functionality with market data
- Investment management
- Transaction processing
- Admin dashboard and user management
- Real-time market data with WebSockets
- API documentation with Swagger
- Performance monitoring
- Caching with Redis
- Rate limiting for security

## Prerequisites

- Node.js v14 or higher
- MongoDB
- Redis (optional, for caching)

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a .env file based on the .env.example file
4. Start the development server:
   ```
   npm run dev
   ```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Port to run the server | 5000 |
| NODE_ENV | Environment (development, production, test) | development |
| MONGODB_URI | MongoDB connection string | - |
| JWT_SECRET | Secret for JWT token generation | - |
| JWT_EXPIRY | JWT token expiration | 24h |
| USE_REDIS | Enable Redis caching | false |
| REDIS_URL | Redis connection URL | redis://localhost:6379 |
| CORS_ORIGIN | CORS origin | * |
| RATE_LIMIT_WINDOW | Rate limiting window in minutes | 15 |
| RATE_LIMIT_MAX | Max requests per window | 100 |
| LOG_LEVEL | Logging level | info |

## API Documentation

API documentation is available at `/api-docs` when the server is running.

## Deployment

This backend can be deployed on Vercel using the provided `vercel.json` configuration.

## Development

- Run `npm run dev` to start development server
- Run `npm run lint` to check for linting issues
- Run `npm test` to run tests

## License

ISC

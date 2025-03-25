import logger from './logger.js';

// Circuit states enum
const State = {
  CLOSED: 'CLOSED',     // Normal operation, requests pass through
  OPEN: 'OPEN',         // Circuit is open, failing fast without calling service
  HALF_OPEN: 'HALF_OPEN' // Testing if service is healthy again
};

class CircuitBreaker {
  constructor(options = {}) {
    // Default configuration
    this.failureThreshold = options.failureThreshold || 5; // Number of failures before opening
    this.resetTimeout = options.resetTimeout || 30000; // Time in ms before trying again (30s default)
    this.monitorInterval = options.monitorInterval || 5000; // Check health every 5s
    this.healthCheckFn = options.healthCheck; // Optional health check function
    this.fallbackFn = options.fallback; // Optional fallback function
    
    // Circuit state
    this.state = State.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.lastOpenTime = null;
    this.services = new Map(); // Store breakers by service name
    
    // Start monitoring
    if (options.enableMonitoring !== false) {
      this.startMonitoring();
    }
  }
  
  // Create a named circuit for a specific service
  create(serviceName, options = {}) {
    if (this.services.has(serviceName)) {
      logger.debug(`Circuit for ${serviceName} already exists`);
      return this.services.get(serviceName);
    }
    
    const circuit = new CircuitBreaker({
      ...options,
      enableMonitoring: false // Only the parent monitors
    });
    
    this.services.set(serviceName, circuit);
    logger.info(`Created circuit breaker for ${serviceName}`);
    return circuit;
  }
  
  // Get a circuit by service name
  getCircuit(serviceName) {
    return this.services.get(serviceName);
  }
  
  // Execute a function with circuit breaker protection
  async exec(fn, fallbackFn) {
    if (this.state === State.OPEN) {
      // Circuit is open, fail fast
      const openDuration = Date.now() - this.lastOpenTime;
      
      if (openDuration < this.resetTimeout) {
        logger.warn(`Circuit is OPEN - failing fast`);
        return this._handleFallback(fallbackFn, new Error('Circuit is open'));
      }
      
      // Try to go to half-open state
      this.state = State.HALF_OPEN;
      logger.info(`Circuit transitioned from OPEN to HALF_OPEN`);
    }
    
    try {
      const result = await fn();
      
      // If successful and circuit was half-open, close it
      if (this.state === State.HALF_OPEN) {
        this.close();
      }
      
      // Reset failure count on success
      this.failureCount = 0;
      
      return result;
    } catch (error) {
      return this._handleFailure(error, fallbackFn);
    }
  }
  
  // Handle a failure by incrementing count and potentially opening circuit
  _handleFailure(error, fallbackFn) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    logger.warn(`Circuit recorded failure #${this.failureCount}:`, error);
    
    // If we hit the threshold, open the circuit
    if (this.state !== State.OPEN && this.failureCount >= this.failureThreshold) {
      this.open();
    }
    
    return this._handleFallback(fallbackFn, error);
  }
  
  // Use fallback function if provided
  _handleFallback(fallbackFn, error) {
    const finalFallback = fallbackFn || this.fallbackFn;
    
    if (typeof finalFallback === 'function') {
      logger.debug('Executing fallback function');
      try {
        return finalFallback(error);
      } catch (fallbackError) {
        logger.error('Fallback function failed:', fallbackError);
        throw fallbackError;
      }
    }
    
    // No fallback, just throw the error
    throw error;
  }
  
  // Open the circuit
  open() {
    if (this.state !== State.OPEN) {
      this.state = State.OPEN;
      this.lastOpenTime = Date.now();
      logger.warn(`Circuit OPENED`);
    }
  }
  
  // Close the circuit
  close() {
    this.state = State.CLOSED;
    this.failureCount = 0;
    logger.info(`Circuit CLOSED`);
  }
  
  // Check health of all services
  async checkHealth() {
    if (typeof this.healthCheckFn === 'function') {
      try {
        const isHealthy = await this.healthCheckFn();
        
        if (isHealthy && this.state === State.OPEN) {
          // If health check passes and circuit is open, try half-open
          this.state = State.HALF_OPEN;
          logger.info(`Health check passed, circuit to HALF_OPEN`);
        }
      } catch (error) {
        logger.error('Health check failed:', error);
        // Keep circuit open or open it if it was half-open
        if (this.state !== State.CLOSED) {
          this.open();
        }
      }
    }
    
    // Check all service circuits too
    for (const [serviceName, circuit] of this.services.entries()) {
      if (typeof circuit.healthCheckFn === 'function') {
        try {
          const isHealthy = await circuit.healthCheckFn();
          
          if (isHealthy && circuit.state === State.OPEN) {
            circuit.state = State.HALF_OPEN;
            logger.info(`Health check passed for ${serviceName}, circuit to HALF_OPEN`);
          }
        } catch (error) {
          logger.error(`Health check failed for ${serviceName}:`, error);
          if (circuit.state !== State.CLOSED) {
            circuit.open();
          }
        }
      }
    }
  }
  
  // Start monitoring loop
  startMonitoring() {
    this.monitorInterval = setInterval(() => {
      this.checkHealth();
    }, this.monitorInterval);
    
    // Make sure interval doesn't prevent Node from exiting
    this.monitorInterval.unref();
  }
  
  // Stop monitoring
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
  }
}

// Create default circuit breaker for general use
const defaultBreaker = new CircuitBreaker();

// Create specific service breakers
const binanceBreaker = defaultBreaker.create('binance', {
  failureThreshold: 3,
  resetTimeout: 15000, // 15 seconds
  healthCheck: async () => {
    try {
      // Simple ping to check if Binance API is responsive
      const response = await fetch('https://api.binance.com/api/v3/ping');
      return response.ok;
    } catch (error) {
      return false;
    }
  }
});

// External API call wrapper with circuit breaker
export const callExternalAPI = async (apiName, apiFn, fallbackFn) => {
  const breaker = defaultBreaker.getCircuit(apiName) || defaultBreaker;
  return breaker.exec(apiFn, fallbackFn);
};

// Middleware for specific routes that need circuit breaking
export const circuitBreakerMiddleware = (serviceName, options = {}) => {
  return (req, res, next) => {
    // Attach circuit breaker to request for later use in route handler
    req.circuitBreaker = defaultBreaker.getCircuit(serviceName) || defaultBreaker;
    next();
  };
};

export { defaultBreaker, binanceBreaker };
export default defaultBreaker;

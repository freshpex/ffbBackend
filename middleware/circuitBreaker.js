import logger from './logger.js';

// Circuit breaker states
const State = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half-open'
};

class CircuitBreaker {
  constructor(options = {}) {
    this.state = State.CLOSED;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.monitorInterval = options.monitorInterval || 10000; // 10 seconds
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailure = null;
    this.lastOpenTime = null;
    this.listeners = new Map();
    
    // Required success count to close circuit from half-open state
    this.requiredSuccessesToClose = options.requiredSuccessesToClose || 2;
  }

  // Execute a function with circuit breaker protection
  async execute(fn) {
    if (this.state === State.OPEN) {
      throw new Error('Circuit is OPEN - request rejected');
    }
    
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure(error);
      throw error;
    }
  }

  // Handle successful execution
  _onSuccess() {
    if (this.state === State.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.requiredSuccessesToClose) {
        this.close();
      }
    } else {
      // Reset failure count after continuous success
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  // Handle execution failure
  _onFailure(error) {
    this.failureCount++;
    this.lastFailure = Date.now();
    
    if (this.state === State.CLOSED && this.failureCount >= this.failureThreshold) {
      this.open();
    } else if (this.state === State.HALF_OPEN) {
      this.open();
    }
  }

  // Open the circuit
  open() {
    if (this.state !== State.OPEN) {
      this.state = State.OPEN;
      this.lastOpenTime = Date.now();
      
      // Schedule reset to half-open
      setTimeout(() => {
        this.state = State.HALF_OPEN;
        this.successCount = 0;
      }, this.resetTimeout);
    }
  }

  // Close the circuit
  close() {
    this.state = State.CLOSED;
    this.failureCount = 0;
  }

  // Check health and update state
  checkHealth() {
    if (this.state === State.OPEN) {
      const timeInOpen = Date.now() - this.lastOpenTime;
      if (timeInOpen >= this.resetTimeout) {
        this.state = State.HALF_OPEN;
        this.successCount = 0;
      }
    }
  }

  // Start monitoring loop
  startMonitoring() {
    this.monitorInterval = setInterval(() => {
      this.checkHealth();
    }, this.monitorInterval);
    
    this.monitorInterval.unref();
  }

  // Stop monitoring
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
  }
}

export default CircuitBreaker;

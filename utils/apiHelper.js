import axios from 'axios';
import logger from '../middleware/logger.js';

// Circuit breaker states
const CB_STATES = {
  CLOSED: 'closed',        // Normal operation
  OPEN: 'open',            // Failing, no requests allowed
  HALF_OPEN: 'half-open'   // Testing if service recovered
};

// Circuit breaker configuration
const circuitBreakers = new Map();

function getCircuitBreaker(serviceId) {
  if (!circuitBreakers.has(serviceId)) {
    circuitBreakers.set(serviceId, {
      state: CB_STATES.CLOSED,
      failureCount: 0,
      lastFailure: 0,
      successCount: 0,
      resetTimeout: null,
      failureThreshold: 3,
      resetTimeoutMs: 30000,
      successThreshold: 2
    });
  }
  
  return circuitBreakers.get(serviceId);
}

function registerFailure(serviceId, error) {
  const cb = getCircuitBreaker(serviceId);
  cb.failureCount++;
  cb.lastFailure = Date.now();
  cb.successCount = 0;
  
  logger.debug(`Service ${serviceId} failure #${cb.failureCount}: ${error.message}`);
  
  if (cb.state === CB_STATES.CLOSED && cb.failureCount >= cb.failureThreshold) {
    cb.state = CB_STATES.OPEN;
    logger.warn(`Circuit breaker OPENED for ${serviceId} after ${cb.failureCount} failures`);
    
    cb.resetTimeout = setTimeout(() => {
      cb.state = CB_STATES.HALF_OPEN;
      logger.info(`Circuit breaker HALF-OPEN for ${serviceId}`);
    }, cb.resetTimeoutMs);
  }
}

function registerSuccess(serviceId) {
  const cb = getCircuitBreaker(serviceId);
  cb.failureCount = 0;
  
  // If we're in half-open state
  if (cb.state === CB_STATES.HALF_OPEN) {
    cb.successCount++;
    
    if (cb.successCount >= cb.successThreshold) {
      cb.state = CB_STATES.CLOSED;
      cb.successCount = 0;
      logger.info(`Circuit breaker CLOSED for ${serviceId} after successful recovery`);
    }
  }
}

export async function callWithRetry(apiCall, options = {}, serviceId = 'default') {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    timeout = 10000,
    fallbackData = null,
    fallbackFunction = null
  } = options;
  
  const cb = getCircuitBreaker(serviceId);
  
  
  if (cb.state === CB_STATES.OPEN) {
    logger.debug(`Circuit is OPEN for ${serviceId}, skipping request`);
    
    if (fallbackFunction) {
      return fallbackFunction();
    }
    
    if (fallbackData) {
      return fallbackData;
    }
    
    throw new Error(`Service ${serviceId} is unavailable (circuit open)`);
  }
  
  let lastError = null;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    
    try {
      const result = await apiCall();
      registerSuccess(serviceId);
      return result;
    } catch (error) {
      lastError = error;
    
      if (cb.state === CB_STATES.HALF_OPEN) {
        registerFailure(serviceId, error);
        
        if (fallbackFunction) {
          logger.info(`Using fallback function for ${serviceId} (circuit half-open failure)`);
          return fallbackFunction();
        }
        
        if (fallbackData) {
          logger.info(`Using fallback data for ${serviceId} (circuit half-open failure)`);
          return fallbackData;
        }
        
        throw new Error(`Service ${serviceId} failed recovery attempt`);
      }
      
      registerFailure(serviceId, error);
      
      logger.debug(`API retry ${attempt}/${maxRetries} for ${serviceId}: ${error.message}`);
      
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logger.warn(`Maximum retry attempts (${maxRetries}) reached for ${serviceId}. Stopping retry attempts.`);
        break;
      }
    }
  }
  
  // After retries exhausted, check for fallback
  if (fallbackFunction) {
    logger.info(`Using fallback function for ${serviceId} after ${maxRetries} failed attempts`);
    return fallbackFunction();
  }
  
  if (fallbackData !== null) {
    logger.info(`Using fallback data for ${serviceId} after ${maxRetries} failed attempts`);
    return fallbackData;
  }
  
  // Otherwise throw the error
  logger.error(`Failed to complete request for ${serviceId} after ${maxRetries} attempts`);
  throw lastError || new Error(`All attempts failed for ${serviceId}`);
}

export function createAPIClient(baseURL, options = {}) {
  return axios.create({
    baseURL,
    timeout: options.timeout || 10000,
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...options.headers
    }
  });
}

export default { callWithRetry, createAPIClient };

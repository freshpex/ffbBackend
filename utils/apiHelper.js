import axios from "axios";
import logger from "../middleware/logger.js";

// Circuit breaker states
const CB_STATES = {
  CLOSED: "closed",
  OPEN: "open",
  HALF_OPEN: "half-open",
};

// Circuit breaker configuration
const circuitBreakers = new Map();

function getCircuitBreaker(serviceId) {
  if (!circuitBreakers.has(serviceId)) {
    circuitBreakers.set(serviceId, {
      state: CB_STATES.CLOSED,
      failureCount: 0,
      successCount: 0,
      lastFailure: null,
      failureThreshold: 5,
      successThreshold: 2,
      resetTimeoutMs: 30000,
      resetTimeout: null,
    });
  }
  return circuitBreakers.get(serviceId);
}

function registerFailure(serviceId, error) {
  const cb = getCircuitBreaker(serviceId);
  cb.failureCount++;
  cb.lastFailure = Date.now();
  cb.successCount = 0;

  if (cb.state === CB_STATES.CLOSED && cb.failureCount >= cb.failureThreshold) {
    cb.state = CB_STATES.OPEN;

    cb.resetTimeout = setTimeout(() => {
      cb.state = CB_STATES.HALF_OPEN;
    }, cb.resetTimeoutMs);
  }
}

function registerSuccess(serviceId) {
  const cb = getCircuitBreaker(serviceId);

  if (cb.state === CB_STATES.HALF_OPEN) {
    cb.successCount++;
    if (cb.successCount >= cb.successThreshold) {
      cb.state = CB_STATES.CLOSED;
      cb.failureCount = 0;
    }
  } else {
    cb.failureCount = Math.max(0, cb.failureCount - 1);
  }
}

export async function callWithRetry(
  apiCall,
  options = {},
  serviceId = "default",
) {
  const {
    retries = 3,
    retryDelay = 1000,
    shouldRetry = (error) => true,
    onRetry = null,
  } = options;

  const cb = getCircuitBreaker(serviceId);

  if (cb.state === CB_STATES.OPEN) {
    throw new Error(`Service ${serviceId} is unavailable (circuit open)`);
  }

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await apiCall();
      registerSuccess(serviceId);
      return response;
    } catch (error) {
      lastError = error;

      if (attempt === retries || !shouldRetry(error)) {
        registerFailure(serviceId, error);
        throw error;
      }

      if (onRetry) {
        onRetry(error, attempt);
      }

      await new Promise((resolve) =>
        setTimeout(resolve, retryDelay * Math.pow(2, attempt)),
      );
    }
  }

  throw lastError;
}

export function createAPIClient(baseURL, options = {}) {
  const client = axios.create({
    baseURL,
    timeout: options.timeout || 10000,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  return client;
}

export default { callWithRetry, createAPIClient };

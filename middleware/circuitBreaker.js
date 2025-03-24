// Add a check to entirely skip requests when the circuit is OPEN
const checkCircuitBreaker = (serviceName) => {
  // If circuit is OPEN and cool-down period hasn't elapsed
  if (circuits[serviceName]?.status === 'OPEN' && 
      Date.now() - circuits[serviceName].lastFailure < circuits[serviceName].resetTimeout) {
    // Return cached data immediately without even attempting
    return true; // Circuit is open
  }
  return false; // Circuit is closed or half-open
};

// Use this in your API routes

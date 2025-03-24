// Add caching to reduce API calls
const priceCache = {
  data: null,
  timestamp: 0,
  TTL: 30000 // 30 seconds cache
};

const fetchTickerPrice = async () => {
  // Check if cache is valid
  if (priceCache.data && (Date.now() - priceCache.timestamp < priceCache.TTL)) {
    return priceCache.data;
  }
  
  try {
    // Your existing API fetch code
    // ...
    
    // Update cache
    priceCache.data = result;
    priceCache.timestamp = Date.now();
    
    return result;
  } catch (error) {
    // Your error handling
    // ...
  }
};

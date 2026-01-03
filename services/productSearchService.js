import axios from "axios";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "real-time-product-search.p.rapidapi.com";

/**
 * Service to fetch products from multiple sources
 */
class ProductSearchService {
  async searchRapidAPI(params = {}) {
    try {
      const {
        query = "",
        country = "us",
        language = "en",
        page = 1,
        limit = 10,
        sortBy = "BEST_MATCH",
        minPrice,
        maxPrice,
        productCondition = "ANY",
        stores,
        freeReturns,
        freeShipping,
        onSale,
      } = params;

      if (!RAPIDAPI_KEY) {
        throw new Error("RAPIDAPI_KEY not configured");
      }

      const queryParams = {
        q: query,
        country,
        language,
        page,
        limit,
        sort_by: sortBy,
        product_condition: productCondition,
        return_filters: true,
      };

      // Add optional params
      if (minPrice) queryParams.min_price = minPrice;
      if (maxPrice) queryParams.max_price = maxPrice;
      if (stores) queryParams.stores = stores;
      if (freeReturns) queryParams.free_returns = true;
      if (freeShipping) queryParams.free_shipping = true;
      if (onSale) queryParams.on_sale = true;

      const response = await axios.get(
        `https://${RAPIDAPI_HOST}/search-v2`,
        {
          params: queryParams,
          headers: {
            "x-rapidapi-host": RAPIDAPI_HOST,
            "x-rapidapi-key": RAPIDAPI_KEY,
          },
          timeout: 10000,
        },
      );

      return this.normalizeRapidAPIResponse(response.data);
    } catch (error) {
      console.error("RapidAPI search error:", error.message);
      throw error;
    }
  }

  /**
   * Get product details from RapidAPI
   */
  async getProductDetails(productId) {
    try {
      if (!RAPIDAPI_KEY) {
        throw new Error("RAPIDAPI_KEY not configured");
      }

      const response = await axios.get(
        `https://${RAPIDAPI_HOST}/product-details`,
        {
          params: { product_id: productId },
          headers: {
            "x-rapidapi-host": RAPIDAPI_HOST,
            "x-rapidapi-key": RAPIDAPI_KEY,
          },
          timeout: 10000,
        },
      );

      return response.data;
    } catch (error) {
      console.error("RapidAPI product details error:", error.message);
      throw error;
    }
  }

  /**
   * Search products using Fake Store API (fallback/supplement)
   */
  async searchFakeStore(params = {}) {
    try {
      const { category, limit = 20, sort = "desc" } = params;

      let url = "https://fakestoreapi.com/products";

      if (category && category !== "all") {
        url = `https://fakestoreapi.com/products/category/${category}`;
      }

      const response = await axios.get(url, {
        params: {
          limit,
          sort,
        },
        timeout: 5000,
      });

      return this.normalizeFakeStoreResponse(response.data);
    } catch (error) {
      console.error("FakeStore API error:", error.message);
      throw error;
    }
  }

  /**
   * Get Fake Store categories
   */
  async getFakeStoreCategories() {
    try {
      const response = await axios.get(
        "https://fakestoreapi.com/products/categories",
        { timeout: 5000 },
      );
      return response.data;
    } catch (error) {
      console.error("FakeStore categories error:", error.message);
      return [];
    }
  }

  /**
   * Combined search across both APIs
   */
  async searchProducts(params = {}) {
    const results = {
      rapidapi: { products: [], error: null },
      fakestore: { products: [], error: null },
    };

    // Try RapidAPI first
    try {
      if (RAPIDAPI_KEY && params.query) {
        const rapidData = await this.searchRapidAPI(params);
        results.rapidapi.products = rapidData.products || [];
      }
    } catch (error) {
      results.rapidapi.error = error.message;
      console.warn("RapidAPI failed, will use FakeStore fallback");
    }

    // Try FakeStore as supplement or fallback
    try {
      const fakeStoreData = await this.searchFakeStore(params);
      results.fakestore.products = fakeStoreData.products || [];
    } catch (error) {
      results.fakestore.error = error.message;
    }

    // Combine results
    const allProducts = [
      ...results.rapidapi.products,
      ...results.fakestore.products,
    ];

    return {
      products: allProducts,
      total: allProducts.length,
      sources: {
        rapidapi: results.rapidapi.products.length,
        fakestore: results.fakestore.products.length,
      },
      filters: results.rapidapi.filters || {},
    };
  }

  /**
   * Normalize RapidAPI response to our schema
   */
  normalizeRapidAPIResponse(data) {
    const products = (data.data || []).map((item) => ({
      externalId: item.product_id || `rapid_${Date.now()}_${Math.random()}`,
      source: "rapidapi",
      title: item.product_title || item.title || "Untitled Product",
      description:
        item.product_description || item.description || "No description",
      category: this.categorizeProduct(item.product_title || ""),
      price: this.parsePrice(item.offer?.price || item.price),
      originalPrice: this.parsePrice(
        item.offer?.original_price || item.typical_price_range?.[1],
      ),
      currency: "USD",
      images: item.product_photos || [item.product_photo] || [],
      thumbnail: item.product_photo || item.product_photos?.[0] || "",
      rating: {
        average: item.product_rating || item.rating || 0,
        count: item.product_num_reviews || item.rating_count || 0,
      },
      store: {
        name: item.offer?.store_name || "Unknown Store",
        link: item.offer?.store_link || "",
      },
      productUrl: item.product_page_url || item.offer?.product_page_url || "",
      condition: item.product_condition || "NEW",
      shippingInfo: {
        freeShipping: item.offer?.free_shipping || false,
        freeReturns: item.offer?.free_returns || false,
      },
      inStock: item.offer?.in_stock !== false,
    }));

    return {
      products,
      total: data.total_results || products.length,
      filters: data.filters || {},
    };
  }

  /**
   * Normalize Fake Store API response
   */
  normalizeFakeStoreResponse(data) {
    const products = (Array.isArray(data) ? data : [data]).map((item) => ({
      externalId: `fakestore_${item.id}`,
      source: "fakestore",
      title: item.title || "Untitled Product",
      description: item.description || "No description",
      category: item.category || "general",
      price: parseFloat(item.price) || 0,
      currency: "USD",
      images: [item.image],
      thumbnail: item.image || "",
      rating: {
        average: item.rating?.rate || 0,
        count: item.rating?.count || 0,
      },
      store: {
        name: "Fake Store",
        link: "https://fakestoreapi.com",
      },
      productUrl: `https://fakestoreapi.com/products/${item.id}`,
      condition: "NEW",
      shippingInfo: {
        freeShipping: true,
        freeReturns: true,
      },
      inStock: true,
    }));

    return { products, total: products.length };
  }

  /**
   * Parse price from various formats
   */
  parsePrice(priceStr) {
    if (typeof priceStr === "number") return priceStr;
    if (!priceStr) return 0;

    // Remove currency symbols and parse
    const cleaned = String(priceStr)
      .replace(/[$€£¥,]/g, "")
      .trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Categorize product based on title/keywords
   */
  categorizeProduct(title) {
    const titleLower = title.toLowerCase();

    const categories = {
      electronics: [
        "phone",
        "laptop",
        "computer",
        "tablet",
        "tv",
        "camera",
        "headphone",
        "speaker",
        "watch",
        "gaming",
      ],
      clothing: [
        "shirt",
        "pants",
        "dress",
        "jacket",
        "shoes",
        "sneaker",
        "boot",
        "hat",
        "jeans",
      ],
      furniture: [
        "chair",
        "table",
        "sofa",
        "bed",
        "desk",
        "cabinet",
        "shelf",
        "couch",
      ],
      accessories: [
        "bag",
        "wallet",
        "belt",
        "jewelry",
        "necklace",
        "bracelet",
        "ring",
        "sunglasses",
      ],
      sports: [
        "ball",
        "fitness",
        "gym",
        "yoga",
        "bike",
        "athletic",
        "exercise",
      ],
      home: [
        "kitchen",
        "decor",
        "lamp",
        "pillow",
        "blanket",
        "towel",
        "appliance",
      ],
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some((keyword) => titleLower.includes(keyword))) {
        return category;
      }
    }

    return "general";
  }
}

export default new ProductSearchService();

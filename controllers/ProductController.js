import Product from "../models/Product.js";
import productSearchService from "../services/productSearchService.js";

/**
 * Search and fetch products from external APIs
 */
export const searchProducts = async (req, res, next) => {
  try {
    const {
      q,
      query,
      category,
      page = 1,
      limit = 20,
      sortBy,
      minPrice,
      maxPrice,
      condition,
      freeShipping,
      freeReturns,
      onSale,
    } = req.query;

    const searchQuery = q || query || "";

    const results = await productSearchService.searchProducts({
      query: searchQuery,
      category,
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      minPrice,
      maxPrice,
      productCondition: condition,
      freeShipping: freeShipping === "true",
      freeReturns: freeReturns === "true",
      onSale: onSale === "true",
    });

    // Cache products in database for faster future access
    if (results.products.length > 0) {
      await cacheProducts(results.products);
    }

    res.json({
      success: true,
      data: {
        products: results.products,
        total: results.total,
        page: parseInt(page),
        limit: parseInt(limit),
        sources: results.sources,
        filters: results.filters,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get product by ID from cache or fetch from API
 */
export const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Try to find in database first
    let product = await Product.findById(id);

    if (!product) {
      // Try to find by externalId
      product = await Product.findOne({ externalId: id });
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Increment view count
    product.viewCount += 1;
    await product.save();

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all cached products with filtering
 */
export const getCachedProducts = async (req, res, next) => {
  try {
    const {
      category,
      page = 1,
      limit = 20,
      sort = "-createdAt",
      search,
      minPrice,
      maxPrice,
      inStock,
    } = req.query;

    const filter = { isActive: true };

    if (category && category !== "all") {
      filter.category = category;
    }

    if (search) {
      filter.$text = { $search: search };
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    if (inStock === "true") {
      filter.inStock = true;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Product.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        products,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get product categories
 */
export const getCategories = async (req, res, next) => {
  try {
    // Get unique categories from cached products
    const categories = await Product.distinct("category", { isActive: true });

    // Also get FakeStore categories
    const fakeStoreCategories =
      await productSearchService.getFakeStoreCategories();

    // Combine and deduplicate
    const allCategories = [
      ...new Set([...categories, ...fakeStoreCategories]),
    ];

    res.json({
      success: true,
      data: allCategories.sort(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get trending/popular products
 */
export const getTrendingProducts = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;

    const products = await Product.find({ isActive: true, inStock: true })
      .sort({ purchaseCount: -1, viewCount: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cache products in database for faster access
 */
async function cacheProducts(products) {
  try {
    const operations = products.map((product) => ({
      updateOne: {
        filter: { externalId: product.externalId },
        update: {
          $set: {
            ...product,
            lastSyncedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    if (operations.length > 0) {
      await Product.bulkWrite(operations);
    }
  } catch (error) {
    console.error("Error caching products:", error);
    // Don't throw - caching is not critical
  }
}

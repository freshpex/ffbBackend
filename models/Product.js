import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    // External product ID from API
    externalId: {
      type: String,
      required: true,
      unique: true,
    },
    source: {
      type: String,
      enum: ["rapidapi", "fakestore", "manual"],
      required: true,
      default: "rapidapi",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    originalPrice: {
      type: Number, // For showing discounts
    },
    currency: {
      type: String,
      default: "USD",
    },
    images: [
      {
        type: String, // Image URLs
      },
    ],
    thumbnail: {
      type: String,
    },
    rating: {
      average: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
      count: {
        type: Number,
        default: 0,
      },
    },
    store: {
      name: String,
      link: String,
    },
    productUrl: {
      type: String, // Link to actual product
    },
    specifications: {
      type: Map,
      of: String, // Key-value pairs for specs
    },
    inStock: {
      type: Boolean,
      default: true,
    },
    stockQuantity: {
      type: Number,
      default: 999, // Unlimited for external products
    },
    condition: {
      type: String,
      enum: ["NEW", "USED", "REFURBISHED"],
      default: "NEW",
    },
    shippingInfo: {
      freeShipping: {
        type: Boolean,
        default: false,
      },
      freeReturns: {
        type: Boolean,
        default: false,
      },
    },
    // For analytics
    viewCount: {
      type: Number,
      default: 0,
    },
    purchaseCount: {
      type: Number,
      default: 0,
    },
    // Cache control
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
productSchema.index({ title: "text", description: "text" });
productSchema.index({ category: 1, price: 1 });
productSchema.index({ source: 1, externalId: 1 });
productSchema.index({ isActive: 1, inStock: 1 });

// Virtual for discount percentage
productSchema.virtual("discountPercentage").get(function () {
  if (this.originalPrice && this.originalPrice > this.price) {
    return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
  }
  return 0;
});

productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

const Product = mongoose.model("Product", productSchema);

export default Product;

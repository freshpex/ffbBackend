import mongoose from 'mongoose';

const marketNewsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    source: {
      type: String,
      required: true,
      trim: true
    },
    url: {
      type: String,
      required: true
    },
    imageUrl: {
      type: String,
      default: null
    },
    summary: {
      type: String,
      required: true
    },
    content: {
      type: String,
      default: null
    },
    categories: {
      type: [String],
      default: []
    },
    symbols: {
      type: [String],
      default: []
    },
    sentiment: {
      type: String,
      enum: ['positive', 'negative', 'neutral'],
      default: 'neutral'
    },
    publishedAt: {
      type: Date,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Add indexes for faster queries
marketNewsSchema.index({ publishedAt: -1 });
marketNewsSchema.index({ categories: 1 });
marketNewsSchema.index({ symbols: 1 });
marketNewsSchema.index({ title: 'text', summary: 'text', content: 'text' });

const MarketNews = mongoose.model('MarketNews', marketNewsSchema);

export default MarketNews;

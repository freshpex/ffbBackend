import mongoose from 'mongoose';

const educationContentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    content: {
      type: String,
      required: true
    },
    category: {
      type: String,
      required: true,
      enum: ['beginner', 'intermediate', 'advanced', 'market-analysis', 'trading-strategies', 'risk-management']
    },
    tags: {
      type: [String],
      default: []
    },
    videoUrl: {
      type: String,
      default: null
    },
    thumbnailUrl: {
      type: String,
      default: null
    },
    readTime: {
      type: Number, // in minutes
      default: 5
    },
    author: {
      type: String,
      default: 'Fidelity First Bank'
    },
    isPublished: {
      type: Boolean,
      default: true
    },
    views: {
      type: Number,
      default: 0
    },
    likes: {
      type: Number,
      default: 0
    },
    featured: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Add index for faster queries
educationContentSchema.index({ category: 1 });
educationContentSchema.index({ tags: 1 });
educationContentSchema.index({ isPublished: 1, featured: 1 });
educationContentSchema.index({ title: 'text', description: 'text', content: 'text' });

const EducationContent = mongoose.model('EducationContent', educationContentSchema);

export default EducationContent;

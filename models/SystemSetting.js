import mongoose from 'mongoose';

const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    category: {
      type: String,
      required: true,
      enum: ['general', 'security', 'email', 'payment', 'kyc', 'trading', 'ui', 'notifications', 'advanced']
    },
    type: {
      type: String,
      required: true,
      enum: ['string', 'number', 'boolean', 'json', 'select', 'array']
    },
    options: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    sensitive: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

// Add indexes for faster queries
systemSettingSchema.index({ category: 1 });
systemSettingSchema.index({ sensitive: 1 });

const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);

export default SystemSetting;

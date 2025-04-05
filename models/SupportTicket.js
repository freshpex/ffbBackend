import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    required: true,
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['account', 'deposit', 'withdrawal', 'technical', 'general', 'investment']
  },
  status: {
    type: String,
    required: true,
    enum: ['open', 'in_progress', 'responded', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  attachments: [{
    filename: String,
    url: String,
    size: Number,
    contentType: String
  }],
  conversation: [{
    sender: {
      id: String,
      name: String,
      role: {
        type: String,
        enum: ['user', 'admin'],
        required: true
      }
    },
    content: {
      type: String,
      required: true
    },
    attachments: [{
      filename: String,
      url: String,
      size: Number,
      contentType: String
    }],
    timestamp: {
      type: Date,
      default: Date.now
    },
    isAdmin: {
      type: Boolean,
      default: false
    }
  }],
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  firstResponseAt: {
    type: Date,
    default: null
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  resolutionNote: {
    type: String,
    default: null
  }
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for faster queries
supportTicketSchema.index({ status: 1 });
supportTicketSchema.index({ user: 1 });
supportTicketSchema.index({ priority: 1 });
supportTicketSchema.index({ createdAt: -1 });

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

export default SupportTicket;

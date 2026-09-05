import mongoose from "mongoose";

const visitorSchema = new mongoose.Schema(
  {
    visitorId: {
      type: String,
      required: true,
    },
    sessionId: {
      type: String,
      required: true,
    },
    sessionIds: {
      type: [String],
      default: [],
    },
    totalSessions: {
      type: Number,
      default: 1,
    },
    browserInfo: {
      userAgent: String,
      language: String,
      screenWidth: Number,
      screenHeight: Number,
      timezone: String,
      platform: String,
      deviceMemory: String,
      deviceType: {
        type: String,
        enum: ["mobile", "desktop", "tablet", "unknown"],
        default: "unknown"
      },
      browser: String,
      os: String
    },
    locationInfo: {
      country: String,
      countryCode: String,
      region: String,
      city: String,
      ip: String
    },
    visits: [
      {
        timestamp: {
          type: Date,
          default: Date.now
        },
        path: String,
        referrer: String,
        duration: Number
      }
    ],
    firstVisit: {
      type: Date,
      default: Date.now
    },
    lastVisit: {
      type: Date,
      default: Date.now
    },
    totalVisits: {
      type: Number,
      default: 1
    },
    convertedToUser: {
      type: Boolean,
      default: false
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient querying
visitorSchema.index({ visitorId: 1, sessionId: 1 });
visitorSchema.index({ visitorId: 1 });
visitorSchema.index({ "locationInfo.country": 1 });
visitorSchema.index({ "browserInfo.deviceType": 1 });
visitorSchema.index({ firstVisit: 1 });
visitorSchema.index({ lastVisit: 1 });

const Visitor = mongoose.model("Visitor", visitorSchema);

export default Visitor;

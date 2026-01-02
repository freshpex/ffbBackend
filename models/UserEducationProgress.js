import mongoose from "mongoose";

const userEducationProgressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: "EducationContent", required: true, index: true },
    progress: { type: Number, default: 0 }, // 0 - 100
    completedAt: { type: Date, default: null },
    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

userEducationProgressSchema.index({ userId: 1, contentId: 1 }, { unique: true });

const UserEducationProgress = mongoose.model("UserEducationProgress", userEducationProgressSchema);

export default UserEducationProgress;

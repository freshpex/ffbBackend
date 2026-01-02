import UserEducationProgress from "../models/UserEducationProgress.js";
import EducationContent from "../models/EducationContent.js";

export async function markProgress(req, res, next) {
  try {
    const userId = req.user._id;
    const { contentId, progress } = req.body;

    if (!contentId || progress === undefined) {
      return res.status(400).json({ success: false, message: "contentId and progress are required" });
    }

    const content = await EducationContent.findById(contentId);
    if (!content) return res.status(404).json({ success: false, message: "Content not found" });

    const update = {
      progress: Math.max(0, Math.min(100, progress)),
      lastUpdatedAt: new Date(),
    };
    if (progress >= 100) update.completedAt = new Date();

    const doc = await UserEducationProgress.findOneAndUpdate(
      { userId, contentId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(200).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

export async function getUserProgress(req, res, next) {
  try {
    const userId = req.user._id;
    const progresses = await UserEducationProgress.find({ userId }).lean();
    res.status(200).json({ success: true, data: progresses });
  } catch (err) {
    next(err);
  }
}

export async function getContentProgress(req, res, next) {
  try {
    const { contentId } = req.params;
    const progresses = await UserEducationProgress.find({ contentId }).populate("userId", "firstName lastName email").lean();
    res.status(200).json({ success: true, data: progresses });
  } catch (err) {
    next(err);
  }
}

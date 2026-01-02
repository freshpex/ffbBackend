import EducationContent from "../models/EducationContent.js";
import youtubeService from "../services/youtubeService.js";
import ImportHistory from "../models/ImportHistory.js";
import importQueue from "../services/educationImportQueue.js";

function estimateReadTime(text) {
  if (!text) return 3;
  const words = text.trim().split(/\s+/).length;
  // average reading speed ~200 wpm
  const minutes = Math.max(1, Math.ceil(words / 200));
  return minutes;
}

export async function syncYoutubePlaylist(req, res, next) {
  try {
    const { playlistId, category = "beginner", tags = [] } = req.body;

    if (!playlistId) {
      return res.status(400).json({ success: false, message: "playlistId is required" });
    }

    const lastImport = await ImportHistory.findOne({ playlistId }).sort({ lastImportedAt: -1, createdAt: -1 });
    if (lastImport && lastImport.lastImportedAt) {
      const diffMs = Date.now() - new Date(lastImport.lastImportedAt).getTime();
      const oneHour = 1000 * 60 * 60;
      if (diffMs < oneHour) {
        return res.status(429).json({ success: false, message: "This playlist was imported recently. Please wait before re-importing." });
      }
    }

    const history = await ImportHistory.create({ playlistId, adminId: req.user?._id, status: "pending", startedAt: new Date() });

    importQueue.enqueue({ playlistId, category, tags, adminId: req.user?._id, importId: history._id });

    res.status(202).json({ success: true, message: "Import queued", importId: history._id });
  } catch (error) {
    next(error);
  }
}

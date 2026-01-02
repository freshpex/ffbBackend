import ImportHistory from "../models/ImportHistory.js";
import EducationContent from "../models/EducationContent.js";
import youtubeService from "./youtubeService.js";
import logger from "../middleware/logger.js";

const queue = [];
let processing = false;

// Simple sleep
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function processNext() {
  if (processing) return;
  const job = queue.shift();
  if (!job) return;

  processing = true;
  const { playlistId, category, tags, adminId, importId } = job;
  let history;
  try {
    history = await ImportHistory.findById(importId);
    if (history) {
      history.status = "running";
      history.startedAt = new Date();
      await history.save();
    }

    // Fetch playlist items
    const items = await youtubeService.getPlaylistItems(playlistId);

    // Collect video IDs and fetch details
    const videoIds = items.map((it) => it.videoId).filter(Boolean);
    const details = await youtubeService.getVideosDetails(videoIds);
    const detailsMap = new Map(details.map((d) => [d.videoId, d]));

    let imported = 0;
    const errorLog = [];

    for (const it of items) {
      try {
        if (!it.videoId) continue;
        const videoUrl = `https://www.youtube.com/watch?v=${it.videoId}`;
        const det = detailsMap.get(it.videoId) || {};
        const thumbnailUrl = det.thumbnails && (det.thumbnails.high || det.thumbnails.medium || det.thumbnails.default)
          ? ((det.thumbnails.high && det.thumbnails.high.url) || (det.thumbnails.medium && det.thumbnails.medium.url) || (det.thumbnails.default && det.thumbnails.default.url))
          : ((it.thumbnails && (it.thumbnails.high || it.thumbnails.medium || it.thumbnails.default))
              ? ((it.thumbnails.high && it.thumbnails.high.url) || (it.thumbnails.medium && it.thumbnails.medium.url) || (it.thumbnails.default && it.thumbnails.default.url))
              : null);

        const doc = {
          title: it.title || "Untitled",
          description: it.description || "",
          content: it.description || "",
          category: category || "beginner",
          tags: tags || [],
          videoUrl,
          thumbnailUrl: thumbnailUrl || null,
          readTime: Math.max(1, Math.ceil((it.description || "").split(/\s+/).length / 200)),
          durationSeconds: det.durationSeconds || null,
          isPublished: true,
        };

        await EducationContent.findOneAndUpdate({ videoUrl }, { $set: doc }, { upsert: true, new: true, setDefaultsOnInsert: true });
        imported += 1;

        await sleep(50);
      } catch (err) {
        logger.error("Failed to import item", err);
        errorLog.push(err.message || String(err));
      }
    }

    if (history) {
      history.status = "succeeded";
      history.importedCount = imported;
      history.errorLog = errorLog;
      history.finishedAt = new Date();
      history.lastImportedAt = new Date();
      await history.save();
    }
  } catch (err) {
    logger.error("Import job failed:", err);
    if (history) {
      history.status = "failed";
      history.errorLog = (history.errorLog || []).concat([err.message || String(err)]);
      history.finishedAt = new Date();
      await history.save();
    }
  } finally {
    processing = false;
    // Schedule next processing tick
    setImmediate(() => processNext());
  }
}

function enqueue(job) {
  queue.push(job);
  // kick processor
  setImmediate(() => processNext());
}

setInterval(() => {
  if (!processing && queue.length > 0) processNext();
}, 10000);

export default {
  enqueue,
};

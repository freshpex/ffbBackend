import EducationContent from "../models/EducationContent.js";
import ImportHistory from "../models/ImportHistory.js";
import logger from "../middleware/logger.js";
import importQueue from "./educationImportQueue.js";
import youtubeService from "./youtubeService.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function seedEducationFromYoutube({ force = false } = {}) {
  try {
    if (!process.env.YOUTUBE_API_KEY) {
      logger.warn("YOUTUBE_API_KEY is not set; skipping Education auto-seed.");
      return { queued: 0, skipped: true, reason: "missing_api_key" };
    }

    const existingCount = await EducationContent.estimatedDocumentCount();
    if (!force && existingCount > 0) {
      return { queued: 0, skipped: true, reason: "already_has_content" };
    }

    if (!force) {
      const lastSeed = await ImportHistory.findOne({ "meta.seed": true }).sort({ createdAt: -1 });
      if (lastSeed && lastSeed.createdAt && Date.now() - new Date(lastSeed.createdAt).getTime() < ONE_DAY_MS) {
        return { queued: 0, skipped: true, reason: "seed_recently_attempted" };
      }
    }

    const seedConfigs = [
      {
        query: "cryptocurrency trading for beginners playlist",
        category: "beginner",
        tags: ["crypto", "trading", "beginner"],
      },
      {
        query: "technical analysis market analysis playlist",
        category: "market-analysis",
        tags: ["market-analysis", "technical-analysis"],
      },
      {
        query: "risk management trading playlist",
        category: "risk-management",
        tags: ["risk-management", "trading"],
      },
      {
        query: "advanced trading strategies playlist",
        category: "trading-strategies",
        tags: ["trading-strategies", "advanced"],
      },
    ];

    let queued = 0;

    for (const cfg of seedConfigs) {
      try {
        const results = await youtubeService.searchPlaylists(cfg.query, { maxResults: 1 });
        const chosen = results[0];
        if (!chosen?.playlistId) continue;

        const history = await ImportHistory.create({
          playlistId: chosen.playlistId,
          status: "pending",
          startedAt: new Date(),
          meta: {
            seed: true,
            query: cfg.query,
            category: cfg.category,
            tags: cfg.tags,
            chosen,
          },
        });

        importQueue.enqueue({
          playlistId: chosen.playlistId,
          category: cfg.category,
          tags: cfg.tags,
          adminId: null,
          importId: history._id,
        });

        queued += 1;
        await sleep(200);
      } catch (err) {
        logger.error("Education auto-seed step failed:", err);
      }
    }

    if (queued > 0) {
      logger.info(`Education auto-seed queued ${queued} playlist import(s).`);
    } else {
      logger.warn("Education auto-seed found no playlists to queue.");
    }

    return { queued, skipped: false };
  } catch (err) {
    logger.error("Education auto-seed failed:", err);
    return { queued: 0, skipped: true, reason: "seed_failed" };
  }
}

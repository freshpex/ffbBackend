import axios from "axios";

const YT_API_BASE = "https://www.googleapis.com/youtube/v3";
const API_KEY = process.env.YOUTUBE_API_KEY;

if (!API_KEY) {
  console.warn("YOUTUBE_API_KEY is not set. YouTube importer will not work without it.");
}

async function getPlaylistItems(playlistId, pageToken = null, accumulated = []) {
  if (!API_KEY) throw new Error("Missing YOUTUBE_API_KEY");

  const params = {
    part: "snippet,contentDetails",
    playlistId,
    maxResults: 50,
    key: API_KEY,
  };

  if (pageToken) params.pageToken = pageToken;

  const url = `${YT_API_BASE}/playlistItems`;
  const res = await axios.get(url, { params });
  const data = res.data;

  const items = (data.items || []).map((it) => {
    const snip = it.snippet || {};
    const videoId = snip.resourceId && snip.resourceId.videoId;
    return {
      videoId,
      title: snip.title,
      description: snip.description,
      thumbnails: snip.thumbnails || {},
      publishedAt: snip.publishedAt,
    };
  });

  const all = accumulated.concat(items);

  if (data.nextPageToken) {
    return getPlaylistItems(playlistId, data.nextPageToken, all);
  }

  return all;
}

function isoDurationToSeconds(iso) {
  // Very small parser for ISO 8601 durations like PT1H2M3S
  if (!iso || typeof iso !== "string") return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

async function getVideosDetails(videoIds = []) {
  if (!API_KEY) throw new Error("Missing YOUTUBE_API_KEY");
  if (!videoIds || videoIds.length === 0) return [];

  // API accepts comma-separated ids (max 50)
  const batches = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    batches.push(videoIds.slice(i, i + 50));
  }

  const results = [];

  for (const batch of batches) {
    const params = {
      part: "contentDetails,snippet",
      id: batch.join(","),
      key: API_KEY,
    };

    const url = `${YT_API_BASE}/videos`;
    const res = await axios.get(url, { params });
    const items = res.data.items || [];

    for (const it of items) {
      const vid = it.id;
      const durationIso = it.contentDetails && it.contentDetails.duration;
      const durationSeconds = isoDurationToSeconds(durationIso);
      const thumbnails = it.snippet && it.snippet.thumbnails;
      results.push({ videoId: vid, durationSeconds, thumbnails });
    }
  }

  return results;
}

async function searchPlaylists(query, { maxResults = 5, pageToken = null } = {}) {
  if (!API_KEY) throw new Error("Missing YOUTUBE_API_KEY");
  if (!query || typeof query !== "string") return [];

  const params = {
    part: "snippet",
    type: "playlist",
    q: query,
    maxResults: Math.min(50, Math.max(1, Number(maxResults) || 5)),
    safeSearch: "strict",
    relevanceLanguage: "en",
    key: API_KEY,
  };

  if (pageToken) params.pageToken = pageToken;

  const url = `${YT_API_BASE}/search`;
  const res = await axios.get(url, { params });
  const items = res.data?.items || [];

  return items
    .map((it) => {
      const playlistId = it.id?.playlistId;
      const snip = it.snippet || {};
      return {
        playlistId,
        title: snip.title,
        description: snip.description,
        thumbnails: snip.thumbnails || {},
        channelTitle: snip.channelTitle,
        publishedAt: snip.publishedAt,
      };
    })
    .filter((x) => x.playlistId);
}

export default {
  getPlaylistItems,
  getVideosDetails,
  searchPlaylists,
};

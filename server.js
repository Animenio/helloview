const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 7000;
const STREAMS_DIR = __dirname;

const manifest = {
  id: 'com.eugenio.privateaddon',
  version: '2.0.0',
  name: 'Eugenio Private Addon',
  description: 'Private Stremio addon for external playback',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: []
};

function emptyData() {
  return { movieStreams: {}, seriesStreams: {} };
}

function getStreamPartFiles() {
  try {
    return fs
      .readdirSync(STREAMS_DIR)
      .filter((name) => /^streams_part_\d{2}\.json$/.test(name))
      .sort((a, b) => {
        const aPart = Number((a.match(/^streams_part_(\d{2})\.json$/) || [])[1] || 0);
        const bPart = Number((b.match(/^streams_part_(\d{2})\.json$/) || [])[1] || 0);
        return aPart - bPart;
      })
      .map((name) => path.join(STREAMS_DIR, name));
  } catch (error) {
    console.error(`[streams] Failed to read stream directory: ${error.message}`);
    return [];
  }
}

function mergeStreams(parts) {
  const merged = emptyData();

  if (!Array.isArray(parts)) {
    return merged;
  }

  parts.forEach((part) => {
    if (!part || typeof part !== 'object') {
      return;
    }

    // Merge Movies
    if (part.movieStreams && typeof part.movieStreams === 'object' && !Array.isArray(part.movieStreams)) {
      Object.entries(part.movieStreams).forEach(([imdbId, streams]) => {
        if (!Array.isArray(streams)) return;

        if (!Array.isArray(merged.movieStreams[imdbId])) {
          merged.movieStreams[imdbId] = [];
        }
        merged.movieStreams[imdbId].push(...streams);
      });
    }

    // Merge Series
    if (part.seriesStreams && typeof part.seriesStreams === 'object' && !Array.isArray(part.seriesStreams)) {
      Object.entries(part.seriesStreams).forEach(([episodeId, streams]) => {
        if (!Array.isArray(streams)) return;

        if (!Array.isArray(merged.seriesStreams[episodeId])) {
          merged.seriesStreams[episodeId] = [];
        }
        merged.seriesStreams[episodeId].push(...streams);
      });
    }
  });

  return merged;
}

function loadStreams() {
  const streamPartFiles = getStreamPartFiles();
  console.log(`[startup] stream part files found: ${streamPartFiles.length}`);

  if (streamPartFiles.length > 0) {
    const parts = streamPartFiles.reduce((acc, streamFile) => {
      try {
        const raw = fs.readFileSync(streamFile, 'utf8');
        const parsed = JSON.parse(raw);
        acc.push(parsed);
      } catch (error) {
        console.error(`[streams] Failed to load ${path.basename(streamFile)}: ${error.message}`);
      }

      return acc;
    }, []);

    return mergeStreams(parts);
  }

  const fallbackPath = path.join(STREAMS_DIR, 'streams.json');
  if (fs.existsSync(fallbackPath)) {
    try {
      const raw = fs.readFileSync(fallbackPath, 'utf8');
      const parsed = JSON.parse(raw);
      console.log('[startup] using fallback streams.json');
      return mergeStreams([parsed]);
    } catch (error) {
      console.error(`[streams] Failed to load fallback streams.json: ${error.message}`);
    }
  }

  console.warn('[startup] no valid stream source found, using empty streams data');
  return emptyData();
}

function sanitizeStreams(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.reduce((acc, item) => {
    if (!item || typeof item !== 'object') {
      return acc;
    }

    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const externalUrl = typeof item.externalUrl === 'string' ? item.externalUrl.trim() : '';

    if (!title || !externalUrl) {
      return acc;
    }

    if (!/^https?:\/\//i.test(externalUrl)) {
      return acc;
    }

    if (typeof item.url === 'string' && item.url.trim().length > 0) {
      return acc;
    }

    const stream = { title, externalUrl };

    if (
      item.behaviorHints &&
      typeof item.behaviorHints === 'object' &&
      !Array.isArray(item.behaviorHints)
    ) {
      stream.behaviorHints = item.behaviorHints;
    }

    acc.push(stream);
    return acc;
  }, []);
}

const streamData = loadStreams();
const builder = new addonBuilder(manifest);

builder.defineStreamHandler((args) => {
  const type = args && args.type ? args.type : '';
  const id = args && typeof args.id === 'string' ? args.id.trim() : '';
  
  console.log(`[stream] request type=${type} id=${id || 'n/a'}`);

  if (!id) {
    console.log('[stream] hit=no');
    console.log('[stream] streams returned=0');
    return { streams: [] };
  }

  let rawStreams = [];

  if (type === 'movie') {
    rawStreams = streamData.movieStreams[id] || [];
  } else if (type === 'series') {
    rawStreams = streamData.seriesStreams[id] || [];
  }

  const streams = sanitizeStreams(rawStreams);
  const hit = streams.length > 0;

  console.log(`[stream] hit=${hit ? 'yes' : 'no'}`);
  console.log(`[stream] streams returned=${streams.length}`);

  return { streams };
});

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`[startup] Eugenio Private Addon started on port ${PORT}`);
console.log(`[startup] Local manifest URL: http://localhost:${PORT}/manifest.json`);
console.log(`[startup] Streams source directory: ${STREAMS_DIR}`);

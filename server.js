const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 7000;
const STREAMS_FILE = path.join(__dirname, 'streams.json');

const manifest = {
  id: 'com.eugenio.privateaddon',
  version: '1.0.0',
  name: 'Eugenio Private Addon',
  description: 'Private Stremio addon for authorized streams',
  resources: ['stream'],
  types: ['movie', 'series'],
  catalogs: [],
  idPrefixes: ['tt']
};

function loadStreams() {
  try {
    if (!fs.existsSync(STREAMS_FILE)) {
      console.warn(`[streams] File not found: ${STREAMS_FILE}. Returning empty catalog.`);
      return { movie: {}, series: {} };
    }

    const raw = fs.readFileSync(STREAMS_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      movie: parsed && typeof parsed.movie === 'object' && parsed.movie !== null ? parsed.movie : {},
      series: parsed && typeof parsed.series === 'object' && parsed.series !== null ? parsed.series : {}
    };
  } catch (error) {
    console.error(`[streams] Failed to load ${STREAMS_FILE}: ${error.message}`);
    return { movie: {}, series: {} };
  }
}

function sanitizeStreams(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && typeof item === 'object')
    .filter((item) => {
      if (typeof item.title !== 'string' || item.title.trim().length === 0) {
        return false;
      }

      if (typeof item.url === 'string') {
        return /^https?:\/\//i.test(item.url);
      }

      if (typeof item.externalUrl === 'string') {
        return /^https?:\/\//i.test(item.externalUrl);
      }

      return false;
    })
    .map((item) => {
      const stream = { title: item.title };

      if (typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) {
        stream.url = item.url;
      } else if (typeof item.externalUrl === 'string' && /^https?:\/\//i.test(item.externalUrl)) {
        stream.externalUrl = item.externalUrl;
      }

      if (item.behaviorHints && typeof item.behaviorHints === 'object') {
        stream.behaviorHints = item.behaviorHints;
      }

      return stream;
    });
}

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
  const data = loadStreams();
  const source = type === 'movie' ? data.movie : type === 'series' ? data.series : null;

  if (!source || !source[id]) {
    return { streams: [] };
  }

  const entry = source[id];
  const items = Array.isArray(entry) ? entry : [entry];
  const streams = sanitizeStreams(items);

  return { streams };
});

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`[startup] Eugenio Private Addon listening on port ${PORT}`);
console.log(`[startup] Local manifest URL: http://localhost:${PORT}/manifest.json`);
console.log(`[startup] Streams source file: ${STREAMS_FILE}`);

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 7000;
const STREAMS_FILE = path.join(__dirname, 'streams.json');

const DEMO_MOVIE_CATALOG_ID = 'authorized-demo-movies';
const DEMO_SERIES_CATALOG_ID = 'authorized-demo-series';

const manifest = {
  id: 'com.eugenio.privateaddon',
  version: '1.0.2',
  name: 'Eugenio Private Addon',
  description: 'Private Stremio addon for authorized streams',
  resources: ['stream', 'catalog', 'meta'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: [
    {
      type: 'movie',
      id: DEMO_MOVIE_CATALOG_ID,
      name: 'Authorized Demo Movies'
    },
    {
      type: 'series',
      id: DEMO_SERIES_CATALOG_ID,
      name: 'Authorized Demo Series'
    }
  ]
};

function emptyData() {
  return { movieStreams: {}, seriesStreams: {}, movieMeta: {}, seriesMeta: {} };
}

function loadStreams() {
  try {
    if (!fs.existsSync(STREAMS_FILE)) {
      console.warn(`[streams] File not found: ${STREAMS_FILE}. Using safe fallback.`);
      return emptyData();
    }

    const raw = fs.readFileSync(STREAMS_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      movieStreams: parsed && typeof parsed.movieStreams === 'object' && parsed.movieStreams !== null ? parsed.movieStreams : {},
      seriesStreams: parsed && typeof parsed.seriesStreams === 'object' && parsed.seriesStreams !== null ? parsed.seriesStreams : {},
      movieMeta: parsed && typeof parsed.movieMeta === 'object' && parsed.movieMeta !== null ? parsed.movieMeta : {},
      seriesMeta: parsed && typeof parsed.seriesMeta === 'object' && parsed.seriesMeta !== null ? parsed.seriesMeta : {}
    };
  } catch (error) {
    console.error(`[streams] Failed to load ${STREAMS_FILE}: ${error.message}`);
    return emptyData();
  }
}

function toMetaPreview(meta) {
  if (!meta || typeof meta !== 'object') {
    return null;
  }

  const preview = {
    id: meta.id,
    type: meta.type,
    name: meta.name,
    poster: meta.poster
  };

  if (typeof meta.description === 'string' && meta.description.trim().length > 0) {
    preview.description = meta.description;
  }

  return preview;
}

function sanitizeStreams(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.reduce((acc, item) => {
    if (!item || typeof item !== 'object') {
      return acc;
    }

    const hasValidTitle = typeof item.title === 'string' && item.title.trim().length > 0;
    const hasValidUrl = typeof item.url === 'string' && /^https?:\/\//i.test(item.url);
    const hasValidExternalUrl = typeof item.externalUrl === 'string' && /^https?:\/\//i.test(item.externalUrl);

    if (!hasValidTitle || (!hasValidUrl && !hasValidExternalUrl)) {
      return acc;
    }

    const stream = { title: item.title.trim() };

    if (hasValidUrl) {
      stream.url = item.url;
    } else {
      stream.externalUrl = item.externalUrl;
    }

    if (item.behaviorHints && typeof item.behaviorHints === 'object' && !Array.isArray(item.behaviorHints)) {
      stream.behaviorHints = item.behaviorHints;
    }

    acc.push(stream);
    return acc;
  }, []);
}

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ type, id }) => {
  console.log(`[catalog] request type=${type} id=${id}`);
  const data = loadStreams();

  if (type === 'movie' && id === DEMO_MOVIE_CATALOG_ID) {
    const metas = Object.values(data.movieMeta)
      .map(toMetaPreview)
      .filter(Boolean);
    console.log(`[catalog] response metas=${metas.length}`);
    return { metas };
  }

  if (type === 'series' && id === DEMO_SERIES_CATALOG_ID) {
    const metas = Object.values(data.seriesMeta)
      .map(toMetaPreview)
      .filter(Boolean);
    console.log(`[catalog] response metas=${metas.length}`);
    return { metas };
  }

  console.log('[catalog] response metas=0 (unsupported catalog)');
  return { metas: [] };
});

builder.defineMetaHandler(async ({ type, id }) => {
  console.log(`[meta] request type=${type} id=${id}`);
  const data = loadStreams();
  const source = type === 'movie' ? data.movieMeta : type === 'series' ? data.seriesMeta : null;
  const meta = source && source[id] ? source[id] : null;

  return { meta };
});

builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[stream] request type=${type} id=${id}`);
  const data = loadStreams();
  const source = type === 'movie' ? data.movieStreams : type === 'series' ? data.seriesStreams : null;

  if (!source || !source[id]) {
    console.log('[stream] response streams=0');
    return { streams: [] };
  }

  const entry = source[id];
  const items = Array.isArray(entry) ? entry : [entry];
  const streams = sanitizeStreams(items);

  console.log(`[stream] response streams=${streams.length}`);
  return { streams };
});

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`[startup] Eugenio Private Addon started on port ${PORT}`);
console.log(`[startup] Local manifest URL: http://localhost:${PORT}/manifest.json`);
console.log(`[startup] Streams source file: ${STREAMS_FILE}`);

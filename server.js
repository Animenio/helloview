const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 7000;
const STREAMS_FILE = path.join(__dirname, 'streams.json');

const DEMO_MOVIE_CATALOG_ID = 'authorized-demo-movies';
const DEMO_SERIES_CATALOG_ID = 'authorized-demo-series';

const manifest = {
  id: 'com.eugenio.privateaddon',
  version: '1.0.1',
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
  return { movie: {}, series: {}, meta: { movie: {}, series: {} } };
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
      movie: parsed && typeof parsed.movie === 'object' && parsed.movie !== null ? parsed.movie : {},
      series: parsed && typeof parsed.series === 'object' && parsed.series !== null ? parsed.series : {},
      meta: parsed && typeof parsed.meta === 'object' && parsed.meta !== null
        ? {
            movie: parsed.meta && typeof parsed.meta.movie === 'object' && parsed.meta.movie !== null ? parsed.meta.movie : {},
            series: parsed.meta && typeof parsed.meta.series === 'object' && parsed.meta.series !== null ? parsed.meta.series : {}
          }
        : { movie: {}, series: {} }
    };
  } catch (error) {
    console.error(`[streams] Failed to load ${STREAMS_FILE}: ${error.message}`);
    return emptyData();
  }
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

function getMetaList(data, type) {
  const source = type === 'movie' ? data.meta.movie : type === 'series' ? data.meta.series : null;
  if (!source || typeof source !== 'object') {
    return [];
  }

  return Object.values(source).filter((meta) => meta && typeof meta === 'object');
}

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ type, id }) => {
  console.log(`[catalog] request received type=${type} id=${id}`);
  const data = loadStreams();

  if (type === 'movie' && id === DEMO_MOVIE_CATALOG_ID) {
    const metas = getMetaList(data, 'movie');
    console.log(`[catalog] returning movie demo metas=${metas.length}`);
    return { metas };
  }

  if (type === 'series' && id === DEMO_SERIES_CATALOG_ID) {
    const metas = getMetaList(data, 'series');
    console.log(`[catalog] returning series demo metas=${metas.length}`);
    return { metas };
  }

  console.log('[catalog] unsupported catalog requested, returning empty metas');
  return { metas: [] };
});

builder.defineMetaHandler(async ({ type, id }) => {
  console.log(`[meta] request received type=${type} id=${id}`);
  const data = loadStreams();
  const source = type === 'movie' ? data.meta.movie : type === 'series' ? data.meta.series : null;
  const meta = source && source[id] ? source[id] : null;

  if (meta) {
    console.log('[meta] meta found, returning payload');
    return { meta };
  }

  console.log('[meta] no meta found, returning null');
  return { meta: null };
});

builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[stream] request received type=${type} id=${id}`);
  const data = loadStreams();
  const source = type === 'movie' ? data.movie : type === 'series' ? data.series : null;

  if (!source || !source[id]) {
    console.log('[stream] no matching entry found, returning streams=0');
    return { streams: [] };
  }

  const entry = source[id];
  const items = Array.isArray(entry) ? entry : [entry];
  const streams = sanitizeStreams(items);

  console.log(`[stream] streams found=${streams.length}`);
  return { streams };
});

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`[startup] Eugenio Private Addon started on port ${PORT}`);
console.log(`[startup] Local manifest URL: http://localhost:${PORT}/manifest.json`);
console.log(`[startup] Streams source file: ${STREAMS_FILE}`);

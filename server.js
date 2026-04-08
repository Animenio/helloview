const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 7000;
const STREAMS_FILE = path.join(__dirname, 'streams.json');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BEARER_TOKEN = process.env.TMDB_BEARER_TOKEN;
const TMDB_ENABLED = Boolean(TMDB_BEARER_TOKEN || TMDB_API_KEY);

const MOVIE_CATALOG_ID = 'top';
const DEMO_IMDB_IDS = ['tt1254207', 'tt0111161', 'tt0133093'];

const manifest = {
  id: 'com.eugenio.privateaddon',
  version: '1.0.4',
  name: 'Eugenio Private Addon',
  description: 'Private Stremio addon for authorized streams',
  resources: ['stream', 'catalog', 'meta'],
  types: ['movie'],
  idPrefixes: ['tt'],
  catalogs: [
    {
      type: 'movie',
      id: MOVIE_CATALOG_ID,
      name: 'Authorized Demo Movies'
    }
  ]
};

function emptyData() {
  return { movieStreams: {}, fallbackMovieMeta: {} };
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
      fallbackMovieMeta: parsed && typeof parsed.fallbackMovieMeta === 'object' && parsed.fallbackMovieMeta !== null ? parsed.fallbackMovieMeta : {}
    };
  } catch (error) {
    console.error(`[streams] Failed to load ${STREAMS_FILE}: ${error.message}`);
    return emptyData();
  }
}

function httpGetJson(url, headers = {}) {
  if (typeof fetch === 'function') {
    return fetch(url, { headers }).then(async (response) => {
      const text = await response.text();
      let json = null;

      if (text) {
        try {
          json = JSON.parse(text);
        } catch (error) {
          throw new Error(`Invalid JSON response (${response.status})`);
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return json;
    });
  }

  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      const chunks = [];

      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        let parsedBody = null;

        if (body) {
          try {
            parsedBody = JSON.parse(body);
          } catch (error) {
            reject(new Error(`Invalid JSON response (${res.statusCode})`));
            return;
          }
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        resolve(parsedBody);
      });
    });

    req.on('error', reject);
  });
}

function buildPosterUrl(posterPath) {
  if (typeof posterPath !== 'string' || posterPath.trim().length === 0) {
    return null;
  }
  return `https://image.tmdb.org/t/p/w500${posterPath}`;
}

async function tmdbRequest(requestPath, query = {}) {
  if (!TMDB_ENABLED) {
    return null;
  }

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}`.length > 0) {
      params.set(key, `${value}`);
    }
  });

  const headers = {
    Accept: 'application/json'
  };

  if (TMDB_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${TMDB_BEARER_TOKEN}`;
  } else if (TMDB_API_KEY) {
    params.set('api_key', TMDB_API_KEY);
  }

  const qs = params.toString();
  const url = `https://api.themoviedb.org/3${requestPath}${qs ? `?${qs}` : ''}`;
  return httpGetJson(url, headers);
}

async function getMovieByImdbId(imdbId) {
  if (!imdbId) {
    return null;
  }

  try {
    const result = await tmdbRequest(`/find/${encodeURIComponent(imdbId)}`, { external_source: 'imdb_id' });
    const movie = result && Array.isArray(result.movie_results) ? result.movie_results[0] : null;

    if (!movie || !movie.id) {
      console.log(`[tmdb] lookup failure imdbId=${imdbId}`);
      return null;
    }

    const details = await tmdbRequest(`/movie/${movie.id}`);
    const merged = {
      ...movie,
      ...(details && typeof details === 'object' ? details : {})
    };

    console.log(`[tmdb] lookup success imdbId=${imdbId}`);
    return merged;
  } catch (error) {
    console.log(`[tmdb] lookup failure imdbId=${imdbId}`);
    return null;
  }
}

function toMetaPreviewFromTmdb(imdbId, movie) {
  if (!movie) {
    return null;
  }

  const releaseYear = typeof movie.release_date === 'string' && movie.release_date.length >= 4
    ? movie.release_date.slice(0, 4)
    : undefined;

  return {
    id: imdbId,
    type: 'movie',
    name: movie.title || imdbId,
    poster: buildPosterUrl(movie.poster_path),
    description: movie.overview || undefined,
    releaseInfo: releaseYear
  };
}

function toMetaFromTmdb(imdbId, movie) {
  if (!movie) {
    return null;
  }

  const preview = toMetaPreviewFromTmdb(imdbId, movie);
  const genres = Array.isArray(movie.genres) ? movie.genres.map((genre) => genre && genre.name).filter((name) => typeof name === 'string' && name.trim().length > 0) : [];

  return {
    ...preview,
    genres
  };
}

function toFallbackPreview(meta) {
  if (!meta || typeof meta !== 'object') {
    return null;
  }

  return {
    id: meta.id,
    type: 'movie',
    name: meta.name,
    poster: meta.poster,
    description: meta.description,
    releaseInfo: meta.releaseInfo
  };
}

function toFallbackMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return null;
  }

  return {
    id: meta.id,
    type: 'movie',
    name: meta.name,
    poster: meta.poster,
    description: meta.description,
    releaseInfo: meta.releaseInfo,
    genres: Array.isArray(meta.genres) ? meta.genres : []
  };
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

  if (type !== 'movie' || id !== MOVIE_CATALOG_ID) {
    console.log('[catalog] response metas=0 (unsupported catalog)');
    return { metas: [] };
  }

  const metas = [];
  for (const imdbId of DEMO_IMDB_IDS) {
    let meta = null;

    if (TMDB_ENABLED) {
      const tmdbMovie = await getMovieByImdbId(imdbId);
      meta = toMetaPreviewFromTmdb(imdbId, tmdbMovie);
    }

    if (!meta) {
      meta = toFallbackPreview(data.fallbackMovieMeta[imdbId]);
    }

    if (meta) {
      metas.push(meta);
    }
  }

  console.log(`[catalog] response metas=${metas.length}`);
  return { metas };
});

builder.defineMetaHandler(async ({ type, id }) => {
  console.log(`[meta] request id=${id}`);

  if (type !== 'movie') {
    return { meta: null };
  }

  const data = loadStreams();

  if (TMDB_ENABLED) {
    const tmdbMovie = await getMovieByImdbId(id);
    const tmdbMeta = toMetaFromTmdb(id, tmdbMovie);

    if (tmdbMeta) {
      return { meta: tmdbMeta };
    }
  }

  const fallbackMeta = toFallbackMeta(data.fallbackMovieMeta[id]);
  return { meta: fallbackMeta || null };
});

builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[stream] request id=${id}`);
  const data = loadStreams();
  const source = type === 'movie' ? data.movieStreams : null;

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
console.log(`[startup] TMDB enabled: ${TMDB_ENABLED ? 'yes' : 'no'}`);

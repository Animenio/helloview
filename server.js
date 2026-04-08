const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 7000;
const STREAMS_FILE = path.join(__dirname, 'streams.json');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BEARER_TOKEN = process.env.TMDB_BEARER_TOKEN;
const TMDB_ENABLED = Boolean(TMDB_BEARER_TOKEN || TMDB_API_KEY);

const manifest = {
  id: 'com.eugenio.privateaddon',
  version: '1.2.0',
  name: 'Eugenio Private Addon',
  description: 'Private Stremio addon for authorized streams',
  resources: ['stream'],
  types: ['movie'],
  idPrefixes: ['tt'],
  catalogs: []
};

function emptyData() {
  return { movieStreams: {}, authorizedIndex: [] };
}

function loadStreams() {
  try {
    if (!fs.existsSync(STREAMS_FILE)) {
      console.warn(`[streams] File not found: ${STREAMS_FILE}. Using safe fallback.`);
      return emptyData();
    }

    const raw = fs.readFileSync(STREAMS_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    const movieStreams =
      parsed && typeof parsed.movieStreams === 'object' && parsed.movieStreams !== null
        ? parsed.movieStreams
        : {};

    const authorizedIndex =
      parsed && Array.isArray(parsed.authorizedIndex)
        ? parsed.authorizedIndex
        : [];

    return { movieStreams, authorizedIndex };
  } catch (error) {
    console.error(`[streams] Failed to load ${STREAMS_FILE}: ${error.message}`);
    return emptyData();
  }
}

async function tmdbRequest(requestPath, query = {}) {
  if (!TMDB_ENABLED || typeof fetch !== 'function') {
    return { ok: false, status: 0, error: 'tmdb_disabled' };
  }

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}`.length > 0) {
      params.set(key, `${value}`);
    }
  });

  const headers = { Accept: 'application/json' };

  if (TMDB_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${TMDB_BEARER_TOKEN}`;
  } else if (TMDB_API_KEY) {
    params.set('api_key', TMDB_API_KEY);
  }

  const qs = params.toString();
  const url = `https://api.themoviedb.org/3${requestPath}${qs ? `?${qs}` : ''}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: (data && (data.status_message || data.message)) || `http_${response.status}`
      };
    }

    return { ok: true, status: response.status, data };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return { ok: false, status: 0, error: 'timeout' };
    }

    return { ok: false, status: 0, error: 'network_or_parse_error' };
  } finally {
    clearTimeout(timeout);
  }
}

async function getMovieMetadataByImdbId(imdbId) {
  if (!imdbId) {
    return null;
  }

  const result = await tmdbRequest(`/find/${encodeURIComponent(imdbId)}`, {
    external_source: 'imdb_id'
  });

  if (!result.ok) {
    return null;
  }

  const movie =
    result.data && Array.isArray(result.data.movie_results)
      ? result.data.movie_results[0]
      : null;

  if (!movie) {
    return null;
  }

  const releaseDate = typeof movie.release_date === 'string' ? movie.release_date : '';
  const year = /^\d{4}/.test(releaseDate) ? Number(releaseDate.slice(0, 4)) : undefined;

  return {
    imdbId,
    title: typeof movie.title === 'string' ? movie.title : '',
    originalTitle: typeof movie.original_title === 'string' ? movie.original_title : '',
    year
  };
}

function normalizeTitle(value) {
  return typeof value === 'string'
    ? value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    : '';
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
    const hasValidExternalUrl =
      typeof item.externalUrl === 'string' && /^https?:\/\//i.test(item.externalUrl);

    if (!hasValidTitle || (!hasValidUrl && !hasValidExternalUrl)) {
      return acc;
    }

    const stream = { title: item.title.trim() };

    if (hasValidUrl) {
      stream.url = item.url;
    } else {
      stream.externalUrl = item.externalUrl;
    }

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

function findAuthorizedMovieStream({ imdbId, title, originalTitle, year }, authorizedIndex) {
  if (!Array.isArray(authorizedIndex)) {
    return [];
  }

  const targetYear = Number.isInteger(year) ? year : undefined;
  const normalizedTitle = normalizeTitle(title);
  const normalizedOriginalTitle = normalizeTitle(originalTitle);

  const byImdb = authorizedIndex.find((entry) => entry && entry.imdbId === imdbId);
  if (byImdb) {
    return sanitizeStreams(Array.isArray(byImdb.streams) ? byImdb.streams : []);
  }

  if (targetYear) {
    const byTitleYear = authorizedIndex.find((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }

      const entryTitle = normalizeTitle(entry.title);
      return entryTitle && entryTitle === normalizedTitle && entry.year === targetYear;
    });

    if (byTitleYear) {
      return sanitizeStreams(Array.isArray(byTitleYear.streams) ? byTitleYear.streams : []);
    }

    const byOriginalTitleYear = authorizedIndex.find((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }

      const entryTitle = normalizeTitle(entry.title);
      return entryTitle && entryTitle === normalizedOriginalTitle && entry.year === targetYear;
    });

    if (byOriginalTitleYear) {
      return sanitizeStreams(
        Array.isArray(byOriginalTitleYear.streams) ? byOriginalTitleYear.streams : []
      );
    }
  }

  return [];
}

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async (args) => {
  const imdbId = args && args.type === 'movie' ? args.id : null;
  console.log(`[stream] request imdbId=${imdbId || 'n/a'}`);

  if (!imdbId) {
    console.log('[stream] direct lookup hit=no');
    console.log('[stream] metadata lookup success=no');
    console.log('[stream] authorized match found=no');
    console.log('[stream] streams returned count=0');
    return { streams: [] };
  }

  const data = loadStreams();
  const directItems = data.movieStreams[imdbId];
  const directStreams = sanitizeStreams(Array.isArray(directItems) ? directItems : []);

  console.log(`[stream] direct lookup hit=${directStreams.length > 0 ? 'yes' : 'no'}`);

  if (directStreams.length > 0) {
    console.log('[stream] metadata lookup success=skipped');
    console.log('[stream] authorized match found=yes (direct)');
    console.log(`[stream] streams returned count=${directStreams.length}`);
    return { streams: directStreams };
  }

  const metadata = await getMovieMetadataByImdbId(imdbId);
  console.log(`[stream] metadata lookup success=${metadata ? 'yes' : 'no'}`);

  const resolvedStreams = metadata
    ? findAuthorizedMovieStream(metadata, data.authorizedIndex)
    : [];

  console.log(`[stream] authorized match found=${resolvedStreams.length > 0 ? 'yes' : 'no'}`);
  console.log(`[stream] streams returned count=${resolvedStreams.length}`);

  return { streams: resolvedStreams };
});

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`[startup] Eugenio Private Addon started on port ${PORT}`);
console.log(`[startup] Local manifest URL: http://localhost:${PORT}/manifest.json`);
console.log(`[startup] Streams source file: ${STREAMS_FILE}`);
console.log(
  `[startup] TMDB metadata enabled: bearer=${TMDB_BEARER_TOKEN ? 'yes' : 'no'}, apiKey=${TMDB_API_KEY ? 'yes' : 'no'}`
);

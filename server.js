const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 7000;
const STREAMS_DIR = __dirname;

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BEARER_TOKEN = process.env.TMDB_BEARER_TOKEN;
const TMDB_ENABLED = Boolean(TMDB_BEARER_TOKEN || TMDB_API_KEY);

const manifest = {
  id: 'com.eugenio.privateaddon',
  version: '1.2.1',
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
    console.error(`[streams] Failed to read directory ${STREAMS_DIR}: ${error.message}`);
    return [];
  }
}

function mergeStreamDataPart(target, part) {
  if (!target || typeof target !== 'object' || !part || typeof part !== 'object') {
    return;
  }

  if (part.movieStreams && typeof part.movieStreams === 'object' && !Array.isArray(part.movieStreams)) {
    Object.entries(part.movieStreams).forEach(([imdbId, streams]) => {
      if (!Array.isArray(streams)) {
        return;
      }

      if (!Array.isArray(target.movieStreams[imdbId])) {
        target.movieStreams[imdbId] = [];
      }

      target.movieStreams[imdbId].push(...streams);
    });
  }

  if (Array.isArray(part.authorizedIndex)) {
    target.authorizedIndex.push(...part.authorizedIndex);
  }
}

function loadStreams() {
  try {
    const streamPartFiles = getStreamPartFiles();

    if (streamPartFiles.length === 0) {
      const fallbackPath = path.join(STREAMS_DIR, 'streams.json');
      if (fs.existsSync(fallbackPath)) {
        try {
          const raw = fs.readFileSync(fallbackPath, 'utf8');
          const parsed = JSON.parse(raw);
          console.warn('[streams] No streams_part_*.json found. Using fallback streams.json');
          return mergeStreamData([parsed]);
        } catch (error) {
          console.error(`[streams] Failed to load fallback streams.json: ${error.message}`);
        }
      }

      console.warn(`[streams] No stream part files found in ${STREAMS_DIR}. Using safe fallback.`);
      return emptyData();
    }

    const merged = emptyData();

    streamPartFiles.forEach((streamFile) => {
      try {
        const raw = fs.readFileSync(streamFile, 'utf8');
        const parsed = JSON.parse(raw);
        mergeStreamDataPart(merged, parsed);
      } catch (error) {
        console.error(`[streams] Failed to load ${streamFile}: ${error.message}`);
      }
    });

    return merged;
  } catch (error) {
    console.error(`[streams] Failed to load stream parts: ${error.message}`);
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

  const directMediaExtPattern = /\.(m3u8|mp4|webm|mov|mkv)(\?|#|$)/i;
  const nonDirectPattern = /(\/watch\b|\/embed\b|\/player\b|\.html?(\?|#|$))/i;

  return items.reduce((acc, item) => {
    if (!item || typeof item !== 'object') {
      return acc;
    }

    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    const hasExternalUrl = typeof item.externalUrl === 'string' && item.externalUrl.trim().length > 0;

    if (!title) {
      return acc;
    }

    if (!url) {
      if (hasExternalUrl) {
        console.warn(`[sanitize] drop reason=externalUrl_not_allowed title="${title}"`);
      }
      return acc;
    }

    if (!/^https?:\/\//i.test(url)) {
      console.warn(`[sanitize] drop reason=invalid_url title="${title}" url="${url}"`);
      return acc;
    }

    if (nonDirectPattern.test(url) || !directMediaExtPattern.test(url)) {
      console.warn(`[sanitize] drop reason=non_direct_media_url title="${title}" url="${url}"`);
      return acc;
    }

    const stream = { title, url };

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
      const entryYear = Number.isInteger(entry.year) ? entry.year : Number(entry.year);
      return entryTitle && entryTitle === normalizedTitle && entryYear === targetYear;
    });

    if (byTitleYear) {
      return sanitizeStreams(Array.isArray(byTitleYear.streams) ? byTitleYear.streams : []);
    }

    const byOriginalTitleYear = authorizedIndex.find((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }

      const entryTitle = normalizeTitle(entry.title);
      const entryYear = Number.isInteger(entry.year) ? entry.year : Number(entry.year);
      return entryTitle && entryTitle === normalizedOriginalTitle && entryYear === targetYear;
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
const streamsDataCache = loadStreams();
console.log(
  `[startup] Streams loaded: movieIds=${Object.keys(streamsDataCache.movieStreams).length}, authorizedEntries=${streamsDataCache.authorizedIndex.length}`
);

builder.defineStreamHandler(async (args) => {
  const imdbId = args && typeof args.id === 'string' ? args.id.trim() : '';
  console.log(`[stream] request imdbId=${imdbId || 'n/a'}`);

  if (!imdbId) {
    console.log('[stream] direct lookup hit=no');
    console.log('[stream] metadata lookup success=no');
    console.log('[stream] authorized match found=no');
    console.log('[stream] streams returned count=0');
    return { streams: [] };
  }

  const data = streamsDataCache;
  const directItems = data.movieStreams[imdbId];
  const directStreams = sanitizeStreams(Array.isArray(directItems) ? directItems : []);

  console.log(`[stream] direct lookup hit=${directStreams.length > 0 ? 'yes' : 'no'}`);

    console.log(`[stream] direct lookup hit=${directStreams.length > 0 ? 'yes' : 'no'}`);

    if (directStreams.length > 0) {
      console.log('[stream] metadata lookup success=no');
      console.log('[stream] authorized match found=yes');
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
  } catch (error) {
    console.error(`[stream] handler error imdbId=${imdbId}: ${error.message}`);
    console.log('[stream] direct lookup hit=no');
    console.log('[stream] metadata lookup success=no');
    console.log('[stream] authorized match found=no');
    console.log('[stream] streams returned count=0');
    return { streams: [] };
  }
});

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`[startup] Eugenio Private Addon started on port ${PORT}`);
console.log(`[startup] Local manifest URL: http://localhost:${PORT}/manifest.json`);
console.log(`[startup] Streams source directory: ${STREAMS_DIR}`);
console.log(
  `[startup] TMDB metadata enabled: bearer=${TMDB_BEARER_TOKEN ? 'yes' : 'no'}, apiKey=${TMDB_API_KEY ? 'yes' : 'no'}`
);

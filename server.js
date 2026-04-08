const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const PORT = process.env.PORT || 7000;

// TMDB è necessario per convertire l'IMDb ID fornito da Stremio nel TMDB ID richiesto da VixSrc
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BEARER_TOKEN = process.env.TMDB_BEARER_TOKEN;
const TMDB_ENABLED = Boolean(TMDB_BEARER_TOKEN || TMDB_API_KEY);

const manifest = {
  id: 'com.eugenio.vixsrcaddon',
  version: '1.3.0',
  name: 'VixSrc Addon',
  description: 'Provider stream basato sulle API di VixSrc',
  resources: ['stream'],
  types: ['movie', 'series'], // Aggiunto il supporto alle serie TV
  idPrefixes: ['tt'],
  catalogs: []
};

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

async function getTmdbIdByImdbId(imdbId, type) {
  if (!imdbId) return null;

  const result = await tmdbRequest(`/find/${encodeURIComponent(imdbId)}`, { external_source: 'imdb_id' });

  if (!result.ok || !result.data) {
    return null;
  }

  if (type === 'movie' && result.data.movie_results && result.data.movie_results.length > 0) {
    return result.data.movie_results[0].id;
  }
  
  if (type === 'series' && result.data.tv_results && result.data.tv_results.length > 0) {
    return result.data.tv_results[0].id;
  }

  return null;
}

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async (args) => {
  // Stremio passa gli ID per le serie nel formato "tt1234567:stagione:episodio"
  const [imdbId, season, episode] = args.id.split(':');
  const type = args.type;

  console.log(`[stream] Richiesta type=${type} id=${args.id}`);

  const tmdbId = await getTmdbIdByImdbId(imdbId, type);
  
  if (!tmdbId) {
    console.log('[stream] TMDB ID non trovato, impossibile generare il link VixSrc');
    return { streams: [] };
  }

  let vixUrl = '';
  if (type === 'movie') {
    vixUrl = `https://vixsrc.to/movie/${tmdbId}?lang=it`;
  } else if (type === 'series') {
    vixUrl = `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}?lang=it`;
  }

  console.log(`[stream] Stream generato: ${vixUrl}`);

  return {
    streams: [
      {
        name: 'VixSrc',
        title: `Guarda su VixSrc (${type})`,
        externalUrl: vixUrl 
      }
    ]
  };
});

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`[startup] VixSrc Addon avviato sulla porta ${PORT}`);
console.log(`[startup] Manifest locale: http://localhost:${PORT}/manifest.json`);
console.log(`[startup] TMDB abilitato: bearer=${TMDB_BEARER_TOKEN ? 'sì' : 'no'}, apiKey=${TMDB_API_KEY ? 'sì' : 'no'}`);

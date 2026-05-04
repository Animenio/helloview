const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const PORT = process.env.PORT || 7000;

// La tua Chiave API v3 di TMDB
const TMDB_API_KEY = '8fb300665dd3bffe6ec5b08df4d68ed7';

const manifest = {
  id: 'com.eugenio.vixsrc',
  version: '2.0.0',
  name: 'Eugenio VixSrc Addon',
  description: 'Guarda film e serie tramite VixSrc API con supporto TMDB',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'tmdb:'],
  catalogs: []
};

/**
 * Converte l'ID IMDb (tt...) in ID TMDB numerico.
 * Richiesto da VixSrc per il corretto funzionamento dei link.
 */
async function convertImdbToTmdb(imdbId, type) {
  if (!TMDB_API_KEY) {
    console.error("[TMDB] Errore: Chiave API mancante nel codice.");
    return null;
  }

  try {
    const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    const response = await fetch(url);
    const data = await response.json();

    if (type === 'movie' && data.movie_results && data.movie_results.length > 0) {
      return data.movie_results[0].id;
    } else if (type === 'series' && data.tv_results && data.tv_results.length > 0) {
      return data.tv_results[0].id;
    }
  } catch (error) {
    console.error("[TMDB] Errore durante la conversione ID:", error.message);
  }
  return null;
}

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async (args) => {
  const type = args.type;
  const fullId = args.id;
  
  console.log(`[stream] Richiesta: type=${type} id=${fullId}`);

  if (!fullId) return { streams: [] };

  let tmdbId = null;
  let season = null;
  let episode = null;

  const parts = fullId.split(':');
  const baseId = parts[0]; 

  // 1. Gestione ID nativi TMDB (se presenti)
  if (fullId.startsWith('tmdb:')) {
    tmdbId = parts[1];
    if (type === 'series') {
      season = parts[2];
      episode = parts[3];
    }
  } 
  // 2. Gestione ID IMDb (conversione automatica)
  else if (fullId.startsWith('tt')) {
    tmdbId = await convertImdbToTmdb(baseId, type);
    if (type === 'series') {
      season = parts[1];
      episode = parts[2];
    }
  }

  if (!tmdbId) {
    console.log(`[stream] Impossibile trovare ID TMDB per ${baseId}`);
    return { streams: [] };
  }

  // Costruzione URL VixSrc
  let streamUrl = (type === 'series') 
    ? `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}?lang=it`
    : `https://vixsrc.to/movie/${tmdbId}?lang=it`;

  return {
    streams: [{
      name: 'VixSrc (IT)',
      title: 'Riproduci nel browser tramite VixSrc',
      externalUrl: streamUrl
    }]
  };
});

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`[startup] Addon avviato sulla porta ${PORT}`);
console.log(`[startup] URL Manifest: http://localhost:${PORT}/manifest.json`);

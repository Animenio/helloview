const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const PORT = process.env.PORT || 7000;

// Sostituisci la stringa sottostante con la tua vera Chiave API v3 di TMDB
const TMDB_API_KEY = '8fb300665dd3bffe6ec5b08df4d68ed7';

const manifest = {
  id: 'com.eugenio.vixsrc',
  version: '2.0.0',
  name: 'Eugenio VixSrc Addon',
  description: 'Guarda film e serie tramite VixSrc API',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'tmdb:'],
  catalogs: []
};

// Funzione per convertire l'ID IMDb in TMDB usando le API di The Movie Database
async function convertImdbToTmdb(imdbId, type) {
  if (!TMDB_API_KEY || TMDB_API_KEY === '8fb300665dd3bffe6ec5b08df4d68ed7') {
    console.error("[TMDB] Errore: Chiave API mancante.");
    return null;
  }

  try {
    const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    // Nota: richiede Node.js 18 o superiore per usare fetch nativamente
    const response = await fetch(url);
    const data = await response.json();

    if (type === 'movie' && data.movie_results && data.movie_results.length > 0) {
      return data.movie_results[0].id;
    } else if (type === 'series' && data.tv_results && data.tv_results.length > 0) {
      return data.tv_results[0].id;
    }
  } catch (error) {
    console.error("[TMDB] Errore durante la conversione:", error.message);
  }
  return null;
}

const builder = new addonBuilder(manifest);

// Handler asincrono per gestire la chiamata di conversione
builder.defineStreamHandler(async (args) => {
  const type = args.type;
  const fullId = args.id;
  
  console.log(`[stream] Richiesta ricevuta: type=${type} id=${fullId}`);

  if (!fullId) {
    return { streams: [] };
  }

  let tmdbId = null;
  let season = null;
  let episode = null;

  const parts = fullId.split(':');
  const baseId = parts[0]; 

  // Gestione diretta per cataloghi basati su TMDB (es. tmdb:12345:1:2)
  if (fullId.startsWith('tmdb:')) {
    tmdbId = parts[1];
    if (type === 'series') {
      season = parts[2];
      episode = parts[3];
    }
  } 
  // Gestione classica Stremio basata su IMDb (es. tt1234567:1:2)
  else if (fullId.startsWith('tt')) {
    console.log(`[stream] Conversione di ${baseId} in ID TMDB...`);
    tmdbId = await convertImdbToTmdb(baseId, type);
    
    if (type === 'series') {
      season = parts[1];
      episode = parts[2];
    }
  }

  // Se la conversione fallisce o l'ID non è valido, non mostra risultati
  if (!tmdbId) {
    console.log(`[stream] Nessun ID TMDB trovato per ${baseId}`);
    return { streams: [] };
  }

  // Generazione del link VixSrc
  let streamUrl = '';
  if (type === 'series') {
    streamUrl = `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}?lang=it`;
  } else {
    streamUrl = `https://vixsrc.to/movie/${tmdbId}?lang=it`;
  }

  const stream = {
    name: 'VixSrc (IT)',
    title: 'Apri il player VixSrc nel browser',
    externalUrl: streamUrl
  };

  console.log(`[stream] URL generato con successo: ${streamUrl}`);

  return { streams: [stream] };
});

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`[startup] Eugenio VixSrc Addon avviato sulla porta ${PORT}`);
console.log(`[startup] Installa in Stremio usando: http://localhost:${PORT}/manifest.json`);

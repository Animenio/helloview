const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const PORT = process.env.PORT || 7000;

const manifest = {
  id: 'com.eugenio.vixsrc',
  version: '2.0.0',
  name: 'Eugenio VixSrc Addon',
  description: 'Guarda film e serie tramite VixSrc API',
  resources: ['stream'],
  types: ['movie', 'series'],
  // Aggiungiamo tmdb: ai prefissi per supportare i cataloghi TMDB, oltre ai classici tt di IMDb
  idPrefixes: ['tt', 'tmdb:'],
  catalogs: []
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler((args) => {
  const type = args.type;
  const id = args.id;
  
  console.log(`[stream] request type=${type} id=${id}`);

  if (!id) {
    return { streams: [] };
  }

  let streamUrl = '';
  const parts = id.split(':');
  let baseId = parts[0]; 

  // Gestione degli ID TMDB se l'utente usa un catalogo TMDB (es. tmdb:12345)
  if (id.startsWith('tmdb:')) {
    baseId = parts[1];
    if (type === 'series') {
      const season = parts[2];
      const episode = parts[3];
      // URL per le serie TV
      streamUrl = `https://vixsrc.to/tv/${baseId}/${season}/${episode}?lang=it`;
    } else {
      // URL per i film
      streamUrl = `https://vixsrc.to/movie/${baseId}?lang=it`;
    }
  } else {
    // Gestione standard Stremio (IMDb ID: tt1234567). 
    // Molti di questi siti iframe provano a risolvere anche l'IMDb ID se passato al posto del TMDB ID.
    if (type === 'series') {
      const season = parts[1];
      const episode = parts[2];
      streamUrl = `https://vixsrc.to/tv/${baseId}/${season}/${episode}?lang=it`;
    } else {
      streamUrl = `https://vixsrc.to/movie/${baseId}?lang=it`;
    }
  }

  const stream = {
    name: 'VixSrc (IT)',
    title: 'Apri il player VixSrc nel browser',
    externalUrl: streamUrl
  };

  console.log(`[stream] URL generato: ${streamUrl}`);

  return { streams: [stream] };
});

serveHTTP(builder.getInterface(), { port: PORT });

console.log(`[startup] Eugenio VixSrc Addon started on port ${PORT}`);
console.log(`[startup] Local manifest URL: http://localhost:${PORT}/manifest.json`);

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const PORT = process.env.PORT || 7000;

// Le credenziali TMDB vengono lette dalle Environment Variables di Render
const TMDB_BEARER_TOKEN = process.env.TMDB_BEARER_TOKEN;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

// Funzione per convertire IMDb ID in TMDB ID
async function getTmdbId(imdbId) {
    if (!TMDB_BEARER_TOKEN && !TMDB_API_KEY) {
        console.log("⚠️ Credenziali TMDB mancanti.");
        return null;
    }

    const headers = { accept: 'application/json' };
    if (TMDB_BEARER_TOKEN) {
        headers.Authorization = `Bearer ${TMDB_BEARER_TOKEN}`;
    }

    const url = `https://api.themoviedb.org/3/find/${imdbId}?external_source=imdb_id${TMDB_API_KEY && !TMDB_BEARER_TOKEN ? `&api_key=${TMDB_API_KEY}` : ''}`;
    
    try {
        const res = await fetch(url, { headers });
        const data = await res.json();
        
        if (data.movie_results && data.movie_results.length > 0) {
            return data.movie_results[0].id;
        }
        if (data.tv_results && data.tv_results.length > 0) {
            return data.tv_results[0].id;
        }
    } catch (e) {
        console.error("Errore durante la chiamata a TMDB:", e.message);
    }
    return null;
}

const manifest = {
    id: "org.helloview.vixsrc",
    version: "2.0.0",
    name: "HelloView VixSrc",
    description: "Riproduci l'intero catalogo appoggiandoti a VixSrc",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
    // Estrae i dati dall'ID di Stremio (es. tt1234567:1:2 per le serie)
    const [imdbId, season, episode] = id.split(":");
    
    // Converte IMDb ID -> TMDB ID
    const tmdbId = await getTmdbId(imdbId);

    if (!tmdbId) {
        return { streams: [] };
    }

    let vixUrl = "";
    
    // Costruisce l'URL usando la documentazione API di VixSrc
    if (type === "movie") {
        vixUrl = `https://vixsrc.to/movie/${tmdbId}?lang=it`;
    } else if (type === "series" && season && episode) {
        vixUrl = `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}?lang=it`;
    }

    if (vixUrl) {
        console.log(`Generato link VixSrc: ${vixUrl}`);
        return {
            streams: [
                {
                    title: `🎬 Guarda su VixSrc (${type === 'movie' ? 'Film' : 'Serie'})`,
                    externalUrl: vixUrl
                }
            ]
        };
    }

    return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: PORT });
console.log(`[Avvio] Addon VixSrc attivo su http://localhost:${PORT}/manifest.json`);

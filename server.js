const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

// --- INSERISCI LA TUA CHIAVE API QUI SOTTO ---
const TMDB_KEY = '8fb300665dd3bffe6ec5b08df4d68ed7'; 
// ---------------------------------------------

const builder = new addonBuilder({
    id: "org.helloview.addon",
    version: "1.2.0",
    name: "HelloView Player",
    description: "Riproduci film tramite VixSrc (Browser)",
    resources: ["stream"],
    types: ["movie", "series"],
    catalogs: [],
    idPrefixes: ["tt"]
});

builder.defineStreamHandler(async ({ type, id }) => {
    // Parsing dell'ID
    let imdbId = id.split(":")[0];
    let season = id.split(":")[1];
    let episode = id.split(":")[2];

    // Controllo Sicurezza Chiave
    if (!TMDB_KEY || TMDB_KEY.includes('INCOLLA')) {
        console.log("Errore: Chiave API mancante");
        return Promise.resolve({ streams: [{ title: "⚠️ ERRORE: Manca API Key nel file server.js", externalUrl: "https://github.com" }] });
    }

    try {
        // Conversione ID (IMDB -> TMDB)
        const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`;
        const response = await axios.get(url);
        
        let tmdbId;
        let finalUrl;

        if (type === 'movie' && response.data.movie_results.length > 0) {
            tmdbId = response.data.movie_results[0].id;
            finalUrl = `https://vixsrc.to/movie/${tmdbId}`;
        } 
        else if (type === 'series' && response.data.tv_results.length > 0) {
            tmdbId = response.data.tv_results[0].id;
            if(season && episode) {
                finalUrl = `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}`;
            }
        }

        if (finalUrl) {
            return Promise.resolve({ streams: [
                {
                    title: "🌐 Guarda su VixSrc (Browser)",
                    externalUrl: finalUrl
                }
            ]});
        }

    } catch (e) {
        console.log("Errore:", e.message);
    }

    return Promise.resolve({ streams: [] });
});

const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port });

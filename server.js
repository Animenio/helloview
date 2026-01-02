const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

// --- PUNTO CRITICO: INSERISCI LA TUA CHIAVE QUI SOTTO ---
// Esempio corretto: const TMDB_KEY = 'a1b2c3d4e5f6...';
const TMDB_KEY = '8fb300665dd3bffe6ec5b08df4d68ed7'; 
// --------------------------------------------------------

const builder = new addonBuilder({
    id: "org.helloview.addon",
    version: "1.0.1",
    name: "HelloView Player",
    description: "Riproduci film e serie tramite VixSrc",
    resources: ["stream"],
    types: ["movie", "series"],
    catalogs: [],
    idPrefixes: ["tt"]
});

builder.defineStreamHandler(async ({ type, id }) => {
    // Gestione ID serie (es. tt12345:1:5)
    let imdbId = id.split(":")[0];
    let season = id.split(":")[1];
    let episode = id.split(":")[2];

    // Controllo se l'utente ha dimenticato di mettere la chiave
    if (!TMDB_KEY || TMDB_KEY === 'INCOLLA_LA_TUA_CHIAVE_VERA_QUI') {
        return Promise.resolve({ streams: [{ 
            title: "⚠️ ERRORE: Inserisci API Key nel file server.js", 
            externalUrl: "https://github.com" 
        }] });
    }

    try {
        // 1. Chiamata a TMDB per convertire IMDB -> TMDB ID
        const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`;
        const response = await axios.get(url);
        
        let tmdbId;
        let finalUrl;

        // 2. Costruzione URL VixSrc
        if (type === 'movie' && response.data.movie_results.length > 0) {
            tmdbId = response.data.movie_results[0].id;
            finalUrl = `https://vixsrc.to/movie/${tmdbId}`;
        } 
        else if (type === 'series' && response.data.tv_results.length > 0) {
            tmdbId = response.data.tv_results[0].id;
            // Se è una serie, servono stagione ed episodio
            if(season && episode) {
                finalUrl = `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}`;
            }
        }

        // 3. Risposta a Stremio
        if (finalUrl) {
            return Promise.resolve({ streams: [
                {
                    title: "🎬 Guarda su HelloView (VixSrc)",
                    externalUrl: finalUrl
                }
            ]});
        }

    } catch (e) {
        console.log("Errore durante la richiesta API:", e.message);
    }

    return Promise.resolve({ streams: [] });
});

const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port });

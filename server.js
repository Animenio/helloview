const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

// --- CONFIGURAZIONE ---
// Sostituisci la scritta qui sotto con la tua Chiave API di TMDB
// Esempio: const TMDB_KEY = 'a1b2c3d4e5...';
const TMDB_KEY = 'INCOLLA_QUI_LA_TUA_CHIAVE_TMDB'; 
// ----------------------

const builder = new addonBuilder({
    id: "org.helloview.addon",
    version: "1.0.0",
    name: "HelloView Player",
    description: "Riproduci film e serie tramite VixSrc",
    resources: ["stream"],
    types: ["movie", "series"],
    catalogs: [],
    idPrefixes: ["tt"]
});

builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`Richiesta ricevuta per: ${type} ${id}`);

    // Gestione ID serie (es. tt12345:1:5)
    let imdbId = id.split(":")[0];
    let season = id.split(":")[1];
    let episode = id.split(":")[2];

    // Controllo sicurezza API Key
    if (!TMDB_KEY || TMDB_KEY.includes('INCOLLA_QUI')) {
        console.log("Errore: API Key mancante");
        return Promise.resolve({ streams: [{ title: "⚠️ ERRORE: Inserisci API Key nel codice", externalUrl: "https://www.themoviedb.org/" }] });
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
            console.log(`Link generato: ${finalUrl}`);
            return Promise.resolve({ streams: [
                {
                    title: "🎬 Guarda su HelloView (VixSrc)",
                    externalUrl: finalUrl
                }
            ]});
        } else {
            console.log("Nessun risultato trovato su TMDB");
        }

    } catch (e) {
        console.log("Errore durante la richiesta API:", e.message);
    }

    return Promise.resolve({ streams: [] });
});

// Avvio server su porta compatibile con Render
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port });
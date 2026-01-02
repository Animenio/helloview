const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

// --- INSERISCI LA TUA CHIAVE QUI ---
const TMDB_KEY = 'INCOLLA_LA_TUA_CHIAVE_VERA_QUI'; 
// -----------------------------------

const builder = new addonBuilder({
    id: "org.helloview.extract",
    version: "1.1.0",
    name: "HelloView Extractor",
    description: "Prova a estrarre il video diretto da VixSrc",
    resources: ["stream"],
    types: ["movie", "series"],
    catalogs: [],
    idPrefixes: ["tt"]
});

// Funzione helper per scaricare l'HTML fingendosi un browser
async function fetchHTML(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                'Referer': 'https://vixsrc.to/'
            },
            timeout: 5000 // Smette di cercare dopo 5 secondi
        });
        return response.data;
    } catch (e) {
        console.log("Errore download pagina:", e.message);
        return null;
    }
}

builder.defineStreamHandler(async ({ type, id }) => {
    let imdbId = id.split(":")[0];
    let season = id.split(":")[1];
    let episode = id.split(":")[2];

    if (!TMDB_KEY || TMDB_KEY.includes('INCOLLA')) {
        return Promise.resolve({ streams: [{ title: "⚠️ CONFIGURA API KEY", externalUrl: "https://github.com" }] });
    }

    try {
        // 1. Converti IMDB -> TMDB
        const searchUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`;
        const searchRes = await axios.get(searchUrl);
        
        let tmdbId;
        let vixUrl;

        if (type === 'movie' && searchRes.data.movie_results.length > 0) {
            tmdbId = searchRes.data.movie_results[0].id;
            vixUrl = `https://vixsrc.to/movie/${tmdbId}`;
        } 
        else if (type === 'series' && searchRes.data.tv_results.length > 0) {
            tmdbId = searchRes.data.tv_results[0].id;
            if(season && episode) {
                vixUrl = `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}`;
            }
        }

        if (!vixUrl) return Promise.resolve({ streams: [] });

        console.log(`Tentativo di estrazione da: ${vixUrl}`);
        
        // 2. TENTATIVO DI ESTRAZIONE (Scraping Leggero)
        // Scarichiamo l'HTML della pagina VixSrc
        const html = await fetchHTML(vixUrl);
        let directLinks = [];

        if (html) {
            // Cerchiamo pattern comuni di file video nel codice sorgente
            // Regex che cerca stringhe che finiscono con .m3u8 o .mp4
            const regex = /(https?:\/\/[^"']+\.(?:m3u8|mp4))/g;
            const matches = html.match(regex);

            if (matches) {
                // Rimuoviamo duplicati
                const uniqueLinks = [...new Set(matches)];
                
                uniqueLinks.forEach(link => {
                    // Spesso i link trovati sono delle pubblicità o trailer, ma proviamo
                    directLinks.push({
                        title: "⚡ Estratto (Direct Play)",
                        url: link,
                        behaviorHints: {
                            notWebReady: true, // Suggerisce a Stremio di trattarlo con cura
                            proxyHeaders: {
                                "request": {
                                    "Referer": "https://vixsrc.to/",
                                    "Origin": "https://vixsrc.to"
                                }
                            }
                        }
                    });
                });
            }
        }

        // 3. Risposta Finale
        // Mettiamo prima i link estratti (se ci sono), poi il link browser come fallback
        let streams = [
            ...directLinks,
            {
                title: "🌐 Apri nel Browser (Fallback sicuro)",
                externalUrl: vixUrl
            }
        ];

        return Promise.resolve({ streams: streams });

    } catch (e) {
        console.log("Errore generale:", e.message);
        return Promise.resolve({ streams: [] });
    }
});

const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: port });

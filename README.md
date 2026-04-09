# Eugenio Private Addon

Addon Stremio minimale che funziona come **stream provider per film aperti/cercati in Stremio**.

## Flusso completo (search/open -> stream)
1. L’utente apre un film in Stremio e il client invia una richiesta `stream` con `args.id` (IMDb, es. `tt0111161`).
2. Il server legge i file split `streams_part_*.json` dalla root della repo deployata.
3. I file validi vengono uniti in una singola struttura:
   - merge di tutte le chiavi in `movieStreams`
   - concat di tutti i record in `authorizedIndex`
4. Dopo il merge viene fatta deduplica robusta:
   - `movieStreams[imdbId]` dedup per `title + url`
   - `authorizedIndex` dedup per priorità `imdbId`, altrimenti `title normalizzato + year`
5. Lo stream handler prova prima il lookup diretto in `movieStreams[imdbId]`.
6. Se non trova stream validi, prova fallback metadata TMDB (solo metadata) e matching su `authorizedIndex`.
7. In ogni caso il risultato finale è sempre `{ streams: [...] }` oppure `{ streams: [] }` senza crash.

## Vincoli rispettati
- Solo sorgenti autorizzate/locali controllate dall’utente.
- Nessuno scraping di siti terzi.
- Nessuna integrazione con VixSrc o siti non autorizzati.
- Nessun frontend aggiuntivo.
- Nessun database complesso.
- Nessun uso di Express.

## Manifest
Il manifest è stream-first e supporta:
- `resources: ["stream"]`
- `types: ["movie"]`
- `idPrefixes: ["tt"]`
- `catalogs: []`
- `version: "1.2.1"`

## Caricamento split files
- Il loader cerca **solo** file che matchano esattamente `streams_part_XX.json` (due cifre).
- I file sono ordinati in modo numerico (`01`, `02`, ..., `20`).
- Se un file è malformato, viene loggato e ignorato, ma il caricamento continua.
- `streams.json` è ignorato di default e usato solo come fallback opzionale se mancano totalmente i file split.
- Se non esiste nessuna sorgente valida, il server usa fallback sicuro:
  - `{ "movieStreams": {}, "authorizedIndex": [] }`

## Formato richiesto per ogni file parte
Ogni file parte deve avere la forma seguente:
```json
{
  "movieStreams": {
    "tt1254207": [
      {
        "title": "Big Buck Bunny - HTTPS HLS",
        "url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
      }
    ]
  },
  "authorizedIndex": [
    {
      "imdbId": "tt0111161",
      "title": "The Shawshank Redemption",
      "year": 1994,
      "streams": [
        {
          "title": "Authorized stream",
          "url": "https://example.com/authorized/shawshank.m3u8"
        }
      ]
    }
  ]
}
```

## Differenza tra le sezioni dati
- `movieStreams`: lookup diretto `IMDb ID -> streams`.
- `authorizedIndex`: fallback tramite metadata (`title/originalTitle/year`) -> `streams`.

## Matching logic su `authorizedIndex`
Priorità del resolver:
1. `imdbId` esatto
2. `title` normalizzato + `year`
3. `originalTitle` normalizzato + `year`

La normalizzazione rende il matching robusto a:
- accenti
- punteggiatura
- maiuscole/minuscole
- spazi multipli

## Requirement per playback interno Stremio
Per garantire playback interno:
- usare sempre `url` (HTTP/HTTPS), **mai** `externalUrl`
- usare URL diretti media (`.m3u8`, `.mp4`, `.webm`, `.mov`, `.mkv`)
- URL tipo pagine/player (`/watch`, `/embed`, `/player`, `.html`) vengono scartati come non idonei

## Logging (senza segreti)
Per ogni richiesta stream vengono loggati:
- `stream request imdbId`
- `direct lookup hit yes/no`
- `metadata lookup success yes/no`
- `authorized match found yes/no`
- `streams returned count`

Per la sanitizzazione stream vengono loggati anche i motivi di scarto:
- `invalid_url`
- `externalUrl_not_allowed`
- `non_direct_media_url`

## TMDB
TMDB è opzionale e usato **solo per metadata** durante la risoluzione secondaria.
Variabili supportate:
- `TMDB_BEARER_TOKEN` (preferito)
- `TMDB_API_KEY` (fallback)

## Avvio locale
```bash
npm install
npm start
```
Manifest locale:
- `http://localhost:7000/manifest.json`

## Deploy Render
1. Push su GitHub.
2. Crea Web Service su Render.
3. Build command: `npm install`
4. Start command: `npm start`
5. (Opzionale) imposta `TMDB_BEARER_TOKEN` / `TMDB_API_KEY`.
6. Re-deploy/restart per applicare env vars.

Manifest deploy:
- `https://<service-name>.onrender.com/manifest.json`

## Nota Render e filesystem
I file JSON split vengono letti direttamente dal filesystem della repo deployata (`__dirname`).
Quindi su Render i `streams_part_*.json` devono essere presenti nel deploy.

## Nota catalogo
Questo addon **non costruisce un catalogo globale proprio**: usa direttamente il search/catalog già presenti in Stremio.
Il playback compare solo quando esiste uno stream valido nei `streams_part_*.json` (o fallback `streams.json`); in caso contrario ritorna `streams: []`.

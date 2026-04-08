# Eugenio Private Addon

Addon Stremio minimale che funziona come **stream provider per film aperti/cercati in Stremio**.

## Flusso principale (search/open -> stream)
1. L’utente cerca un film in Stremio e apre la scheda (es. `Eternity`).
2. Stremio invia una richiesta `stream` al tuo addon con `args.id` = IMDb ID (es. `tt0111161`).
3. L’addon prova prima il lookup diretto in `streams.json.movieStreams[imdbId]`.
4. Se non trova nulla, prova una risoluzione secondaria:
   - recupera metadata movie da TMDB (solo metadata)
   - estrae `title`, `originalTitle`, `year`
   - chiama resolver locale `findAuthorizedMovieStream(...)` su `authorizedIndex`
5. Se trova match autorizzato ritorna `streams: [...]`; altrimenti ritorna `streams: []`.

## Vincoli rispettati
- Solo sorgenti autorizzate/locali controllate dall’utente.
- Nessuno scraping di siti terzi.
- Nessuna integrazione con VixSrc o siti non autorizzati.
- Nessun frontend aggiuntivo.
- Nessun database complesso.
- Nessun uso di Express.

## Manifest
Il manifest è semplificato e supporta:
- `resources: ["stream"]`
- `types: ["movie"]`
- `idPrefixes: ["tt"]`
- `version: "1.2.0"`

## Struttura `streams.json`
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

## Matching logic
Priorità del resolver locale:
1. `imdbId` esatto
2. `title` normalizzato + `year`
3. `originalTitle` normalizzato + `year`

## Logging (senza segreti)
Per ogni richiesta stream vengono loggati:
- `stream request imdbId`
- `direct lookup hit yes/no`
- `metadata lookup success/failure`
- `authorized match found yes/no`
- `streams returned count`

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


## Nota catalogo
Questo addon **non costruisce un catalogo globale proprio**: usa direttamente il search/catalog già presenti in Stremio.
Il playback compare solo quando esiste uno stream autorizzato nel tuo `streams.json`; in caso contrario ritorna `streams: []`.

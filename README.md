# Eugenio Private Addon

Addon Stremio **stream-only** minimale per film, con playback esterno via `externalUrl`.

## Architettura finale
- Manifest minimale (`stream` only).
- Nessun catalog custom.
- Nessun meta handler.
- Unico handler: `defineStreamHandler`.
- Lookup diretto solo per IMDb ID (`tt...`).
- Nessun TMDB.
- Nessun matching titolo/anno/original title.
- Nessun fallback metadata.
- Nessuna deduplica sofisticata.

## Manifest
- `id`: `com.eugenio.privateaddon`
- `version`: `2.0.0`
- `name`: `Eugenio Private Addon`
- `description`: `Private Stremio addon for external playback`
- `resources`: `["stream"]`
- `types`: `["movie"]`
- `idPrefixes`: `["tt"]`
- `catalogs`: `[]`

## Sorgente dati
L’addon usa solo file JSON locali nella repo:
1. **Primario**: tutti i file `streams_part_*.json`
2. **Fallback opzionale**: `streams.json` (solo se non ci sono file parte)

### Regole loader
- Cerca file con pattern `streams_part_XX.json`.
- Merge semplice delle chiavi `movieStreams`.
- Se lo stesso IMDb ID compare in più file, concatena gli array.
- `authorizedIndex` viene ignorato completamente anche se presente.

## Formato richiesto
Ogni file deve contenere `movieStreams` nel formato seguente:

```json
{
  "movieStreams": {
    "tt1254207": [
      {
        "title": "Big Buck Bunny - External Player",
        "externalUrl": "https://example.com/external/movie/1254207"
      }
    ]
  }
}
```

## Comportamento stream handler
Per ogni richiesta `stream`:
1. legge `args.id` come IMDb ID
2. prende `movieStreams[imdbId]`
3. applica sanitizzazione minima
4. risponde:
   - `{ streams: [{ title, externalUrl }] }` se trova risultati validi
   - `{ streams: [] }` altrimenti

## Sanitizzazione stream
Accetta solo item con:
- `title` valido (stringa non vuota)
- `externalUrl` valido (`http/https`)

Scarta:
- item malformati
- item con `url`
- item senza `externalUrl`

`behaviorHints` viene mantenuto solo se è un oggetto valido.

## Logging minimale
Log essenziali:
- startup
- numero file parte trovati
- IMDb richiesto
- hit/miss
- numero stream restituiti

## Avvio locale
```bash
npm install
npm start
```

Manifest locale:
- `http://localhost:7000/manifest.json`

## Deploy Render
La compatibilità con Render resta invariata:
- nessun Express
- nessun database
- nessun frontend
- file JSON letti dal filesystem della repo deployata (`__dirname`)

Manifest deploy:
- `https://<service-name>.onrender.com/manifest.json`

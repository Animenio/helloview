# Eugenio Private Addon

## Overview
This is a minimal private Stremio addon (Node.js + CommonJS + `stremio-addon-sdk`) for **authorized streams only**.

The addon keeps stream mappings in `streams.json` and exposes:
- `stream` resource
- `catalog` resource (movie demo catalog)
- `meta` resource

TMDB is used **only** for movie catalog and metadata enrichment.
Streams remain static and separate in `streams.json`.

## Data model in `streams.json`
The file uses two top-level objects:
- `movieStreams`
- `fallbackMovieMeta`

### Critical ID rule
- **Movies:** same ID for meta and stream (example: `tt1254207`).

## Demo catalog
The addon provides one internal demo catalog:
- `eugenio_top`

Default IMDb IDs used for TMDB lookup:
- `tt1254207`
- `tt0111161`
- `tt0133093`

Catalog responses return preview metas (`id`, `type`, `name`, `poster`, optional `description`, optional `releaseInfo`).
`meta` responses return full movie metadata including `genres`.

## TMDB configuration
Render provides TMDB credentials via environment variables:
- `TMDB_BEARER_TOKEN` (preferred at runtime)
- `TMDB_API_KEY` (used only as fallback if bearer token is missing)

Rules:
- Do **not** commit TMDB keys/tokens in the repository.
- Do **not** print TMDB keys/tokens in logs.
- TMDB is used only for catalog/meta, not for stream playback.

If TMDB is missing or temporarily failing, the addon falls back to local `fallbackMovieMeta` from `streams.json`.

Attribution note:
- This product uses the TMDB API but is not endorsed or certified by TMDB.

Credit note:
- If you use TMDB data or images, include TMDB logo/credits in your About/Credits section.

## Local run
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the addon:
   ```bash
   npm start
   ```
3. Manifest URL:
   - `http://localhost:7000/manifest.json`

Useful logs include:
- TMDB enabled `bearer=yes/no, apiKey=yes/no`
- catalog request `type/id`
- TMDB lookup success/failure per IMDb ID
- meta request `type/id`
- stream request `type/id`

## Deploy on Render
1. Push the repository to GitHub.
2. Create a new Web Service on Render from the repository.
3. Render uses:
   - Build command: `npm install`
   - Start command: `npm start`
4. Add env vars in Render:
   - `TMDB_BEARER_TOKEN` (recommended)
   - optionally `TMDB_API_KEY`
5. Deployed manifest URL:
   - `https://<service-name>.onrender.com/manifest.json`

## TMDB troubleshooting
- If `TMDB_BEARER_TOKEN` / `TMDB_API_KEY` are not active in your Render deploy, the addon still serves catalog/meta using local `fallbackMovieMeta`.
- The catalog should **not** disappear when TMDB fails (timeout, auth, endpoint, rate limit): fallback metadata keeps the addon visible in Stremio.
- After adding or changing env vars in Render, trigger a new deploy/restart of the service so runtime picks up the new values.
- TMDB is used **only** for metadata (catalog/meta), never for stream playback.

## Install in Stremio
1. Copy your manifest URL.
2. Open Stremio → Addons.
3. Choose **Install via URL**.
4. Paste the manifest URL and install.
5. Open demo movie catalog and test items.

## Limitations
- Only for streams you control and are authorized to use.
- No scraping.
- No database.
- No TV series handling in this phase.

# Eugenio Private Addon

## Overview
This is a minimal private Stremio addon (Node.js + CommonJS + `stremio-addon-sdk`) for **authorized streams only**.

The addon keeps stream mappings in `streams.json` and exposes:
- `stream` resource (main functionality)
- `catalog` resource (demo catalogs for direct in-app testing)
- `meta` resource (metadata used by demo catalogs)

## Why the addon may not appear as a source
Stremio shows an addon source in a content page only when the addon returns at least one stream for the requested content ID.

If your addon is stream-only and the requested ID is not present in `streams.json`, the stream handler returns an empty list and Stremio shows no source for that title. This is expected behavior.

In this project:
- movies are mapped by IMDb IDs (example: `tt1254207`)
- series episodes are mapped by `tt:season:episode` IDs (example: `tt1748166:1:1`)

If the queried ID does not exactly match a key in `streams.json`, you will get no streams.

## Demo catalogs for testing
To make testing reliable directly inside Stremio, the addon provides two internal demo catalogs:
- `authorized-demo-movies`
- `authorized-demo-series`

These catalogs are fed by `streams.json.meta` and point to IDs that also exist in `streams.json.movie` / `streams.json.series`.

Default demo IDs included:
- Movie demo: `tt1254207`
- Series demo episode: `tt1748166:1:1`

How to use the demo catalogs:
1. Install the addon in Stremio.
2. Open the addon catalogs.
3. Open one demo item.
4. Verify that at least one stream is returned.

After verifying, replace demo entries in `streams.json` with your own authorized streams.

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

Useful startup logs include:
- addon startup confirmation
- local manifest URL
- catalog/meta/stream request traces
- number of streams returned per stream request

## Deploy on Render
1. Push the repository to GitHub.
2. Create a new Web Service on Render from the repository.
3. Render uses:
   - Build command: `npm install`
   - Start command: `npm start`
4. Deployed manifest URL:
   - `https://<service-name>.onrender.com/manifest.json`

Render Free note:
- cold starts are possible after inactivity, so the first request can be slow.

## Install in Stremio
1. Copy your manifest URL:
   - local: `http://localhost:7000/manifest.json`
   - deployed: `https://<service-name>.onrender.com/manifest.json`
2. Open Stremio → Addons.
3. Choose **Install via URL**.
4. Paste the manifest URL and install.
5. Open the demo catalogs and test one demo item.

## Important limitations
- This addon is only for streams you control and are authorized to use.
- No scraping, no torrent integrations, no third-party source resolvers.
- No TMDB API integration and no IMDb→TMDB conversion logic.
- `streams.json` is static file-based configuration; restart/redeploy after updates.

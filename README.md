# Eugenio Private Addon

## Overview
This is a minimal private Stremio addon (Node.js + CommonJS + `stremio-addon-sdk`) for **authorized streams only**.

The addon keeps stream and meta mappings in `streams.json` and exposes:
- `stream` resource
- `catalog` resource (demo catalogs for in-app testing)
- `meta` resource

## Data model in `streams.json`
The file uses four top-level objects:
- `movieStreams`
- `seriesStreams`
- `movieMeta`
- `seriesMeta`

### Critical ID rule
- **Movies:** same ID for meta and stream (example: `tt1254207`).
- **Series:** series meta ID is separate from episode/stream IDs.
  - series meta ID example: `tt1748166`
  - episode stream ID example: `tt1748166:1:1`

If a series uses an episode-like ID (`tt...:1:1`) as the **series meta ID**, Stremio catalogs may not appear correctly.

## Demo catalogs
The addon provides two internal demo catalogs:
- `authorized-demo-movies`
- `authorized-demo-series`

Default demo entries:
- Movie demo: `tt1254207`
- Series demo (meta): `tt1748166`
- Series episode stream: `tt1748166:1:1`

Catalog responses return **preview metas only** (`id`, `type`, `name`, `poster`, optional `description`).
Full series metadata with `videos` is returned by the `meta` resource.

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
- catalog request `type/id` + returned meta count
- meta request `type/id`
- stream request `type/id` + returned stream count

## Deploy on Render
1. Push the repository to GitHub.
2. Create a new Web Service on Render from the repository.
3. Render uses:
   - Build command: `npm install`
   - Start command: `npm start`
4. Deployed manifest URL:
   - `https://<service-name>.onrender.com/manifest.json`

## Install in Stremio
1. Copy your manifest URL.
2. Open Stremio → Addons.
3. Choose **Install via URL**.
4. Paste the manifest URL and install.
5. Open demo catalogs and test demo items.

## Limitations
- Only for streams you control and are authorized to use.
- No scraping.
- No TMDB integration.
- No database.

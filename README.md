# Eugenio Private Addon

## Overview
Minimal private Stremio addon (Node.js + CommonJS) for **authorized streams only** that you directly control (your own MP4/HLS or URLs you are licensed to use).

## Project structure
- `server.js` — addon manifest + `defineStreamHandler` + server startup.
- `streams.json` — local static stream mapping for movies and series episodes.
- `render.yaml` — Render web service deployment configuration.
- `package.json` — runtime metadata and dependencies.

## Local run
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the addon:
   ```bash
   npm start
   ```
3. Local manifest URL:
   - `http://localhost:7000/manifest.json`

## How to edit streams.json
`streams.json` is local and static. Customize it with streams you are authorized to distribute/use.

Supported keys:
- `movie` entries by IMDb id (example: `tt1254207`)
- `series` entries by `tt:season:episode` (example: `tt1748166:1:1`)

Each entry supports:
- `title` (required)
- `url` or `externalUrl` (required, must start with `http://` or `https://`)
- `behaviorHints` (optional)

## Deploy on Render
1. Push this repository to GitHub.
2. Create a new Render service from the repo.
3. Render will use `render.yaml` settings:
   - Build: `npm install`
   - Start: `npm start`
4. Deployed manifest URL:
   - `https://<service-name>.onrender.com/manifest.json`

Notes for Render free plan:
- The service can spin down when idle.
- First request after idle can be slow.
- Do not use Render filesystem for runtime-persistent mutable data.

## Install in Stremio
1. Deploy and copy your manifest URL.
2. Open Stremio → Addons.
3. Use “Install via URL” and paste:
   - local: `http://localhost:7000/manifest.json`
   - remote: `https://<service-name>.onrender.com/manifest.json`

## Important limitations
- This project is intended **only** for streams you control and are authorized to use.
- No scraping, torrents, or third-party unauthorized source resolvers are included.
- `streams.json` changes require redeploy/restart to reflect updates.

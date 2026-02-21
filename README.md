# Helsinki Moves

Web app for showing nearby Helsinki public transport departures using browser geolocation.

## Current status

- Transport modes: `RAIL`, `TRAM`, `METRO`, and `BUS`
- Auto-loads location on page open
- Auto-refreshes departures every 30 seconds
- Manual refresh button
- Rail filter: `Helsinki Only`
- Bus/Tram/Metro controls:
  - nearest stop selector
  - line filters
  - destination filters
- UI state is persisted in URL query params and localStorage
- Light/dark theme toggle with system preference fallback
- Theme is initialized inline in `index.html` head before CSS load to avoid flash/mismatch
- Frontend reports client errors to server-side logging endpoint

## API routes

- `GET /api/v1/departures`
  - Required: `lat`, `lon`, `mode`
  - `mode`: `RAIL`, `TRAM`, `METRO`, or `BUS`
  - BUS/TRAM/METRO optional filters: `stopId`, `line`, `dest`
  - Metro mode maps to Digitransit's upstream `SUBWAY` route mode
- `POST /api/v1/client-error`
  - Accepts sanitized client error reports (payload-limited)

## Project structure

- `web/index.html` app shell
- `web/scripts/app/*.js` frontend runtime modules (ordered via `web/scripts/app/entry.js`)
- `web/scripts/README.md` module boundaries/load order (`window.HMApp` contract)
- `web/styles/main.css` stylesheet entrypoint
- `web/styles/*.css` modular stylesheets (see `web/styles/README.md`)
- `web/tools/build-assets.mjs` asset bundling script
- `web/dist/` generated JS/CSS bundles loaded by `index.html`
- `web/assets/icons/` static icons
- `web/api/v1/departures.js` departures API
- `web/api/v1/client-error.js` client error reporting API
- `web/api/lib/digitransit.js` Digitransit GraphQL client + queries
- `web/api/lib/departures-utils.js` shared departures parsing/filter utilities
- `web/vercel.json` security headers config

## Local development

From `web/`:

1. `cp .env.example .env`
2. Set `DIGITRANSIT_API_KEY` in `.env`
3. `npm install`
4. `npm run build`
5. Run `vercel dev`

Quick checks:

From repository root:

- `node --check web/scripts/app/01-state.js`
- `node --check web/scripts/app/02-ui.js`
- `node --check web/scripts/app/03-data.js`
- `node --check web/scripts/app/04-init.js`
- `node --check web/scripts/app/entry.js`
- `node --check web/tools/build-assets.mjs`
- `node --check web/api/v1/departures.js`
- `node --check web/api/v1/client-error.js`
- `node --check web/api/lib/digitransit.js`
- `node --check web/api/lib/departures-utils.js`

## Deploy (Vercel)

1. Import repository to Vercel.
2. Set **Root Directory** to `web`.
3. Add environment variable `DIGITRANSIT_API_KEY`.
4. Deploy.

Runtime: Node.js `24.x` (`web/package.json`).

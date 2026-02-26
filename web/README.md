# Simple Vercel App: Helsinki Moves

## Structure

- `index.html` app shell
- `scripts/app/*.js` frontend runtime modules
- `scripts/app/entry.js` JS bundle entry (imports app modules in order)
- `scripts/README.md` script module boundaries/load order (`window.HMApp` contract)
- inline theme bootstrap in `index.html` head (sets `data-theme` before CSS load)
- `styles/main.css` stylesheet entrypoint/import manifest
- `styles/*.css` modular stylesheets
- `styles/README.md` stylesheet maintenance guide
- `dist/` generated frontend bundles served by `index.html`
- `tools/build-assets.mjs` frontend bundling script
- `assets/icons/` app icons
- `api/v1/departures.js` departures Vercel serverless API
- `api/v1/client-error.js` client error report API
- `api/lib/digitransit.js` Digitransit GraphQL client + query helpers
- `api/lib/departures-utils.js` shared departures parsing/filtering utilities
- `vercel.json` Vercel config

## Local run

1. Install Vercel CLI:
   - `npm i -g vercel`
2. From this folder (`web/`), create local env file:
   - `cp .env.example .env`
3. Set your key in `.env`:
   - `DIGITRANSIT_API_KEY=...`
4. Install dependencies and build assets:
   - `npm install`
   - `npm run build`
5. Run:
   - `vercel dev`

## Quick checks

From repository root:

- `node --check web/scripts/app/entry.js`
- `node --check web/scripts/app/01-state.js`
- `node --check web/scripts/app/02-ui.js`
- `node --check web/scripts/app/03-data.js`
- `node --check web/scripts/app/04-init.js`
- `node --check web/tools/build-assets.mjs`
- `node --check web/api/v1/departures.js`
- `node --check web/api/v1/client-error.js`
- `node --check web/api/lib/digitransit.js`
- `node --check web/api/lib/departures-utils.js`

## Cross-browser E2E (voice/microphone flows)

From `web/`:

- `npm run test:e2e:install`
- `npm run test:e2e`

Target a single engine:

- `npm run test:e2e:chromium`
- `npm run test:e2e:firefox`
- `npm run test:e2e:webkit`

## Deploy

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel dashboard, import repo.
3. Set **Root Directory** to `web`.
4. Add environment variable:
   - `DIGITRANSIT_API_KEY`
5. Deploy.

Vercel runs `npm run build` (configured in `vercel.json`) before deployment.

## API used

- Endpoint: `https://api.digitransit.fi/routing/v2/hsl/gtfs/v1`
- Header: `digitransit-subscription-key`

## Notes

- Frontend requests your browser location and calls `/api/v1/departures`.
- API supports multiple modes via `mode` (`RAIL`, `TRAM`, `METRO`, `BUS`).
- BUS/TRAM/METRO modes support `stopId`, `line`, and `dest` query filters.
- Metro mode is mapped to Digitransit's upstream `SUBWAY` route mode.
- Frontend also posts sanitized client errors to `/api/v1/client-error`.
- Frontend also emits sampled `type: "metric"` events to `/api/v1/client-error` with:
  - `context.metricName`: `first_successful_render`
  - `context.metricName`: `initial_nearest_stop_resolved`
  - `context.metricName`: `first_manual_interaction`
  - `context.metricName`: `first_manual_stop_context_change`
- Theme supports manual light/dark toggle with system preference fallback.

# AGENTS.md

Guidance for agents working in this repository.

## Repository Scope

This repo is a **web-only** project.

- Frontend:
  - `web/index.html`
  - `web/scripts/app/*.js` (ordered runtime modules)
  - `web/scripts/app/entry.js` (bundle entry importing runtime modules in order)
  - `web/scripts/README.md` (script module boundaries/load order)
  - `web/index.html` inline head theme bootstrap (before CSS load)
  - `web/styles/main.css` (stylesheet entrypoint/import manifest)
  - `web/styles/*.css` (modular stylesheets)
  - `web/styles/README.md` (stylesheet maintenance rules)
  - `web/dist/*` (generated frontend bundles served by `index.html`)
  - `web/tools/build-assets.mjs` (asset bundling script)
  - `web/assets/icons/*`
- API (Vercel serverless):
  - `web/api/v1/departures.js`
  - `web/api/v1/client-error.js`
- API helpers:
  - `web/api/lib/digitransit.js`
  - `web/api/lib/departures-utils.js`
- Vercel config: `web/vercel.json`
- CI: `.github/workflows/ci.yml`

## Purpose

Show nearest Helsinki public transport departures (rail + tram + metro + bus) based on browser geolocation.

Key UX requirements currently in use:

- Auto-load location on page open.
- Auto-refresh departures every 30 seconds.
- Manual location refresh button.
- Rail/Tram/Metro/Bus mode toggle.
- Rail-only local filter: `Helsinki Only`.
- Bus/Tram/Metro controls:
  - stop selector
  - line filters
  - destination filters
- Persist selected mode and filters in URL + localStorage.
- Theme toggle with system preference fallback.
- Persist selected theme in localStorage.
- Show departures clearly with:
  - line identifier
  - track/platform or stop
  - remaining time

## API Behavior

`GET /api/v1/departures` currently:

- Uses Digitransit GraphQL (`routing/v2/hsl/gtfs/v1`).
- Required query params:
  - `lat`, `lon`, `mode`
- `mode` supports `RAIL`, `TRAM`, `METRO`, and `BUS`.
- BUS/TRAM/METRO modes support optional query params:
  - `stopId`
  - `line` (repeatable or comma-separated)
  - `dest` (repeatable or comma-separated)
- Resolves nearest relevant station/stop(s) and returns upcoming departures.
- BUS/TRAM/METRO responses include `stops`, `selectedStopId`, and `filterOptions` for UI controls.
- Internally, metro queries map to Digitransit's `SUBWAY` route mode.
- Sets `Cache-Control: no-store`.
- Invalid input returns `400`. Invalid method returns `405`.
- Returns sanitized 500 errors to clients.

`POST /api/v1/client-error` currently:

- Accepts client-side error reports from frontend.
- Applies payload size limits and sanitization.
- Logs sanitized payload server-side and returns `204` on success.
- Returns:
  - `400` for invalid payload
  - `405` for invalid method
  - `413` for oversized payload

When modifying API behavior, preserve:

- No secret leakage in responses.
- Generic client-facing errors on internal failures.
- Server-side logging only for detailed errors.

## Secrets and Security

- Secret used: `DIGITRANSIT_API_KEY`
- Store secret only in:
  - Vercel project environment variables
  - local `web/.env` for local development

Never expose secrets to frontend or committed files.

Security headers are configured in `web/vercel.json` (CSP, HSTS, frame protections, referrer policy, geolocation permissions policy).

If touching auth/config/security:

1. Avoid returning raw upstream errors to clients.
2. Keep `.env` out of version control.
3. Preserve or improve WAF/rate limiting posture.

## Local Development

From `web/`:

1. `cp .env.example .env`
2. set `DIGITRANSIT_API_KEY`
3. `npm install`
4. `npm run build`
5. `vercel dev`

Quick sanity checks:

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

## Deploy

Deploy from `web/`:

- `vercel --prod --yes`

Runtime target:

- Node.js `24.x` (see `web/package.json`)

Primary production domain is aliased to:

- `https://helsinkimoves.fheinonen.eu`

## Version Control

- Changes in this repository are committed with `jj` (Jujutsu).

## Style and Editing Guidelines

- Keep implementation plain HTML/CSS/JS unless user requests framework migration.
- Prioritize readability over visual complexity.
- Keep UI mobile-friendly.
- Prefer small targeted patches over broad rewrites.
- Frontend runtime scripts are modularized under `web/scripts/app/`; preserve load order in `web/index.html`.
- Add new app logic to the closest module file instead of growing one file.
- Cross-module script communication should go through `window.HMApp` (`dom`, `constants`, `state`, `api`) instead of new implicit globals.
- CSS is modularized; add styles to the closest file under `web/styles/` rather than `web/styles/main.css`.
- Keep `web/styles/main.css` import order stable unless there is a clear cascade reason to change it.
- Light theme overrides are centralized in `web/styles/theme-light.css` under `[data-theme="light"]`.

## Common Safe Tests

- `curl -i 'https://helsinkimoves.fheinonen.eu/api/v1/departures?lat=60.1708&lon=24.9375&mode=RAIL'`
- `curl -i 'https://helsinkimoves.fheinonen.eu/api/v1/departures?lat=60.1708&lon=24.9375&mode=TRAM'`
- `curl -i 'https://helsinkimoves.fheinonen.eu/api/v1/departures?lat=60.1708&lon=24.9375&mode=METRO'`
- `curl -i 'https://helsinkimoves.fheinonen.eu/api/v1/departures?lat=60.1708&lon=24.9375&mode=BUS'`
- Probe expected rejection behavior:
  - invalid params -> `400`
  - invalid mode -> `400`
  - invalid method -> `405`

## If Unsure

- Preserve existing behavior.
- Ask before changing external integrations (DNS, domains, WAF policy, spend settings).

# AGENTS.md

Guidance for agents working in this repository.

## Repository Scope

This repo is a **web-only** project.

- Frontend:
  - `web/index.html`
  - `web/scripts/app.js`
  - `web/styles/main.css`
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

Show nearest Helsinki public transport departures (currently rail + bus) based on browser geolocation.

Key UX requirements currently in use:

- Auto-load location on page open.
- Auto-refresh departures every 30 seconds.
- Manual location refresh button.
- Rail/Bus mode toggle.
- Rail-only local filter: `Helsinki Only`.
- Bus controls:
  - stop selector
  - line filters
  - destination filters
- Persist selected mode and filters in URL + localStorage.
- Show departures clearly with:
  - line identifier
  - track/platform or stop
  - remaining time

## API Behavior

`GET /api/v1/departures` currently:

- Uses Digitransit GraphQL (`routing/v2/hsl/gtfs/v1`).
- Required query params:
  - `lat`, `lon`, `mode`
- `mode` supports `RAIL` and `BUS`.
- BUS mode supports optional query params:
  - `stopId`
  - `line` (repeatable or comma-separated)
  - `dest` (repeatable or comma-separated)
- Resolves nearest relevant station/stop(s) and returns upcoming departures.
- BUS responses include `stops`, `selectedStopId`, and `filterOptions` for UI controls.
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
3. `vercel dev`

Quick sanity checks:

From repository root:

- `node --check web/scripts/app.js`
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

## Common Safe Tests

- `curl -i 'https://helsinkimoves.fheinonen.eu/api/v1/departures?lat=60.1708&lon=24.9375&mode=RAIL'`
- `curl -i 'https://helsinkimoves.fheinonen.eu/api/v1/departures?lat=60.1708&lon=24.9375&mode=BUS'`
- Probe expected rejection behavior:
  - invalid params -> `400`
  - invalid mode -> `400`
  - invalid method -> `405`

## If Unsure

- Preserve existing behavior.
- Ask before changing external integrations (DNS, domains, WAF policy, spend settings).

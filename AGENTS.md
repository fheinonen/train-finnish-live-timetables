# AGENTS.md

Guidance for agents working in this repository.

## Repository Scope

This repo is a **web-only** project.

- Frontend:
  - `web/index.html`
  - `web/scripts/app.js`
  - `web/styles/main.css`
  - `web/assets/icons/*`
- API (Vercel serverless): `web/api/next-trains.js`
- Vercel config: `web/vercel.json`

## Purpose

Show nearest Helsinki commuter train departures based on browser geolocation.

Key UX requirements currently in use:

- Auto-load location on page open.
- Show departures clearly with:
  - train letter
  - track/platform
  - remaining time

## API Behavior

`/api/next-trains` currently:

- Uses Digitransit GraphQL (`routing/v2/hsl/gtfs/v1`).
- Filters to rail only (`mode/vehicleMode = RAIL`).
- Resolves nearest rail station/stop and returns up to 3 departures.
- Returns sanitized 500 errors to clients.

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

- `node --check web/scripts/app.js`
- `node --check web/api/next-trains.js`

## Deploy

Deploy from `web/`:

- `vercel --prod --yes`

Production domain is aliased to:

- `https://train.fheinonen.eu`

## Version Control

- Changes in this repository are committed with `jj` (Jujutsu).

## Style and Editing Guidelines

- Keep implementation plain HTML/CSS/JS unless user requests framework migration.
- Prioritize readability over visual complexity.
- Keep UI mobile-friendly.
- Prefer small targeted patches over broad rewrites.

## Common Safe Tests

- `curl -i 'https://train.fheinonen.eu/api/next-trains?lat=60.1708&lon=24.9375'`
- Probe expected rejection behavior:
  - invalid params -> `400`
  - invalid method -> `405`

## If Unsure

- Preserve existing behavior.
- Ask before changing external integrations (DNS, domains, WAF policy, spend settings).

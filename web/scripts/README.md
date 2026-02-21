# Frontend Script Structure

The app runtime is split into ordered browser scripts under `web/scripts/app/`.
Each file is wrapped in an IIFE and communicates through a shared `window.HMApp` object:
- `HMApp.dom` (DOM refs)
- `HMApp.constants` (app constants)
- `HMApp.state` (mutable app state)
- `HMApp.api` (cross-module function surface)

## Load order (must stay stable)

1. `app/01-state.js`
2. `app/02-ui.js`
3. `app/03-data.js`
4. `app/04-init.js`

`index.html` loads these files with `defer` in that exact order.

## Responsibilities

- `app/01-state.js`
  - DOM element lookups
  - constants + mutable app state
  - storage/url state hydration and persistence
  - client-error payload/report helpers
- `app/02-ui.js`
  - mode/filter helpers
  - status/error text helpers
  - bus controls rendering
  - departures/next-summary rendering
  - clock and layout alignment helpers
- `app/03-data.js`
  - fetch timeout/retry helpers
  - API response normalization
  - load/geolocation refresh orchestration
- `app/04-init.js`
  - UI event listeners
  - bootstrap sequence (hydrate, initial load, intervals)
  - global error listeners
  - theme toggle behavior

## Editing guidance

- Prefer editing the smallest relevant file in `app/` instead of broad cross-file changes.
- Add cross-module state/refs in `HMApp.state` / `HMApp.dom` via `01-state.js`.
- Expose cross-module functions by attaching them to `HMApp.api` in the owning module.
- Avoid introducing new implicit globals.

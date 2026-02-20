# Simple Vercel App: Helsinki Next Trains

## Structure

- `index.html` app shell
- `scripts/app.js` frontend behavior
- `styles/main.css` styling
- `assets/icons/` app icons
- `api/next-trains.js` Vercel serverless API
- `vercel.json` Vercel config

## Local run

1. Install Vercel CLI:
   - `npm i -g vercel`
2. From this folder (`web/`), create local env file:
   - `cp .env.example .env`
3. Set your key in `.env`:
   - `DIGITRANSIT_API_KEY=...`
4. Run:
   - `vercel dev`

## Deploy

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel dashboard, import repo.
3. Set **Root Directory** to `web`.
4. Add environment variable:
   - `DIGITRANSIT_API_KEY`
5. Deploy.

## API used

- Endpoint: `https://api.digitransit.fi/routing/v2/hsl/gtfs/v1`
- Header: `digitransit-subscription-key`

## Notes

- Frontend requests your browser location and calls `/api/next-trains`.
- API filters to commuter trains (`mode = RAIL`).

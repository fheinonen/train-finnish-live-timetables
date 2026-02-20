# Helsinki Next Trains (Web)

Simple Vercel app that shows next Helsinki commuter trains from the closest station to your location.

## Project structure

- `web/` contains the full app
- `web/index.html` app shell
- `web/scripts/app.js` frontend behavior
- `web/styles/main.css` frontend styles
- `web/assets/icons/` static app icons
- `web/api/next-trains.js` Vercel serverless API

## Deploy on Vercel

1. Import this repo into Vercel.
2. Set **Root Directory** to `web`.
3. Add environment variable:
   - `DIGITRANSIT_API_KEY`
4. Deploy.

See detailed setup in `web/README.md`.

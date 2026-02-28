## BDD/TDD Workflow
- Write Given/When/Then scenarios for all new behaviors. Use natural language. Keep scenarios ignorant of code structure.
- See every scenario fail before implementing it.
- Write a custom parser/runner as glue code connecting scenario language to production code.
- Follow the three laws of TDD to make each scenario pass.
- Never create or allow no-op, pending, or skeleton step definitions. Every step must exercise real production code and be seen to fail first.

## Code Quality
- Keep functions small; cyclomatic complexity no greater than five where practical.
- Decouple tests from production code via a testing API: as tests get more specific, code gets more generic.
- Keep test coverage in the high 90s for line and branch.
- Use available linters.
- Optimize code to minimize token count and reduce context window pressure.

## Test Output
- Test commands must print failed tests only.
- Suppress passing test lines and success summaries.
- For Node test runs, prefer failure-only output filtering, for example:
  `node --test ... 2>&1 | rg -v '^(✔|ℹ tests|ℹ suites|ℹ pass|ℹ fail 0|ℹ cancelled|ℹ skipped|ℹ todo|ℹ duration_ms)'`

## UI Change Workflow
- For every UI/styling change, run visual regression checks before sharing results.
- Visual checks are snapshot-based and must cover both viewports:
  - mobile
  - desktop
- From `web/`, run:
  - `npm run ui:check`
- If UI changes are intentional, update snapshots first:
  - `npm run ui:baseline`
  - then `npm run ui:check` again to confirm green.
- Keep visual tests deterministic:
  - mocked API responses
  - fixed runtime time/source of randomness
  - stable theme and viewport settings

## Git Discipline
- Check test coverage before commit.
- Never push to git without asking first.

## Local Development

From `web/`:

1. `cp .env.example .env`
2. set `DIGITRANSIT_API_KEY`
3. `npm install`
4. `npm run build`
5. `vercel dev`


## Deploy

Deploy from `web/`:

- `vercel --prod --yes`

Runtime target:

- Node.js `24.x` (see `web/package.json`)

Primary production domain is aliased to:

- `https://helsinkimoves.fheinonen.eu`

## Version Control

- Changes in this repository are committed with `jj` (Jujutsu).

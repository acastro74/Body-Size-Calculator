# Body Size Calculator

Find the right clothing size for an online purchase from **one full-body photo**, your height
(and optionally weight, age and sex) and the **size chart** the store publishes (e.g. an Amazon
screenshot). MVP scope: upper-body garments (tees, shirts, jackets, hoodies, sweaters).

## How it works

1. **Your details** – height (cm or ft-in), optional weight/age/sex. Saved only in `localStorage`.
2. **Photo** – a front-facing, full-body photo. A pose model (MediaPipe) and a body silhouette run
   **in your browser**; the photo is never uploaded. Quality checks reject photos that are cut off,
   turned sideways or tilted, and warn when the arms touch the torso.
3. **Size chart** – upload/paste a screenshot (or paste text). The server sends *only that image* to
   Claude, which returns structured data (unit, garment-vs-body, rows). You review and edit it.
4. **Result** – the recommended size for your preferred fit (slim / regular / loose) plus your
   estimated measurements with ± ranges.

### Estimation & matching (`web/src/core`)
- `silhouette.ts` – scale from your height, torso widths from the segmentation mask, arm length from landmarks.
- `anthropometrics.ts` – priors for chest/waist/hip/shoulder/arm from height, weight, age, sex.
- `bodyEstimate.ts` – frontal width → circumference (ellipse + depth prior), fused with the prior by inverse variance.
- `ease.ts` / `sizeMatch.ts` – garment charts are compared as `garment − (body + ease)`; body charts without ease. Too-small is penalised more than too-big; the score is averaged over the estimate's uncertainty.

## Run it

```bash
cp .env.example .env        # add ANTHROPIC_API_KEY (server only)
npm install
npm run dev                 # web on :5173, API on :8787 (first run downloads the ~9 MB pose model)
```
Production: `npm run build && npm start` (the server serves `web/dist`).

Checks: `npm run typecheck`, `npm test` (unit + component + server), `npm run test:e2e` (Playwright/Chromium).

## Accuracy & known limitations — please read
- A single frontal photo cannot see depth: circumferences are **estimates** (chest/waist roughly ±4–6 cm). The UI shows ranges and a disclaimer.
- Anthropometric coefficients in `anthropometrics.ts` and the ease table in `ease.ts` are **reasonable approximations, not fitted on a dataset**. Recalibrating on ANSUR II and validating on real photos with tape measurements is the main follow-up. No accuracy figure has been measured yet.
- The pose pipeline is unit-tested on synthetic silhouettes and shown to load and run in Chromium, but has **not been validated on real photos** in this repo's tests.
- The Claude chart reader has mocked tests only; try it with `tests/fixtures/tacvasen-size-chart.webp` once an API key is set.
- Loose clothing in the photo inflates the silhouette; the UI asks for fitted clothing.
- Out of scope for the MVP: pants/shoes, accounts, per-measure breakdown, alternative-size hints, tape-measure overrides, browser extension.

## Layout
```
shared/   zod schemas + types shared by web and server
web/      React + Vite PWA, src/core = pure, tested logic
server/   Hono API: POST /api/parse-size-chart (rate-limited, 5 MB cap)
tests/    vitest (unit/component/server) and Playwright e2e
```

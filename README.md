# SnackTrack

A free, mobile-first food tracker for losing weight with a calorie deficit. Log meals from a built-in list of common Singapore dishes, the Open Food Facts packaged-food database, or figures you look up yourself (e.g. a restaurant's published nutrition facts). No account, no API keys, no running costs.

## Features

- **Goal-based targets.** Works out your maintenance calories (Mifflin–St Jeor × activity) and sets a daily target for your chosen loss rate (0.25–1 kg/week, 7700 kcal ≈ 1 kg). The target never goes below 1200 kcal for women or 1500 kcal for men. Protein (1.8 g/kg), fat, carb and fibre targets follow from it, plus upper limits for sugar, saturated fat and sodium.
- **Common Singapore dishes.** Search ~60 hawker dishes, kopitiam drinks and basics (chicken rice, laksa, kopi siew dai…) with typical per-serving values, offline.
- **Restaurant meals.** Enter where and what you ate, tap *Find official nutrition facts* to search the web for the restaurant's published figures (e.g. Super Simple), and type them in.
- **Recent foods.** Anything you've logged before is one tap to re-log.
- **Packaged foods.** Search [Open Food Facts](https://world.openfoodfacts.org) by product name or barcode number, then enter grams eaten.
- **Review before logging.** Edit any number, add items, and scale the portion from ×0.5 to ×2.
- **Today view.** Calories-left ring, macro bars, and the log grouped by meal. Step back to earlier days to log them late.
- **Progress view.** Weigh-ins with a smoothed trend line (so water swings don't mislead you), 14 days of calories vs. target and maintenance, average deficit, estimated fat lost and a projected goal date.
- **Private by default.** All data stays in your browser's localStorage. Export/import a JSON backup from the Goals tab.

**Live app:** https://kaichaoang.github.io/snack-track/

## Use it

1. Open https://kaichaoang.github.io/snack-track/ on your phone and set your goal.
2. Use "Add to Home Screen" to install it like an app.

The app is a static site with no server of its own. Packaged-food search calls Open Food Facts directly from your browser; everything else works offline.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
```

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs the tests, builds a static export (`out/`) with the `/snack-track` base path and publishes it on every push to `main`. One-time setup: **repo Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Where the numbers come from

- `lib/dishes.ts`: typical values for one standard serving, rounded from widely published Singapore dish figures (e.g. Health Promotion Board data). Saturated fat is derived as ~35% of total fat. Portions vary by stall, so treat them as starting points.
- `lib/foods.ts`: Open Food Facts product data, scaled from per-100 g values to the amount you enter.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Static export to `out/` |
| `npm test` | Unit tests for the nutrition math and dish list (`lib/nutrition.test.ts`) |
| `npm run typecheck` | TypeScript check |

## Caveats

Dish values are typical servings; a generous plate can be 20–30% more. When a restaurant publishes its figures, use those. This is not medical advice.

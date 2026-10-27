# SnackTrack

A mobile-first food tracker for losing weight with a calorie deficit. Snap a photo of a meal, say where you ate it, and SnackTrack estimates its calories and nutrients. For chains like **Super Simple**, Subway or Saladstop!, it looks up the restaurant's published nutrition facts first.

## Features

- **Goal-based targets.** Works out your maintenance calories (Mifflin–St Jeor × activity) and sets a daily target for your chosen loss rate (0.25–1 kg/week, 7700 kcal ≈ 1 kg). The target never goes below 1200 kcal for women or 1500 kcal for men. Protein (1.8 g/kg), fat, carb and fibre targets follow from it, plus upper limits for sugar, saturated fat and sodium.
- **Photo + description estimates.** Claude reads the photo and your notes, and returns each item with its portion, calories, protein, carbs, fat, fibre, sugar, saturated fat and sodium. Each item is tagged with where its numbers came from: *official figures*, *database* or *estimated from photo*.
- **Public nutrition lookup.** With "Look up published nutrition facts" ticked, a web search (localised to Singapore) runs first. It looks for the restaurant's official menu nutrition, then the HPB Energy & Nutrient Composition database, USDA FoodData Central or Open Food Facts. The sources are linked on the review screen.
- **Packaged foods.** Search [Open Food Facts](https://world.openfoodfacts.org) by product name or barcode number, then enter grams eaten.
- **Review before logging.** Edit any number, untick items you didn't eat, and scale the portion from ×0.5 to ×2.
- **Today view.** Calories-left ring, macro bars, and the log grouped by meal. Step back to earlier days to log them late.
- **Progress view.** Weigh-ins with a smoothed trend line (so water swings don't mislead you), 14 days of calories vs. target and maintenance, average deficit, estimated fat lost and a projected goal date.
- **Private by default.** All data stays in your browser's localStorage. Export/import a JSON backup from the Goals tab.

**Live app:** https://kaichaoang.github.io/snack-track/

## Use it

1. Open https://kaichaoang.github.io/snack-track/ on your phone and set your goal.
2. In **Goals → Anthropic API key**, paste a key from [console.anthropic.com](https://console.anthropic.com/settings/keys). Setting a monthly spend limit there is a good idea.
3. Use "Add to Home Screen" to install it like an app. The camera button opens the camera directly.

The app is a static site with no server of its own. Claude and Open Food Facts are called directly from your browser. Your key is stored only in that browser's localStorage, is sent only to `api.anthropic.com`, and is never included in backups. Packaged-food search and manual entry work without a key.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
```

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs the tests, builds a static export (`out/`) with the `/snack-track` base path and publishes it on every push to `main`. One-time setup: **repo Settings → Pages → Build and deployment → Source: GitHub Actions**.

## How estimates work

`lib/estimate.ts` makes two Claude calls (`claude-opus-5-5`):

1. **Research** (only when lookup is on): identifies the dish from the photo/description and uses the `web_search` server tool to find published figures, noting each source's serving size.
2. **Estimate**: takes the photo, your description and the research notes and returns structured JSON (`lib/estimate-schema.ts`). Published figures are scaled to the portion shown. Otherwise portions are judged visually, counting hidden calories from oil, sauces and drinks.

Both calls have server-side refusal fallback enabled (`fallbacks: "default"`). Photos are downscaled to 1280 px JPEG in the browser before sending.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Static export to `out/` |
| `npm test` | Unit tests for the nutrition math (`lib/nutrition.test.ts`) |
| `npm run typecheck` | TypeScript check |

## Caveats

Photo estimates are approximate: ±20–30% is typical for mixed dishes. Logging where you ate and adding details (e.g. "half rice", "dressing on the side") helps most. This is not medical advice.

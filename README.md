# SnackTrack

A free, mobile-first food tracker for losing weight with a calorie deficit. Describe a meal the way you'd say it ("grouper fish soup with less rice, a little sauce, some soup") and it itemises and estimates it, offline. You can also pick from common Singapore dishes, search packaged foods, or type in a restaurant's published figures. Optionally, connect a free Google Gemini key for AI estimates that search the web for restaurant nutrition facts and read photos. No account, no running costs.

## Features

- **Goal-based targets.** Works out your maintenance calories (Mifflin–St Jeor × activity) and sets a daily target for your chosen loss rate (0.25–1 kg/week, 7700 kcal ≈ 1 kg). The target never goes below 1200 kcal for women or 1500 kcal for men. Protein (1.8 g/kg), fat, carb and fibre targets follow from it, plus upper limits for sugar, saturated fat and sodium.
- **Describe a meal in your own words.** The text is split into parts and matched against ~90 ingredients (rice, noodles, fish, chicken, tofu, vegetables, soups, sauces, drinks…), local dish templates (fish soup, chicken rice, economy rice, yong tau foo…) and the dish list. Amount words scale each part: *no* (0), *a little* (⅓), *less/some/half* (½), *extra/more* (1.5×), *double* (2×), plus numbers such as *2 eggs* or *150g chicken*. A later mention adjusts an earlier part, so "chicken rice, less rice" halves the rice. Words it doesn't know are listed so nothing is silently dropped. The meal is logged as one entry.
- **Free AI estimates (optional).** With a free [Gemini API key](https://aistudio.google.com/apikey) added in the Goals tab, *Ask AI* sends your description (and an optional photo) to Gemini with Google Search turned on. It looks up official figures when you name a restaurant (e.g. Super Simple), otherwise uses public food data, and returns an itemised estimate with sources. The app picks the newest Flash model your key can use; you can change it in Goals. On the free tier Google may use what you send to improve its products.
- **Common Singapore dishes.** Search ~60 hawker dishes, kopitiam drinks and basics (chicken rice, laksa, kopi siew dai…) with typical per-serving values, offline.
- **Restaurant meals.** Enter where and what you ate, tap *Find official nutrition facts* to search the web for the restaurant's published figures (e.g. Super Simple), and type them in.
- **Recent foods.** Anything you've logged before is one tap to re-log.
- **Packaged foods.** Search [Open Food Facts](https://world.openfoodfacts.org) by product name or barcode number, then enter grams eaten.
- **Review before logging.** Edit any number, add items, and scale the portion from ×0.5 to ×2.
- **Today view.** Calories-left ring, macro bars, and the log grouped by meal. Step back to earlier days to log them late.
- **Progress view.** Weigh-ins with a smoothed trend line (so water swings don't mislead you), 14 days of calories vs. target and maintenance, average deficit, estimated fat lost and a projected goal date.
- **Cloud history (optional).** Sign in under **Goals → Account & sync** and your log, weigh-ins and goal are saved to Supabase and synced across devices. The app keeps a local copy, so it stays fast and works offline; changes are queued and sent when you're back online. Anything logged before signing in is uploaded at first sign-in. Without an account everything stays in the browser, and you can export/import a JSON backup.

**Live app:** https://kaichaoang.github.io/snack-track/

## Use it

1. Open https://kaichaoang.github.io/snack-track/ on your phone and set your goal.
2. Optional: get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and paste it under **Goals → AI meal estimates**.
3. Use "Add to Home Screen" to install it like an app.

The app is a static site with no server of its own. Gemini, Open Food Facts and Supabase are called directly from your browser; everything else works offline. The Gemini key is stored only in that browser's localStorage and is never synced or included in backups.

## Database (Supabase)

SnackTrack uses the Supabase project `esnphmnqxbdeygwrusjv`, with accounts in `app_users` / `sessions`. Its own tables are `snack_profiles`, `snack_entries` and `snack_weights`, created by `supabase/migrations/`. The tables have RLS on with no policies and no grants, so the publishable key in `lib/sync.ts` can't read them; the app calls `SECURITY DEFINER` functions (`snack_load`, `snack_upsert_entries`, …) that check the session token.

**Keep-alive:** free Supabase projects pause after 7 days without activity. `.github/workflows/keepalive.yml` calls `public.keepalive()` (`SELECT 1`) every 3 days to keep the project awake. GitHub turns off scheduled workflows in a repo with no commits for 60 days; if that happens, re-enable it under **Actions → Keep Supabase awake**.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
```

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs the tests, builds a static export (`out/`) with the `/snack-track` base path and publishes it on every push to `main`. One-time setup: **repo Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Where the numbers come from

- `lib/sync.ts`: Supabase sync (sign-in, offline queue, pull on open).
- `lib/gemini.ts`: the Gemini request (Google Search tool, optional photo) and the parser for its JSON reply.
- `lib/ingredients.ts`: typical cooked values per default portion for each ingredient, rounded from common food-composition data (USDA FoodData Central / Singapore HPB), plus dish templates that expand into ingredients. `lib/describe.ts` is the parser.
- `lib/dishes.ts`: typical values for one standard serving, rounded from widely published Singapore dish figures (e.g. Health Promotion Board data). Saturated fat is derived as ~35% of total fat. Portions vary by stall, so treat them as starting points.
- `lib/foods.ts`: Open Food Facts product data, scaled from per-100 g values to the amount you enter.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Static export to `out/` |
| `npm test` | Unit tests for the nutrition math, dish list and meal parser (`lib/*.test.ts`) |
| `npm run typecheck` | TypeScript check |

## Caveats

Dish values are typical servings; a generous plate can be 20–30% more. When a restaurant publishes its figures, use those. This is not medical advice.

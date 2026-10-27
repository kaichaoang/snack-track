# SnackTrack

A mobile-first food tracker for losing weight with a calorie deficit. Describe a meal the way you'd say it ("grouper fish soup with less rice, a little sauce, some soup"), optionally with a photo, and the AI itemises and estimates it, deliberately erring high so a deficit isn't undermined by under-counting. Or log manually.

**Live app:** https://kaichaoang.github.io/snack-track/

## Features

- **Goal-based targets.** Maintenance calories (Mifflin–St Jeor × activity) and a daily target for your chosen loss rate (0.25–1 kg/week, 7700 kcal ≈ 1 kg), never below 1200 kcal (women) / 1500 kcal (men). Protein, fat, carb and fibre targets, plus limits for sugar, saturated fat and sodium.
- **AI estimates (allowlisted accounts).** The app calls the `snack-estimate` edge function, which checks the session, the allowlist (`snack_ai_access`) and a daily cap (`snack_ai_usage`), then asks the AI with web search so named restaurants (e.g. Super Simple) get their published figures. The prompt leans high: generous portions, hidden oil and sauces counted, drinks assumed sweetened, upper end of ranges. The AI key is a project secret and never reaches the browser.
- **Quick estimate** for accounts without AI: an offline parser (`lib/describe.ts`, `lib/ingredients.ts`, `lib/dishes.ts`) with a 15% upward buffer.
- **Manual logging**, recent foods for one-tap re-logging, and editing before logging.
- **Today / Progress views** with dated day navigation, weight trend, 14-day calories vs. target, projected goal date.
- **Account history.** Sign in under Goals; log, weigh-ins and goal are saved and available on any phone. A local copy keeps the app fast and working without signal.

## AI provider

`supabase/functions/snack-estimate` uses Claude when the `ANTHROPIC_API_KEY` secret is set (model from `CLAUDE_MODEL`, default `claude-opus-5-5`), otherwise Gemini via `GEMINI_API_KEY`. Set secrets in the Supabase dashboard → Edge Functions → Secrets. Give an account access with:

```sql
insert into public.snack_ai_access(user_id) select id from public.app_users where username = '<username>';
```

## Database (Supabase)

Project `esnphmnqxbdeygwrusjv`, accounts in `app_users` / `sessions`. SnackTrack tables: `snack_profiles`, `snack_entries`, `snack_weights`, `snack_ai_access`, `snack_ai_usage` (see `supabase/migrations/`). RLS is on with no policies and no grants, so the publishable key in `lib/config.ts` can't read them; the app calls `SECURITY DEFINER` functions that check the session token.

**Keep-alive:** `.github/workflows/keepalive.yml` calls `public.keepalive()` (`SELECT 1`) every 3 days so the free project doesn't pause. GitHub turns off scheduled workflows after 60 days without commits; re-enable under **Actions → Keep Supabase awake** if needed.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
```

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs the tests, builds a static export (`out/`) with the `/snack-track` base path and publishes it on every push to `main`. One-time setup: **repo Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Static export to `out/` |
| `npm test` | Unit tests for the nutrition math, quick estimate and AI reply parsing (`lib/*.test.ts`) |
| `npm run typecheck` | TypeScript check |

## Caveats

Estimates are approximate and lean high on purpose. This is not medical advice.

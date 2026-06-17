# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

**mood-cinema** is a bilingual (Japanese / English) PWA that recommends movies
based on the user's current *mood* and *situation*. The user pops a set of
emoji "balloons" (気分・シーン・雰囲気 …), and the app maps that selection to
[TMDB](https://www.themoviedb.org/) Discover API parameters and shows the top 5
matching movies, each with affiliate links (U-NEXT / Amazon) and SEO content.

It is a pure client-side SPA — there is **no backend**. All logic runs in the
browser; TMDB is called directly from the client with a read token, and
responses are cached in `localStorage`. The site is monetised via affiliate
links and (post-approval) Google AdSense. Much of the user-facing copy and the
inline docs are in Japanese; keep that convention.

## Tech stack

- **React 19** + **react-router-dom 7** (SPA routing)
- **Vite 8** (dev server + build) with `@vitejs/plugin-react`
- **TypeScript 5.9**, strict mode, project references (`tsconfig.app.json` for
  `src`, `tsconfig.node.json` for build tooling)
- No CSS framework — hand-written CSS in `src/styles/` (`tokens.css` design
  tokens + `global.css`)
- Deployed on **Vercel** (config in `vercel.json`)
- **No test runner and no ESLint config** are set up. The only automated check
  is the TypeScript compiler (`tsc -b`), which is strict
  (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`).

## Commands

```bash
npm install            # install deps
npm run setup          # create .env.local from the example (node scripts/setup.mjs)
npm run dev            # vite dev server (default http://localhost:5173)
npm run build          # tsc -b && vite build && generate dist/sitemap.xml
npm run preview        # serve the production build locally
```

There is no `lint` or `test` script. To verify a change compiles, run
`npm run build` (or `npx tsc -b`). Always run the build after non-trivial
changes — strict TS will fail the Vercel deploy otherwise.

## Environment variables

All env vars are `VITE_`-prefixed (exposed to the client by Vite). Copy
`.env.local.example` → `.env.local`. Only `VITE_TMDB_TOKEN` is required for the
app to function; everything else degrades gracefully when unset.

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_TMDB_TOKEN` | ✅ | TMDB API v4 Read Access Token (Bearer). Without it `/result` shows a config error. |
| `VITE_AMAZON_TAG` | | Amazon associate tag appended to search links. |
| `VITE_UNEXT_REDIRECT_PREFIX` | | A8.net redirect template wrapping U-NEXT links. Unset → bare U-NEXT URL. |
| `VITE_ADSENSE_CLIENT` | | AdSense publisher id. Unset → ad slots render nothing. |
| `VITE_SITE_URL` | | Canonical origin for OGP / canonical / sitemap. Defaults to `https://mood-cinema.example.com`. |

## Architecture & data flow

The core loop is **balloon selection → mapping → TMDB query → results**:

1. **`src/pages/Mood.tsx`** — the selection screen. Selected balloon IDs live in
   the URL (`/mood?s=cry,solo`); on submit the app navigates to
   `/result?b=cry,solo`. Selection is constrained to 2–6 balloons.
2. **`src/data/balloons.ts`** — the catalogue of `BALLOONS`. Each balloon has a
   `category` (`mood`/`scene`/`intensity`/`theme`/`atmosphere`/`with`) and
   `weights` (mood scores, genre scores, runtime, atmosphere, etc.). This is the
   source of truth for the quiz content.
3. **`src/lib/balloonMapper.ts`** — `buildParamsFromBalloons()` is the heart of
   the app. It aggregates balloon weights into a dominant mood, top genres,
   excluded genres, runtime, vote thresholds, etc., and produces TMDB
   `DiscoverParams` plus display labels and a recommendation-reason string. Note
   `dailyPage()` rotates the TMDB result page daily so results feel fresh.
4. **`src/data/moodMapping.ts`** — `GENRE` id constants, `MOOD_CONFIG`
   (mood → base genres + reason template), the `DiscoverParams` type, and
   `buildRecommendReason()`.
5. **`src/lib/tmdb.ts`** — typed TMDB client. Wraps `/discover/movie` and JP
   watch-providers. All requests are cached in `localStorage` for 24h
   (`mc:tmdb:` prefix). Throws `TmdbConfigError` (missing token) or
   `TmdbApiError` (non-2xx), both handled in `Result.tsx`.
6. **`src/pages/Result.tsx`** — fetches, slices to 5 movies, renders
   `MovieCard`s + `AdBanner`s + related articles, saves to history, fires
   analytics. This page is `noindex` (it's per-query).

### Routing & i18n

`src/App.tsx` mounts **two** route trees off the same `AppShell`:

- `/*` → Japanese (`prefix = ''`, `lang = 'ja'`)
- `/en/*` → English (`prefix = '/en'`, `lang = 'en'`)

Inside the shell, routes are prefix-relative. **When adding links or routes,
always build paths with the `prefix` from `useI18n()`** (e.g.
`` `${prefix}/mood` ``), never hardcode `/mood`. Translations live in
`src/i18n/ja.ts` and `src/i18n/en.ts` (same shape — `Translations` is
`typeof ja`); access them via `useI18n()`. `/quiz` is a legacy path that
redirects to `/mood` (also enforced in `vercel.json`).

### Other libraries (`src/lib/`)

- `seo.ts` — `useSeo()` hook imperatively manages `<head>` (title, meta, OG,
  canonical, hreflang, JSON-LD). `buildArticleJsonLd` / `buildBreadcrumbJsonLd`
  helpers. SPA has no SSR, so SEO is done client-side per page.
- `history.ts` — last 10 diagnoses in `localStorage` (`mc:history`).
- `analytics.ts` — thin GA4 `gtag` wrapper (`track.*`). No-op until GA is wired
  into `index.html`.
- `affiliate.ts` — builds Amazon / U-NEXT search URLs with tags.
- `courseNames.ts` — generates the JP "course" label from selected IDs.

### Content data (`src/data/`)

- `articles.ts` / `articles.en.ts` — SEO long-form articles (JP/EN). Each
  exports `ARTICLES` and an `ARTICLE_MAP`.
- `sceneLandings.ts` — static SEO landing pages at `/scene/:slug` that preset a
  balloon combination.
- `moodArticleMap.ts` — maps balloon IDs → related articles shown on `/result`.

## Conventions & gotchas

- **Sitemap slug lists are duplicated.** `scripts/generate-sitemap.mjs` hardcodes
  `ARTICLE_SLUGS` and `SCENE_SLUGS`. When you add/remove an article in
  `articles.ts` or a landing in `sceneLandings.ts`, **update the matching list in
  the sitemap script too**, or the new page won't be indexed.
- **Balloon IDs are an implicit public API.** They appear in URLs (`?b=`,
  `?s=`), shortcuts in `i18n/*.ts`, `moodArticleMap.ts`, `sceneLandings.ts`, and
  `courseNames.ts`. Renaming a balloon ID breaks shared links and these
  cross-references — grep for the ID before changing it.
- **Graceful degradation is intentional.** Missing affiliate/ad/analytics env
  vars must never break the UI. Preserve the `?? ''` / `Boolean(...)` guards and
  empty-state handling.
- **Strict TS, no unused symbols.** Don't leave unused imports/vars/params —
  the build fails. Match the existing typed, functional style.
- **localStorage access is always wrapped in try/catch** (quota / privacy mode).
  Follow that pattern for any new persistence.
- **CSP is locked down** in `vercel.json`: scripts/styles are `'self'` +
  `'unsafe-inline'`, images only from `image.tmdb.org`, connections only to
  `api.themoviedb.org`. Adding a new external origin (analytics, ads, fonts)
  requires updating the CSP header there *and* the corresponding `index.html`
  snippet.
- Japanese is the default language for UI copy, comments, and commit context in
  this project; keep new user-facing strings bilingual (add to both `ja.ts` and
  `en.ts`).

## Deployment

Push to GitHub → Vercel auto-builds (`npm run build`) and serves `dist/`.
`vercel.json` handles the SPA rewrite (everything → `index.html`), the
`/quiz`→`/mood` redirect, the manifest content-type, and security headers. Set
the env vars in the Vercel dashboard. See `README.md` / `QUICKSTART.md` (both in
Japanese) for the full launch/affiliate playbook.

## Git workflow

Active development branch for this work: `claude/claude-md-docs-lamsf5`.
Commit with clear messages and push with `git push -u origin <branch>`. Do not
open a pull request unless explicitly asked.

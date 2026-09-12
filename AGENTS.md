# AGENTS.md

## Cursor Cloud specific instructions

This repository ("moovie") hosts **เลือกดี Affiliate Lab** — a Thai affiliate content automation MVP (Shopee / TikTok Shop / Facebook) with draft → approve → manual post workflow.

### Stack

- **Local/dev:** Next.js 16 (App Router) + TypeScript + Tailwind v4
- **Data:** JSON file DB at `data/db.json` (seed via `npm run seed` / `npm run seed:demo`)
- **Production package:** PHP + MySQL under `deploy/php/` (cPanel-friendly)
- **Package manager:** npm (`package-lock.json`)

### Environment Verification

```bash
git status
node --version
npm --version
python3 --version
```

### Setup & common commands

```bash
npm install
npm run seed:demo
npm run workflow:morning
npm run workflow:evening
npm run test:unit
npm run build
npm run dev
```

Lint: `npx eslint .` (Next 16 removed `next lint`).

### Key paths

- `src/lib/` — scoring, content, schedule, compliance, workflows, playbooks, results-intake, fit labs (incl. Hook Fit + CTA Fit)
- `src/app/` — dashboard pages + API routes
- `scripts/` — seed, morning/evening CLI, unit tests
- `deploy/php/` — production PHP mirror (`pull.php` / `sync-auto.php` default tip `cursor/affiliate-88d0`)

### Rules agents must keep

- Never auto-publish to social platforms; drafts require human Approve then manual post
- Every caption needs affiliate disclosure; Approve gate blocks overclaim language
- No guaranteed-income claims — experimental recommendations from manual metrics only
- Manual affiliate mode is default; platform adapters are stubs until API keys exist

### Latest incremental feature

- **Benefit Fit Lab** (`src/lib/benefit-fit.ts` + PHP `build_benefit_fit_lab`) — soft ranking of benefit framing (result_first / ease_daily / save_time / feel_relief / hype_claim / none) from logged metrics; flags hype claims; mix tips + queue suggestions (never auto-rewrite); morning/evening brief lines; export `scope=benefit-fit`
- Prior tip: **Offer Fit Lab** (`src/lib/offer-fit.ts` + PHP `build_offer_fit_lab`) — value/offer framing; export `scope=offer-fit`

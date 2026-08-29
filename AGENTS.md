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

- `src/lib/` — scoring, content, schedule, compliance, workflows, playbooks, results-intake
- `src/app/` — dashboard pages + API routes
- `scripts/` — seed, morning/evening CLI, unit tests
- `deploy/php/` — production PHP mirror (`pull.php` / `sync-auto.php` default tip `cursor/affiliate-7e81`)

### Rules agents must keep

- Never auto-publish to social platforms; drafts require human Approve then manual post
- Every caption needs affiliate disclosure; Approve gate blocks overclaim language
- No guaranteed-income claims — experimental recommendations from manual metrics only
- Manual affiliate mode is default; platform adapters are stubs until API keys exist

### Latest incremental feature

- **Commission Band Lab** (`src/lib/commission-band.ts` + PHP `build_commission_band_fit_lab`) — soft ranking of commission-rate bands (under8 / mid8_11 / good12_19 / strong20_29 / high30) from logged metrics; mix tips + queue suggestions (never auto-swap); morning/evening brief lines; export `scope=commission-band`

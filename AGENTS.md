# AGENTS.md

## Cursor Cloud specific instructions

This repository hosts **เลือกดี Affiliate Lab** — a manual-first affiliate content automation MVP (Thai-first) for Shopee / TikTok Shop / Facebook.

### Stack

- Next.js (App Router) + TypeScript + Tailwind CSS v4
- JSON file database at `data/db.json` (no external services required)
- Scripts via `tsx`: seed, morning/evening workflows, unit tests

### Setup

```bash
npm install
npm run seed        # empty DB
# or: npm run seed:demo
npm run dev
```

### Common commands

- `npm run dev` — local dashboard on http://localhost:3000
- `npm run build` / `npm start` — production
- `npm run lint` — ESLint (`eslint .`)
- `npm run test:unit` — scoring/content/schedule unit checks
- `npm run seed:demo` — load 6 sample products for local experiments
- `npm run workflow:morning` / `npm run workflow:evening` — daily automation CLI

### Rules baked into the product

- Draft-only scheduling; human Approve (or Skip) before any real post
- Affiliate disclosure on generated captions
- No guaranteed-income claims; experimental ROI from manual metrics
- Platform API adapters exist as stubs under `src/lib/adapters/`

### Notes

- Prefer editing `src/lib/*` for ranking/content/workflow logic
- Do not wire auto-publish without an explicit approval gate
- Compliance soft-filter: `src/lib/compliance.ts`
- Thai seasonality: `src/lib/seasonality.ts`
- CSV/JSON import: `POST /api/products/import`
- Bulk approve (draft → approved only): `POST /api/schedule/bulk-approve`
- Skip draft: `POST /api/schedule/:id/skip`
- Automation Center UI: `/automation`
- Production PHP+MySQL package lives under `deploy/php/` (cPanel); keep secrets out of git
- Export briefs: `/api/export?format=csv&scope=briefs`
- Export weekly rollup: `/api/export?format=csv&scope=weekly`
- Morning/evening are idempotent per day; pass `{ "force": true }` or CLI `--force` to regenerate
- Weekly product rollup: `src/lib/weekly.ts`
- Filming checklist lives on each content pack (`filmingChecklist`)
- Selling angles (3): `sellingAngles` on content packs
- Pause products: `active: false` excludes from morning ranking (`PATCH /api/products/:id`)
- Draft volume: `settings.maxPostsPerDay` (2|3) via `PATCH /api/settings`
- Duplicate affiliate URL blocked on create/import
- Evening learning snapshot: `db.learning` via `src/lib/learning.ts` (soft bias + underperformer penalty)
- Category diversity in `rankProducts` alongside platform mix
- Approved posting checklist export: `/api/export?format=md&scope=approved`
- Experiment plan (A/B hooks + data gaps): `src/lib/experiments.ts` · export `/api/export?format=md&scope=experiments`
- Event proximity boost (Mother's Day Aug 1–12 + back-to-school Aug 13–31): `eventProximityBoost` in `src/lib/seasonality.ts`
- Platform-aware hooks in `generateHooks` (Shopee / TikTok Shop / Facebook)
- Calendar dates: `todayISO` / `bangkokParts` use Asia/Bangkok (`src/lib/db.ts`)
- `readDb` must restore `learning` — required for evening→morning loop
- Real ROI needs `metrics.promoSpend`; otherwise report commission/click only
- Daily schedule respects remaining room vs `maxPostsPerDay` across force reruns
- Ranking blends commission% + expected baht (`expectedCommissionScore` in `src/lib/scoring.ts`)
- Morning brief uses `explainScore` for Top pick transparency
- Evening learning may set `preferredTime` + `vanityProductIds` (soft schedule/rank bias)
- Filming queue: `src/lib/filming.ts` · export `/api/export?format=md&scope=filming`
- Morning compliance audit + product readiness: `auditDraftCaptions` / `productReadinessIssues` in `src/lib/compliance.ts`
- `npm run workflow:day` runs morning then evening for local end-to-end checks
- PHP pull default branch tip: `cursor/affiliate-5bb4`

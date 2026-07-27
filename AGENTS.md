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
npm run seed
npm run dev
```

### Common commands

- `npm run dev` — local dashboard on http://localhost:3000
- `npm run build` / `npm start` — production
- `npm run lint` — ESLint (`eslint .`)
- `npm run test:unit` — scoring/content/schedule unit checks
- `npm run workflow:morning` / `npm run workflow:evening` — daily automation CLI

### Rules baked into the product

- Draft-only scheduling; human Approve before any real post
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
- Automation Center UI: `/automation`
- Production PHP+MySQL package lives under `deploy/php/` (cPanel); keep secrets out of git

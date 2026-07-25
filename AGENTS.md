# AGENTS.md

## Cursor Cloud specific instructions

This repository hosts **เลือกดี (Lueakdee)** — an affiliate content automation MVP for Shopee, TikTok Shop, and Facebook. Manual-first: no external affiliate APIs required.

### Stack

- **Node.js** + **Next.js** (App Router) + **TypeScript** + **Tailwind CSS v4**
- Local JSON database at `data/db.json` (created by `npm run seed`)
- CLI workflows via `tsx`: `scripts/morning.ts`, `scripts/evening.ts`

### Setup

```bash
npm install
npm run seed
```

### Dev / lint / test / build

```bash
npm run dev                 # http://localhost:3000
npm run lint
npm run test:unit
npm run build
npm run workflow:morning    # daily top products + draft calendar
npm run workflow:evening    # analyze manual metrics
```

### Important product rules

- Never auto-post to social platforms; drafts require explicit user approval
- Every caption includes affiliate disclosure
- No guaranteed-income claims — experimental lab wording only
- Platform adapters under `src/lib/adapters/` are stubs until API keys exist

### Data

- Runtime DB: `data/db.json` (gitignored)
- Seed samples: `npm run seed`
- Export: `/api/export?type=json|products.csv|schedule.csv|metrics.csv`

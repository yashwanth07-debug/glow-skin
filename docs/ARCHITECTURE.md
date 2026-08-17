# Glow — System Architecture + API Specification

## 1. Architecture overview

```
                 USER (browser)
                      |
                      v
              FRONTEND  (React + Vite + TS)
        Landing · Upload · Results · Routine · History
                      |
          +-----------+---------------------+
          |                                 |
          v                                 v
   YouCam Cloud API (browser-direct,   LocalStorage
   CORS-enabled, key via env)          (scan history,
   - /s2s/v2.0/file/{slug}             progress)
   - /s2s/v2.0/task/skin-analysis
   - /s2s/v2.0/task/skin-tone-analysis
   - /s2s/v2.0/task/fitzpatrick-scale-analyzer
```

**Why this architecture (guide Part 14 — be able to answer "why"):**
- **React + Vite**: multiple interactive views (upload, dashboard, routine, history) → components + state make this clean; Vite gives instant dev + tiny static build.
- **No custom backend**: YouCam's API is CORS-enabled (`access-control-allow-origin: *`, verified live) so the browser can call it directly — fewer moving parts, easier to explain, nothing to break.
- **Key handling (guide Part 12 — NEVER in repos)**: `VITE_YOUCAM_KEY` lives in `.env` (gitignored) or Vercel env vars. The repo only has `.env.example` with a placeholder.
- **LocalStorage as the MVP "database"**: zero-setup persistence for history/progress; the schema doc defines the production (Supabase/Postgres) shape.

## 2. Tech stack (deliberately small)

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | React 18 + Vite + TypeScript | Reusable components, fast builds, typed |
| Styling | Plain CSS (custom design system) | No framework dependency; consistent with our brand |
| State | React hooks + context | MVP-scale |
| "Database" | localStorage (MVP) | Instant, no account; Supabase-ready schema documented |
| External API | YouCam v2 (3 endpoints) | The hackathon API; CORS-open; verified live |
| Deploy | GitHub Pages (static) | Free subdomain; auto via Pages (or `gh-pages` branch) |
| Testing | Vitest + headless-Chromium E2E | Guide: test everything |

## 3. Request/data flow (a full scan)

1. User uploads selfie → preview in memory (object URL)
2. Frontend requests upload slots: `POST /s2s/v2.0/file/skin-analysis`, `.../skin-tone-analysis`, `.../fitzpatrick-scale-analyzer` (Authorization: Bearer)
3. PUT image bytes to each presigned S3 URL → get `file_id`s
4. Create tasks in parallel: `POST /s2s/v2.0/task/{slug}` with `src_file_id`
5. Poll `GET /s2s/v2.0/task/{slug}/{task_id}` every ~3s until `success`
6. Parse responses → scores/masks/all/skin_age · colors · fitzpatrick_scale
7. Rule engine computes routine; results rendered; history saved to localStorage
8. (Units are charged ONLY on successful tasks — errors/polls are free.)

## 4. API endpoints (YouCam v2 — exact, live-verified)

| Purpose | Endpoint | Method | Auth | Body | Cost |
|---------|----------|--------|------|------|------|
| Upload slot | `/s2s/v2.0/file/{slug}` | POST | Bearer | `{files:[{content_type,file_name,file_size}]}` | free |
| Upload bytes | (presigned URL from slot) | PUT | presigned | binary | free |
| Skin analysis | `/s2s/v2.0/task/skin-analysis` | POST | Bearer | `{src_file_id, dst_actions:[14 concerns], format:"json"}` | 16u |
| Poll | `/s2s/v2.0/task/skin-analysis/{id}` | GET | Bearer | — | free |
| Tone analysis | `/s2s/v2.0/task/skin-tone-analysis` | POST | Bearer | `{src_file_id, format:"json"}` | 20u |
| Poll | `/s2s/v2.0/task/skin-tone-analysis/{id}` | GET | Bearer | — | free |
| Fitzpatrick | `/s2s/v2.0/task/fitzpatrick-scale-analyzer` | POST | Bearer | `{src_file_id, version:"1.0"}` | 10u |
| Poll | `/s2s/v2.0/task/fitzpatrick-scale-analyzer/{id}` | GET | Bearer | — | free |

### Response shapes (verified live, 11 Aug 2026)
```jsonc
// skin-analysis
{ "data": { "task_status":"success", "results": { "output": [
  { "type":"pore", "ui_score":62, "raw_score":38, "mask_urls":["https://…"] },
  { "type":"all", "score":76.25 }, { "type":"skin_age", "score":38 }, … ] } } }

// skin-tone-analysis
{ "data": { "task_status":"success", "results": { "color": {
  "skin_color":"#997152", "eye_color":"#241711", "lip_color":"#cc7f71",
  "eyebrow_color":"#805d47", "hair_color":"#B56637" } } } }

// fitzpatrick-scale-analyzer
{ "data": { "task_status":"success", "results": { "fitzpatrick_scale":"V" } } }
```

## 5. Folder structure

```
glow-skin/
├─ docs/            PRD, ARCHITECTURE, DATABASE, API, PRESENTATION, JUDGE-QA
├─ public/          favicon, sample images (demo mode)
├─ src/
│  ├─ components/   Upload, Results, ConcernTile, MaskView, Routine, History, ShareCard, DemoBanner
│  ├─ lib/          youcam.ts (client), routine.ts (rule engine), store.ts (history)
│  ├─ App.tsx
│  ├─ main.tsx
│  └─ styles.css
├─ .env.example
├─ package.json · vite.config.ts · tsconfig.json
└─ README.md
```

## 6. Security considerations
- API key ONLY in env (never committed) — guide Part 12
- Images handled in-memory (blob URLs), revoked on close
- No user data stored server-side; history stays on device
- Rate limits respected (poll every 3s; max 5 QPS)

## 7. Simplifications for the hackathon
- No auth — the product is a tool, not an account-based app (documented in PRD out-of-scope)
- No real DB — localStorage + documented schema
- Demo mode replays sample results when no key is set

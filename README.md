# ✨ GLOW — AI Skin Intelligence (GLOW Verdict)

**The beauty score that tells you when to trust it.**

Upload a selfie → full AI skin report (14 concerns + masks, skin age, Fitzpatrick type, tone) → personalized routine → progress tracking — **plus an honesty layer: we re-scan your face and tell you which of your scores are trustworthy, and which are just noise.**

> Built for the **YouCam API Skin AI & Apparel VTO Hackathon** · 3 YouCam APIs · MIT licensed

---

## 🌐 Try it live

**https://yashwanth07-debug.github.io/glow-skin/**

*(Add `VITE_YOUCAM_KEY` to enable real API analysis — without it, the app runs a clearly-labeled demo so it never breaks.)*

## 🎬 Demo video

*[Add 1–3 min demo video link here before submission]* — show: upload → 14 concern scores → tap a mask → **Run uncertainty check (3× scan) → verdict tags** → skin signature → share card → routine → progress.

---

## 🎯 The problem

Skincare is a $150B+ industry built on guesswork. Generic quizzes, self-reported skin types, and — worst of all — **beauty apps that hand you a number and pretend it's a fact**. Measurement research (TOLERANCE, 2026) shows the same unchanged skin can move **16 raw points** between captures on some metrics. The number was never a fact about your face.

## 💡 The solution

**GLOW Verdict** turns a selfie into an honest skin report:

1. **📸 One selfie → 3 YouCam analyses** (parallel): skin-analysis (14 concerns, 16u) · skin-tone-analysis (20u) · fitzpatrick-scale-analyzer (10u)
2. **📋 Full report** — overall score ring, skin age, 14 concern tiles with **tap-to-see detection masks**, tone + colors, color season, glow-up tips
3. **🧴 Personalized routine** — deterministic rule engine from your actual scores (no hallucination risk)
4. **📈 Progress tracking** — every scan saved (localStorage, Supabase-ready schema documented)
5. **📏 THE VERDICT (our differentiator)** — "Run uncertainty check": re-scans your face 3× and labels every metric **trustworthy / borderline / noise / saturated** with a ± spread. We show you the uncertainty — like a real measurement tool should
6. **🃏 Skin signature** — your most distinctive metric becomes a *kind* persona ("Dewy Radiance — you wake up half-glowing already") + a **shareable verdict card**
7. **⚖️ "Whose ideal?"** — beauty canons are contested; we cite the research (Jayaratne 2012, Farkas 1987) instead of pretending our number is a fact

## 🔌 YouCam API usage

| Endpoint | Method | Cost |
|----------|--------|------|
| `/s2s/v2.0/file/{slug}` → presigned PUT | POST | free |
| `/s2s/v2.0/task/skin-analysis` (14 SD concerns) | POST | 16u |
| `/s2s/v2.0/task/skin-tone-analysis` | POST | 20u |
| `/s2s/v2.0/task/fitzpatrick-scale-analyzer` | POST | 10u |
| `/s2s/v2.0/task/{slug}/{task_id}` (poll) | GET | free |

**~46 units per full scan** → ~21 scans per 1,000 hackathon units. Units charged only on successful tasks; errors/polls free. Key lives **only** in env / encrypted repo secret — never in the repo.

## 🧱 Architecture

```
Browser (React 19 + Vite + TS)
   │  upload selfie → face-crop (0.7× square, verified fix)
   ▼
YouCam v2 API (browser-direct, CORS-open, key via env)
   ├─ skin-analysis       → scores + masks + overall + skin age
   ├─ skin-tone-analysis  → tone + eye/lip/brow/hair colors
   └─ fitzpatrick         → UV type I–VI
   ▼
GLOW Verdict engines (deterministic, unit-tested)
   ├─ routine engine      → AM/PM/weekly plan from scores
   ├─ variance engine     → 3× re-scan → ± spread + verdicts
   ├─ signature engine    → persona + talent (kind inversion)
   └─ canons              → cited "whose ideal?" explainer
   ▼
localStorage history (Supabase-ready schema in docs/DATABASE.md)
```

## 🛠️ Getting started

```bash
npm ci
cp .env.example .env     # add VITE_YOUCAM_KEY (optional — demo mode without it)
npm run dev              # http://localhost:5373
npm test                 # 14 unit tests (engines + verdict)
npm run build
```

**Deploy (GitHub Pages):** push to `main` → workflow builds with `VITE_BASE_PATH=/glow-skin/` → deploys to `https://<user>.github.io/glow-skin/`. For real API data, set `VITE_YOUCAM_KEY` as a repo/CI **secret** (never commit it).

## 🧪 Testing

- `src/lib/verdict.test.ts` — variance spreads, saturation pinning, personas, canons (9 tests)
- `src/lib/routine.test.ts` — SPF by Fitzpatrick, concern-targeted steps (5 tests)
- E2E verified in headless Chrome: upload → analyzing → report → uncertainty check → share card

## 📁 Project structure

```
glow-skin/
├─ docs/            PRD · ARCHITECTURE · DATABASE · PRESENTATION · STITCH prompts
├─ src/
│  ├─ lib/          youcam.ts (3-API client) · verdict.ts (honesty engine)
│  │                routine.ts · store.ts · demo.ts
│  ├─ App.tsx       upload → report → routine → progress → verdict → share
│  └─ styles.css    Apple-style glass design (light/dark)
├─ .env.example · .github/workflows/pages.yml
└─ README.md
```

## 📈 Future

Product catalog integration · HD + multi-face · accounts (Supabase) · AI chat consultant over scan history · "whom it underserves" brand analytics (ToneGrid-style)

## 👥 Team

*— add your team names —*

---

*Routine + verdict content is educational, rule-based, not medical advice. Uncertainty is measured and labeled honestly.*

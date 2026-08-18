# Devpost Submission — Glow — AI Skin Intelligence
*Our submission write-up for the [YouCam API Skin AI & Apparel VTO Hackathon](https://youcam-api.devpost.com/) (topic: **Skin AI**). Live app, demo video and source code are linked below.*

**Project name:** Glow — AI Skin Intelligence
**Tagline:** Your phone camera becomes an honest skin analyst: 14 AI concern scores, your skin's real age and sun type, a routine built from your numbers — and the truth about whether those numbers can be trusted.
**Topic:** Skin AI
**Live demo:** https://yashwanth07-debug.github.io/glow-skin/  *(works with no setup — click “Try demo (no photo)”)*
**Demo video:** https://youtu.be/SZwuhVDO1AU  *(1:42 — a single real take on the live app; real YouCam scan, self-correcting pipeline, report + masks, routine, honest progress, 3× re-scan uncertainty verdicts)*
**Repo:** https://github.com/yashwanth07-debug/glow-skin
**Built with:** YouCam AI Skin Analysis API · YouCam AI Skin Tone Analysis API · YouCam AI Fitzpatrick Skin Type API · React 18 · TypeScript · Vite · GitHub Pages

---

## Inspiration

Skincare advice today is either a generic quiz ("what's your skin type?") or a $150 dermatologist visit. Meanwhile people spend billions on products that don't match their skin and have no way to know if anything works. We wanted to meet the moment the brief describes: standing in front of a mirror wondering *“is this working?”* — and answer it with real measurement instead of vibes. YouCam's clinical-grade Skin AI made the measurement possible; the honest-measurement philosophy (tell people when *not* to trust a number) made it Glow.

## What it does

1. **Scan.** Upload or take a selfie. A drag + zoom crop editor shows the exact square the AI receives; behind the scenes a retry pipeline searches window × zoom combinations so “face too small” errors self-correct instead of failing — and a roll-correction ladder counter-rotates tilted photos (`±8°/±15°`) so head-tilt angle errors recover too (all retries cost zero API units).
2. **Measure.** In ~15–30 seconds, three YouCam APIs run in parallel: **Skin Analysis** (14 concerns, scores + detection masks, overall score, skin age), **Skin Tone Analysis** (skin/eye/lip/brow/hair colors), and **Fitzpatrick Skin Type** (UV-reactivity I–VI, the sunscreen gold standard).
3. **Understand.** A report dashboard: animated score ring, skin age, Fitzpatrick card with a one-line UV note, exact tone hex, 14 color-coded concern tiles — tap any tile to see its AI detection mask on your actual face.
4. **Act.** A deterministic rules engine turns your scores into an AM/PM/weekly routine (with interaction rules, e.g. retinol never the same night as BHA), Fitzpatrick-aware SPF guidance, a color-season palette computed from your measured hexes, and glow-up tips.
5. **Verify.** The signature feature: a **3× re-scan uncertainty check** computes per-metric spread and labels every number *trustworthy / borderline / noise*. Because one scan is a number — honest measurement is the product.
6. **Track.** Re-scan anytime; history, trend chart, and per-scan deltas are stored locally (no account, nothing server-side). A screenshot-ready verdict card makes results shareable.

Demo mode replays labeled sample data (`provider: demo`) so the experience can be judged end-to-end without spending a single API unit.

## How we built it

React 18 + TypeScript + Vite single-page app, plain CSS with theming. The YouCam client is browser-direct REST: request a file slot → S3 upload → create task → **adaptive poll** (600 ms start, ×1.35 backoff, 2.2 s cap — materially faster than fixed-interval polling). All three analyses launch in parallel per crop. The capture pipeline decodes the photo once (EXIF-aware), renders 1024px square crops on an OffscreenCanvas, and searches: the user's hand-framed crop first, then automatic face-zone candidates with a zoom ladder (1×/0.6×/0.42×/0.3×) for “face too small”, stopping early on photo-inherent angle errors. Unit economics respected: failed tasks are free, so retries never burn units. 30 unit tests cover crop/window math, error mapping, the routine engine, the verdict engine, and the history store; every push to `main` runs tests, builds, and deploys to GitHub Pages with the API key injected as an encrypted Actions secret — never in the code.

## Challenges we ran into

- **The API rejects most real-world selfies by default** — faces too small, angled, or below min resolution. We turned error responses into engineered resilience: candidate crops, a zoom-down ladder, guidance overlays, and finally a user-controlled crop editor. Failures went from dead-ends to invisible retries.
- **Latency vs. unit budget.** Faster polling = snappier UX but more requests; parallel crops = faster but double-bill on success. Our answer: adaptive backoff, skin-only probes during rescue retries, and tone/Fitzpatrick only after a skin success.
- **Honesty under marketing pressure.** Every product in this space claims one score. We built the uncertainty engine because the numbers genuinely vary scan-to-scan — surfacing that, tastefully, was a design problem as much as a stats problem.

## Accomplishments that we're proud of

- A scan flow that *doesn't fail*: between the crop editor and the retry ladder, users essentially never see a raw API error.
- Three YouCam APIs composed into one coherent report (real, judged-level usage — not a wrapper): the masks, the tone palette and the Fitzpatrick type all *do something* downstream.
- The uncertainty verdicts — to our knowledge the only demo in this space that tells you when not to trust the AI.
- Zero-config demo: any judge can experience the whole product in 3 seconds.

## What we learned

Deep familiarity with YouCam's task-based API model (file slots, task lifecycle, unit economics, error taxonomy) and how to design around it; that consumer AI health tools live or die on trust UX — perceived failures, latency honesty, and showing uncertainty — more than on the model output itself.

## What's next for Glow

- YouCam **AI Skin Simulation** for before/after “your skin in 8 weeks” projections tied to the routine, and photo-enhance as a pre-analysis quality gate
- Unit caching (hash photo → replay), PWA install + scan reminders, before/after alignment across scans
- Brand/B2B embedding: the scan→recommend→re-scan loop as a widget for D2C skincare storefronts

---

## 📹 Demo video

**Watch: https://youtu.be/SZwuhVDO1AU** — 1:42, comfortably inside the 3:00 judging limit.

A single continuous take of the **live app** on a phone viewport — a **real YouCam scan**, no mock data: the crop editor and self-correcting retry pipeline, the analyzing screen, the report with detection masks, the rules-built routine, honest progress tracking, and the 3× re-scan uncertainty verdicts. Voice-over only; no third-party trademarks or copyrighted music, per the submission rules.

### Narration transcript (in order)

| On screen | Narration |
|---|---|
| Landing page | “Skincare is a $150B industry built on guesswork. Glow turns any phone camera into an honest skin analyst — powered by YouCam's clinical Skin AI.” |
| Selfie upload · crop editor + zoom bar | “Frame your face — this square is exactly what the AI scans. The app retries and zooms automatically instead of failing.” |
| Analyzing screen (live stages + timer) | “Three YouCam APIs run in parallel: Skin Analysis for 14 concerns, Skin Tone for your exact colors, and Fitzpatrick for your sun type — about 46 units per scan, retries are free.” |
| Report: score ring, skin age, Fitzpatrick card, tone hex · tap a tile → mask overlay | “Fourteen clinical scores with detection masks on your actual face. Skin age. Your Fitzpatrick type — the sunscreen standard — and your exact tone.” |
| Routine tab + Progress tab | “A routine built by rules from your numbers, and progress tracking across scans — all private, on-device.” |
| 3× re-scan → per-metric verdict chips | “And the part nobody else does: re-scan three times and Glow tells you which numbers are trustworthy and which are noise. Honest measurement is the product.” |
| Shareable verdict card → outro | “Glow — AI Skin Intelligence. Skin Analysis, Tone, and Fitzpatrick APIs by YouCam. Links in the description.” |

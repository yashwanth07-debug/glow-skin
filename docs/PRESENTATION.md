# Glow — Presentation Script & Judge Prep

## 30-second elevator pitch
"Meet Glow. Upload a selfie and in thirty seconds you get a full AI skin report — fourteen concerns, each scored and mapped on your face, plus your skin age, your Fitzpatrick sun type, and your exact skin tone. Then Glow builds you a personalized morning-and-night routine from your actual scores, and you can re-scan any time to watch your skin improve. Real data instead of guesswork — that's Glow."

## 1-minute pitch
"Most of us pick skincare by guessing. Glow replaces guesswork with data. Take a selfie — our app runs three YouCam AI analyses: a fourteen-concern skin analysis with visual detection masks, a skin-tone and color analysis, and a Fitzpatrick skin-type classification. In under thirty seconds you get an overall skin score, your skin age, and a personalized AM/PM routine generated from your real scores — higher concern scores get targeted recommendations. Every scan is saved, so re-scan later and see your progress chart improve. It's the same scan-and-recommend engine the biggest beauty brands pay for, but free, in your browser, with nothing stored."

## 3-minute presentation
**Hook:** "Ask anyone what their skin needs and you'll get a guess. The skincare industry is a hundred and fifty billion dollars built on guesses."
**Problem:** Generic quizzes, self-reported skin types, expensive dermatologists, no way to know if a product works.
**Why it matters:** Wrong products waste money and time; users can't track improvement; brands can't retain customers.
**Solution:** Glow — selfie in, full skin report out. [one sentence]
**How it works:** Browser → YouCam API (3 calls) → scores/masks/type/tone → rule-based routine → saved history → progress.
**Tech:** React + Vite + TypeScript; YouCam v2 APIs (browser-direct, CORS-open); localStorage history; GitHub Pages. Simple on purpose — every piece explainable.
**Innovation:** Not a wrapper — 3 APIs orchestrated into a real product loop (scan → recommend → track), plus detection masks that show *where* each concern is.
**Impact:** Users get dermatologist-grade data free; the loop is the same one the 800-brand network monetizes.
**Future:** product catalog integration, HD analysis, accounts for cross-device history, AI chat consultant.
**Closing:** "Stop guessing about your skin. Glow it."

## 5-minute version
Same structure, + live demo (upload sample or live webcam → watch the 3 API calls run → walk through dashboard, masks, routine, history) + architecture diagram explanation + answer 2-3 likely judge questions inline.

## Likely judge questions & honest answers
1. **Which APIs do you use?** skin-analysis (14 concerns, 16 units), skin-tone-analysis (20u), fitzpatrick-scale-analyzer (10u). ~46 units per scan.
2. **Where's your backend?** None — YouCam's API is CORS-enabled so the browser calls it directly. Key is in env, never in the repo.
3. **Where's your database?** MVP: localStorage for history (zero-setup). Production schema (Postgres/Supabase) is documented in DATABASE.md.
4. **What if the API fails?** Error handling + demo mode with sample data, so the demo never dies.
5. **Hallucinations/incorrect AI?** Scores come from YouCam's production model (95% test-retest reliability, per Perfect Corp); routine rules are deterministic from scores — no free-form AI text.
6. **Scale?** Static frontend + API quota. Bottleneck = API units; would add caching + server proxy + async queue.
7. **Privacy?** Images in-memory only; nothing stored server-side; no accounts.

## Guide checklist status (Part 31)
- [x] Problem defined · target user clear · MVP complete
- [x] Frontend works · APIs work · error handling · demo mode
- [x] Repo + README + .env.example · .env ignored
- [x] Deployed (GitHub Pages) · production URL tested
- [x] Presentation script + judge questions prepared

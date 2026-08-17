# Google Stitch Prompt — "Glow" AI Skin Intelligence UI
Copy everything below (from `PROMPT START` to `PROMPT END`) into Google Stitch.

---

## PROMPT START

Design a complete, premium single-page web app UI for **"Glow — AI Skin Intelligence"**, a face-rating + skincare product (a real hackathon product powered by the YouCam API). Generate the FULL app: landing → upload → analyzing → results dashboard → routine → progress, plus a share-result card. Aim for the polish level of Whoop / Glossier / Aesop — premium beauty-tech, NOT generic AI-slop.

### 1. Visual direction & design tokens
- **Vibe:** warm, editorial, dermatologist-grade but friendly. Cream canvas, terracotta accent, serif display headlines, clean sans body. Feels like a beauty magazine + a health wearable.
- **Colors (exact):**
  - Canvas `#FAF9F5` · Surface `#EFE9DE` · Surface-strong `#E8E0D2`
  - Ink `#141413` · Body `#3D3D3A` · Muted `#6C6A64` · Hairline `#E6DFD8`
  - Primary (terracotta) `#A9583E` (AA-safe on white) · hover `#8F4A33` · soft tint `rgba(169,88,62,0.10)`
  - Success `#16A34A` · Warning `#D4A017` · Danger `#DC2626`
  - Score colors: ≥85 green · ≥70 amber · <70 red
- **Typography:** Display headlines in a serif stack (Iowan Old Style / Palatino / Georgia), weight 400, letter-spacing -0.02em. Body/UI in Inter/system sans. Tabular numerals for all scores.
- **Radius scale (ONE consistent rule):** cards 14–16px · buttons/inputs 10px · chips/rings full-pill.
- **Shadows:** warm-tinted, soft (`0 1px 2px rgba(169,88,62,.06), 0 12px 32px rgba(169,88,62,.10)`); no flat black.
- **Spacing:** generous; section rhythm 24–48px. Mobile-first, max-width 960px container.
- **Dark mode:** also provide a dark variant (canvas `#141414`, surfaces `#1F1E1B`, text `#FAF9F5`, same terracotta accent) with a toggle.
- **Motion:** springy micro-interactions (score ring animates, tiles lift on hover, tabs slide, cards fade-rise in, skeleton shimmer during loading). Respect `prefers-reduced-motion`.

### 2. Screens & components (build ALL of these)

**A. Landing / hero**
- Big serif headline: "Know your skin. *Not a guess.*" (italic accent on second line)
- Subtext: "Upload a selfie and get a full AI skin report in ~30 seconds — 14 concern scores with visual masks, your skin age, sun type, exact tone, and a routine built from your real results."
- Primary CTA: "Upload a selfie" (terracotta pill). Secondary: "Try demo (no photo)" (ghost).
- Trust chips: "🔒 Nothing stored" · "⚡ ~30s" · "🧬 3 AI analyses"
- 4-step strip: 📸 Selfie → 🧪 AI analysis → 📋 Report + routine → 📈 Progress
- Subtle warm gradient glow behind the hero; generous negative space.

**B. Upload experience**
- Large dashed dropzone with icon, "Drop your photo here or click to browse", note "Front-facing, well-lit, face in frame".
- On image: square preview with a soft face-guidance ellipse overlay, "Analyze" button.
- Camera capture button (if supported) + "Use sample photo" link.

**C. Analyzing screen**
- Centered pulsing score-ring skeleton + progress list with animated checkmarks:
  "Skin analysis — 14 concerns… ✓" · "Skin tone & colors… ✓" · "Fitzpatrick type… ✓"
- Friendly microcopy: "Reading your skin…"

**D. Results dashboard (the star)**
- Header: "Your skin report" + provider badge ("✨ Real YouCam AI" / "🎬 Demo") + time + actions: **Share** (primary-ish) and **New scan**.
- **Summary row (4 cards):**
  1. Big animated **score ring** (SVG arc, tabular number, label "overall")
  2. "Skin age" big number card
  3. "Fitzpatrick" card (I–VI) with one-line UV note (e.g. "Rarely burns, tans easily")
  4. "Skin tone" card with a color dot + hex
- **Tabs (segmented pills):** 📋 Report · 🧴 Routine · 📈 Progress
- **Report tab:**
  - Grid of **14 concern tiles**: label, score, color-coded progress bar; tap → shows detection **mask overlay image** (highlight active tile); hint "tap to see mask".
  - **Color palette strip**: chips with color dots (Skin/Eye/Lip/Brow/Hair hexes).
  - **🎨 Color season card**: "Your color season: Warm Spring — soft corals, warm neutrals, gold/rose-gold".
  - **💡 Glow-up tips card**: 3–4 bullet tips tied to top concerns (e.g., "Pores: salicylic acid + niacinamide (score 62)").
- **Routine tab:**
  - "Focus areas" chips (worst concerns).
  - Two-column **AM ☀️ / PM 🌙 cards** with numbered steps; "🗓 Weekly" strip; disclaimer footnote (educational, not medical advice).
- **Progress tab:**
  - **Trend sparkline chart** of overall scores across scans (animated bars/line), current → previous delta with ▲/▼ + friendly note.
  - **History list**: date/time, score, skin age, Fitzpatrick, "latest" badge.
- **Share modal:** a beautiful **result card** (score ring, skin age, Fitzpatrick, tone, top concern, brand mark, "Get your Glow report") with Share/Copy buttons — designed to be screenshot-worthy.

**E. Footer:** "Glow · AI Skin Intelligence · powered by YouCam · built for the YouCam API Hackathon"

### 3. Technical constraints
- Output **React 18 + TypeScript + Vite** with **plain CSS** (CSS variables for the tokens above; no Tailwind dependency).
- Component breakdown: `Landing`, `Upload`, `Analyzing`, `ResultsDashboard`, `ScoreRing`, `ConcernTile`, `MaskView`, `ColorStrip`, `SeasonCard`, `TipsCard`, `RoutineView`, `ProgressView`, `Sparkline`, `HistoryList`, `ShareModal`, `DarkModeToggle`.
- All data comes from a `ScanResult` object with this shape (render it as-is):
```ts
interface ScanResult {
  overall: number | null;            // 0–100
  skinAge: number | null;
  fitzpatrick: string | null;        // "I".."VI"
  tone: string | null;               // hex
  colors: Record<string, string>;    // SKIN/EYE/LIP/BROW/HAIR hexes
  scores: Record<string, number>;    // 14 concerns → 0–100 (higher = healthier)
  masks: Record<string, string[]>;   // concern → mask image URLs
  routine: { am: string[]; pm: string[]; weekly: string[]; focus: string[] };
  season: string; tips: string[];
  provider: 'youcam' | 'demo';
  tookMs: number;
}
```
- Accessible (ARIA labels on rings/bars/tabs, keyboard nav, focus rings), responsive down to 360px, dark-mode toggle, `prefers-reduced-motion` respected.
- No backend, no external fonts CDN beyond system fonts.

### 4. Do NOT
- No generic purple/blue AI gradients. No glassmorphism everywhere. No emoji-overload (use max 1–2 per section). No hardcoded data — every value renders from the data object. Keep it clean, warm, premium.

## PROMPT END

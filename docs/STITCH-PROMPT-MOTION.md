# Google Stitch Prompt v2 — "Glow" reshaped with motion-first design engineering
*(Built from emilkowalski/skills: emil-design-eng, animate, review-animations,
improve-animations, find-animation-opportunities.) Copy from PROMPT START to END.*

---

## PROMPT START

Design the complete UI for **"Glow — AI Skin Intelligence"** (a face-rating +
skincare web app, powered by AI skin analysis) in the visual language of iOS —
frosted glass, SF typography, system colors — with a **motion system engineered
like a design-engineering review: every animation must be justified,
frequency-appropriate, fast (<300ms), easing-correct, origin-aware,
interruptible, GPU-only, and accessibility-safe.** The result must feel like a
native Apple app, not a website.

### A. VISUAL SYSTEM (exact)
- iOS grouped background: light `#F2F2F7`, dark `#000000` (support both; toggle
  also respects `prefers-color-scheme`).
- Frosted glass cards: `rgba(255,255,255,.78)` light / `rgba(28,28,30,.72)` dark,
  `backdrop-filter: blur(24px) saturate(180%)`, 1px hairline borders
  (`rgba(60,60,67,.12)` light / `rgba(84,84,88,.55)` dark), inset top highlight
  `inset 0 1px 0 rgba(255,255,255,.35)` (light) / `.08` (dark). Radius: cards 20px,
  buttons 14px, chips/pills full.
- Typography: SF stack (-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe
  UI", Roboto, sans-serif). Large titles 700 / -0.03em / 1.02. Body 16-17px,
  secondary `rgba(60,60,67,.6)`. Numbers `font-variant-numeric: tabular-nums`.
- iOS system colors: blue `#007AFF` (dark `#0A84FF`), green `#34C759` (#30D158),
  orange `#FF9500` (#FF9F0A), red `#FF3B30` (#FF453A), pink `#FF2D55`, teal
  `#30B0C7`, purple `#AF52DE`. Scores: ≥85 green, ≥70 orange, <70 red.
- No purple AI gradients, no rainbow, no glassmorphism-on-everything, no heavy
  shadows, no ALLCAPS titles.

### B. MOTION SYSTEM — THE TEN NON-NEGOTIABLES (apply to every element)
1. **Justified motion.** Every animation answers "why?" — feedback, state
   indication, spatial consistency, preventing a jarring change. Never "it looks
   cool" on a frequently-seen element.
2. **Frequency-appropriate.** Frequently used controls get NO or minimal motion;
   rare/first-time moments (first scan result, celebration) get the generous
   springy delight.
3. **Responsive easing.** Entrances/exits use `ease-out` or strong custom curves
   (e.g. `cubic-bezier(0.22,1,0.36,1)`). **Never `ease-in`.** Never the weak
   built-in CSS easings — always custom cubic-bezier.
4. **Sub-300ms.** All UI animation ≤300ms (dropdowns 180ms, fades 200-220ms,
   presses 140-160ms). Slower only on deliberate rare moments.
5. **Origin & physical correctness.** Popovers/panels scale in from their TRIGGER
   (`transform-origin` at trigger). Never animate from `scale(0)` — start
   `scale(0.92-0.97)` + opacity. (Modals exempt: stay centered.)
6. **Interruptible.** Use CSS transitions or springs that retarget from current
   state — never keyframes that restart. Rapid re-triggers must feel smooth.
7. **GPU-only properties.** Animate ONLY `transform` and `opacity`. Never animate
   width/height/margin/top/left.
8. **Accessibility.** `prefers-reduced-motion` honored (gentler: keep opacity/
   color, drop movement). Hover effects gated behind `@media (hover:hover) and
   (pointer:fine)`.
9. **Asymmetric enter/exit.** Deliberate actions (press, hold-to-confirm) animate
   slightly slower; system responses snap.
10. **Cohesion.** One personality throughout — crisp, iOS-native, springy only
    where it earns it.

**Approved animation recipes (use these exactly):**
- Pressable elements → `:active { transform: scale(0.97) }` with `transition:
  transform 160ms ease-out`.
- Content that appears (conditional renders, tabs, expanding sections) → fade +
  scale from `scale(0.95)` + `opacity:0` → `scale(1)/opacity:1`, 200ms
  `cubic-bezier(0.22,1,0.36,1)`; use `@starting-style` for entry without JS.
- Tabs/segments → sliding pill indicator with a spring `cubic-bezier(0.34,1.56,0.64,1)`
  240ms; content fades 180ms.
- Score ring / bars / sparkline → animate on view, `ease-out` 500-700ms (rare
  delight moment, allowed to be a touch slower).
- Toasts/sheets → enter and exit along the SAME path (sheet slides up, exits
  down), `translateY(100%)` percentages not pixels, 240ms ease-out.
- Modals → centered scale `0.95→1` + fade, 220ms; backdrop fades 180ms with a
  subtle blur.
- Grid/list first appearance → 30-80ms stagger, subtle, never blocking.
- Any draggable/slider → spring physics, velocity-aware, rubber-band at edges.
- Mask overlay → origin-aware: scale in from the tapped tile, not center.

### C. SCREENS & FLOW (build all)

1. **LANDING / HERO** — iOS large title "Know your skin." / "Not a guess." (blue
   second line). Subtext: "Upload a selfie and get a full AI skin report in ~30
   seconds — 14 concern scores with visual masks, your skin age, sun type, exact
   tone, and a routine built from your real results." Primary blue pill "Upload a
   selfie" + frosted "Try demo (no photo)". Trust chips: "🔒 Nothing stored" ·
   "⚡ ~30s" · "🧬 3 AI analyses". 4-step strip: 📸 Selfie → 🧪 AI analysis → 📋
   Report + routine → 📈 Progress. Elements stagger in 40-60ms (first-time
   moment, allowed).

2. **UPLOAD** — large frosted dropzone (dashed border, camera icon, "Drop your
   photo here or click to browse", note "Front-facing, well-lit, face in
   frame"). After pick: circular preview with blue ring + "Analyze" button
   (press scale 0.97). "Use sample photo" link.

3. **ANALYZING** — centered blue circular progress ring; steps appear one by one
   with checkmarks: "Skin analysis — 14 concerns" · "Skin tone & colors" ·
   "Fitzpatrick type"; microcopy "Reading your skin…". Steps fade in 180ms each,
   staggered 300ms.

4. **RESULTS DASHBOARD (centerpiece — make it stunning)** —
   - Header: "Your skin report" large title, provider badge ("✨ Real YouCam AI" /
     "🎬 Demo"), elapsed time, "Share" (blue) + "New scan" buttons.
   - Summary row: 4 frosted cards — (a) animated circular score ring (SVG arc,
     blue→green/orange/red by value, tabular number, "overall"), (b) "Skin age"
     big number, (c) "Fitzpatrick" I-VI + UV note, (d) "Skin tone" color dot +
     hex. Cards enter with 40ms stagger, fade+scale 0.96.
   - iOS segmented control: "📋 Report" · "🧴 Routine" · "📈 Progress" with
     sliding pill + content fade.
   - REPORT: grid of 14 frosted concern tiles (label, tabular score, color bar);
     tap → tile highlights + **detection-mask overlay scales in from the tile**
     (origin-aware) with close; hint "tap to see mask". Color palette chips
     (Skin/Eye/Lip/Brow/Hair dots + hex). "Your color season" blue-tinted card.
     "Glow-up tips" frosted card (3-4 bullets).
   - ROUTINE: "Focus areas" chips; two frosted columns ☀️ Morning / 🌙 Night with
     numbered steps; "🗓 Weekly" strip; tiny disclaimer.
   - PROGRESS: animated trend sparkline; delta row (▲/▼ + friendly note);
     history list (frosted rows: date, score, skin age, Fitzpatrick, "latest"
     badge) — rows fade in, staggered 30ms.
   - SHARE MODAL: iOS bottom sheet (slides up 240ms ease-out, exits down the
     same path) with a beautiful share card — score ring, skin age, Fitzpatrick,
     tone, top concern, app mark, "Get your Glow report" — "Share" + "Copy"
     buttons.

5. **FOOTER** — "Glow · AI Skin Intelligence · powered by YouCam · built for the
   YouCam API Hackathon".

### D. TECHNICAL CONSTRAINTS
- React 18 + TypeScript + Vite, plain CSS with variables (no Tailwind, no UI
  library). Tokenize: `--ease-out`, `--ease-spring`, `--dur-fast:140ms`,
  `--dur:220ms`, `--dur-slow:300ms` — every animation uses a token, no
  invented values.
- Components: Landing, Upload, Analyzing, ResultsDashboard, ScoreRing,
  ConcernTile, MaskView, ColorStrip, SeasonCard, TipsCard, RoutineView,
  ProgressView, Sparkline, HistoryList, ShareModal, ThemeToggle.
- Render everything from this data object (no hardcoded values):
  { overall:number|null, skinAge:number|null, fitzpatrick:string|null,
    tone:string|null, colors:Record<string,string>, scores:Record<string,number>,
    masks:Record<string,string[]>, routine:{am:string[],pm:string[],weekly:string[],
    focus:string[]}, season:string, tips:string[], provider:'youcam'|'demo',
    tookMs:number }
- Accessible (ARIA on rings/bars/tabs, keyboard nav, strong focus rings),
  responsive to 360px, light+dark, `prefers-reduced-motion` → drop movement,
  keep opacity/color. No external font CDNs.

### E. DO NOT
- No animation without purpose. No `ease-in`. No `scale(0)` entrances. No
  width/height animation. No keyframes for interruptible UI. No purple
  gradients, no rainbow, no clutter. When unsure if motion helps — omit it.

## PROMPT END

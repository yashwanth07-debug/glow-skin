// ---------------------------------------------------------------------------
// Glow — routine rule engine. Deterministic: recommendations are derived from
// the actual concern scores (ui_score: higher = healthier, so LOW score =
// concern worth addressing). No free-form AI text → no hallucinations.
// ---------------------------------------------------------------------------

export interface Routine {
  am: string[];
  pm: string[];
  weekly: string[];
  focus: string[];
}

const CONCERN_LABELS: Record<string, string> = {
  wrinkle: 'Wrinkles', droopy_upper_eyelid: 'Upper eyelids', droopy_lower_eyelid: 'Lower eyelids',
  firmness: 'Firmness', acne: 'Acne', moisture: 'Moisture', eye_bag: 'Eye bags',
  dark_circle_v2: 'Dark circles', age_spot: 'Age spots', radiance: 'Radiance',
  redness: 'Redness', oiliness: 'Oiliness', pore: 'Pores', texture: 'Texture',
};

/** Low ui_score = the concern is present/worth addressing. */
const CONCERN_THRESHOLD = 75;

export function generateRoutine(
  scores: Record<string, number>,
  fitzpatrick: string | null
): Routine {
  const concerns = Object.entries(scores)
    .filter(([, s]) => s < CONCERN_THRESHOLD)
    .sort((a, b) => a[1] - b[1]) // worst first
    .map(([k]) => k);

  const am: string[] = ['Gentle low-pH cleanser'];
  const pm: string[] = ['Oil-based cleanser', 'Water-based cleanser'];
  const weekly: string[] = [];
  const focus: string[] = concerns.map((c) => CONCERN_LABELS[c] ?? c);

  const has = (c: string) => concerns.includes(c);

  if (has('radiance') || has('texture')) am.push('Vitamin C serum (brightening)');
  if (has('moisture')) am.push('Hyaluronic acid serum (hydration)');
  am.push('Moisturizer');
  if (fitzpatrick && ['I', 'II', 'III'].includes(fitzpatrick)) {
    am.push('SPF 50+ (your Fitzpatrick type ' + fitzpatrick + ' burns easily — SPF is non-negotiable)');
  } else {
    am.push('SPF 30+ (daily protection, all skin types)');
  }

  if (has('pore') || has('oiliness') || has('acne')) {
    pm.push('Salicylic acid (BHA) 2–3×/week — targets ' + (CONCERN_LABELS[concerns.find((c) => ['pore','oiliness','acne'].includes(c))!] ?? 'congestion'));
    weekly.push('Salicylic acid (BHA) 2–3×/week');
  }
  if (has('wrinkle') || has('droopy_upper_eyelid') || has('droopy_lower_eyelid') || has('firmness')) {
    pm.push('Retinol (start 2–3×/week, build up) — targets ' + (CONCERN_LABELS[concerns.find((c) => ['wrinkle','droopy_upper_eyelid','droopy_lower_eyelid','firmness'].includes(c))!] ?? 'texture & firmness'));
    weekly.push('Retinol 2–3×/week (never same night as BHA)');
  }
  if (has('dark_circle_v2') || has('eye_bag')) pm.push('Caffeine eye cream (AM optional)');
  if (has('redness')) pm.push('Centella / azulene calming serum (redness)');
  if (has('age_spot')) {
    am.push('Niacinamide + vitamin C for age spots');
    weekly.push('Niacinamide serum daily for age spots');
  }
  if (has('acne')) pm.push('Benzoyl peroxide spot treatment (only on active spots)');
  if (has('moisture') || has('firmness')) pm.push('Ceramide-rich night moisturizer');

  pm.push('Night moisturizer');

  return { am, pm, weekly, focus };
}

// ---- personal color "season" (from tone + hair/eye colors) ---------------

export function seasonFromColors(colors: Record<string, string>, toneHex: string | null): string {
  // crude but honest rule: use skin luminance + hair darkness
  const lum = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return 128;
    const n = parseInt(m[1], 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  const skinLum = toneHex ? lum(toneHex) : 128;
  const hairHex = colors.HAIR ?? colors.hair_color ?? '#000000';
  const hairLum = lum(hairHex);
  const warm = toneHex ? (toneHex.match(/[0-9A-F]/g) ?? []).join('').length > 0 && parseInt(toneHex.replace('#',''),16) % 3 !== 0 : true;
  // simplify: warm vs cool via red-dominance heuristic
  const r = toneHex ? parseInt(toneHex.slice(1,3),16) : 128;
  const b = toneHex ? parseInt(toneHex.slice(5,7),16) : 128;
  const isWarm = r > b;
  const dark = hairLum < 90;
  if (isWarm && dark) return 'Deep Autumn — rich warm earth tones, gold jewelry';
  if (isWarm) return 'Warm Spring — soft corals, warm neutrals, gold/rose-gold';
  if (dark) return 'Deep Winter — jewel tones, cool reds, silver jewelry';
  return 'Cool Summer — dusty pinks, cool blues, silver';
}

export function beautyTips(scores: Record<string, number>): string[] {
  const tips: string[] = [];
  const bad = Object.entries(scores).filter(([, s]) => s < 75).sort((a, b) => a[1] - b[1]).slice(0, 4);
  for (const [k, s] of bad) {
    const label = CONCERN_LABELS[k] ?? k;
    if (k === 'acne') tips.push(`Acne: keep a non-comedogenic routine, change pillowcases 2×/wk (score ${Math.round(s)})`);
    else if (k === 'wrinkle') tips.push(`Wrinkles: start retinol + always SPF (score ${Math.round(s)})`);
    else if (k === 'dark_circle_v2') tips.push(`Dark circles: sleep 7–8h, caffeine eye cream (score ${Math.round(s)})`);
    else if (k === 'radiance') tips.push(`Radiance: vitamin C in the AM + exfoliate 2×/wk (score ${Math.round(s)})`);
    else if (k === 'pore') tips.push(`Pores: salicylic acid + niacinamide (score ${Math.round(s)})`);
    else if (k === 'moisture') tips.push(`Hydration: hyaluronic acid on damp skin (score ${Math.round(s)})`);
    else if (k === 'redness') tips.push(`Redness: skip actives 1 day/wk, centella serum (score ${Math.round(s)})`);
    else tips.push(`${label}: address with the routine below (score ${Math.round(s)})`);
  }
  return tips;
}

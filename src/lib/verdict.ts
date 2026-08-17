// ---------------------------------------------------------------------------
// GLOW Verdict — the honesty engine.
//  1. variance(): 3 scans of the same face → per-metric spread + verdict
//     (trustworthy / borderline / noise / saturated). Modeled on TOLERANCE:
//     some numbers survive re-capture, most don't, and we say which.
//  2. signature(): your most distinctive feature → a KIND persona + talent
//     (inspired by FaceForge's inversion, reframed positively — no roasting).
//  3. canons(): the "whose ideal?" explainer — beauty canons are contested;
//     we cite the research instead of pretending our number is a fact.
// ---------------------------------------------------------------------------

import type { ScanResult } from './youcam';

export type Verdict = 'trustworthy' | 'borderline' | 'noise' | 'saturated';

export interface MetricVerdict {
  score: number;
  spread: number;
  verdict: Verdict;
}

export interface VarianceReport {
  metrics: Record<string, MetricVerdict>;
  summary: string;
  generated: boolean; // true when simulated (demo/no extra units)
  scans: number;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  trustworthy: 'Trustworthy',
  borderline: 'Borderline',
  noise: 'Noise',
  saturated: 'Saturated',
};

export function verdictFromSpread(spread: number, score: number): Verdict {
  if (score >= 99.5 || score <= 0.5) return 'saturated'; // pinned at the ceiling/floor
  if (spread < 3) return 'trustworthy';
  if (spread < 6) return 'borderline';
  return 'noise';
}

/** Deterministic pseudo-variance (seeded by the score) for demo/no-extra-units mode. */
function jitter(score: number, seed: number): number {
  const s = Math.sin(seed * 12.9898 + score * 78.233) * 43758.5453;
  const r = s - Math.floor(s);
  return r * 7; // 0..7 spread
}

/**
 * Variance report from 3 capture variants.
 *  - real mode: pass the 3 actual ScanResults
 *  - demo mode: pass a single result + generated:true → simulated spread
 */
export function buildVariance(
  scans: ScanResult[],
  opts: { generated?: boolean } = {}
): VarianceReport {
  const generated = opts.generated ?? false;
  const metrics: Record<string, MetricVerdict> = {};

  // union of all concern keys
  const keys = new Set<string>();
  scans.forEach((s) => Object.keys(s.scores).forEach((k) => keys.add(k)));

  for (const k of keys) {
    const vals = scans.map((s) => s.scores[k]).filter((v) => typeof v === 'number');
    if (vals.length === 0) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const spread = generated
      ? jitter(mean, k.length + mean)
      : vals.length > 1
        ? Math.max(...vals) - Math.min(...vals)
        : 0;
    metrics[k] = { score: Math.round(mean), spread: Number(spread.toFixed(1)), verdict: verdictFromSpread(spread, mean) };
  }

  const trustworthy = Object.values(metrics).filter((m) => m.verdict === 'trustworthy').length;
  const noisy = Object.values(metrics).filter((m) => m.verdict === 'noise' || m.verdict === 'saturated').length;
  const total = Object.keys(metrics).length;

  const summary =
    generated
      ? `Simulated re-capture check (${total} metrics). In real mode we re-scan your face 3× to measure true variance.`
      : `${trustworthy}/${total} metrics survived re-capture; ${noisy} are ${noisy === 1 ? 'noise' : 'noise or saturated'}. Trust the numbers that survive.`;

  return { metrics, summary, generated, scans: scans.length };
}

// ---------------------------------------------------------------------------
// Skin signature (kind inversion)
// ---------------------------------------------------------------------------

const PERSONAS: Record<string, { name: string; trait: string; line: string }> = {
  dark_circle_v2: { name: 'Moonlit Eyes', trait: 'soft, expressive eyes', line: 'Late nights and deep thoughts — your eyes tell stories.' },
  eye_bag: { name: 'Gentle Dawn', trait: 'soft under-eye contour', line: 'A natural softness that reads as warmth, not fatigue.' },
  pore: { name: 'Velvet Texture', trait: 'rich, characterful texture', line: 'Real skin has texture — yours has story.' },
  wrinkle: { name: 'Story Keeper', trait: 'lived-in, expressive lines', line: 'Every line is a chapter you earned.' },
  acne: { name: 'Resilient Bloom', trait: 'skin in progress', line: 'Breakouts are chapters, not endings.' },
  radiance: { name: 'Sunlit Glow', trait: 'naturally luminous skin', line: 'Your light shows without a highlighter.' },
  redness: { name: 'Rosy Temperament', trait: 'warm, reactive tone', line: 'You wear your feelings on your cheeks — honestly.' },
  firmness: { name: 'Spring Back', trait: 'bouncy, youthful resilience', line: 'Skin that holds its own against gravity.' },
  texture: { name: 'Velvet Texture', trait: 'rich, characterful texture', line: 'Real skin has texture — yours has story.' },
  moisture: { name: 'Desert Rose', trait: 'thirsty but resilient', line: 'Hydration is your unlock — one serum away from glow.' },
  oiliness: { name: 'Dewy Radiance', trait: 'naturally glossy skin', line: 'You wake up half-glowing already.' },
  age_spot: { name: 'Sun Diary', trait: 'skin that remembers summers', line: 'Your skin keeps a sun log most people never keep.' },
  droopy_upper_eyelid: { name: 'Bedroom Gaze', trait: 'soft, relaxed eyelids', line: 'A dreamy look that needs no filter.' },
  droopy_lower_eyelid: { name: 'Sleepy Charm', trait: 'soft lower-lid line', line: 'Effortlessly relaxed, like a Sunday morning.' },
};

export interface Signature {
  persona: string;
  trait: string;
  line: string;
  talent: string;
  talentScore: number;
  distinctScore: number;
}

export function skinSignature(scores: Record<string, number>): Signature {
  const entries = Object.entries(scores).filter(([, v]) => typeof v === 'number');
  if (entries.length === 0) {
    return { persona: 'Blank Canvas', trait: 'ready for anything', line: 'Your story is unwritten.', talent: '—', talentScore: 0, distinctScore: 0 };
  }
  // most distinctive = lowest score (the metric that stands out)
  const weakest = [...entries].sort((a, b) => a[1] - b[1])[0];
  const strongest = [...entries].sort((a, b) => b[1] - a[1])[0];
  const p = PERSONAS[weakest[0]] ?? { name: 'Original', trait: 'a one-of-one feature', line: 'Your face has its own signature.' };
  return {
    persona: p.name,
    trait: p.trait,
    line: p.line,
    talent: PERSONAS[strongest[0]]?.name ?? 'Natural Glow',
    talentScore: Math.round(strongest[1]),
    distinctScore: Math.round(weakest[1]),
  };
}

// ---------------------------------------------------------------------------
// "Whose ideal?" — the canons explainer (cited, honest)
// ---------------------------------------------------------------------------

export interface Canon {
  name: string;
  kind: 'description' | 'prescription' | 'scorecard';
  claim: string;
  citation: string;
}

export const CANONS: Canon[] = [
  {
    name: 'Neoclassical canons (facial thirds)',
    kind: 'description',
    claim: 'The face divides into equal thirds (hairline–brow–nose–chin). Jayaratne et al. (2012) measured Southern Chinese faces and found 0% conformity to this canon.',
    citation: 'Jayaratne, Deutsch, McGrath (2012) — J Craniofac Surg.',
  },
  {
    name: 'Golden ratio (Phi)',
    kind: 'prescription',
    claim: 'Attractiveness ≈ closeness to 1.618 ratios. Farkas, who revised the canons against real anthropometry, concluded they cannot serve as normative standards.',
    citation: 'Farkas et al. (1987) — revised neoclassical canons.',
  },
  {
    name: 'Online symmetry scorecards',
    kind: 'scorecard',
    claim: 'One immutable face scored 98% by one online scorecard and 45% by another (53-point spread). The number was never a fact about your face.',
    citation: 'Measured in the TOLERANCE project, 2026 (81 re-captures, 4 canons).',
  },
];

// ---------------------------------------------------------------------------
export { VERDICT_LABEL };

import { describe, expect, it } from 'vitest';
import {
  buildVariance,
  CANONS,
  skinSignature,
  verdictFromSpread,
  type VarianceReport,
} from './verdict';
import type { ScanResult } from './youcam';

function fakeScan(scores: Record<string, number>): ScanResult {
  return {
    overall: 76, skinAge: 30, fitzpatrick: 'IV', tone: '#9a7253',
    colors: {}, scores, masks: {}, tookMs: 1000, provider: 'demo',
  };
}

describe('verdictFromSpread', () => {
  it('pins saturated at the ceiling', () => {
    expect(verdictFromSpread(0, 100)).toBe('saturated');
  });
  it('trustworthy below 3', () => {
    expect(verdictFromSpread(1.5, 60)).toBe('trustworthy');
  });
  it('borderline 3-6', () => {
    expect(verdictFromSpread(4, 60)).toBe('borderline');
  });
  it('noise above 6', () => {
    expect(verdictFromSpread(8, 60)).toBe('noise');
  });
});

describe('buildVariance', () => {
  it('computes real spread from 3 scans', () => {
    const r = buildVariance([
      fakeScan({ pore: 60, oiliness: 50 }),
      fakeScan({ pore: 63, oiliness: 66 }),
      fakeScan({ pore: 58, oiliness: 62 }),
    ]);
    expect(r.metrics.pore.spread).toBeCloseTo(5, 0);
    expect(r.metrics.pore.verdict).toBe('borderline');
    expect(r.metrics.oiliness.spread).toBeCloseTo(16, 0);
    expect(r.metrics.oiliness.verdict).toBe('noise');
    expect(r.generated).toBe(false);
    expect(r.scans).toBe(3);
  });

  it('simulates variance in generated mode', () => {
    const r: VarianceReport = buildVariance([fakeScan({ pore: 60 })], { generated: true });
    expect(r.generated).toBe(true);
    expect(r.metrics.pore.spread).toBeGreaterThan(0);
    expect(r.summary).toContain('Simulated');
  });
});

describe('skinSignature', () => {
  it('maps weakest metric to a persona (kind inversion)', () => {
    const sig = skinSignature({ pore: 45, radiance: 92, wrinkle: 80 });
    expect(sig.persona).toBe('Velvet Texture');
    expect(sig.distinctScore).toBe(45);
    expect(sig.talentScore).toBe(92);
  });

  it('handles empty scores', () => {
    const sig = skinSignature({});
    expect(sig.persona).toBe('Blank Canvas');
  });
});

describe('CANONS', () => {
  it('ships citations for every canon', () => {
    expect(CANONS.length).toBeGreaterThanOrEqual(3);
    for (const c of CANONS) {
      expect(c.citation.length).toBeGreaterThan(5);
      expect(['description', 'prescription', 'scorecard']).toContain(c.kind);
    }
  });
});

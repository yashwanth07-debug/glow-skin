import { describe, expect, it } from 'vitest';
import { generateRoutine } from './routine';

describe('generateRoutine', () => {
  it('adds SPF for fair Fitzpatrick types', () => {
    const r = generateRoutine({ radiance: 90, moisture: 85 }, 'II');
    expect(r.am.some((s) => s.includes('SPF 50'))).toBe(true);
  });

  it('adds SPF 30 for darker types', () => {
    const r = generateRoutine({ radiance: 90 }, 'V');
    expect(r.am.some((s) => s.includes('SPF 30'))).toBe(true);
  });

  it('targets low scores (pores -> BHA)', () => {
    const r = generateRoutine({ pore: 55, oiliness: 50, radiance: 90 }, 'IV');
    expect(r.pm.some((s) => s.includes('Salicylic'))).toBe(true);
    expect(r.weekly.some((s) => s.includes('Salicylic'))).toBe(true);
    expect(r.focus).toContain('Pores');
  });

  it('targets wrinkles -> retinol', () => {
    const r = generateRoutine({ wrinkle: 60, radiance: 90 }, 'III');
    expect(r.pm.some((s) => s.includes('Retinol'))).toBe(true);
    expect(r.focus).toContain('Wrinkles');
  });

  it('healthy scores -> minimal routine, no focus', () => {
    const r = generateRoutine({ pore: 95, wrinkle: 92, radiance: 94, moisture: 90, firmness: 91 }, 'V');
    expect(r.focus).toEqual([]);
    expect(r.weekly).toEqual([]);
  });
});

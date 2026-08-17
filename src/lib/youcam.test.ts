import { describe, expect, it } from 'vitest';
import { CROP_CANDIDATES, CROP_OUT, cropRect, friendlyTaskError } from './youcam';

describe('cropRect', () => {
  it('defaults to a 0.7× square centered at (w/2, 0.4h)', () => {
    const r = cropRect(3000, 4000, 0.7);
    expect(r.size).toBe(2100);
    // cx = w/2 → sx covers [450, 2550]; sy centers 2100 at 0.4·4000 = 1600
    expect(r.sx).toBe(450);
    expect(r.sy).toBe(550);
    expect(r.sx + r.size).toBeLessThanOrEqual(3000);
    expect(r.sy + r.size).toBeLessThanOrEqual(4000);
  });

  it('clamps when the window would overflow the image', () => {
    const r = cropRect(500, 300, 0.9);
    expect(r.size).toBe(270);
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy).toBeGreaterThanOrEqual(0);
    expect(r.sx + r.size).toBeLessThanOrEqual(500);
    expect(r.sy + r.size).toBeLessThanOrEqual(300);
  });

  it('supports off-center windows', () => {
    const r = cropRect(2000, 2000, 0.7, 0.3, 0.5);
    expect(r.size).toBe(1400);
    // cx=0.3 → center x=600 → sx = 600-700 → clamped to 0
    expect(r.sx).toBe(0);
    // cy=0.5 → center y=1000 → sy = 1000-700 = 300
    expect(r.sy).toBe(300);
  });

  it('never produces a window larger than the image', () => {
    for (const w of [100, 640, 1080, 4000]) {
      for (const h of [100, 800, 2400, 4000]) {
        for (const c of CROP_CANDIDATES) {
          const r = cropRect(w, h, c.frac, c.cx, c.cy);
          expect(r.size).toBeGreaterThan(0);
          expect(r.sx).toBeGreaterThanOrEqual(0);
          expect(r.sy).toBeGreaterThanOrEqual(0);
          expect(r.sx + r.size).toBeLessThanOrEqual(w);
          expect(r.sy + r.size).toBeLessThanOrEqual(h);
        }
      }
    }
  });
});

describe('CROP_CANDIDATES', () => {
  it('starts with the default face zone and always outputs ≥800px', () => {
    expect(CROP_CANDIDATES[0]).toEqual({ frac: 0.7, cx: 0.5, cy: 0.4 });
    expect(CROP_OUT).toBeGreaterThanOrEqual(800);
    // smallest candidate on a small image must still hit the ≥800 output rule
    for (const c of CROP_CANDIDATES) {
      expect(c.frac).toBeGreaterThan(0);
      expect(c.frac).toBeLessThanOrEqual(0.9);
      expect(c.cx).toBeGreaterThanOrEqual(0);
      expect(c.cx).toBeLessThanOrEqual(1);
      expect(c.cy).toBeGreaterThanOrEqual(0);
      expect(c.cy).toBeLessThanOrEqual(1);
    }
  });
});

describe('friendlyTaskError', () => {
  it('maps no-face errors to actionable advice', () => {
    const msg = friendlyTaskError('{"error":"error_no_face","results":null,"task_status":"error"}');
    expect(msg).toMatch(/face/i);
    expect(msg).not.toMatch(/error_no_face/);
  });
  it('maps angle errors', () => {
    expect(friendlyTaskError('{"error":"error_face_angle_leftward"}')).toMatch(/angled/i);
  });
  it('maps too-small-face errors', () => {
    expect(friendlyTaskError('{"error":"error_src_face_too_small"}')).toMatch(/too small/i);
  });
  it('maps below-min-size errors', () => {
    expect(friendlyTaskError('{"error":"error_below_min_image_size"}')).toMatch(/resolution|larger/i);
  });
  it('maps face-out-of-frame errors', () => {
    expect(friendlyTaskError('{"error":"error_src_face_out_of_bound"}')).toMatch(/cut off/i);
  });
  it('maps service hiccups (DLQ crashes) without leaking internals', () => {
    const msg = friendlyTaskError('{"error":"[DLQ] Max retries exhausted. Last error: list index out of range"}');
    expect(msg).toMatch(/hiccup/i);
    expect(msg).not.toMatch(/DLQ/);
  });
  it('falls back to a generic message', () => {
    expect(friendlyTaskError('{"error":"something_unexpected"}')).toMatch(/try again/i);
  });
});

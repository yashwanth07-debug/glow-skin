// Demo mode — realistic sample data so the product demo never fails without a key.
import type { ScanResult } from './youcam';

export function demoScan(): ScanResult {
  const scores: Record<string, number> = {
    wrinkle: 70, droopy_upper_eyelid: 72, droopy_lower_eyelid: 74, firmness: 78,
    acne: 95, moisture: 80, eye_bag: 66, dark_circle_v2: 60, age_spot: 90,
    radiance: 81, redness: 88, oiliness: 55, pore: 62, texture: 84,
  };
  return {
    overall: 76,
    skinAge: 38,
    scores,
    masks: {},
    tone: '#997152',
    colors: { SKIN: '#997152', EYE: '#241711', LIP: '#CC7F71', BROW: '#805D47', HAIR: '#B56637' },
    fitzpatrick: 'V',
    tookMs: 2900,
    provider: 'demo',
  };
}

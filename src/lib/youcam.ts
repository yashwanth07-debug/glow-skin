// ---------------------------------------------------------------------------
// Glow — YouCam v2 client (browser-direct, CORS-enabled, verified live).
// 3 endpoints: skin-analysis (14 concerns) · skin-tone-analysis ·
// fitzpatrick-scale-analyzer. Key comes ONLY from env (VITE_YOUCAM_KEY).
// Units are charged only on successful tasks (~46u per full scan).
// ---------------------------------------------------------------------------

export const YOUNCAM_BASE = 'https://yce-api-01.makeupar.com';

export const FULL_CONCERNS = [
  'wrinkle', 'droopy_upper_eyelid', 'droopy_lower_eyelid', 'firmness',
  'acne', 'moisture', 'eye_bag', 'dark_circle_v2', 'age_spot', 'radiance',
  'redness', 'oiliness', 'pore', 'texture',
];

export interface ScanResult {
  overall: number | null;
  skinAge: number | null;
  scores: Record<string, number>;
  masks: Record<string, string[]>;
  tone: string | null;
  colors: Record<string, string>;
  fitzpatrick: string | null;
  tookMs: number;
  provider: 'youcam' | 'demo';
}

export const hasKey = (): boolean => Boolean(import.meta.env.VITE_YOUCAM_KEY?.trim());

// ---- generic helpers -------------------------------------------------------

async function upload(key: string, blob: Blob, slug: string): Promise<string> {
  const slotRes = await fetch(`${YOUNCAM_BASE}/s2s/v2.0/file/${slug}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{ content_type: blob.type || 'image/jpeg', file_name: 'selfie.jpg', file_size: blob.size }],
    }),
  });
  const slotJson = await slotRes.json();
  const file = slotJson?.data?.files?.[0];
  if (!file) throw new Error(`upload slot failed: ${JSON.stringify(slotJson).slice(0, 160)}`);
  const up = file.requests[0];
  const put = await fetch(up.url, { method: up.method || 'PUT', headers: up.headers, body: blob });
  if (!put.ok) throw new Error('S3 upload failed');
  return file.file_id;
}

async function createTask(key: string, slug: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${YOUNCAM_BASE}/s2s/v2.0/task/${slug}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const id = json?.data?.task_id ?? json?.task_id;
  if (!id) throw new Error(`task create failed: ${JSON.stringify(json).slice(0, 200)}`);
  return id;
}

async function pollTask(key: string, slug: string, taskId: string, timeoutMs = 180_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${YOUNCAM_BASE}/s2s/v2.0/task/${slug}/${taskId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const json = await res.json();
    const d = json?.data ?? json;
    const status = d?.task_status ?? d?.status;
    if (status === 'success') return json;
    if (status === 'error') throw new Error(`YouCam task failed: ${JSON.stringify(d).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('YouCam task timed out');
}

// ---- individual analyses ---------------------------------------------------

async function runSkinAnalysis(key: string, blob: Blob): Promise<{ scores: Record<string, number>; masks: Record<string, string[]>; overall: number | null; skinAge: number | null }> {
  const fid = await upload(key, blob, 'skin-analysis');
  const taskId = await createTask(key, 'skin-analysis', { src_file_id: fid, dst_actions: FULL_CONCERNS, format: 'json' });
  const res = await pollTask(key, 'skin-analysis', taskId);
  const output = res?.data?.results?.output ?? [];
  const scores: Record<string, number> = {};
  const masks: Record<string, string[]> = {};
  let overall: number | null = null;
  let skinAge: number | null = null;
  for (const item of output) {
    const t: string = item.type ?? '';
    if (t === 'all') { overall = item.score ?? null; continue; }
    if (t === 'skin_age') { skinAge = item.score ?? null; continue; }
    if (t === 'resize_image') continue;
    if (typeof item.ui_score === 'number') scores[t] = item.ui_score;
    if (Array.isArray(item.mask_urls)) masks[t] = item.mask_urls;
  }
  return { scores, masks, overall, skinAge };
}

async function runTone(key: string, blob: Blob): Promise<{ tone: string | null; colors: Record<string, string> }> {
  const fid = await upload(key, blob, 'skin-tone-analysis');
  const taskId = await createTask(key, 'skin-tone-analysis', { src_file_id: fid, format: 'json' });
  const res = await pollTask(key, 'skin-tone-analysis', taskId);
  const color = res?.data?.results?.color ?? {};
  const colors: Record<string, string> = {};
  let tone: string | null = null;
  for (const [k, v] of Object.entries(color)) {
    if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v.trim())) {
      colors[k] = v.trim().toUpperCase();
      if (/skin/i.test(k) && !tone) tone = v.trim().toUpperCase();
    }
  }
  return { tone, colors };
}

async function runFitzpatrick(key: string, blob: Blob): Promise<string | null> {
  const fid = await upload(key, blob, 'fitzpatrick-scale-analyzer');
  const taskId = await createTask(key, 'fitzpatrick-scale-analyzer', { src_file_id: fid, version: '1.0' });
  const res = await pollTask(key, 'fitzpatrick-scale-analyzer', taskId);
  return res?.data?.results?.fitzpatrick_scale ?? null;
}

// ---- public entry ----------------------------------------------------------

/**
 * Prepares the selfie for analysis: center-crops a square around the face
 * region (faces sit in the upper-center of selfies) and scales to 640×640.
 * YouCam's analyzers reject faces that are too small in-frame
 * (error_src_face_too_small). Empirically verified: a crop window of
 * ~0.70× the smaller dimension, centered at (w/2, 0.40h), passes
 * skin-analysis (0.85× fails).
 */
export async function prepareImage(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width: w, height: h } = bitmap;
  // square crop window, centered horizontally, biased to upper-middle (face zone)
  const size = Math.round(Math.min(w, h) * 0.7);
  const cx = w / 2;
  const cy = h * 0.4;
  const sx = Math.max(0, Math.min(cx - size / 2, w - size));
  const sy = Math.max(0, Math.min(cy - size / 2, h - size));

  const out = 640;
  const canvas = new OffscreenCanvas(out, out);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, out, out);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return blob;
}

export async function fullScan(file: File | Blob): Promise<ScanResult> {
  const key = (import.meta.env.VITE_YOUCAM_KEY as string).trim();
  const blob = await prepareImage(file);
  const start = performance.now();
  // run all three analyses in parallel (independent tasks)
  const [skin, tone, fitz] = await Promise.all([
    runSkinAnalysis(key, blob),
    runTone(key, blob),
    runFitzpatrick(key, blob),
  ]);
  return {
    overall: skin.overall,
    skinAge: skin.skinAge,
    scores: skin.scores,
    masks: skin.masks,
    tone: tone.tone,
    colors: tone.colors,
    fitzpatrick: fitz,
    tookMs: Math.round(performance.now() - start),
    provider: 'youcam',
  };
}

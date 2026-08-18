// ---------------------------------------------------------------------------
// Glow — YouCam v2 client (browser-direct, CORS-enabled, verified live).
// 3 endpoints: skin-analysis (14 concerns) · skin-tone-analysis ·
// fitzpatrick-scale-analyzer. Key comes ONLY from env (VITE_YOUCAM_KEY).
// Units are charged only on successful tasks (~46u per full scan).
//
// Robustness notes (verified live against the real API, Aug 2026):
//  - The API rejects output images below ~800px with
//    `error_below_min_image_size` — we render 1024×1024 crops.
//  - Faces must be large in-frame (`error_src_face_too_small`) — we crop a
//    square around the face zone instead of sending the whole photo.
//  - A hardcoded crop window can miss the face (`error_no_face`), so we try
//    several windows in order. Failed tasks are FREE (units only charge on
//    success), so retrying costs nothing but a few seconds.
//  - skin-tone-analysis is strict about head angle (`error_face_angle_*`);
//    when it fails we still deliver the skin report and add a warning.
//  - Some images crash their pipeline ([DLQ] …) — mapped to a friendly
//    message with a "use a different photo" hint.
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
  /** Non-fatal API warnings (e.g. tone/fitzpatrick failed but scan succeeded). */
  warnings?: string[];
}

export const hasKey = (): boolean => Boolean(import.meta.env.VITE_YOUCAM_KEY?.trim());

// ---- image preparation ----------------------------------------------------

/** Output edge length for crops sent to the API (min ~800; 1024 is safe). */
export const CROP_OUT = 1024;

export interface CropWindow {
  /** Square window = frac × smaller image dimension. */
  frac: number;
  /** Horizontal center of the window, 0..1 of image width. */
  cx: number;
  /** Vertical center of the window, 0..1 of image height. */
  cy: number;
}

/**
 * Ordered crop candidates. The first is the default face zone (verified to
 * pass skin-analysis); the rest rescue faces that sit off-center, higher or
 * lower in the frame. Errors are free, so trying them in order costs nothing
 * unless a scan actually succeeds.
 */
export const CROP_CANDIDATES: CropWindow[] = [
  { frac: 0.7, cx: 0.5, cy: 0.4 },  // default face zone (upper-middle)
  { frac: 0.85, cx: 0.5, cy: 0.4 }, // wider window — catches off-center faces
  { frac: 0.7, cx: 0.5, cy: 0.55 }, // lower window — faces in the lower half
  { frac: 0.9, cx: 0.5, cy: 0.45 }, // nearly-full square — last resort
];

/** Pure crop math (unit-tested): square window around (cx·w, cy·h), clamped. */
export function cropRect(
  w: number, h: number, frac: number, cx = 0.5, cy = 0.4,
): { sx: number; sy: number; size: number } {
  const size = Math.round(Math.min(w, h) * frac);
  const sx = Math.max(0, Math.min(cx * w - size / 2, w - size));
  const sy = Math.max(0, Math.min(cy * h - size / 2, h - size));
  return { sx, sy, size };
}

async function renderSquare(
  bitmap: ImageBitmap, sx: number, sy: number, size: number,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(CROP_OUT, CROP_OUT);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, CROP_OUT, CROP_OUT);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  if (blob.size < 1024) throw new Error('Could not encode the photo — please try another image.');
  return blob;
}

/**
 * Decodes the upload (EXIF-aware) and renders every crop candidate as a
 * 1024×1024 JPEG blob, in the order they should be tried.
 */
export async function prepareImages(file: File | Blob): Promise<Blob[]> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error("We couldn't read that image file. Please upload a clear JPEG or PNG photo (not a live photo or HEIC).");
  }
  const { width: w, height: h } = bitmap;
  if (w < 64 || h < 64) throw new Error('That photo is too small — please upload a higher-resolution image.');
  const blobs: Blob[] = [];
  try {
    for (const c of CROP_CANDIDATES) {
      const { sx, sy, size } = cropRect(w, h, c.frac, c.cx, c.cy);
      blobs.push(await renderSquare(bitmap, sx, sy, size));
    }
  } finally {
    bitmap.close();
  }
  return blobs;
}

// ---- error mapping ---------------------------------------------------------

/** Maps raw YouCam task errors to honest, actionable messages. */
export function friendlyTaskError(raw: string): string {
  if (/error_no_face/.test(raw)) {
    return "We couldn't find a face in that photo. Try a clear, front-facing selfie in good light — face fully visible, nothing covering it.";
  }
  if (/error_face_angle/.test(raw)) {
    return 'That photo is angled. Face the camera directly (no side profile or head tilt) and try again.';
  }
  if (/error_src_face_too_small/.test(raw)) {
    return "Your face is too small in the frame — move closer / crop in on your face and try again.";
  }
  if (/error_src_face_out_of_bound/.test(raw)) {
    return "Your face is cut off at the edge of the photo — re-frame so your whole face is inside the image and try again.";
  }
  if (/error_below_min_image_size/.test(raw)) {
    return 'That photo is too low-resolution — please upload a larger image.';
  }
  if (/DLQ|Max retries|timeout|timed out/i.test(raw)) {
    return 'The AI service hiccuped on this image — try again, or upload a different photo.';
  }
  return 'Something went wrong with the AI service — please try again in a moment.';
}

/** Short warning for a secondary analysis (tone/fitzpatrick) that failed. */
function shortWarning(raw: string, what: string): string {
  if (/error_face_angle/.test(raw)) return `${what} skipped — photo angle (face the camera straight on)`;
  if (/error_no_face/.test(raw)) return `${what} skipped — no face detected`;
  return `${what} skipped — service hiccup`;
}

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

/**
 * Adaptive fast polling. A fixed 3s interval (the old behaviour) wasted up to
 * ~3s per round-trip × 3 analyses — usually the biggest chunk of total scan
 * time. Now: first check after ~600ms, then back off ×1.35 up to a 2.2s cap.
 * Typical tasks resolve in 2–6s, so the wait is now honest to the task's
 * actual finish time instead of the nearest 3s boundary.
 */
async function pollTask(key: string, slug: string, taskId: string, timeoutMs = 150_000): Promise<any> {
  const start = Date.now();
  let delay = 600;
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, delay));
    const res = await fetch(`${YOUNCAM_BASE}/s2s/v2.0/task/${slug}/${taskId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const json = await res.json();
    const d = json?.data ?? json;
    const status = d?.task_status ?? d?.status;
    if (status === 'success') return json;
    if (status === 'error') throw new Error(JSON.stringify(d));
    delay = Math.min(2200, Math.round(delay * 1.35));
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

/** A user-chosen crop, in source-image pixels (after EXIF orientation). */
export interface ManualCrop { sx: number; sy: number; size: number; }

export interface ScanOptions {
  /** The crop the user framed with the zoom/drag editor — tried FIRST. */
  crop?: ManualCrop;
  /** Live status updates for the analyzing screen. */
  onStage?: (msg: string) => void;
}

/**
 * Renders exactly the square the user framed in the editor (WYSIWYG: what you
 * see in the crop frame is what the AI scans). Clamped inside the image.
 */
export async function prepareManual(file: File | Blob, crop: ManualCrop): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error("We couldn't read that image file. Please upload a clear JPEG or PNG photo (not a live photo or HEIC).");
  }
  try {
    const size = Math.max(1, Math.min(Math.round(crop.size), bitmap.width, bitmap.height));
    const sx = Math.max(0, Math.min(Math.round(crop.sx), bitmap.width - size));
    const sy = Math.max(0, Math.min(Math.round(crop.sy), bitmap.height - size));
    return await renderSquare(bitmap, sx, sy, size);
  } finally {
    bitmap.close();
  }
}

/**
 * Deeper-zoom ladder applied per window. When the API reports
 * `error_src_face_too_small`, we keep the same centre and shrink the window
 * (failed tasks are FREE — units charge only on success), so a well-framed
 * but distant face still scans: 1× → 0.6× → 0.42× → 0.3× of the window.
 * A ~0.2× window upscaled to 1024px almost always satisfies the API.
 */
const TOO_SMALL_LADDER = [1, 0.6, 0.42, 0.3];

/** Re-centre square with side = mult·size on the same midpoint, clamped. */
function shrinkWindow(w: { sx: number; sy: number; size: number }, mult: number, W: number, H: number) {
  const size = Math.max(1, Math.round(w.size * mult));
  const cx = w.sx + w.size / 2;
  const cy = w.sy + w.size / 2;
  return {
    sx: Math.max(0, Math.min(Math.round(cx - size / 2), W - size)),
    sy: Math.max(0, Math.min(Math.round(cy - size / 2), H - size)),
    size,
  };
}

type ToneOut = Awaited<ReturnType<typeof runTone>>;
type SkinOut = Awaited<ReturnType<typeof runSkinAnalysis>>;
type Settled<T> = PromiseSettledResult<T>;

function assembleResult(s: SkinOut, tone: Settled<ToneOut>, fitz: Settled<string | null>, start: number): ScanResult {
  const warnings: string[] = [];
  if (tone.status === 'rejected') warnings.push(shortWarning(tone.reason instanceof Error ? tone.reason.message : String(tone.reason), 'Skin tone'));
  if (fitz.status === 'rejected') warnings.push(shortWarning(fitz.reason instanceof Error ? fitz.reason.message : String(fitz.reason), 'Fitzpatrick'));
  return {
    overall: s.overall,
    skinAge: s.skinAge,
    scores: s.scores,
    masks: s.masks,
    tone: tone.status === 'fulfilled' ? tone.value.tone : null,
    colors: tone.status === 'fulfilled' ? tone.value.colors : {},
    fitzpatrick: fitz.status === 'fulfilled' ? fitz.value : null,
    tookMs: Math.round(performance.now() - start),
    provider: 'youcam',
    warnings: warnings.length ? warnings : undefined,
  };
}

async function decode(file: File | Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error("We couldn't read that image file. Please upload a clear JPEG or PNG photo (not a live photo or HEIC).");
  }
}

/**
 * Full scan — self-correcting search over (window × zoom) space:
 *  - window order: the user's hand-framed crop FIRST (carries their intent),
 *    then the automatic face-zone candidates;
 *  - fast path: the very first window at 1× runs all 3 analyses in parallel
 *    (the common case — no time lost versus a naive single attempt);
 *  - rescue path: after the first failure we try skin-analysis only (cheaper
 *    and quicker per probe), shrinking the window per TOO_SMALL_LADDER
 *    whenever the API says the face is too small; when skin succeeds we fan
 *    tone + Fitzpatrick out in parallel on the winning crop;
 *  - `error_face_angle` is photo-inherent (no crop fixes it) → stop at once;
 *  - every failure is FREE — units charge only on a successful task.
 */
export async function fullScan(file: File | Blob, opts: ScanOptions = {}): Promise<ScanResult> {
  const key = (import.meta.env.VITE_YOUCAM_KEY as string).trim();
  const say = opts.onStage ?? (() => {});
  const start = performance.now();

  say('Preparing your photo…');
  const bitmap = await decode(file);
  try {
    const W = bitmap.width, H = bitmap.height;
    if (W < 64 || H < 64) throw new Error('That photo is too small — please upload a higher-resolution image.');

    const windows: { sx: number; sy: number; size: number }[] = [];
    if (opts.crop) {
      const size = Math.max(1, Math.min(Math.round(opts.crop.size), W, H));
      windows.push({
        sx: Math.max(0, Math.min(Math.round(opts.crop.sx), W - size)),
        sy: Math.max(0, Math.min(Math.round(opts.crop.sy), H - size)),
        size,
      });
    }
    for (const c of CROP_CANDIDATES) windows.push(cropRect(W, H, c.frac, c.cx, c.cy));

    let lastRaw = '';
    let firstAttempt = true;

    outer:
    for (const win of windows) {
      for (const mult of TOO_SMALL_LADDER) {
        const w = mult === 1 ? win : shrinkWindow(win, mult, W, H);
        const blob = await renderSquare(bitmap, w.sx, w.sy, w.size);

        if (firstAttempt) {
          firstAttempt = false;
          say('Uploading + launching 3 AI analyses in parallel…');
          const [skin, tone, fitz] = await Promise.allSettled([
            runSkinAnalysis(key, blob),
            runTone(key, blob),
            runFitzpatrick(key, blob),
          ]);
          if (skin.status === 'fulfilled') {
            say('Building your report…');
            return assembleResult(skin.value, tone, fitz, start);
          }
          lastRaw = skin.reason instanceof Error ? skin.reason.message : String(skin.reason);
        } else {
          say(mult === 1 ? 'Adjusting framing — retrying (free)…' : 'Zooming in closer — retrying (free)…');
          try {
            const s = await runSkinAnalysis(key, blob);
            say('Skin read ✓ — finishing tone & sun type…');
            const [tone, fitz] = await Promise.allSettled([runTone(key, blob), runFitzpatrick(key, blob)]);
            return assembleResult(s, tone, fitz, start);
          } catch (e) {
            lastRaw = e instanceof Error ? e.message : String(e);
          }
        }

        // Photo-inherent angle problem: no crop will save it — stop everything.
        if (/error_face_angle/.test(lastRaw)) break outer;
        // Face too small → dive deeper in the SAME window (next ladder rung).
        if (/error_src_face_too_small/.test(lastRaw)) continue;
        // Any other error (no face, out of bounds, service hiccup…) → next window.
        break;
      }
    }

    throw new Error(friendlyTaskError(lastRaw || 'YouCam task failed'));
  } finally {
    bitmap.close();
  }
}

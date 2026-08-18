import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { fullScan, hasKey, type ScanResult, type ManualCrop } from './lib/youcam';
import { demoScan } from './lib/demo';
import { buildVariance, skinSignature, CANONS, VERDICT_LABEL, type VarianceReport, type Signature } from './lib/verdict';
import { generateRoutine, seasonFromColors, beautyTips, type Routine } from './lib/routine';
import { loadHistory, saveHistory, toEntry, realScans, type HistoryEntry } from './lib/store';
import { BUILD_VERSION, BUILD_DATE } from './version';

type Phase = 'landing' | 'upload' | 'analyzing' | 'results';

/** The 5 steps shown on the analyzing screen (Aura-style staged checklist). */
const AN_STAGES = ['Preparing photo', 'Uploading securely', 'Analyzing skin patterns', 'Generating report', 'Finalizing results'] as const;

/** Elapsed seconds → mm:ss for the analyzing clock. */
const formatClock = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Fold the real pipeline messages (youcam.ts onStage) + elapsed time onto the
 * 5 visible steps. The long poll keeps the "Uploading…" message alive, so
 * after 2.5s we advance it to "Analyzing skin patterns". Demo mode has no
 * messages at all, so it is driven purely by its ~2.2s timeline.
 */
function stageIndex(msg: string, elapsedSec: number, demo: boolean): number {
  if (/report/i.test(msg)) return 3;
  if (/skin read|framing|zooming/i.test(msg)) return 2;
  if (/uploading|launching/i.test(msg)) return elapsedSec > 2.5 ? 2 : 1;
  if (/prepar|ready/i.test(msg)) return 0;
  if (demo) return Math.min(3, Math.floor(elapsedSec / 0.55));
  return msg ? 2 : 0;
}

const CONCERN_LABELS: Record<string, string> = {
  wrinkle: 'Wrinkles', droopy_upper_eyelid: 'Upper eyelids', droopy_lower_eyelid: 'Lower eyelids',
  firmness: 'Firmness', acne: 'Spots', moisture: 'Moisture', eye_bag: 'Eye bags',
  dark_circle_v2: 'Dark circles', age_spot: 'Age spots', radiance: 'Radiance',
  redness: 'Redness', oiliness: 'Oiliness', pore: 'Pores', texture: 'Texture',
};
const FITZ_INFO: Record<string, string> = {
  I: 'Pale · always burns', II: 'Beige · burns easily', III: 'Light brown · gradually tans',
  IV: 'Medium · tans easily', V: 'Brown · rarely burns', VI: 'Dark · never burns',
};
// Stitch palette: green ≥85, orange 70–84, red <70
const scoreColor = (s: number) => (s >= 85 ? '#53e16f' : s >= 70 ? '#ff9f0a' : '#ba1a1a');
const scoreBarColor = (s: number) => (s >= 85 ? '#53e16f' : s >= 70 ? '#ffb020' : '#ba1a1a');
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Integer display for any API score — the API returns floats (76.85714285714286)
    and old history entries may still hold them. */
const fmt = (n: number | null | undefined): string => (n == null || Number.isNaN(n) ? '—' : String(Math.round(n)));

/* ---------------------------------------------------------------------------
   CropView — the WYSIWYG crop frame. What you see inside the square (drag to
   move, zoom bar to tighten) is exactly the region sent to the AI. The frame
   renders the orientation-corrected image translated so the crop window
   (sx, sy, size) fills a `frame`×`frame` square:
     display scale sDisp = frame·zoom / minSide   (source px → css px)
     translate = (−sx·sDisp, −sy·sDisp)
--------------------------------------------------------------------------- */
interface CropViewProps {
  url: string;
  dims: { w: number; h: number };
  zoom: number;                    // 1..3
  pan: { fx: number; fy: number }; // 0..1 fraction of available travel
  frame: number;                   // rendered square size, css px
  interactive?: boolean;
  round?: boolean;
  guide?: boolean;
  onPan?: (pan: { fx: number; fy: number }) => void;
}

function CropView({ url, dims, zoom, pan, frame, interactive = false, round = false, guide = false, onPan }: CropViewProps) {
  const dragRef = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const minSide = Math.min(dims.w, dims.h);
  const size = minSide / zoom;
  const sDisp = (frame * zoom) / minSide;
  const xMax = Math.max(0, dims.w - size);
  const yMax = Math.max(0, dims.h - size);
  const sx = pan.fx * xMax;
  const sy = pan.fy * yMax;

  const imgStyle: CSSProperties = {
    width: dims.w * sDisp,
    height: dims.h * sDisp,
    transform: `translate(${-sx * sDisp}px, ${-sy * sDisp}px)`,
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive || !onPan) return;
    e.currentTarget.setPointerCapture(e.pointerId);   // keep tracking past the edge
    dragRef.current = { x: e.clientX, y: e.clientY, fx: pan.fx, fy: pan.fy };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || !interactive || !onPan) return;
    const dxSrc = (e.clientX - d.x) / sDisp;          // 1:1 tracking — element glued to finger
    const dySrc = (e.clientY - d.y) / sDisp;
    onPan({
      fx: xMax ? clamp01((d.fx * xMax + dxSrc) / xMax) : 0,
      fy: yMax ? clamp01((d.fy * yMax + dySrc) / yMax) : 0,
    });
  };
  const up = () => { dragRef.current = null; };

  return (
    <div
      className={`crop-frame${round ? ' round' : ''}${interactive ? ' grab' : ''}`}
      style={{ width: frame, height: frame }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      role={interactive ? 'slider' : undefined}
      aria-label={interactive ? 'Drag to position your face in the square' : 'Your framed photo'}
    >
      <img src={url} alt="" draggable={false} style={imgStyle} />
      {guide && (
        <svg className="crop-guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <ellipse cx="50" cy="44" rx="26" ry="33" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="0.7" strokeDasharray="3 2.2" />
          <ellipse cx="50" cy="44" rx="26" ry="33" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="0.7" strokeDasharray="3 2.2" strokeDashoffset="2.6" />
        </svg>
      )}
    </div>
  );
}

/* Demo-mode sample face: replaces the old empty "Your selfie (demo)" box with a
   real illustrated sample scan, so the report never shows a broken blank panel.
   Concern dots map each of the 14 metrics to its region; the tapped one pulses. */
const DEMO_DOTS: Record<string, { x: number; y: number }> = {
  wrinkle: { x: 100, y: 80 }, droopy_upper_eyelid: { x: 80, y: 102 }, droopy_lower_eyelid: { x: 120, y: 113 },
  firmness: { x: 74, y: 136 }, acne: { x: 127, y: 137 }, moisture: { x: 100, y: 153 },
  eye_bag: { x: 81, y: 111 }, dark_circle_v2: { x: 119, y: 108 }, age_spot: { x: 65, y: 125 },
  radiance: { x: 135, y: 125 }, redness: { x: 100, y: 134 }, oiliness: { x: 100, y: 97 },
  pore: { x: 100, y: 121 }, texture: { x: 83, y: 147 },
};

function DemoFaceArt({ active }: { active: string | null }) {
  return (
    <svg viewBox="0 0 200 240" preserveAspectRatio="xMidYMid slice" className="demo-face-art" role="img" aria-label="Demo sample face with concern regions">
      <defs>
        <linearGradient id="dfbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f7dbc9" /><stop offset="1" stopColor="#e7b49c" />
        </linearGradient>
      </defs>
      <rect width="200" height="240" fill="url(#dfbg)" />
      <path d="M50 240 C58 206 78 194 100 194 C122 194 142 206 150 240 Z" fill="rgba(255,255,255,0.55)" />
      <rect x="90" y="158" width="20" height="44" rx="9" fill="#eec3ad" />
      <ellipse cx="100" cy="112" rx="46" ry="58" fill="#f3cdb8" />
      <path d="M54 104 C60 50 140 50 146 104 C138 72 122 64 100 64 C78 64 62 72 54 104 Z" fill="#8a6a58" />
      <ellipse cx="84" cy="106" rx="5" ry="3" fill="#5b463c" />
      <ellipse cx="116" cy="106" rx="5" ry="3" fill="#5b463c" />
      <path d="M93 140 Q100 144 107 140" stroke="#b0715f" strokeWidth="3" fill="none" strokeLinecap="round" />
      {Object.entries(DEMO_DOTS).map(([k, p]) => (
        <g key={k}>
          <circle cx={p.x} cy={p.y} r={active === k ? 6.5 : 3} fill={active === k ? '#007aff' : 'rgba(20,20,20,0.4)'}
            stroke={active === k ? '#fff' : 'none'} strokeWidth="1.5" style={{ transition: 'r 160ms ease, fill 160ms ease' }} />
          {active === k && <circle cx={p.x} cy={p.y} r="12" fill="none" stroke="#007aff" strokeWidth="1.4" className="dot-halo" />}
        </g>
      ))}
    </svg>
  );
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('landing');
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgBlob, setImgBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeMask, setActiveMask] = useState<string | null>(null);
  const [activeConcern, setActiveConcern] = useState<string | null>(null);
  const [tab, setTab] = useState<'report' | 'routine' | 'progress'>('report');
  const [tips, setTips] = useState<string[]>([]);
  const [season, setSeason] = useState<string>('');
  const [variance, setVariance] = useState<VarianceReport | null>(null);
  const [signature, setSignature] = useState<Signature | null>(null);
  const [checking, setChecking] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dark, setDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  );
  // Crop editor state
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ fx: 0.5, fy: 0.5 });
  const [frame, setFrame] = useState(340);
  // Analyzing progress (honest, from the pipeline itself)
  const [stageMsg, setStageMsg] = useState('');
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const upd = () => setFrame(Math.max(220, Math.min(340, window.innerWidth - 48)));
    upd();
    window.addEventListener('resize', upd);
    return () => window.removeEventListener('resize', upd);
  }, []);

  useEffect(() => {
    if (phase !== 'analyzing') return;
    const t0 = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 200);
    return () => window.clearInterval(id);
  }, [phase]);

  /** The exact crop the user framed — goes first in the scan (usually the only candidate needed). */
  const manualCrop: ManualCrop | undefined = useMemo(() => {
    if (!dims) return undefined;
    const minSide = Math.min(dims.w, dims.h);
    const size = Math.round(minSide / zoom);
    const xMax = Math.max(0, dims.w - size);
    const yMax = Math.max(0, dims.h - size);
    return { sx: Math.round(pan.fx * xMax), sy: Math.round(pan.fy * yMax), size };
  }, [dims, zoom, pan]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => { setHistory(loadHistory()); }, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setImgBlob(f);
    setImgUrl(URL.createObjectURL(f));
    setZoom(1);
    setPan({ fx: 0.5, fy: 0.5 });
    setDims(null);
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      setDims({ w: bmp.width, h: bmp.height });
      bmp.close();
    } catch { /* crop editor falls back to plain preview + auto crops */ }
    setPhase('upload');
  };

  const runDemo = () => {
    setError(null);
    setImgUrl(null); setImgBlob(null);
    setPhase('analyzing');
    setTimeout(() => {
      const r = demoScan();
      setSignature(skinSignature(r.scores));
      applyResult(r);
    }, 2200);
  };

  const applyResult = (r: ScanResult) => {
    setResult(r);
    setRoutine(generateRoutine(r.scores, r.fitzpatrick));
    setTips(beautyTips(r.scores));
    setSeason(seasonFromColors(r.colors, r.tone));
    setActiveMask(null); setActiveConcern(null);
    setTab('report'); setPhase('results');
    const entry = toEntry(r);
    setHistory((h) => {
      const next = [entry, ...h].slice(0, 20);
      saveHistory(next);
      return next;
    });
  };

  const analyze = useCallback(async () => {
    if (!imgBlob || busy) return;
    setBusy(true); setError(null); setStageMsg('Getting ready…');
    try {
      applyResult(hasKey() ? await fullScan(imgBlob, { crop: manualCrop, onStage: setStageMsg }) : demoScan());
    } catch (e) {
      // Stay on the upload screen — keep the photo + zoom tool in front of the
      // user so they can fix the framing and retry, not get dumped on landing.
      setError(e instanceof Error ? e.message : String(e));
      setPhase('upload');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgBlob, busy, manualCrop]);

  useEffect(() => {
    if (phase === 'analyzing' && imgBlob) void analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, imgBlob]);

  // Which checklist row is highlighted on the analyzing screen
  const stageIdx = stageIndex(stageMsg, elapsed, !imgBlob);

  // Deep check: re-scan up to 3× (real) or simulate (demo). ~92-138 units real.
  const deepCheck = useCallback(async () => {
    if (checking) return;
    setChecking(true); setError(null);
    try {
      if (hasKey() && imgBlob) {
        const extra: ScanResult[] = [result!, await fullScan(imgBlob), await fullScan(imgBlob)];
        setVariance(buildVariance(extra));
      } else {
        setVariance(buildVariance([result!], { generated: true }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }, [checking, imgBlob, result]);

  const reset = () => { setPhase('landing'); setResult(null); setImgUrl(null); setImgBlob(null); setError(null); setActiveMask(null); setActiveConcern(null); setVariance(null); setSignature(null); setDims(null); setZoom(1); setPan({ fx: 0.5, fy: 0.5 }); setStageMsg(''); };

  // Progress = REAL scans only. Demo entries are listed but never charted —
  // charting sample numbers would be fake progress.
  const realHist = realScans(history);
  const prev = realHist[1];
  const worst = result ? Object.entries(result.scores).sort((a, b) => a[1] - b[1])[0] : null;

  return (
    <div className="page">
      {/* Top app bar */}
      <header className="topbar">
        <span className="brand">Glow</span>
        <span className="tag">AI SKIN INTELLIGENCE</span>
        <span className="top-right">
          {!hasKey() && <span className="demo-badge">demo mode</span>}
          <button className="icon-btn" onClick={() => setDark((d) => !d)} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
            {dark ? '☀️' : '🌙'}
          </button>
        </span>
      </header>

      <main className="wrap">
        {phase === 'landing' && (
          <section className="hero">
            <h1 className="hero-title">Know your skin.<br /><em>Not a guess.</em></h1>
            <p className="hero-sub">Upload a selfie and get a full AI skin report in ~30 seconds — 14 concern scores with visual masks, your skin age, sun type, exact tone, and a routine built from your real results.</p>
            <div className="steps"><span>📸 Selfie</span>→<span>🧪 AI analysis</span>→<span>📋 Report + routine</span>→<span>📈 Progress</span></div>
            <div className="cta-row">
              <button className="btn-primary" onClick={() => setPhase("upload")}>Upload a selfie</button>
              <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              <button className="btn-ghost" onClick={runDemo}>Try demo (no photo)</button>
            </div>
            <div className="chips"><span>🔒 Nothing stored</span><span>⚡ ~30s</span><span>🧬 3 AI analyses</span></div>
            {error && <div className="error">⚠ {error}</div>}
          </section>
        )}

        {phase === 'upload' && (
          <section className="upload-screen animate-rise">
            <div className="upload-card glass-card">
              <h1 className="upload-title">Upload Photo</h1>
              <p className="upload-sub">Frame your face in the square — exactly what you see is what the AI scans.</p>
              <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
              {!imgUrl ? (
                <div
                  className="dropzone"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
                >
                  <div className="dz-prompt">
                    <span className="dz-icon">📷</span>
                    <span className="dz-label">Tap to choose</span>
                    <span className="dz-hint">JPEG or PNG · front-facing · face in frame</span>
                  </div>
                </div>
              ) : (
                <>
                  {dims ? (
                    <CropView url={imgUrl} dims={dims} zoom={zoom} pan={pan} frame={frame} interactive guide onPan={setPan} />
                  ) : (
                    <div className="crop-frame" style={{ width: frame, height: frame }}>
                      <img src={imgUrl} alt="selfie preview" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'static' }} />
                    </div>
                  )}
                  {dims && (
                    <>
                      <div className="zoom-row">
                        <span className="zoom-ico" aria-hidden>−</span>
                        <input
                          type="range" className="zoom-bar" min={1} max={6} step={0.05} value={zoom}
                          onChange={(e) => setZoom(parseFloat(e.target.value))}
                          aria-label="Zoom — crop in until your face fills the dashed oval"
                        />
                        <span className="zoom-ico" aria-hidden>＋</span>
                      </div>
                      <p className="zoom-hint">Drag the photo to move it · slide the bar to zoom closer — your face should fill the dashed oval.</p>
                    </>
                  )}
                  <button className="btn-ghost small replace-link" onClick={() => inputRef.current?.click()}>Choose another photo</button>
                </>
              )}
              <button className="btn-primary analyze-btn" disabled={!imgBlob || busy} onClick={() => setPhase('analyzing')}>
                Analyze Skin
              </button>
              <button className="btn-ghost small demo-link" onClick={runDemo}>Try demo (no photo)</button>
              {error && (
                <div className="error-box" role="alert">
                  <span className="error-mark" aria-hidden>⚠</span>
                  <div>
                    {error}
                    <div className="error-hint">Tip: use the zoom bar above and drag until your face fills the dashed oval, then hit Analyze again — the crop is exactly what the AI receives.</div>
                  </div>
                  <button className="error-x" onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
                </div>
              )}
            </div>
          </section>
        )}

        {phase === 'analyzing' && (
          <section className="analyzing">
            <h2 className="sr-only">Analyzing your photo</h2>

            {/* Framed photo with a warm-sienna progress arc (indeterminate-but-alive) */}
            <div className="ring-progress">
              <svg viewBox="0 0 170 170" className="ring-progress-svg" aria-hidden>
                <circle cx="85" cy="85" r="79" fill="none" stroke="var(--ios-fill)" strokeWidth="5" />
                <circle cx="85" cy="85" r="79" fill="none" stroke="var(--primary)" strokeWidth="5"
                  strokeLinecap="round" strokeDasharray="372 124" className="ring-progress-arc" />
              </svg>
              <div className="ring-progress-center">
                {imgUrl && dims
                  ? <CropView url={imgUrl} dims={dims} zoom={zoom} pan={pan} frame={138} round />
                  : imgUrl
                    ? <img src={imgUrl} alt="selfie" className="ring-face" />
                    : <svg viewBox="0 0 100 100" className="ring-face-demo" aria-hidden>
                        <circle cx="50" cy="50" r="50" className="rfd-bg" />
                        <g className="rfd-lines" fill="none" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M50 22c13 0 20 9 20 23 0 16-9 27-20 27S30 61 30 45c0-14 7-23 20-23z" />
                          <path d="M40 44c2-2 5-2 7 0M53 44c2-2 5-2 7 0" />
                          <path d="M50 47v7h-3" />
                          <path d="M44 60c4 3 8 3 12 0" />
                        </g>
                      </svg>}
              </div>
            </div>

            {/* The DNA → face → scan line-art loop, in its own white card */}
            <div className="loader-card">
              <img className="loader-gif" src={`${import.meta.env.BASE_URL}loader-dna.gif`} alt="" aria-hidden />
            </div>

            {/* Staged checklist — driven by the real pipeline, not a fake timer */}
            <ul className="stage-checklist" aria-label="Analysis progress">
              {AN_STAGES.map((label, i) => (
                <li key={label} className={i < stageIdx ? 'done' : i === stageIdx ? 'live' : i === stageIdx + 1 ? 'queued' : 'later'}>
                  {i < stageIdx
                    ? <svg className="stage-ico" viewBox="0 0 16 16" aria-hidden><path d="M3 8.6l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    : <span className={`stage-ico dot${i === stageIdx ? ' pulse' : ''}`} aria-hidden />}
                  <span>{label}{i === stageIdx ? '…' : ''}</span>
                </li>
              ))}
            </ul>

            <p className="an-timer">{formatClock(elapsed)}</p>
            <p className="an-stage-detail">{stageMsg || 'Warming up…'}</p>
            <p className="an-note">
              {hasKey()
                ? 'Your privacy is paramount. Photos are processed securely — no artificial delays, no misleading progress bars. Failed reads are free and retried automatically.'
                : 'Demo analysis — add a YouCam API key for real AI results. No artificial delays, no misleading progress bars.'}
            </p>
          </section>
        )}

        {phase === 'results' && result && routine && (
          <section className="results animate-rise">
            {/* Header */}
            <div className="results-head">
              <div>
                <div className="provider-row">
                  <span className={`provider-badge ${result.provider === 'youcam' ? 'youcam' : 'demo'}`}>
                    {result.provider === 'youcam' ? '✨ Real YouCam AI' : '🎬 Demo'} · {Math.round(result.tookMs / 1000)}s
                  </span>
                </div>
                <h1 className="results-title">Your skin report</h1>
              </div>
              <div className="head-actions">
                <button className="btn-ghost small" onClick={async () => {
                  const text = `My Glow skin report: ${result.overall ?? '—'}/100 · skin age ${result.skinAge ?? '—'} · Fitzpatrick ${result.fitzpatrick ?? '—'} · top concern ${worst ? CONCERN_LABELS[worst[0]] : '—'} ✨`;
                  try {
                    if (navigator.share) await navigator.share({ title: 'Glow — my skin report', text });
                    else { await navigator.clipboard.writeText(text); alert('Copied!'); }
                  } catch {}
                }}>📤 Share</button>
                <button className="btn-primary small" onClick={() => setShareOpen(true)}>🃏 Verdict card</button>
                <button className="btn-ghost small" onClick={reset}>+ New scan</button>
              </div>
            </div>

            {result.warnings && result.warnings.length > 0 && (
              <div className="warnings-note">ℹ️ {result.warnings.join(' · ')}</div>
            )}

            {/* Summary row — 4 glass cards */}
            <div className="summary">
              <div className="glass-card sum-card">
                <span className="sum-label">Score</span>
                <div className="ring-wrap">
                  <svg viewBox="0 0 100 100" className="ring-svg">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="var(--ios-fill)" strokeWidth="7" />
                    <circle cx="50" cy="50" r="45" fill="none" stroke={scoreColor(result.overall ?? 0)} strokeWidth="7" strokeLinecap="round"
                      strokeDasharray="283" strokeDashoffset={283 * (1 - (result.overall ?? 0) / 100)} transform="rotate(-90 50 50)"
                      style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }} />
                  </svg>
                  <span className="ring-num">{fmt(result.overall)}</span>
                </div>
              </div>
              <div className="glass-card sum-card">
                <span className="sum-label">Skin Age</span>
                <span className="sum-big">{fmt(result.skinAge)}</span>
                <span className="sum-foot">years</span>
              </div>
              <div className="glass-card sum-card">
                <span className="sum-label">Fitzpatrick</span>
                <div className="fitz-circle">{result.fitzpatrick ?? '—'}</div>
                <span className="sum-foot">{result.fitzpatrick ? FITZ_INFO[result.fitzpatrick] : ''}</span>
              </div>
              <div className="glass-card sum-card">
                <span className="sum-label">Tone</span>
                <div className="tone-dot" style={{ background: result.tone ?? '#ccc' }} />
                <span className="sum-mono">{result.tone ?? '—'}</span>
              </div>
            </div>

            {/* Segmented control (desktop) */}
            <div className="tabs">
              {(['report', 'routine', 'progress'] as const).map((t) => (
                <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
                  {t === 'report' ? '📋 Report' : t === 'routine' ? '🧴 Routine' : '📈 Progress'}
                </button>
              ))}
            </div>

            {tab === 'report' && (
              <div className="report-layout">
                {/* Left: face map — the user's real selfie + detection mask overlay */}
                <div className="face-panel glass-card">
                  {imgUrl ? (
                    <div className="face-wrap">
                      <img src={imgUrl} alt="your face map" className="face-img" />
                      {activeMask && <img src={activeMask} alt="detection mask" className="mask-overlay" />}
                    </div>
                  ) : (
                    <div className="face-wrap demo">
                      <DemoFaceArt active={activeConcern} />
                      <span className="demo-chip">demo sample</span>
                    </div>
                  )}
                  <div className="face-hint">
                    <span className="material">👆</span> {activeConcern
                      ? `${CONCERN_LABELS[activeConcern] ?? activeConcern} ${imgUrl ? 'mask' : 'region'}`
                      : imgUrl ? 'Tap a concern to view its mask' : 'Tap a concern to see its region'}
                  </div>
                </div>

                {/* Right: concern tiles */}
                <div className="tiles-wrap">
                  <div className="tiles-grid">
                    {Object.entries(result.scores).map(([k, s]) => (
                      <div key={k} className={`glass-card tile ${activeConcern === k ? 'active' : ''}`}
                        onClick={() => {
                          const m = result.masks[k]?.[0];
                          if (m) { setActiveConcern(k); setActiveMask(activeMask === m ? null : m); }
                          else { setActiveConcern(activeConcern === k ? null : k); setActiveMask(null); }
                        }}>
                        <div className="tile-top"><span>{CONCERN_LABELS[k] ?? k}</span><b style={{ color: scoreColor(s) }}>{Math.round(s)}</b></div>
                        <div className="bar"><div style={{ width: `${s}%`, background: scoreBarColor(s) }} /></div>
                        {variance?.metrics[k] && (
                          <small className={`verdict-tag v-${variance.metrics[k].verdict}`}>
                            ±{variance.metrics[k].spread} · {VERDICT_LABEL[variance.metrics[k].verdict]}
                          </small>
                        )}
                        {result.masks[k]?.length ? <small className="mask-hint">tap to see mask</small> : null}
                      </div>
                    ))}
                  </div>

                  <div className="glass-card uncertainty-card">
                    <div className="tips-head"><span className="tips-icon">📏</span><b>Verdict — can you trust these numbers?</b></div>
                    {variance ? (
                      <>
                        <p className="unc-summary">{variance.summary}</p>
                        <div className="unc-chips">
                          <span className="unc-chip good">✓ trustworthy</span>
                          <span className="unc-chip warn">~ borderline</span>
                          <span className="unc-chip bad">✗ noise</span>
                          <span className="unc-chip bad">■ saturated</span>
                        </div>
                      </>
                    ) : (
                      <p className="unc-summary">One scan is a number. Re-capturing your face reveals which numbers survive — and which are noise. Run the check to see your error bars.</p>
                    )}
                    <button className="btn-ghost small" disabled={checking} onClick={deepCheck}>
                      {checking ? 'Re-scanning…' : variance ? '↻ Re-run check (3× scan)' : '📏 Run uncertainty check (3× scan)'}
                    </button>
                    {variance?.generated && <small className="gen-note">Simulated variance (demo mode) — labeled GENERATED, like a good measurement tool should.</small>}
                  </div>

                  {signature && (
                    <div className="glass-card signature-card" onClick={() => setShareOpen(true)}>
                      <div className="sig-left">
                        <span className="sig-emoji">🃏</span>
                        <div>
                          <b>{signature.persona}</b>
                          <span className="sig-trait">{signature.trait}</span>
                          <span className="sig-line">“{signature.line}”</span>
                        </div>
                      </div>
                      <span className="sig-talent">Talent: {signature.talent} · {signature.talentScore}</span>
                      <span className="sig-hint">tap for share card →</span>
                    </div>
                  )}

                  <div className="glass-card tips-card">
                    <div className="tips-head"><span className="tips-icon">💡</span><b>Glow-up Focus</b></div>
                    {tips.length > 0
                      ? <ul>{tips.map((t) => <li key={t}>{t}</li>)}</ul>
                      : <p>You're in great shape — keep the routine up.</p>}
                  </div>

                  {season && (
                    <div className="glass-card season-card"><b>🎨 Your color season:</b> {season}</div>
                  )}

                  <div className="glass-card canons-card">
                    <div className="tips-head"><span className="tips-icon">⚖️</span><b>Whose ideal? (beauty canons are contested)</b></div>
                    {CANONS.map((c) => (
                      <div key={c.name} className="canon">
                        <b>{c.name}</b> <span className={`canon-kind k-${c.kind}`}>{c.kind}</span>
                        <p>{c.claim}</p>
                        <small>{c.citation}</small>
                      </div>
                    ))}
                  </div>

                  {Object.keys(result.colors).length > 0 && (
                    <div className="colors">
                      {Object.entries(result.colors).map(([k, v]) => (
                        <span key={k} className="color-chip"><i style={{ background: v }} />{k}: {v}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'routine' && (
              <div className="glass-card routine">
                <p className="muted">Built from your scores — higher concern = prioritized step.</p>
                {routine.focus.length > 0 && <div className="focus"><b>Focus areas:</b> {routine.focus.join(' · ')}</div>}
                <div className="routine-cols">
                  <div className="routine-col"><h3>☀️ Morning</h3><ul>{routine.am.map((s) => <li key={s}>{s}</li>)}</ul></div>
                  <div className="routine-col"><h3>🌙 Night</h3><ul>{routine.pm.map((s) => <li key={s}>{s}</li>)}</ul></div>
                </div>
                {routine.weekly.length > 0 && <div className="routine-weekly"><b>🗓 Weekly:</b> {routine.weekly.join(' · ')}</div>}
                <div className="disclaimer">Routine is educational, generated by rules from your scores — not medical advice.</div>
              </div>
            )}

            {tab === 'progress' && (
              <div className="progress-wrap">
                {realHist.length >= 2 && (() => {
                  const seq = [...realHist].reverse();                    // oldest → newest
                  const vals = seq.map((h) => h.overall ?? 0);
                  const lo = Math.min(...vals), hi = Math.max(...vals);
                  const pad = Math.max(4, Math.round((hi - lo) * 0.35));
                  const loP = Math.max(0, lo - pad), hiP = Math.min(100, hi + pad);
                  // Normalised scale so 83 vs 85 is visible instead of 3 identical slabs
                  const hPct = (v: number) => (hiP === loP ? 60 : 20 + ((v - loP) / (hiP - loP)) * 80);
                  const delta = vals[vals.length - 1] - vals[vals.length - 2];
                  return (
                    <div className="glass-card trend">
                      <div className="trend-head">
                        <b>Trend — real scans only</b>
                        <span className={`delta-chip ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}`}>
                          {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '— 0'} vs last real scan
                        </span>
                      </div>
                      <div className="trend-bars">
                        {seq.map((h) => (
                          <div key={h.id} className="trend-col">
                            <span className="trend-val">{fmt(h.overall)}</span>
                            <span className="trend-bar" style={{ height: `${hPct(h.overall ?? 0)}%` }} />
                            <span className="trend-date">{new Date(h.ts).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                          </div>
                        ))}
                      </div>
                      <p className="trend-note">Scans vary a few points with light and angle — treat small changes as noise, not progress.</p>
                    </div>
                  );
                })()}
                {realHist.length < 2 && (
                  <div className="glass-card progress">
                    <b>No trend yet.</b> Progress appears after 2 real scans — we never chart demo data or estimate changes.
                  </div>
                )}
                {prev && result.provider !== 'demo' && result.overall !== null && prev.overall !== null && (
                  <div className="glass-card progress">
                    <b>Since your last real scan:</b> {fmt(prev.overall)} → {fmt(result.overall)}
                    <span className="muted"> · a few points either way is noise — real change takes weeks</span>
                  </div>
                )}
                <div className="history-list">
                  {history.length === 0 && <p className="muted center">No scans yet.</p>}
                  {history.map((h, i) => (
                    <div key={h.id} className="glass-card hist-item">
                      <span className="hist-date">{new Date(h.ts).toLocaleDateString()} {new Date(h.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="hist-score" style={{ color: scoreColor(h.overall ?? 0) }}>{fmt(h.overall)}</span>
                      <span className="hist-meta">age {fmt(h.skinAge)} · type {h.fitzpatrick ?? '—'}</span>
                      {h.provider === 'demo' && <span className="hist-demo">demo</span>}
                      {i === 0 && <span className="badge-new">latest</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Mobile bottom nav */}
      {phase === 'results' && (
        <nav className="bottom-nav">
          {(['report', 'routine', 'progress'] as const).map((t) => (
            <button key={t} className={`bn-item ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              <span className="bn-icon">{t === 'report' ? '📋' : t === 'routine' ? '🧴' : '📈'}</span>
              <span className="bn-label">{t === 'report' ? 'Report' : t === 'routine' ? 'Routine' : 'Progress'}</span>
            </button>
          ))}
        </nav>
      )}

      {shareOpen && signature && result && (
        <div className="modal-backdrop" onClick={() => setShareOpen(false)}>
          <div className="share-card glass-card" onClick={(e) => e.stopPropagation()}>
            <button className="share-close" onClick={() => setShareOpen(false)}>✕</button>
            <div className="share-brand">✨ Glow</div>
            <div className="share-score">{fmt(result.overall)}<span>/100</span></div>
            <div className="share-sig">🃏 {signature.persona}</div>
            <div className="share-line">“{signature.line}”</div>
            <div className="share-meta">
              <span>age {fmt(result.skinAge)}</span>·<span>type {result.fitzpatrick ?? '—'}</span>·<span>{result.tone ?? '—'}</span>
            </div>
            <div className="share-verdicts">
              {variance && Object.entries(variance.metrics).slice(0, 3).map(([k, m]) => (
                <span key={k} className={`verdict-tag v-${m.verdict}`}>{CONCERN_LABELS[k] ?? k}: {m.score}±{m.spread}</span>
              ))}
            </div>
            <div className="share-cta">
              <button className="btn-primary small" onClick={async () => {
                const text = `My Glow Verdict: ${result.overall}/100 · ${signature.persona} · ${Object.entries(variance?.metrics ?? {}).filter(([,m])=>m.verdict==='trustworthy').length ?? 0}/${Object.keys(variance?.metrics ?? {}).length ?? 0} metrics trustworthy ✨`;
                try {
                  if (navigator.share) await navigator.share({ title: 'Glow Verdict', text });
                  else { await navigator.clipboard.writeText(text); alert('Copied!'); }
                } catch {}
              }}>📤 Share</button>
              <button className="btn-ghost small" onClick={() => setShareOpen(false)}>Close</button>
            </div>
            <div className="share-foot">Get your Glow verdict · glow-skin.app</div>
          </div>
        </div>
      )}

      <footer className="footer">Glow · AI Skin Intelligence · powered by YouCam · built for the YouCam API Hackathon<br /><span className="build-badge">v{BUILD_VERSION} · build {BUILD_DATE}</span></footer>
    </div>
  );
}

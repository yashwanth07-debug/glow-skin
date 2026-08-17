import { useCallback, useEffect, useRef, useState } from 'react';
import { fullScan, hasKey, type ScanResult } from './lib/youcam';
import { demoScan } from './lib/demo';
import { buildVariance, skinSignature, CANONS, VERDICT_LABEL, type VarianceReport, type Signature } from './lib/verdict';
import { generateRoutine, seasonFromColors, beautyTips, type Routine } from './lib/routine';
import { loadHistory, saveHistory, toEntry, type HistoryEntry } from './lib/store';
import { BUILD_VERSION, BUILD_DATE } from './version';

type Phase = 'landing' | 'upload' | 'analyzing' | 'results';

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => { setHistory(loadHistory()); }, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setImgBlob(f);
    setImgUrl(URL.createObjectURL(f));
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
    setBusy(true); setError(null);
    try {
      applyResult(hasKey() ? await fullScan(imgBlob) : demoScan());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('landing');
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgBlob, busy]);

  useEffect(() => {
    if (phase === 'analyzing' && imgBlob) void analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, imgBlob]);

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

  const reset = () => { setPhase('landing'); setResult(null); setImgUrl(null); setImgBlob(null); setError(null); setActiveMask(null); setActiveConcern(null); setVariance(null); setSignature(null); };

  const prev = history[1];
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
              <p className="upload-sub">Upload a clear, front-facing selfie for accurate analysis.</p>
              <div
                className="dropzone"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
              >
                <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                {imgUrl ? (
                  <img src={imgUrl} alt="selfie preview" className="dz-preview" />
                ) : (
                  <div className="dz-prompt">
                    <span className="dz-icon">📷</span>
                    <span className="dz-label">Tap to choose</span>
                    <span className="dz-hint">JPEG or PNG · face in frame</span>
                  </div>
                )}
              </div>
              <button className="btn-primary analyze-btn" disabled={!imgBlob} onClick={() => setPhase('analyzing')}>
                Analyze Skin
              </button>
              <button className="btn-ghost small demo-link" onClick={runDemo}>Try demo (no photo)</button>
              {error && <div className="error">⚠ {error}</div>}
            </div>
          </section>
        )}

        {phase === 'analyzing' && (
          <section className="analyzing">
            <div className="analyzing-card glass-card">
              <div className="ring-progress">
                <svg viewBox="0 0 120 120" className="ring-progress-svg">
                  <circle cx="60" cy="60" r="54" fill="none" stroke="var(--ios-fill)" strokeWidth="4" />
                  <circle cx="60" cy="60" r="54" fill="none" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray="339.292" strokeDashoffset="339.292" className="ring-progress-arc" />
                </svg>
                <div className="ring-progress-center">
                  {imgUrl ? <img src={imgUrl} alt="selfie" className="ring-face" /> : <span className="ring-face-emoji">🧬</span>}
                </div>
              </div>
              <h2 className="analyzing-title">Reading your skin…</h2>
              <div className="step-list">
                <div className="step">✓ Skin analysis — 14 concerns</div>
                <div className="step">✓ Skin tone &amp; colors</div>
                <div className="step">✓ Fitzpatrick type</div>
              </div>
              <p className="muted">{hasKey() ? 'Real YouCam AI analysis' : 'Demo analysis — add a YouCam key for real results'}</p>
            </div>
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
                  <span className="ring-num">{result.overall ?? '—'}</span>
                </div>
              </div>
              <div className="glass-card sum-card">
                <span className="sum-label">Skin Age</span>
                <span className="sum-big">{result.skinAge ?? '—'}</span>
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
                    <div className="face-empty">📸<br />Your selfie<br /><small>(demo)</small></div>
                  )}
                  <div className="face-hint">
                    <span className="material">👆</span> {activeConcern ? `${CONCERN_LABELS[activeConcern] ?? activeConcern} mask` : 'Tap a concern to view its mask'}
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
                {history.length >= 2 && (
                  <div className="glass-card spark">
                    <b>Trend</b>
                    <div className="spark-bars">
                      {[...history].reverse().map((h) => (
                        <span key={h.id} style={{ height: `${h.overall ?? 0}%` }} title={`${h.overall}`} />
                      ))}
                    </div>
                    <small>{history[0].overall} → {history[history.length - 1].overall}</small>
                  </div>
                )}
                {prev && result.overall !== null && prev.overall !== null && (
                  <div className="glass-card progress">
                    <b>Progress:</b> {prev.overall} → {result.overall}
                    <span style={{ color: result.overall >= prev.overall ? '#34c759' : '#ff3b30' }}>
                      {result.overall >= prev.overall ? ' ▲ improving' : ' ▼ (retinol takes weeks — keep going)'}
                    </span>
                  </div>
                )}
                <div className="history-list">
                  {history.length === 0 && <p className="muted center">No scans yet.</p>}
                  {history.map((h, i) => (
                    <div key={h.id} className="glass-card hist-item">
                      <span className="hist-date">{new Date(h.ts).toLocaleDateString()} {new Date(h.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="hist-score" style={{ color: scoreColor(h.overall ?? 0) }}>{h.overall ?? '—'}</span>
                      <span className="hist-meta">age {h.skinAge ?? '—'} · type {h.fitzpatrick ?? '—'}</span>
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
            <div className="share-score">{result.overall ?? '—'}<span>/100</span></div>
            <div className="share-sig">🃏 {signature.persona}</div>
            <div className="share-line">“{signature.line}”</div>
            <div className="share-meta">
              <span>age {result.skinAge ?? '—'}</span>·<span>type {result.fitzpatrick ?? '—'}</span>·<span>{result.tone ?? '—'}</span>
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

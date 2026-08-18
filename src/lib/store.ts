// ---------------------------------------------------------------------------
// Glow — history store (localStorage, MVP "database" — see DATABASE.md).
// ---------------------------------------------------------------------------

import type { ScanResult } from './youcam';

export interface HistoryEntry {
  id: string;
  ts: number;
  overall: number | null;
  skinAge: number | null;
  fitzpatrick: string | null;
  tone: string | null;
  scores: Record<string, number>;
  masks: Record<string, string[]>;
  colors: Record<string, string>;
  /** Where the numbers came from. Demo scans are shown in the list but never
      charted in Progress — charting sample data would be fake progress.
      (Absent on entries saved before this field existed → treated as real.) */
  provider?: 'youcam' | 'demo';
}

/** Only real YouCam scans count as progress — demo entries are illustrative. */
export function realScans(entries: HistoryEntry[]): HistoryEntry[] {
  return entries.filter((e) => e.provider !== 'demo');
}

const KEY = 'glow:history:v1';
const MAX = 20;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    /* storage full/blocked — ignore */
  }
}

export function toEntry(r: ScanResult): HistoryEntry {
  return {
    id: 'scan_' + Date.now(),
    ts: Date.now(),
    overall: r.overall === null ? null : Math.round(r.overall),
    skinAge: r.skinAge === null ? null : Math.round(r.skinAge),
    fitzpatrick: r.fitzpatrick,
    tone: r.tone,
    scores: r.scores,
    masks: r.masks,
    colors: r.colors,
    provider: r.provider,
  };
}

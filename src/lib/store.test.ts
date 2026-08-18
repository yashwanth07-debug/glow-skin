import { describe, expect, it } from 'vitest';
import { realScans, type HistoryEntry } from './store';

const base: HistoryEntry = {
  id: 'scan_1', ts: 1, overall: 80, skinAge: 30, fitzpatrick: 'IV', tone: '#A9815F',
  scores: {}, masks: {}, colors: {},
};

describe('realScans', () => {
  it('filters demo entries out of the progress data', () => {
    const list: HistoryEntry[] = [
      { ...base, id: 'a', provider: 'youcam' },
      { ...base, id: 'b', provider: 'demo' },
      { ...base, id: 'c' }, // legacy entry without provider — treated as real
    ];
    const ids = realScans(list).map((e) => e.id);
    expect(ids).toEqual(['a', 'c']);
  });

  it('returns everything when nothing is demo', () => {
    const list: HistoryEntry[] = [{ ...base, provider: 'youcam' }, { ...base, provider: 'youcam' }];
    expect(realScans(list)).toHaveLength(2);
  });
});

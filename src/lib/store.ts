// App state: progress, attempts, statistics and settings. Persisted in IndexedDB.
import { useEffect, useState, useSyncExternalStore } from 'react';
import * as db from './db';
import type { Assessment, EngineId } from '../assess/types';

export type StageId = 'learn' | 'words' | 'listen' | 'say' | 'sentences' | 'test';
export const STAGES: { id: StageId; label: string }[] = [
  { id: 'learn', label: 'Learn' }, { id: 'words', label: 'Words' }, { id: 'listen', label: 'Listen' },
  { id: 'say', label: 'Say' }, { id: 'sentences', label: 'Sentences' }, { id: 'test', label: 'Test' },
];

export interface ScorePoint { t: number; score: number; kind: 'listen' | 'word' | 'sentence' | 'test' | 'reading'; ref: string; engine?: EngineId }
export interface SoundProgress {
  stages: Partial<Record<StageId, boolean>>;
  listenBest?: number; listenLast?: number;
  testBest?: number; testLast?: number;
  mastered?: number; // timestamp
  words: Record<string, number>; // best word scores
  sentences: Record<string, number>;
}
export interface ReadingAttempt {
  story: string; t: number; scope: string; engine: EngineId; overall: number;
  metrics: Record<string, number | null>; durationSec: number; words: number; problems: string[];
}
export interface PhonemeStat { n: number; sum: number; conf: Record<string, number> }
/** 'auto' picks the best checker available: Azure when connected, otherwise the browser's recognizer or the on-device model */
export type EnginePref = 'auto' | EngineId;
export interface Settings { engine: EnginePref; azureEndpoint: string; slowReading: boolean; hvpt: boolean; v?: number }

interface State {
  ready: boolean;
  sounds: Record<string, SoundProgress>;
  reading: ReadingAttempt[];
  points: ScorePoint[];
  phonemes: Record<string, PhonemeStat>;
  patterns: Record<string, number>;
  activity: Record<string, number>; // yyyy-mm-dd -> seconds
  settings: Settings;
}

const DEFAULT_SETTINGS: Settings = { engine: 'auto', azureEndpoint: '', slowReading: false, hvpt: true };
let state: State = { ready: false, sounds: {}, reading: [], points: [], phonemes: {}, patterns: {}, activity: {}, settings: DEFAULT_SETTINGS };
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const KEYS = ['sounds', 'reading', 'points', 'phonemes', 'patterns', 'activity', 'settings'] as const;

export async function init() {
  const vals = await Promise.all(KEYS.map(k => db.get<unknown>(k)));
  const next = { ...state } as State;
  KEYS.forEach((k, i) => { if (vals[i] !== undefined) (next as unknown as Record<string, unknown>)[k] = vals[i]; });
  next.settings = { ...DEFAULT_SETTINGS, ...next.settings };
  // version 1 stored 'browser' as the default engine and a playback rate; both are replaced
  const old = next.settings as Settings & { rate?: number; v?: number };
  if (!old.v) { if (old.engine === 'browser') old.engine = 'auto'; delete old.rate; old.v = 2; }
  next.ready = true;
  state = next; emit();
  db.persist();
}

function update<K extends typeof KEYS[number]>(k: K, v: State[K]) {
  state = { ...state, [k]: v }; emit();
  db.set(k, v);
}

export function getState() { return state; }
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, () => sel(state));
}

// ---------- sounds ----------
const EMPTY: SoundProgress = Object.freeze({ stages: Object.freeze({}), words: Object.freeze({}), sentences: Object.freeze({}) }) as SoundProgress;
export function soundProgress(id: string): SoundProgress {
  return state.sounds[id] || EMPTY;
}
function setSound(id: string, fn: (p: SoundProgress) => SoundProgress) {
  const cur = soundProgress(id);
  update('sounds', { ...state.sounds, [id]: fn({ ...cur, stages: { ...cur.stages }, words: { ...cur.words }, sentences: { ...cur.sentences } }) });
}
export function completeStage(id: string, stage: StageId) {
  if (soundProgress(id).stages[stage]) return;
  setSound(id, p => ({ ...p, stages: { ...p.stages, [stage]: true } }));
}
export function recordListen(id: string, score: number) {
  setSound(id, p => ({ ...p, listenLast: score, listenBest: Math.max(p.listenBest || 0, score) }));
  addPoint({ t: Date.now(), score, kind: 'listen', ref: id });
}
export function recordWordScore(id: string, word: string, score: number, engine: EngineId) {
  setSound(id, p => ({ ...p, words: { ...p.words, [word]: Math.max(p.words[word] || 0, score) } }));
  addPoint({ t: Date.now(), score, kind: 'word', ref: id, engine });
}
export function recordSentenceScore(id: string, idx: number, score: number, engine: EngineId) {
  setSound(id, p => ({ ...p, sentences: { ...p.sentences, [idx]: Math.max(p.sentences[idx] || 0, score) } }));
  addPoint({ t: Date.now(), score, kind: 'sentence', ref: id, engine });
}
/** Returns true if this result newly masters the sound. */
export function recordTest(id: string, score: number, passed: boolean, engine: EngineId): boolean {
  const before = soundProgress(id).mastered;
  setSound(id, p => ({
    ...p, testLast: score, testBest: Math.max(p.testBest || 0, score),
    stages: passed ? { ...p.stages, test: true } : p.stages,
    mastered: p.mastered || (passed ? Date.now() : undefined),
  }));
  addPoint({ t: Date.now(), score, kind: 'test', ref: id, engine });
  return passed && !before;
}

// ---------- reading ----------
export function recordReading(a: ReadingAttempt) {
  update('reading', [...state.reading, a].slice(-500));
  addPoint({ t: a.t, score: a.overall, kind: 'reading', ref: a.story, engine: a.engine });
}

function addPoint(p: ScorePoint) { update('points', [...state.points, p].slice(-3000)); }

// ---------- detailed statistics from an assessment ----------
const FINALS = new Set(['s', 'z', 't', 'd']);
export function learnFrom(a: Assessment) {
  if (a.engine === 'azure') {
    const ph = { ...state.phonemes };
    const pat = { ...state.patterns };
    const bump = (k: string) => { pat[k] = (pat[k] || 0) + 1; };
    for (const w of a.words) {
      if (!w.phonemes) continue;
      w.phonemes.forEach((p, i) => {
        const s = ph[p.p] ? { ...ph[p.p], conf: { ...ph[p.p].conf } } : { n: 0, sum: 0, conf: {} };
        s.n++; s.sum += p.score;
        if (p.heardAs && p.heardAs !== p.p && p.score < 70) s.conf[p.heardAs] = (s.conf[p.heardAs] || 0) + 1;
        ph[p.p] = s;
        if (i === w.phonemes!.length - 1 && FINALS.has(p.p)) {
          bump('final:n'); if (p.score < 60) bump('final:weak');
          if (p.p === 's' || p.p === 'z') { bump('finals:n'); if (p.score < 50) bump('finals:drop'); }
        }
      });
    }
    update('phonemes', ph);
    update('patterns', pat);
  } else {
    const pat = { ...state.patterns };
    for (const w of a.words) {
      pat['words:n'] = (pat['words:n'] || 0) + 1;
      if (w.status !== 'good') {
        pat['words:miss'] = (pat['words:miss'] || 0) + 1;
        // recognized as the same word minus a final s: a likely dropped ending
        if (w.heard && w.ref.endsWith('s') && w.heard === w.ref.slice(0, -1)) pat['finals:drop'] = (pat['finals:drop'] || 0) + 1;
        if (w.heard && w.ref.endsWith('ed') && (w.heard === w.ref.slice(0, -2) || w.heard === w.ref.slice(0, -1))) pat['ed:drop'] = (pat['ed:drop'] || 0) + 1;
      }
      if (w.ref.endsWith('s')) pat['finals:n'] = (pat['finals:n'] || 0) + 1;
      if (w.ref.endsWith('ed')) pat['ed:n'] = (pat['ed:n'] || 0) + 1;
    }
    update('patterns', pat);
  }
}

// ---------- activity time ----------
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let lastTick = 0;
export function useActivityClock() {
  useEffect(() => {
    lastTick = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && state.ready && now - lastTick < 90_000) {
        const k = today();
        update('activity', { ...state.activity, [k]: (state.activity[k] || 0) + Math.round((now - lastTick) / 1000) });
      }
      lastTick = now;
    }, 30_000);
    const vis = () => { lastTick = Date.now(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, []);
}
/** mark that the learner interacted, so idle tabs do not count as study time */
export function touch() { if (Date.now() - lastTick > 90_000) lastTick = Date.now(); }

// ---------- settings ----------
export function setSettings(p: Partial<Settings>) { update('settings', { ...state.settings, ...p }); }

export async function resetAll() {
  await db.clearAll();
  state = { ...state, sounds: {}, reading: [], points: [], phonemes: {}, patterns: {}, activity: {}, settings: state.settings };
  emit();
  db.set('settings', state.settings);
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data?: T; error?: string } {
  const [st, setSt] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    let alive = true;
    setSt({});
    fn().then(d => alive && setSt({ data: d }), e => alive && setSt({ error: String(e?.message || e) }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return st;
}

export const dayKey = today;

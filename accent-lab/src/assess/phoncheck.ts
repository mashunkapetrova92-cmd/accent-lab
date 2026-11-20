// Free sound-by-sound check for sentences: the on-device sound recognizer's output is aligned with the
// sounds each word should have. Sounds marked "!" in the data are ones the recognizer misses even in the
// model voice's own recordings, so they are never counted against the learner.
// Measured on lesson sentences: native voices get 1–3% of sounds flagged, Russian-accented voices about 45%.
import { phonemes, phonStatus } from './phon';
import { getState } from '../lib/store';
import type { Assessment, Metric, PhonemeResult, StartOptions, WordResult } from './types';
import { isVowel } from './azure';

/** recognizer symbols → the app's notation (the one Azure results and the lessons use) */
const APP: Record<string, string> = { 'ɹ': 'r', 't͡ʃ': 'tʃ', 'd͡ʒ': 'dʒ', 'g': 'ɡ' };
const app = (p: string) => APP[p] ?? p;
const WEAK = new Set(['ə', 'ɪ']); // reduced vowels vary a lot even in native speech

/** for each expected sound: null when heard, '' when missing, otherwise the sound heard instead */
export function alignSounds(exp: string[], got: string[]): (string | null)[] {
  const n = exp.length, m = got.length;
  const D: number[][] = Array.from({ length: n + 1 }, (_, i) => { const r = new Array(m + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (exp[i - 1] === got[j - 1] ? 0 : 1));
  const out: (string | null)[] = new Array(n).fill(null);
  let i = n, j = m;
  while (i > 0) {
    if (j > 0 && D[i][j] === D[i - 1][j - 1] + (exp[i - 1] === got[j - 1] ? 0 : 1)) { out[i - 1] = exp[i - 1] === got[j - 1] ? null : got[j - 1]; i--; j--; }
    else if (D[i][j] === D[i - 1][j] + 1) { out[i - 1] = ''; i--; }
    else j--;
  }
  return out;
}

/** score per sound: heard 100; a missing sound or a different reduced vowel 65; another sound 30 */
export function scoreSounds(phones: string[], got: string[]): PhonemeResult[][] {
  const words = phones.map(w => w.split(' ').filter(Boolean));
  const flat = words.flat(); const clean = flat.map(p => p.replace(/^!/, ''));
  const a = alignSounds(clean, got);
  const out: PhonemeResult[][] = []; let k = 0;
  for (const w of words) {
    const res: PhonemeResult[] = [];
    for (let j = 0; j < w.length; j++, k++) {
      if (flat[k].startsWith('!')) continue; // unreliable even in the model voice
      const h = a[k], p = app(clean[k]);
      if (h === null) res.push({ p, score: 100 });
      else if (h === '' || (WEAK.has(clean[k]) && isVowel(app(h)))) res.push({ p, score: 65, heardAs: h ? app(h) : undefined });
      else res.push({ p, score: 30, heardAs: app(h) });
    }
    out.push(res);
  }
  return out;
}

export const soundCheckOn = () => getState().settings.soundCheck !== false;

/** Adds sound-by-sound results to a sentence assessment; leaves it unchanged if anything fails. */
/** Starts the sound recognizer early (it runs in its own worker, next to the word recognizer). */
export function startSoundCheck(o: StartOptions, audio16k: Float32Array): Promise<{ ph: string[] }> | null {
  if (!o.phones || o.phones.length !== o.refKeys.length || !soundCheckOn() || phonStatus() === 'error') return null;
  const p = phonemes(audio16k); p.catch(() => {}); return p;
}

export async function addSoundCheck(r: Assessment, o: StartOptions, audio16k: Float32Array | Promise<{ ph: string[] }> | null): Promise<Assessment> {
  if (!o.phones || o.phones.length !== o.refKeys.length || !soundCheckOn() || phonStatus() === 'error') return r;
  let got: string[];
  if (!audio16k) return r;
  try { ({ ph: got } = await (audio16k instanceof Float32Array ? phonemes(audio16k) : audio16k)); } catch { return r; }
  const per = scoreSounds(o.phones, got);
  const words: WordResult[] = r.words.map((w, i) => {
    if (w.status === 'omitted' || !per[i]?.length) return w;
    const worst = Math.min(...per[i].map(p => p.score));
    // a recognized word with a wrong sound is no longer "good"
    const score = w.status === 'good' ? Math.min(100, Math.round(per[i].reduce((s, p) => s + p.score, 0) / per[i].length)) : w.score;
    const status = w.status !== 'good' ? w.status : worst < 60 ? 'poor' : worst < 80 ? 'fair' : 'good';
    return { ...w, phonemes: per[i], score, status, error: status === 'good' ? w.error : w.error || 'A sound differs' };
  });
  const all = words.flatMap(w => w.phonemes || []);
  const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  const note = 'On-device sound check (free): compares the sounds it heard with the expected ones.';
  const m: Record<string, Metric> = {
    phoneme: { key: 'phoneme', label: 'Phoneme accuracy', value: avg(all.map(p => p.score)), kind: 'measured', note },
    vowel: { key: 'vowel', label: 'Vowel accuracy', value: avg(all.filter(p => isVowel(p.p)).map(p => p.score)), kind: 'measured', note },
    consonant: { key: 'consonant', label: 'Consonant accuracy', value: avg(all.filter(p => !isVowel(p.p)).map(p => p.score)), kind: 'measured', note },
  };
  const metrics = r.metrics.map(x => m[x.key] && m[x.key].value !== null ? m[x.key] : x);
  const ok = words.filter(w => w.status === 'good').length;
  const overall = Math.round(words.reduce((s, w) => s + (w.status === 'omitted' ? 0 : w.score ?? 0), 0) / Math.max(1, words.length));
  return { ...r, words, metrics, overall: Math.min(overall, Math.round(ok / Math.max(1, words.length) * 100 + 15)), detail: { ...(r.detail || {}), heardSounds: got.join(' ') } };
}

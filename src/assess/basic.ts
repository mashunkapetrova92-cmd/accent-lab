// Results for the two recognizer-based engines (the browser's recognizer and the on-device model).
// Both know which words were understood; neither can score individual sounds, so those metrics are
// reported as not measured.
import { align, heardTokens, key, shownWord } from '../lib/text';
import { statusOf, type Assessment, type EngineId, type Metric, type StartOptions, type WordResult } from './types';

export const NOT_MEASURED = 'Needs Azure assessment (Settings).';

function soundMetrics(long: boolean): Metric[] {
  return [
    { key: 'phoneme', label: 'Phoneme accuracy', value: null, kind: 'unavailable', note: NOT_MEASURED },
    { key: 'vowel', label: 'Vowel accuracy', value: null, kind: 'unavailable', note: NOT_MEASURED },
    { key: 'consonant', label: 'Consonant accuracy', value: null, kind: 'unavailable', note: NOT_MEASURED },
    ...(long ? [
      { key: 'fluency', label: 'Fluency', value: null, kind: 'unavailable' as const, note: NOT_MEASURED },
      { key: 'prosody', label: 'Stress, rhythm, intonation', value: null, kind: 'unavailable' as const, note: NOT_MEASURED },
    ] : []),
  ];
}

/** Sentence or text: align the transcript with the reference words. */
export function transcriptAssessment(engine: EngineId, o: StartOptions, transcript: string, durationSec: number, audio?: Blob, speechSec?: number): Assessment {
  const H = heardTokens(transcript, o.refKeys);
  const res = align(o.refKeys, H.map(h => h.k));
  const words: WordResult[] = res.map((r, i) => ({
    idx: i, ref: o.refKeys[i], score: r.st === 'ok' ? 100 : 0,
    status: r.st === 'ok' ? 'good' : r.st === 'sub' ? 'poor' : 'omitted',
    heard: r.h >= 0 && r.st !== 'ok' ? shownWord(H[r.h].w) : undefined,
    error: r.st === 'ok' ? null : r.st === 'sub' ? 'Heard as another word' : 'Not heard',
  }));
  const ok = words.filter(w => w.status === 'good').length;
  const overall = Math.round(ok / Math.max(1, words.length) * 100);
  const secs = speechSec && speechSec > 1 ? speechSec : durationSec;
  const wpm = o.mode === 'word' ? null : Math.round(H.length / Math.max(secs, 1) * 60);
  const metrics: Metric[] = [
    { key: 'words', label: 'Word recognition', value: overall, kind: 'measured', note: 'Share of words the recognizer understood as the intended words.' },
    ...(wpm !== null ? [{ key: 'rate', label: 'Speaking rate', value: wpm, unit: 'wpm', kind: 'measured' as const, note: 'Words per minute, including pauses. Natural reading aloud is roughly 140–170.' }] : []),
    ...soundMetrics(o.mode !== 'word'),
  ];
  return { engine, overall, words, metrics, transcript, durationSec, audio };
}

// Letter names the recognizer writes instead of a word that sounds the same ("C" for "see").
const LETTER: Record<string, string> = { b: 'be', c: 'see', g: 'gee', i: 'eye', j: 'jay', k: 'kay', o: 'oh', p: 'pea', q: 'queue', r: 'are', t: 'tea', u: 'you', y: 'why', x: 'ex' };
const sound = (w: string) => { const t = w.toLowerCase().replace(/[^a-z' ]/g, '').trim(); return key(LETTER[t] || t); };

/** Single word checked by forced choice between the target and the words it is confused with. */
export function choiceAssessment(o: StartOptions, scores: Record<string, number>, heard: string, durationSec: number, audio?: Blob): Assessment {
  const target = o.refKeys[0];
  const entries = Object.entries(scores);
  const mx = Math.max(...entries.map(e => e[1]));
  const z = entries.reduce((s, [, v]) => s + Math.exp(v - mx), 0);
  // spellings that sound exactly like the target (see, sea, C) count as the target
  const same = (c: string) => sound(c) === sound(target);
  const p = entries.filter(([c]) => same(c)).reduce((s, [, v]) => s + Math.exp(v - mx), 0) / z;
  const best = entries.sort((a, b) => b[1] - a[1]).find(([c]) => !same(c))?.[0];
  // relative to the model recording: the recognizer is less sure of some words even when they are said perfectly
  const ref = Math.max(0.5, Math.min(1, (o.ref ?? 100) / 100));
  const score = Math.round(Math.min(1, p / ref) * 100);
  const other = best && score < 80 ? best : undefined;
  const w: WordResult = {
    idx: 0, ref: target, score, status: statusOf(score),
    heard: shownWord(other || (heard && !same(heard) ? heard : undefined)),
    error: score >= 80 ? null : other ? 'Closer to another word' : 'Unclear',
  };
  const alts = (o.alternatives || []).filter(a => a !== target);
  const metrics: Metric[] = [
    { key: 'words', label: 'Word recognition', value: score, kind: 'measured', note: alts.length ? `How clearly the recognizer heard “${target}” rather than ${alts.map(a => `“${a}”`).join(', ')}.` : `How clearly the recognizer heard “${target}”.` },
    ...soundMetrics(false),
  ];
  return { engine: 'local', overall: score, words: [w], metrics, transcript: shownWord(heard) || '', durationSec, audio, detail: { scores, heard, p, ref } };
}

/** A word the recognizer cannot confirm even in the model recording: keep the recording for comparison, no score. */
export function uncheckedAssessment(o: StartOptions, durationSec: number, audio?: Blob): Assessment {
  const metrics: Metric[] = [
    { key: 'words', label: 'Word recognition', value: null, kind: 'unavailable', note: 'The on-device recognizer cannot check this word reliably on its own. Compare your recording with the model.' },
    ...soundMetrics(false),
  ];
  return { engine: 'local', overall: 0, checked: false, words: [{ idx: 0, ref: o.refKeys[0], score: null, status: 'good', error: null }], metrics, transcript: '', durationSec, audio };
}

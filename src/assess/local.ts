// On-device engine: records with the app's own recorder and recognizes speech with a small Whisper model
// in the browser. Works in every current browser (including Firefox and apps opened from the iPhone Home
// Screen), keeps the learner's recording for playback and works offline once the model is saved.
import { choose, loadModel, transcribe } from './asr';
import { choiceAssessment, transcriptAssessment, uncheckedAssessment } from './basic';
import { hasSpeech, PcmRecorder, SR } from './pcm';
import { AssessError, type Assessment, type Engine, type Session, type StartOptions } from './types';

function speechBounds(x: Float32Array): [number, number] {
  const F = 320; let first = -1, last = -1, peak = 0;
  const rms: number[] = [];
  for (let i = 0; i + F <= x.length; i += F) { let s = 0; for (let k = 0; k < F; k++) s += x[i + k] * x[i + k]; const r = Math.sqrt(s / F); rms.push(r); if (r > peak) peak = r; }
  const th = Math.max(0.008, peak * 0.08);
  rms.forEach((r, i) => { if (r > th) { if (first < 0) first = i; last = i; } });
  if (first < 0) return [0, x.length];
  return [Math.max(0, (first - 12) * F), Math.min(x.length, (last + 15) * F)];
}

function modelError(e: unknown): AssessError {
  const m = String((e as Error)?.message || e);
  if (!navigator.onLine || /fetch|network|Failed to load|404/i.test(m)) return new AssessError('model', 'The speech model has to be downloaded once (about 100 MB). Connect to the internet and try again.');
  return new AssessError('model', 'The on-device speech model could not run in this browser: ' + m);
}

export const localEngine: Engine = {
  id: 'local',
  name: 'On-device recognition',
  async start(o: StartOptions): Promise<Session> {
    const rec = PcmRecorder.prepare(); // must happen before any await (user gesture)
    const ready = loadModel().catch(e => { throw modelError(e); });
    ready.catch(() => {});
    const segs: Promise<string>[] = [];
    const partial: string[] = [];
    const long = o.mode !== 'word';
    await rec.start({
      onLevel: o.onLevel,
      endSilence: o.mode === 'word' ? 0.8 : o.mode === 'sentence' ? 2.5 : 0,
      maxSeconds: o.mode === 'word' ? 6 : o.mode === 'sentence' ? 45 : 900,
      onAutoStop: () => o.onEnded?.(),
      onSegment: long ? (seg) => {
        const k = segs.length;
        const p = hasSpeech(seg) ? ready.then(() => transcribe(seg)) : Promise.resolve('');
        segs.push(p);
        p.then(t => { partial[k] = t; o.onPartial?.(partial.filter(Boolean).join(' ')); }).catch(() => {});
      } : undefined,
    });
    o.onPartial?.('');

    const stop = async (): Promise<Assessment> => {
      const { all, tail, wav } = await rec.stop();
      const dur = all.length / SR;
      if (!hasSpeech(all)) throw new AssessError('nothing', 'Nothing was heard. Check that the microphone is allowed, speak a little louder, and try again.');
      if (o.check !== 'n' || long) await ready;
      try {
        if (!long) {
          if (o.check === 'n') return uncheckedAssessment(o, dur, wav);
          const [a, b] = speechBounds(all);
          const target = o.refKeys[0];
          const cands = Array.from(new Set([target, ...(o.alternatives || [])]));
          const { scores, heard } = await choose(all.subarray(a, b), cands, o.check !== 'p');
          return choiceAssessment(o, scores, heard.toLowerCase().replace(/[^a-z' ]/g, '').trim(), dur, wav);
        }
        if (tail && hasSpeech(tail)) segs.push(transcribe(tail));
        const texts = await Promise.all(segs);
        const transcript = texts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        if (!transcript) throw new AssessError('nothing', 'No words were recognized. Speak a little closer to the microphone and try again.');
        return transcriptAssessment('local', o, transcript, dur, wav);
      } catch (e) {
        if (e instanceof AssessError) throw e;
        throw modelError(e);
      }
    };
    return { stop, cancel() { rec.cancel(); } };
  },
};

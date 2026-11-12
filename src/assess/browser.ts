// The browser's own speech recognizer (Google in Chrome, Microsoft in Edge, Apple in Safari).
// It reports which words were understood as the intended words and shows them live while the learner reads.
import { transcriptAssessment } from './basic';
import { hasSpeech, PcmRecorder } from './pcm';
import { localSupported, transcribe } from './asr';
import { AssessError, type Assessment, type Engine, type Session, type StartOptions } from './types';
import { key } from '../lib/text';
import { setRecording } from '../lib/audio';

type Alt = { transcript: string };
type Rec = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<Alt> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
const SRCtor = (): (new () => Rec) | undefined =>
  (window as unknown as { SpeechRecognition?: new () => Rec }).SpeechRecognition ||
  (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;

export const browserSupported = () => !!SRCtor();
export const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Opened from the iPhone Home Screen as a web app (not in a Safari tab). */
export const IOS_STANDALONE = IS_IOS && (matchMedia('(display-mode: standalone)').matches || !!(navigator as unknown as { standalone?: boolean }).standalone);
export const STANDALONE_MSG = 'Apple’s speech recognition does not run in apps opened from the Home Screen. Choose “Automatic” or “On-device” checking in Settings, which work everywhere.';

/** Error codes after which this browser's recognizer should not be used again automatically. */
export const BROKEN_CODES = new Set(['service-not-allowed', 'network', 'language-not-supported', 'nostart', 'standalone', 'start']);
const BROKEN_KEY = 'accentlab.nativeBroken';
let broken = (() => { try { return localStorage.getItem(BROKEN_KEY) === '1'; } catch { return false; } })();
export const nativeBroken = () => broken;
/** The browser's recognizer failed in a way that will repeat (blocked service, no network access, missing engine). */
export function markNativeBroken() { broken = true; try { localStorage.setItem(BROKEN_KEY, '1'); } catch { /* ignore */ } }

export const browserEngine: Engine = {
  id: 'browser',
  name: 'Browser speech recognition',
  async start(o: StartOptions): Promise<Session> {
    const Ctor = SRCtor();
    if (!Ctor) throw new AssessError('unsupported', 'This browser has no built-in speech recognition. Choose “Automatic” checking in Settings.');
    // Our own recording runs alongside recognition where the device allows it (not on iPhone, where the two compete for the microphone).
    let cap: PcmRecorder | null = IS_IOS ? null : PcmRecorder.prepare();
    // without our own recording, still switch the iPhone to its recording audio mode while the recognizer listens
    const iosMic = !cap;
    if (iosMic) setRecording(true);
    const release = () => { if (iosMic) setRecording(false); };
    if (cap) {
      try { await cap.start({ onLevel: o.onLevel }); }
      catch (e) { const c = (e as AssessError).code; if (c === 'denied' || c === 'insecure' || c === 'nomic') throw e; cap = null; }
    }
    const t0 = performance.now();
    let started = false;
    let active = true, committed = '', sessionFinal = '', interim = '', fatal: AssessError | null = null;
    let alts: string[] = [];
    let rec: Rec;
    let endResolve: (() => void) | null = null;
    let restarts = 0;

    const build = () => {
      const r = new Ctor();
      r.lang = 'en-US'; r.continuous = o.mode !== 'word'; r.interimResults = true; r.maxAlternatives = o.mode === 'word' ? 5 : 1;
      (r as unknown as { onstart: () => void }).onstart = () => { started = true; };
      (r as unknown as { onaudiostart: () => void }).onaudiostart = () => { started = true; };
      r.onresult = e => {
        started = true;
        const finals: string[] = []; let inter = '';
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i];
          const t = res[0].transcript.trim();
          if (o.mode === 'word') { alts = []; for (let k = 0; k < res.length; k++) alts.push(res[k].transcript.trim()); }
          if (res.isFinal) {
            const prev = finals[finals.length - 1];
            if (prev && t.toLowerCase().startsWith(prev.toLowerCase())) finals[finals.length - 1] = t; else if (t) finals.push(t);
          } else inter += ' ' + t;
        }
        sessionFinal = finals.join(' '); interim = inter.trim();
        o.onPartial?.((committed + ' ' + sessionFinal + ' ' + interim).trim());
      };
      r.onerror = e => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        if (e.error === 'audio-capture' && cap) { cap.cancel(); cap = null; return; }
        const msg: Record<string, string> = {
          'not-allowed': 'The microphone or speech recognition is blocked for this site. Allow the microphone and try again. On iPhone, also turn on Settings → General → Keyboard → Enable Dictation.',
          'service-not-allowed': 'This browser’s speech recognition is switched off. The app will use on-device checking instead — tap the button and speak again.',
          'network': 'This browser’s speech recognition could not reach its server. The app will use on-device checking instead — tap the button and speak again.',
          'audio-capture': 'No microphone was found. Connect one and try again.',
          'language-not-supported': 'American English recognition is not available in this browser. The app will use on-device checking instead — tap the button and speak again.',
        };
        if (IOS_STANDALONE && (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture')) { fatal = new AssessError('standalone', STANDALONE_MSG); active = false; return; }
        fatal = new AssessError(e.error, msg[e.error] || `Recognition stopped (${e.error}). Try again.`);
        active = false;
      };
      r.onend = () => {
        // continuous recognition ends by itself after a pause in some browsers: keep listening until the learner stops
        if (active && o.mode !== 'word' && restarts < 40) {
          committed = (committed + ' ' + sessionFinal + ' ' + interim).trim(); sessionFinal = ''; interim = '';
          restarts++;
          try { rec = build(); rec.start(); return; } catch { /* fall through and finish with what was heard */ }
        }
        const auto = active;
        active = false;
        endResolve?.(); endResolve = null;
        if (auto) o.onEnded?.();
      };
      return r;
    };
    rec = build();
    try { rec.start(); } catch { cap?.cancel(); release(); if (IOS_STANDALONE) throw new AssessError('standalone', STANDALONE_MSG); throw new AssessError('start', 'This browser’s speech recognition could not start. The app will use on-device checking instead — tap the button and speak again.'); }
    // a recognizer that never starts (seen in some browsers) must not leave the learner waiting
    const watchdog = setTimeout(() => {
      if (started || !active) return;
      fatal = new AssessError('nostart', 'This browser’s speech recognition did not start. The app will use on-device checking instead — tap the button and speak again.');
      active = false; try { rec.abort(); } catch { /* ignore */ }
      endResolve?.();
      // with our own recording running, the learner just carries on and the recording is checked on the device
      if (!cap) o.onEnded?.();
    }, 6000);

    const finish = async (): Promise<Assessment> => {
      clearTimeout(watchdog);
      const ended = new Promise<void>(res => { endResolve = res; setTimeout(res, 2500); });
      if (active) { active = false; try { rec.stop(); } catch { /* ignore */ } } else { endResolve?.(); }
      await ended;
      release();
      const rest = cap ? await cap.stop() : null;
      let transcript = (committed + ' ' + sessionFinal + ' ' + interim).replace(/\s+/g, ' ').trim();
      const dur = (performance.now() - t0) / 1000;
      // the browser's recognizer failed or heard nothing, but our own recording has speech:
      // check that recording on this device instead, so the attempt is not lost
      const brokenNow = !!fatal && BROKEN_CODES.has(fatal.code);
      if (brokenNow) markNativeBroken();
      if ((brokenNow || !transcript) && rest && hasSpeech(rest.all) && localSupported() && o.mode !== 'word') {
        const text = await transcribe(rest.all);
        if (text) return transcriptAssessment('local', o, text, dur, rest.wav);
      }
      if (fatal) throw fatal;
      // single words: accept the intended word if it is among the recognizer's alternatives
      if (o.mode === 'word' && alts.length) {
        const want = o.refKeys[0];
        const hit = alts.find(a => a.toLowerCase().split(/\s+/).map(w => key(w.replace(/[^a-z']/g, ''))).includes(want));
        if (hit) transcript = want;
      }
      if (!transcript && !started) throw new AssessError('nostart', 'This browser’s speech recognition did not start. The app will use on-device checking instead — tap the button and speak again.');
      if (!transcript) throw new AssessError('nothing', 'Nothing was heard. Check the microphone, speak a little louder, and try again.');
      return transcriptAssessment('browser', o, transcript, dur, rest?.wav);
    };
    return {
      stop: finish,
      cancel() { clearTimeout(watchdog); active = false; try { rec.abort(); } catch { /* ignore */ } cap?.cancel(); release(); },
    };
  },
};

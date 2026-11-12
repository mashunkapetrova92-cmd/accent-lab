// Playback of the model recordings and of the learner's own voice.
//
// Recordings are decoded once (decodeAudioData) and every clip is played through one ordinary <audio> element
// as a short WAV made from the decoded samples. This combination works in every browser:
//  * no seeking inside MP3 files, which made Safari hang or start at the wrong place;
//  * <audio> playback is not silenced by the iPhone's ring/silent switch. Web Audio output is ("ambient"
//    sound), which is why sounds disappeared in the app opened from the Home Screen while they played in
//    browser apps that set their own audio mode;
//  * one element, started by a tap, can play everything afterwards (iOS needs a tap before any sound).
import { useSyncExternalStore } from 'react';
import type { Clip } from '../data/types';
import { url } from '../data/load';

const SR = 24000; // every published recording is 24 kHz mono
type AnyWindow = Window & { webkitAudioContext?: typeof AudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext };
interface AudioSessionLike { type: string }
const session = (): AudioSessionLike | undefined => (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession;

/** iPhone audio mode (Safari 17+). Only the recorder needs a special mode; <audio> playback works in the default one. */
export function setSessionType(t: 'playback' | 'play-and-record' | 'auto') {
  const s = session();
  if (s && s.type !== t) { try { s.type = t; } catch { /* not supported */ } }
}

// ---------- decoding ----------
let decoder: BaseAudioContext | null = null;
function getDecoder(): BaseAudioContext | null {
  if (decoder) return decoder;
  const W = window as AnyWindow;
  // an offline context decodes without touching the audio output, so it needs no tap and no audio mode
  const OAC = window.OfflineAudioContext || W.webkitOfflineAudioContext;
  if (OAC) {
    for (const rate of [SR, 44100]) { try { decoder = new OAC(1, 1, rate); return decoder; } catch { /* try the next rate */ } }
  }
  const AC = window.AudioContext || W.webkitAudioContext;
  if (AC) { try { decoder = new AC(); } catch { decoder = null; } }
  return decoder;
}
export const webAudioSupported = () => !!getDecoder();

function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  const c = getDecoder();
  if (!c) return Promise.reject(new Error('no decoder'));
  return new Promise((res, rej) => {
    try {
      const p = c.decodeAudioData(data, res, rej) as Promise<AudioBuffer> | undefined; // old Safari: callbacks only
      if (p && typeof p.then === 'function') p.then(res, rej);
    } catch (e) { rej(e); }
  });
}

function toInt16(f: Float32Array): Int16Array {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) { const s = f[i]; o[i] = s <= -1 ? -32768 : s >= 1 ? 32767 : (s * 32767) | 0; }
  return o;
}

/** exact length of each published file in seconds; browsers that keep the MP3 encoder delay decode it longer */
let durations: Record<string, number> = {};
export function setDurations(d: Record<string, number>) { durations = d; }
const ENCODER_DELAY = 1105 / 24000;

interface Pcm { x: Int16Array; rate: number; lead: number; dur: number }
const pcmDone = new Map<string, Pcm>();
const pcmPending = new Map<string, Promise<Pcm>>();
const MAX_SECONDS = 900; // about 43 MB of decoded recordings kept in memory

function remember(file: string, p: Pcm) {
  pcmDone.delete(file); pcmDone.set(file, p);
  let total = 0;
  for (const [k, v] of [...pcmDone.entries()].reverse()) { total += v.dur; if (total > MAX_SECONDS && k !== file) pcmDone.delete(k); }
}

async function fetchWithRetry(u: string): Promise<ArrayBuffer> {
  let last = new Error('offline');
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u);
      if (r.ok) return await r.arrayBuffer();
      last = new Error(`http ${r.status}`);
      if (r.status === 404) break;
    } catch { last = new Error('offline'); }
    await new Promise(z => setTimeout(z, 500 * (i + 1)));
  }
  throw last;
}

function load(file: string): Promise<Pcm> {
  const done = pcmDone.get(file);
  if (done) { remember(file, done); return Promise.resolve(done); }
  const pend = pcmPending.get(file);
  if (pend) return pend;
  const p = (async () => {
    const buf = await decode(await fetchWithRetry(url(`audio/${file}`)));
    const exp = durations[file];
    const lead = exp !== undefined && buf.duration - exp > 0.03 ? ENCODER_DELAY : 0;
    const v: Pcm = { x: toInt16(buf.getChannelData(0)), rate: buf.sampleRate, lead, dur: buf.duration };
    remember(file, v);
    return v;
  })();
  pcmPending.set(file, p);
  p.then(() => pcmPending.delete(file), () => pcmPending.delete(file));
  return p;
}

/** Fetch and decode in the background so the first tap plays at once. */
export function preload(files: (string | undefined | null)[]) {
  for (const f of new Set(files.filter(Boolean) as string[])) load(f).catch(() => {});
}

// ---------- WAV clips ----------
const PAD = 0.03; // silence before and after each clip: some devices clip the very start of a sound

function wavHeader(rate: number, samples: number): ArrayBuffer {
  const v = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples * 2, true);
  return v.buffer;
}

/** samples [a, b) as a 16-bit WAV with short fades, so a clip never starts or ends with a click */
function wavBlob(x: Int16Array, rate: number, a: number, b: number): { blob: Blob; len: number } {
  a = Math.max(0, Math.min(x.length, a)); b = Math.max(a, Math.min(x.length, b));
  const n = b - a;
  const pad = new Int16Array(Math.round(rate * PAD));
  const fade = Math.min(Math.round(rate * 0.006), n >> 2);
  const head = x.slice(a, a + fade), tail = x.slice(b - fade, b);
  for (let i = 0; i < fade; i++) { head[i] = Math.round(head[i] * i / fade); tail[i] = Math.round(tail[i] * (fade - i) / fade); }
  const total = n + pad.length * 2;
  return { blob: new Blob([wavHeader(rate, total), pad, head, x.subarray(a + fade, b - fade), tail, pad], { type: 'audio/wav' }), len: total / rate };
}

let silentUrl = '';
const silence = () => silentUrl || (silentUrl = URL.createObjectURL(wavBlob(new Int16Array(SR / 20), SR, 0, SR / 20).blob));

// ---------- the player ----------
let el: HTMLAudioElement | null = null;
let elUrl = ''; // object URL the element plays now, revoked when replaced
function player(): HTMLAudioElement {
  if (el) return el;
  const p = new Audio();
  p.preload = 'auto';
  p.setAttribute('playsinline', '');
  (p as HTMLAudioElement & { disableRemotePlayback?: boolean }).disableRemotePlayback = true;
  p.addEventListener('playing', () => { const c = current; if (c && p.src === c.src) { c.started = true; armTimer(c); } });
  p.addEventListener('ended', () => { const c = current; if (c && p.src === c.src) finish(c); });
  // paused by the system (a call, Siri, another app): the button must not keep showing "playing"
  p.addEventListener('pause', () => { const c = current; if (c && c.started && p.src === c.src && !p.ended) finish(c); });
  p.addEventListener('error', () => { const c = current; if (c && p.src === c.src) { finish(c); fail('The recording could not be played in this browser.'); } });
  el = p;
  return p;
}
function setSrc(p: HTMLAudioElement, src: string, own: boolean) {
  const old = elUrl;
  p.src = src;
  elUrl = own ? src : '';
  if (old && old !== src) URL.revokeObjectURL(old);
}

/** Play a moment of silence during the current tap, so later sounds may start without one (iOS rule). */
function primeInGesture(): Promise<void> {
  if (recordingActive) return Promise.reject(new Error('recording'));
  const p = player();
  if (current || (!p.paused && !p.ended)) return Promise.resolve();
  setSrc(p, silence(), false);
  try {
    const r = p.play();
    if (r && typeof r.then === 'function') { r.catch(() => { /* not a tap: a later one will do */ }); return r; }
  } catch (e) { return Promise.reject(e); }
  return Promise.resolve();
}
export function unlock() { primeInGesture().catch(() => {}); }
if (typeof window !== 'undefined') {
  let primed = false;
  const first = () => { if (!primed) primeInGesture().then(() => { primed = true; }, () => {}); };
  for (const ev of ['touchend', 'click', 'keydown']) window.addEventListener(ev, first, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
}

let recordingActive = false;
/** true while a recording is made or a recording plays */
export const audioBusy = () => recordingActive || !!current;
/** The recorder tells the player when the microphone is in use. */
export function setRecording(on: boolean) {
  recordingActive = on;
  if (on) {
    stop();
    try { el?.pause(); } catch { /* ignore */ }
    setSessionType('play-and-record');
  } else setSessionType('auto');
}

// ---------- state shared with React ----------
let playingId = '';
let lastError = '';
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
export function usePlaying(id: string) { return useSyncExternalStore(subscribe, () => playingId === id); }
export function usePlayingAny() { return useSyncExternalStore(subscribe, () => playingId); }
export function useAudioError() { return useSyncExternalStore(subscribe, () => lastError); }
export function clearAudioError() { if (lastError) { lastError = ''; emit(); } }
function fail(msg: string) { lastError = msg; emit(); }

interface Current {
  id: string; src: string; from: number; offset: number; len: number; raf: number; timer: number; started: boolean;
  onEnd?: () => void; onTime?: (t: number) => void;
}
let current: Current | null = null;

function clear(c: Current) { cancelAnimationFrame(c.raf); clearTimeout(c.timer); }

/** 'ended' should always arrive; this guards against a device that never sends it or never starts */
function armTimer(c: Current) {
  clearTimeout(c.timer);
  const p = player();
  const len = isFinite(c.len) ? c.len : isFinite(p.duration) ? p.duration : NaN;
  const wait = !c.started ? 6 : isNaN(len) ? 2 : Math.max(0, len - (p.currentTime || 0)) + 1.5;
  c.timer = window.setTimeout(() => {
    if (current !== c) return;
    if (!c.started) { finish(c); fail('Tap the play button again to hear the recording.'); return; }
    if (p.ended || p.paused || (!isNaN(len) && p.currentTime >= len - 0.05)) finish(c); else armTimer(c);
  }, wait * 1000);
}

function finish(c: Current) {
  if (current !== c) return;
  current = null;
  clear(c);
  if (playingId === c.id) { playingId = ''; emit(); }
  c.onEnd?.();
}

function halt(callEnd: boolean) {
  const c = current;
  if (c) {
    current = null; clear(c);
    try { el?.pause(); } catch { /* ignore */ }
    if (callEnd) c.onEnd?.();
  }
  if (playingId) { playingId = ''; emit(); }
}
/** Stop playback (the clip's onEnd runs). */
export function stop() { halt(true); }
/** Stop where it is without signalling the end, so the reader keeps its place. */
export function pause() { halt(false); }

export interface PlayOpts { id: string; onTime?: (t: number) => void; onEnd?: () => void }

function start(blob: Blob, from: number, len: number, o: PlayOpts) {
  const p = player();
  setSrc(p, URL.createObjectURL(blob), true);
  const c: Current = { id: o.id, src: p.src, from, offset: from - PAD, len, raf: 0, timer: 0, started: false, onEnd: o.onEnd, onTime: o.onTime };
  current = c;
  armTimer(c);
  let r: Promise<void> | undefined;
  try { r = p.play(); } catch (e) { r = Promise.reject(e); }
  if (r && typeof r.then === 'function') {
    r.catch((e: unknown) => {
      if (current !== c) return;
      const name = (e as { name?: string })?.name;
      if (name === 'AbortError') return;
      current = null; clear(c);
      if (playingId === c.id) { playingId = ''; emit(); }
      fail(name === 'NotAllowedError' ? 'Tap the play button again to hear the recording.' : 'The recording could not be played in this browser.');
    });
  }
  if (o.onTime) {
    const tick = () => {
      if (current !== c) return;
      o.onTime!(Math.max(c.from, c.offset + p.currentTime));
      c.raf = requestAnimationFrame(tick);
    };
    c.raf = requestAnimationFrame(tick);
  }
}

/** Play [from, to) seconds of a published audio file (to the end when `to` is omitted). */
export async function playRange(file: string, from: number, to: number | undefined, o: PlayOpts): Promise<void> {
  stop();
  if (!recordingActive) setSessionType('auto');
  from = Math.max(0, from);
  playingId = o.id; clearAudioError(); emit();
  (window as unknown as { __lastPlay?: unknown }).__lastPlay = { file, from, to, id: o.id };
  let P = pcmDone.get(file);
  if (!P) {
    // keep this tap's permission to play: start the player now (silence) and swap in the clip when it is ready
    primeInGesture().catch(() => {});
    try { P = await load(file); }
    catch (e) {
      if (playingId === o.id && !current) { playingId = ''; emit(); }
      fail((e as Error).message === 'offline' ? 'The recording could not be loaded. Check your internet connection, or save lessons for offline use in Settings.' : 'The recording could not be loaded. Try again in a moment.');
      throw e;
    }
    if (playingId !== o.id || current) return; // another button was pressed meanwhile
  } else remember(file, P);
  const w = wavBlob(P.x, P.rate, Math.round((from + P.lead) * P.rate), Math.round(((to ?? P.dur) + P.lead) * P.rate));
  start(w.blob, from, w.len, o);
}

/** Margins around a clip: sprites have 0.35 s of silence between items, so these never reach a neighbor. */
const PRE = 0.08, POST = 0.12;

/** Play a model clip. Slow uses the separately recorded slow version (natural, not time-stretched). */
export function playClip(clip: Clip | null | undefined, slow = false, id?: string): Promise<void> {
  if (!clip) return Promise.resolve();
  const useSlow = slow && clip.length >= 6;
  const file = useSlow ? clip[3] as string : clip[0];
  const a = useSlow ? clip[4] as number : clip[1];
  const b = useSlow ? clip[5] as number : clip[2];
  return playRange(file, a - PRE, b + POST, { id: id || `${clip[0]}:${clip[1]}:${useSlow ? 's' : 'n'}` });
}

// ---------- the learner's recordings ----------
const blobDone = new WeakMap<Blob, Pcm | null>();
const blobPending = new WeakMap<Blob, Promise<Pcm | null>>();
export async function playBlob(blob: Blob, from?: number, to?: number, id = 'mine'): Promise<void> {
  stop();
  if (!recordingActive) setSessionType('auto');
  playingId = id; clearAudioError(); emit();
  if (from === undefined && to === undefined) { start(blob, 0, NaN, { id }); return; }
  let P = blobDone.get(blob);
  if (P === undefined) {
    primeInGesture().catch(() => {});
    let pr = blobPending.get(blob);
    if (!pr) {
      pr = blob.arrayBuffer().then(decode).then(buf => ({ x: toInt16(buf.getChannelData(0)), rate: buf.sampleRate, lead: 0, dur: buf.duration }), () => null);
      pr.then(v => blobDone.set(blob, v));
      blobPending.set(blob, pr);
    }
    P = await pr;
    if (playingId !== id || current) return;
  }
  if (!P) { start(blob, 0, NaN, { id }); return; } // this recording cannot be cut: play all of it
  const a = Math.max(0, from ?? 0);
  const w = wavBlob(P.x, P.rate, Math.round(a * P.rate), Math.round((to ?? P.dur) * P.rate));
  start(w.blob, a, w.len, { id });
}

// Microphone capture as raw audio. One recorder serves every engine: it feeds 16 kHz samples to the
// on-device recognizer and to Azure, keeps a WAV copy of the learner's voice for playback, drives the
// level meter, and notices when the learner has finished speaking.
import { micError } from '../lib/mic';
import { setRecording } from '../lib/audio';
import { AssessError } from './types';

export const SR = 16000;
const FRAME = 320; // 20 ms at 16 kHz

type AnyWindow = Window & { webkitAudioContext?: typeof AudioContext };

export interface PcmOptions {
  onLevel?: (v: number) => void;
  /** every new block of 16 kHz samples (Azure streaming) */
  onChunk?: (x: Float32Array) => void;
  /** speech followed by this many seconds of silence ends the recording (0: only the user stops it) */
  endSilence?: number;
  onAutoStop?: () => void;
  /** a completed stretch of speech, cut at a pause, for recognition while the learner keeps talking */
  onSegment?: (seg: Float32Array, startSec: number) => void;
  maxSeconds?: number;
}

const WORKLET = `class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) { this.buf[this.n++] = ch[i]; if (this.n === this.buf.length) { this.port.postMessage(this.buf); this.buf = new Float32Array(2048); this.n = 0; } }
    return true;
  }
}
registerProcessor('pcm-tap', Tap);`;
let workletUrl = '';

/** Streaming low-pass + resampler from the device rate to 16 kHz. */
class Resampler {
  private taps: Float32Array; private hist: Float32Array; private hp = 0; private pos = 0; private step: number; private prev = 0; private havePrev = false;
  constructor(inRate: number) {
    this.step = inRate / SR;
    const N = 31, fc = 7200 / inRate;
    this.taps = new Float32Array(N);
    let s = 0;
    for (let i = 0; i < N; i++) {
      const m = i - (N - 1) / 2;
      const sinc = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
      const w = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (N - 1));
      this.taps[i] = sinc * w; s += this.taps[i];
    }
    for (let i = 0; i < N; i++) this.taps[i] /= s;
    this.hist = new Float32Array(N);
  }
  push(x: Float32Array): Float32Array {
    const out: number[] = [];
    const N = this.taps.length;
    for (let i = 0; i < x.length; i++) {
      this.hist[this.hp] = x[i]; this.hp = (this.hp + 1) % N;
      let y = 0;
      for (let k = 0; k < N; k++) y += this.taps[k] * this.hist[(this.hp + k) % N];
      // output samples that fall between the previous and this filtered input sample
      if (!this.havePrev) { this.prev = y; this.havePrev = true; this.pos = 0; continue; }
      while (this.pos <= 1) { out.push(this.prev + (y - this.prev) * this.pos); this.pos += this.step; }
      this.pos -= 1; this.prev = y;
    }
    return Float32Array.from(out);
  }
}

export class PcmRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private nodes: AudioNode[] = [];
  private rs: Resampler | null = null;
  private parts: Float32Array[] = [];
  private len = 0;
  private o: PcmOptions = {};
  private stopped = false;
  // speech detection
  private frame = new Float32Array(FRAME); private fn = 0;
  private floor = 0.003; private speech = 0; private silence = 0; private spoke = false;
  private segStart = 0; private lastQuiet = 0; private quietRun = 0;
  private autoFired = false;
  startedAt = 0;

  /** Call synchronously inside the tap handler: Safari only lets a user gesture start audio. */
  static prepare(): PcmRecorder {
    const r = new PcmRecorder();
    // the iPhone's recording audio mode has to be chosen before the audio context exists
    setRecording(true);
    const AC = window.AudioContext || (window as AnyWindow).webkitAudioContext;
    if (AC) { try { r.ctx = new AC(); r.ctx.resume().catch(() => {}); } catch { r.ctx = null; } }
    return r;
  }

  async start(o: PcmOptions, stream?: MediaStream): Promise<MediaStream> {
    this.o = o;
    if (!this.ctx) { setRecording(false); throw new AssessError('unsupported', 'This browser cannot record audio. Update it or use another browser.'); }
    setRecording(true);
    try {
      this.stream = stream || await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      setRecording(false);
      try { await this.ctx.close(); } catch { /* ignore */ }
      if (!navigator.mediaDevices?.getUserMedia) throw micError(new Error('getUserMedia unavailable'));
      throw micError(e);
    }
    const ctx = this.ctx;
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* ignore */ } }
    this.rs = new Resampler(ctx.sampleRate);
    const src = ctx.createMediaStreamSource(this.stream);
    const mute = ctx.createGain(); mute.gain.value = 0; mute.connect(ctx.destination);
    let tapped = false;
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        if (!workletUrl) workletUrl = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(workletUrl);
        const node = new AudioWorkletNode(ctx, 'pcm-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
        node.port.onmessage = e => this.feed(e.data as Float32Array);
        src.connect(node); node.connect(mute); this.nodes.push(src, node, mute);
        tapped = true;
      } catch { tapped = false; }
    }
    if (!tapped) {
      const sp = ctx.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = e => this.feed(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(sp); sp.connect(mute); this.nodes.push(src, sp, mute);
    }
    this.startedAt = performance.now();
    return this.stream;
  }

  private feed(raw: Float32Array) {
    if (this.stopped || !this.rs) return;
    const x = this.rs.push(raw);
    if (!x.length) return;
    this.parts.push(x); this.len += x.length;
    this.o.onChunk?.(x);
    for (let i = 0; i < x.length; i++) {
      this.frame[this.fn++] = x[i];
      if (this.fn === FRAME) { this.onFrame(); this.fn = 0; }
    }
    if (this.o.maxSeconds && this.len / SR > this.o.maxSeconds) this.fireAuto();
  }

  private onFrame() {
    let s = 0; for (let i = 0; i < FRAME; i++) s += this.frame[i] * this.frame[i];
    const rms = Math.sqrt(s / FRAME);
    this.o.onLevel?.(Math.min(1, rms * 9));
    const t = this.len / SR;
    // the noise floor follows quiet frames quickly and loud frames slowly
    this.floor = rms < this.floor ? Math.max(0.0005, rms) : Math.min(0.05, this.floor * 1.003 + 0.000001);
    const isSpeech = rms > Math.max(this.floor * 3.5, 0.006);
    if (isSpeech) { this.speech += 0.02; this.silence = 0; if (this.speech > 0.12) this.spoke = true; this.quietRun = 0; }
    else {
      this.silence += 0.02; this.quietRun += 0.02;
      if (this.speech < 0.12) this.speech = 0;
      if (this.quietRun >= 0.06) this.lastQuiet = t;
    }
    // automatic end of a single word or sentence
    if (this.o.endSilence && this.spoke && this.silence >= this.o.endSilence) this.fireAuto();
    // segments for incremental recognition: cut at a pause once a segment is long enough, or force a cut at 24 s
    if (this.o.onSegment) {
      const segLen = t - this.segStart;
      const pauseCut = this.spoke && this.silence >= 0.35 && segLen >= 4;
      const forceCut = segLen >= 24;
      if (pauseCut || forceCut) {
        const cut = forceCut && this.lastQuiet > this.segStart + 8 ? this.lastQuiet : t - (pauseCut ? 0.15 : 0);
        this.emitSegment(cut);
      }
    }
  }

  private emitSegment(cutSec: number) {
    const a = Math.round(this.segStart * SR), b = Math.min(this.len, Math.round(cutSec * SR));
    if (b - a > SR * 0.3) this.o.onSegment!(this.slice(a, b), this.segStart);
    this.segStart = cutSec; this.spoke = this.silence < 0.35 ? this.spoke : false;
  }

  private fireAuto() { if (this.autoFired) return; this.autoFired = true; this.o.onAutoStop?.(); }

  elapsed() { return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0; }
  get seconds() { return this.len / SR; }
  heardSpeech() { return this.spoke || this.speech > 0.12; }

  /** all samples recorded so far (16 kHz) */
  samples(): Float32Array { return this.slice(0, this.len); }
  private slice(a: number, b: number): Float32Array {
    const out = new Float32Array(Math.max(0, b - a));
    let off = 0, w = 0;
    for (const p of this.parts) {
      const s = Math.max(a - off, 0), e = Math.min(b - off, p.length);
      if (e > s) { out.set(p.subarray(s, e), w); w += e - s; }
      off += p.length;
      if (off >= b) break;
    }
    return out;
  }

  /** Stops the microphone. Returns the remaining unsent segment (if segments are used), all samples, and a WAV. */
  async stop(): Promise<{ all: Float32Array; tail: Float32Array | null; tailStart: number; wav: Blob }> {
    // keep listening a moment: people tap "stop" while finishing the last word, and audio arrives with a small delay
    if (!this.autoFired) await new Promise(r => setTimeout(r, 300));
    this.stopped = true;
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* ignore */ } }
    this.stream?.getTracks().forEach(t => t.stop());
    try { await this.ctx?.close(); } catch { /* ignore */ }
    setRecording(false);
    const all = this.samples();
    const a = Math.round(this.segStart * SR);
    const tail = this.o.onSegment ? (all.length - a > SR * 0.3 ? all.subarray(a) : null) : null;
    return { all, tail, tailStart: this.segStart, wav: toWav(all) };
  }

  cancel() {
    this.stopped = true;
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* ignore */ } }
    this.stream?.getTracks().forEach(t => t.stop());
    try { this.ctx?.close(); } catch { /* ignore */ }
    setRecording(false);
  }
}

export function toWav(x: Float32Array, rate = SR): Blob {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) { const s = Math.max(-1, Math.min(1, x[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Loudness check used before recognition: true when the clip contains speech-level sound. */
export function hasSpeech(x: Float32Array): boolean {
  let peak = 0, n = 0;
  for (let i = 0; i + FRAME <= x.length; i += FRAME) {
    let s = 0; for (let k = 0; k < FRAME; k++) s += x[i + k] * x[i + k];
    const r = Math.sqrt(s / FRAME); if (r > peak) peak = r; if (r > 0.01) n++;
  }
  return peak > 0.012 && n >= 5;
}

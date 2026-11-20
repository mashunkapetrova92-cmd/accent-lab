// Microphone access, recording of the learner's voice, and an input level meter.
import { AssessError } from '../assess/types';

export function micError(e: unknown): AssessError {
  console.warn('[mic]', (e as { name?: string })?.name, (e as Error)?.message);
  const name = (e as { name?: string })?.name || '';
  if (!window.isSecureContext) return new AssessError('insecure', 'The microphone only works when the app is opened over HTTPS. Open the published https link, not a local file.');
  if (name === 'NotAllowedError' || name === 'SecurityError') return new AssessError('denied', 'Microphone access is blocked. On iPhone: Settings → Safari → Microphone → Allow, or tap “aA” in the address bar → Website Settings → Microphone. Then try again.');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new AssessError('nomic', 'No microphone was found. Connect one or check that no other app is using it.');
  if (name === 'NotReadableError') return new AssessError('busy', 'The microphone is being used by another app. Close it and try again.');
  return new AssessError('mic', 'The microphone could not be started. ' + ((e as Error)?.message || ''));
}

export async function openMic(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw micError(new Error('getUserMedia unavailable'));
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch (e) { throw micError(e); }
}

function pickMime(): string | undefined {
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  if (typeof MediaRecorder === 'undefined') return undefined;
  return types.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } });
}

export class Capture {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private ctx: AudioContext | null = null;
  private raf = 0;
  startedAt = 0;
  constructor(public stream: MediaStream) {}

  start(onLevel?: (v: number) => void) {
    this.startedAt = performance.now();
    if (typeof MediaRecorder !== 'undefined') {
      try {
        const mime = pickMime();
        this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
        this.rec.ondataavailable = e => { if (e.data?.size) this.chunks.push(e.data); };
        this.rec.start(250);
      } catch { this.rec = null; }
    }
    if (onLevel) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        const src = this.ctx.createMediaStreamSource(this.stream);
        const an = this.ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
        const buf = new Uint8Array(an.fftSize);
        const loop = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
          onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
          this.raf = requestAnimationFrame(loop);
        };
        loop();
      } catch { /* level meter is optional */ }
    }
  }

  elapsed() { return (performance.now() - this.startedAt) / 1000; }

  async stop(releaseMic = true): Promise<Blob | undefined> {
    cancelAnimationFrame(this.raf);
    try { await this.ctx?.close(); } catch { /* ignore */ }
    let blob: Blob | undefined;
    if (this.rec && this.rec.state !== 'inactive') {
      blob = await new Promise<Blob>(res => {
        this.rec!.onstop = () => res(new Blob(this.chunks, { type: this.rec!.mimeType || 'audio/webm' }));
        try { this.rec!.stop(); } catch { res(new Blob(this.chunks)); }
      });
    }
    if (releaseMic) this.stream.getTracks().forEach(t => t.stop());
    return blob && blob.size > 0 ? blob : undefined;
  }

  cancel() { cancelAnimationFrame(this.raf); try { this.rec?.stop(); } catch { /* ignore */ } try { this.ctx?.close(); } catch { /* ignore */ } this.stream.getTracks().forEach(t => t.stop()); }
}

// Main-thread side of the on-device sound recognizer (see phon.worker.ts): one-time download, then
// phonemes(audio) → the sounds it heard. Downloaded only when the learner turns sound checking on.
import { useSyncExternalStore } from 'react';

export const PHON_MODEL = 'wav2vec2-ljspeech-gruut-ONNX';
export const PHON_MB = 90;

let worker: Worker | null = null; let seq = 0;
const pending = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>();
const files = new Map<string, { loaded: number; total: number }>();
type St = 'idle' | 'loading' | 'ready' | 'error';
let status: St = 'idle', progress = 0, errorText = '';
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
export function usePhonModel() {
  return { status: useSyncExternalStore(subscribe, () => status), progress: useSyncExternalStore(subscribe, () => progress), error: errorText };
}
export const phonStatus = () => status;
const base = () => new URL(import.meta.env.BASE_URL, location.href).href;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./phon.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as { id?: number; type?: string; file?: string; loaded?: number; total?: number; error?: string };
    if (m.type === 'progress' && m.file) {
      files.set(m.file, { loaded: m.loaded || 0, total: m.total || 0 });
      let l = 0, t = 0; for (const f of files.values()) { l += f.loaded; t += f.total; }
      const p = t ? l / t : 0; if (Math.abs(p - progress) > 0.005) { progress = p; emit(); }
      return;
    }
    if (m.id === undefined) return;
    const p = pending.get(m.id); if (!p) return;
    pending.delete(m.id);
    if (m.error) p.rej(new Error(m.error)); else p.res(m);
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'The sound checker could not start.');
    for (const p of pending.values()) p.rej(err);
    pending.clear(); status = 'error'; errorText = err.message; emit(); worker?.terminate(); worker = null;
  };
  return worker;
}
function call<T>(type: string, extra: Record<string, unknown> = {}, transfer: Transferable[] = []): Promise<T> {
  const id = ++seq;
  return new Promise<T>((res, rej) => { pending.set(id, { res: res as (v: unknown) => void, rej }); getWorker().postMessage({ id, type, base: base(), model: PHON_MODEL, ...extra }, transfer); });
}
export function loadPhon(): Promise<void> {
  if (status === 'ready') return Promise.resolve();
  if (status !== 'loading') { status = 'loading'; errorText = ''; emit(); }
  return call('load').then(() => { status = 'ready'; progress = 1; emit(); }, (e: Error) => { status = 'error'; errorText = e.message; emit(); throw e; });
}
export async function phonemes(audio: Float32Array): Promise<{ ph: string[]; at: number[] }> {
  await loadPhon();
  const copy = audio.slice();
  return call<{ ph: string[]; at: number[] }>('phonemes', { audio: copy }, [copy.buffer]);
}
// automated checks call the recognizer directly
(window as unknown as { __phonemes?: typeof phonemes }).__phonemes = phonemes;

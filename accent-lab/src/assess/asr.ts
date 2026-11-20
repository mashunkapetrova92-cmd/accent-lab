// Main-thread side of the on-device recognizer: starts the worker, reports the one-time model download,
// and offers transcribe() and choose() as promises.
import { useSyncExternalStore } from 'react';

export const MODEL = 'whisper-base.en';
/** approximate one-time download (model + runtime), shown before the first use */
export const MODEL_MB = 100;

type Pending = { res: (v: unknown) => void; rej: (e: Error) => void };
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
const files = new Map<string, { loaded: number; total: number }>();

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';
let status: ModelStatus = 'idle';
let progress = 0;
let errorText = '';
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
export function useModel() {
  const s = useSyncExternalStore(subscribe, () => status);
  const p = useSyncExternalStore(subscribe, () => progress);
  return { status: s, progress: p, error: errorText };
}
export const modelStatus = () => status;

function base() { return new URL(import.meta.env.BASE_URL, location.href).href; }

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./asr.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as { id?: number; type?: string; file?: string; loaded?: number; total?: number; error?: string };
    if (m.type === 'progress' && m.file) {
      files.set(m.file, { loaded: m.loaded || 0, total: m.total || 0 });
      let l = 0, t = 0; for (const f of files.values()) { l += f.loaded; t += f.total; }
      const p = t ? l / t : 0;
      if (Math.abs(p - progress) > 0.005) { progress = p; emit(); }
      return;
    }
    if (m.id === undefined) return;
    const p = pending.get(m.id); if (!p) return;
    pending.delete(m.id);
    if (m.error) p.rej(new Error(m.error)); else p.res(m);
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'The speech model could not start.');
    for (const p of pending.values()) p.rej(err);
    pending.clear(); status = 'error'; errorText = err.message; emit();
    worker?.terminate(); worker = null;
  };
  return worker;
}

function call<T>(type: string, extra: Record<string, unknown> = {}, transfer: Transferable[] = []): Promise<T> {
  const id = ++seq;
  return new Promise<T>((res, rej) => {
    pending.set(id, { res: res as (v: unknown) => void, rej });
    getWorker().postMessage({ id, type, base: base(), model: MODEL, ...extra }, transfer);
  });
}

/** Starts the one-time download in the background; resolves when the model is ready. */
export function loadModel(): Promise<void> {
  if (status === 'ready') return Promise.resolve();
  if (status !== 'loading') { status = 'loading'; errorText = ''; emit(); }
  return call<{ ok: boolean }>('load').then(() => { status = 'ready'; progress = 1; emit(); }, (e: Error) => {
    status = 'error'; errorText = e.message; emit();
    throw e;
  });
}

export async function transcribe(audio: Float32Array): Promise<string> {
  await loadModel();
  const copy = audio.slice();
  const r = await call<{ text: string }>('transcribe', { audio: copy }, [copy.buffer]);
  return r.text;
}

export async function choose(audio: Float32Array, candidates: string[], open = true): Promise<{ scores: Record<string, number>; heard: string }> {
  await loadModel();
  const copy = audio.slice();
  return call<{ scores: Record<string, number>; heard: string }>('choose', { audio: copy, candidates, open }, [copy.buffer]);
}

/** WebAssembly is required; every current browser has it. */
export const localSupported = () => typeof WebAssembly === 'object' && typeof Worker !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

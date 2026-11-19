/// <reference lib="webworker" />
// On-device sound recognizer (wav2vec2 trained to write American English phonemes, quantized), in its own
// worker. It turns a recording into the sequence of sounds it heard, which is compared with the expected
// sounds of the sentence. Free and offline once downloaded.
import { AutoModelForCTC, Tensor, env } from '@huggingface/transformers';

type Run = (x: Record<string, Tensor>) => Promise<{ logits: Tensor }>;
let loading: Promise<{ run: Run; inv: string[]; blank: number }> | null = null;
const post = (m: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

function load(base: string, name: string) {
  if (loading) return loading;
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = base + 'models/';
  env.useBrowserCache = true;
  const onnx = env.backends.onnx as unknown as { wasm: { wasmPaths: string; numThreads: number; proxy: boolean } };
  onnx.wasm.wasmPaths = base + 'ort/';
  onnx.wasm.numThreads = 1;
  const progress = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === 'progress' && p.file && p.total) post({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
  };
  loading = (async () => {
    const vocab = await (await fetch(`${base}models/${name}/vocab.json`)).json() as Record<string, number>;
    const inv: string[] = []; for (const [k, v] of Object.entries(vocab)) inv[v] = k;
    const model = await AutoModelForCTC.from_pretrained(name, { dtype: 'q4', device: 'wasm', progress_callback: progress });
    return { run: model as unknown as Run, inv, blank: vocab['[PAD]'] ?? vocab['<pad>'] ?? 0 };
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type } = e.data as { id: number; type: string };
  try {
    const L = await load(e.data.base, e.data.model);
    if (type === 'load') { post({ id, ok: true }); return; }
    const x = e.data.audio as Float32Array;
    // the model expects zero-mean, unit-variance audio at 16 kHz
    let m = 0; for (let i = 0; i < x.length; i++) m += x[i]; m /= x.length || 1;
    let v = 0; for (let i = 0; i < x.length; i++) v += (x[i] - m) ** 2; const sd = Math.sqrt(v / (x.length || 1)) + 1e-7;
    const y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = (x[i] - m) / sd;
    const { logits } = await L.run({ input_values: new Tensor('float32', y, [1, y.length]) });
    const [, T, V] = logits.dims; const d = logits.data as Float32Array;
    // greedy CTC: best symbol per 20 ms frame, repeats merged, blanks dropped; frame times kept per sound
    const ph: string[] = []; const at: number[] = []; let prev = -1;
    for (let t = 0; t < T; t++) {
      let b = 0, bv = -Infinity; const o = t * V;
      for (let k = 0; k < V; k++) if (d[o + k] > bv) { bv = d[o + k]; b = k; }
      if (b !== prev && b !== L.blank) { const s = L.inv[b]; if (s && s !== '|' && s !== '[UNK]') { ph.push(s); at.push(t * 0.02); } }
      prev = b;
    }
    post({ id, ph, at });
  } catch (err) {
    post({ id, error: String((err as Error)?.message || err) });
  }
};

/// <reference lib="webworker" />
// On-device speech recognition (Whisper base.en, quantized) running in a worker so the page stays responsive.
// Two jobs: free transcription of sentences and texts, and a forced choice between a target word and the
// words it is most often confused with ("sheep" or "ship"?), which is far more reliable for single words.
import { pipeline, Tensor, env } from '@huggingface/transformers';

type Fn = (...a: unknown[]) => Promise<unknown>;
interface Loaded { asr: Fn; proc: unknown; tok: unknown; model: unknown; SOT: number; NOTS: number; EOT: number; suppress: Set<number> }
let loading: Promise<Loaded> | null = null;

const post = (m: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

function load(base: string, name: string): Promise<Loaded> {
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
    const asr = await pipeline('automatic-speech-recognition', name, { dtype: 'q8', device: 'wasm', progress_callback: progress }) as unknown as Fn & { processor: unknown; tokenizer: unknown; model: unknown };
    const proc = asr.processor, tok = asr.tokenizer, model = asr.model;
    const id = (t: string) => (tok as unknown as { model: { tokens_to_ids: Map<string, number> } }).model.tokens_to_ids.get(t)!;
    const SOT = id('<|startoftranscript|>'), NOTS = id('<|notimestamps|>'), EOT = id('<|endoftext|>');
    // every special token except the end token is suppressed during free decoding
    const suppress = new Set<number>();
    const vocab = (tok as unknown as { model: { tokens_to_ids: Map<string, number> } }).model.tokens_to_ids;
    for (const [t, i] of vocab) if (t.startsWith('<|') && i !== EOT) suppress.add(i);
    for (let i = EOT + 1; i < 52000; i++) suppress.add(i);
    return { asr, proc, tok, model, SOT, NOTS, EOT, suppress };
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

async function encode(L: Loaded, audio: Float32Array): Promise<Tensor> {
  const { input_features } = await (L.proc as unknown as (a: Float32Array) => Promise<{ input_features: Tensor }>)(audio);
  const sess = (L.model as unknown as { sessions: Record<string, { run(f: Record<string, unknown>): Promise<Record<string, unknown>> }> }).sessions['model'];
  const r = await sess.run({ input_features: (input_features as unknown as { ort_tensor: unknown }).ort_tensor });
  return new (Tensor as unknown as new (t: unknown) => Tensor)(r.last_hidden_state);
}

async function logits(L: Loaded, enc: Tensor, ids: number[]): Promise<{ data: Float32Array; V: number }> {
  const out = await (L.model as unknown as (x: unknown) => Promise<{ logits: Tensor }>)({
    encoder_outputs: enc,
    decoder_input_ids: new Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
  });
  return { data: out.logits.data as Float32Array, V: out.logits.dims[2] };
}

function logSoftmaxAt(row: Float32Array, k: number): number {
  let m = -Infinity; for (let i = 0; i < row.length; i++) if (row[i] > m) m = row[i];
  let z = 0; for (let i = 0; i < row.length; i++) z += Math.exp(row[i] - m);
  return row[k] - m - Math.log(z);
}

/** log P(text | audio) */
async function score(L: Loaded, enc: Tensor, text: string): Promise<number> {
  const body = (L.tok as unknown as { encode(t: string, o: unknown): number[] }).encode(text, { add_special_tokens: false });
  const ids = [L.SOT, L.NOTS, ...body, L.EOT];
  const inp = ids.slice(0, -1);
  const { data, V } = await logits(L, enc, inp);
  let s = 0;
  for (let i = 1; i < inp.length; i++) s += logSoftmaxAt(data.subarray(i * V, (i + 1) * V), ids[i + 1]);
  return s;
}

/** Greedy transcription of a short clip using already computed encoder output. */
async function greedy(L: Loaded, enc: Tensor, maxTokens = 12): Promise<string> {
  const ids = [L.SOT, L.NOTS];
  for (let step = 0; step < maxTokens; step++) {
    const { data, V } = await logits(L, enc, ids);
    const row = data.subarray((ids.length - 1) * V, ids.length * V);
    let best = -1, bv = -Infinity;
    for (let i = 0; i < V; i++) if (row[i] > bv && !L.suppress.has(i)) { bv = row[i]; best = i; }
    if (best === L.EOT || best < 0) break;
    ids.push(best);
  }
  return (L.tok as unknown as { decode(ids: number[], o: unknown): string }).decode(ids.slice(2), { skip_special_tokens: true }).trim();
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const variants = (w: string) => [' ' + cap(w) + '.', ' ' + w, ' ' + cap(w)];

self.onmessage = async (e: MessageEvent) => {
  const { id, type } = e.data as { id: number; type: string };
  try {
    const L = await load(e.data.base, e.data.model);
    if (type === 'load') { post({ id, ok: true }); return; }
    const audio = e.data.audio as Float32Array;
    if (type === 'transcribe') {
      // free text (segments of up to about 25 s); the pipeline decodes with a key-value cache
      const r = await L.asr(audio, { max_new_tokens: 220 }) as { text: string };
      post({ id, text: (r.text || '').trim() });
      return;
    }
    const enc = await encode(L, audio);
    if (type === 'choose') {
      const cands = (e.data.candidates as string[]).slice();
      const heard = await greedy(L, enc, 10);
      // what the model hears on its own is always one of the choices, so a word that sounds like
      // something else entirely cannot win just because the alternatives were even further off
      const h = heard.toLowerCase().replace(/[^a-z' ]/g, '').replace(/\s+/g, ' ').trim();
      if (e.data.open !== false && h && h.split(' ').length <= 3 && !cands.includes(h)) cands.push(h);
      const scores: Record<string, number> = {};
      for (const c of cands) { let b = -Infinity; for (const v of variants(c)) b = Math.max(b, await score(L, enc, v)); scores[c] = b; }
      post({ id, scores, heard });
    }
  } catch (err) {
    post({ id, error: String((err as Error)?.message || err) });
  }
};

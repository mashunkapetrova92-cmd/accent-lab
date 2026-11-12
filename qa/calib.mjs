// Mirrors asr.worker.ts "choose": checks that every model recording is recognized as its own word.
import { AutoProcessor, AutoTokenizer, WhisperForConditionalGeneration, Tensor, env } from '/home/claude/accent-lab/node_modules/@huggingface/transformers/dist/transformers.node.mjs';
import { execFileSync } from 'node:child_process'; import fs from 'node:fs';
env.localModelPath = '/home/claude/models/'; env.allowRemoteModels = false;
const M = 'whisper-tiny.en';
const [jobsFile, outFile] = process.argv.slice(2);
const dec = (p, a, b) => { const args = ['-v', 'error']; if (a !== undefined) args.push('-ss', String(Math.max(0, a)), '-to', String(b)); args.push('-i', p, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'); const r = execFileSync('ffmpeg', args); return new Float32Array(r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength)); };
const processor = await AutoProcessor.from_pretrained(M); const tok = await AutoTokenizer.from_pretrained(M);
const model = await WhisperForConditionalGeneration.from_pretrained(M, { dtype: 'q8' });
const ids = tok.model.tokens_to_ids; const SOT = ids.get('<|startoftranscript|>'), NOTS = ids.get('<|notimestamps|>'), EOT = ids.get('<|endoftext|>');
const suppress = new Set(); for (const [t, i] of ids) if (t.startsWith('<|') && i !== EOT) suppress.add(i); for (let i = EOT + 1; i < 52000; i++) suppress.add(i);
async function encode(x) { const { input_features } = await processor(x); const r = await model.sessions['model'].run({ input_features: input_features.ort_tensor }); return new Tensor(r.last_hidden_state); }
async function logits(enc, seq) { const out = await model({ encoder_outputs: enc, decoder_input_ids: new Tensor('int64', BigInt64Array.from(seq.map(BigInt)), [1, seq.length]) }); return { d: out.logits.data, V: out.logits.dims[2] }; }
const lsm = (row, k) => { let m = -Infinity; for (const v of row) if (v > m) m = v; let z = 0; for (const v of row) z += Math.exp(v - m); return row[k] - m - Math.log(z); };
async function score(enc, text) { const body = tok.encode(text, { add_special_tokens: false }); const seq = [SOT, NOTS, ...body, EOT]; const inp = seq.slice(0, -1); const { d, V } = await logits(enc, inp); let s = 0; for (let i = 1; i < inp.length; i++) s += lsm(d.subarray(i * V, (i + 1) * V), seq[i + 1]); return s; }
async function greedy(enc, max = 10) { const seq = [SOT, NOTS]; for (let k = 0; k < max; k++) { const { d, V } = await logits(enc, seq); const row = d.subarray((seq.length - 1) * V, seq.length * V); let b = -1, bv = -Infinity; for (let i = 0; i < V; i++) if (row[i] > bv && !suppress.has(i)) { bv = row[i]; b = i; } if (b === EOT || b < 0) break; seq.push(b); } return tok.decode(seq.slice(2), { skip_special_tokens: true }).trim(); }
const cap = w => w.charAt(0).toUpperCase() + w.slice(1); const variants = w => [' ' + cap(w) + '.', ' ' + w, ' ' + cap(w)];
function bounds(x) { const F = 320; let first = -1, last = -1, peak = 0; const r = []; for (let i = 0; i + F <= x.length; i += F) { let s = 0; for (let k = 0; k < F; k++) s += x[i + k] ** 2; const v = Math.sqrt(s / F); r.push(v); if (v > peak) peak = v; } const th = Math.max(0.008, peak * 0.08); r.forEach((v, i) => { if (v > th) { if (first < 0) first = i; last = i; } }); return first < 0 ? [0, x.length] : [Math.max(0, (first - 12) * F), Math.min(x.length, (last + 15) * F)]; }
const jobs = JSON.parse(fs.readFileSync(jobsFile)); const res = [];
let t0 = Date.now();
for (const [i, j] of jobs.entries()) {
  const x0 = dec(j.file, j.a, j.b); const [a, b] = bounds(x0); const enc = await encode(x0.subarray(a, b));
  const heard = await greedy(enc); const h = heard.toLowerCase().replace(/[^a-z' ]/g, '').replace(/\s+/g, ' ').trim();
  const cands = [...new Set([j.word, ...(j.alt || [])])]; if (h && h.split(' ').length <= 3 && !cands.includes(h)) cands.push(h);
  const sc = {}; for (const c of cands) { let best = -Infinity; for (const v of variants(c)) best = Math.max(best, await score(enc, v)); sc[c] = best; }
  const mx = Math.max(...Object.values(sc)); const Z = Object.values(sc).reduce((s, v) => s + Math.exp(v - mx), 0);
  const P = {}; for (const c of cands) P[c] = Math.round(Math.exp(sc[c] - mx) / Z * 100);
  res.push({ ...j, heard: h, P });
  if (i % 25 === 0) console.log(i, '/', jobs.length, ((Date.now() - t0) / 1000).toFixed(0) + 's', j.word, P);
}
fs.writeFileSync(outFile, JSON.stringify(res));

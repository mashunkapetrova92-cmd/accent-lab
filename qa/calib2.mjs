// Offline calibration of single-word checking, mirroring the app (asr.worker.ts + basic.ts):
// for every word, how confidently the on-device recognizer identifies the MODEL recording,
//   pair: among the word and its confusable alternatives
//   open: among those plus whatever the recognizer hears freely
import { AutoProcessor, AutoTokenizer, WhisperForConditionalGeneration, Tensor, env } from '/home/claude/accent-lab/node_modules/@huggingface/transformers/dist/transformers.node.mjs';
import { execFileSync } from 'node:child_process'; import fs from 'node:fs';
env.localModelPath = '/home/claude/models/'; env.allowRemoteModels = false;
const M = 'whisper-tiny.en';
const [jobsFile, outFile] = process.argv.slice(2);
// the app's sound-alike rules (lib/text.ts + assess/basic.ts)
const src = fs.readFileSync('/home/claude/accent-lab/src/lib/text.ts', 'utf8');
const groups = eval(src.slice(src.indexOf('const HOMO_GROUPS = ') + 'const HOMO_GROUPS = '.length, src.indexOf('];', src.indexOf('const HOMO_GROUPS')) + 1));
const variantsMap = eval('(' + src.slice(src.indexOf('const VARIANT: Record<string, string> = ') + 'const VARIANT: Record<string, string> = '.length, src.indexOf('};', src.indexOf('const VARIANT')) + 1) + ')');
const HOMO = {}; for (const g of groups) for (const w of g) if (!HOMO[w]) HOMO[w] = g[0];
const key = w => { let k = w.replace(/'/g, ''); k = variantsMap[k] || k; return HOMO[k] || k; };
const LETTER = { b: 'be', c: 'see', g: 'gee', i: 'eye', j: 'jay', k: 'kay', o: 'oh', p: 'pea', q: 'queue', r: 'are', t: 'tea', u: 'you', y: 'why', x: 'ex' };
const sound = w => { const t = w.toLowerCase().replace(/[^a-z' ]/g, '').trim(); return key(LETTER[t] || t); };
const dec = (p, a, b) => { const args = ['-v', 'error']; if (a !== undefined) args.push('-ss', String(Math.max(0, a)), '-to', String(b)); args.push('-i', p, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'); const r = execFileSync('ffmpeg', args, { maxBuffer: 1 << 26 }); return new Float32Array(r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength)); };
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
const prob = (sc, target) => { const e = Object.entries(sc); const mx = Math.max(...e.map(x => x[1])); const z = e.reduce((s, [, v]) => s + Math.exp(v - mx), 0); return e.filter(([c]) => sound(c) === sound(target)).reduce((s, [, v]) => s + Math.exp(v - mx), 0) / z; };
const jobs = JSON.parse(fs.readFileSync(jobsFile));
const done = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile)) : [];
const seen = new Set(done.map(r => r.id)); const res = done;
let t0 = Date.now(), n = 0;
for (const j of jobs) {
  if (seen.has(j.id)) continue;
  const x0 = dec(j.file, j.a, j.b); const [a, b] = bounds(x0); const enc = await encode(x0.subarray(a, b));
  const heard = await greedy(enc); const h = heard.toLowerCase().replace(/[^a-z' ]/g, '').replace(/\s+/g, ' ').trim();
  const pair = [...new Set([j.word, ...(j.alt || [])])];
  const open = h && h.split(' ').length <= 3 && !pair.includes(h) ? [...pair, h] : pair;
  const sc = {}; for (const c of open) { let best = -Infinity; for (const v of variants(c)) best = Math.max(best, await score(enc, v)); sc[c] = best; }
  const scPair = Object.fromEntries(pair.map(c => [c, sc[c]]));
  res.push({ id: j.id, word: j.word, alt: j.alt || [], heard: h, pair: Math.round(prob(scPair, j.word) * 100), open: Math.round(prob(sc, j.word) * 100) });
  if (++n % 50 === 0) { fs.writeFileSync(outFile, JSON.stringify(res)); console.log(n, ((Date.now() - t0) / 1000).toFixed(0) + 's', j.word, res[res.length - 1]); }
}
fs.writeFileSync(outFile, JSON.stringify(res));
console.log('done', res.length);

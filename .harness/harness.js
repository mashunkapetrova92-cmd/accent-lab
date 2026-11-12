import { pipeline, env, AutoTokenizer, AutoProcessor, MoonshineForConditionalGeneration, WhisperForConditionalGeneration, Tensor } from '@huggingface/transformers';
env.allowLocalModels = true; env.allowRemoteModels = false; env.localModelPath = '/models/'; env.useBrowserCache = false;
env.backends.onnx.wasm.wasmPaths = '/ort/'; env.backends.onnx.wasm.numThreads = 1;
window.log = []; const L = (...a) => { log.push(a.join(' ')); };
async function wav16(path) {
  const ab = await fetch(path).then(r => r.arrayBuffer());
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const tmp = new AC(1, 16000, 16000);
  const buf = await new Promise((res, rej) => { const p = tmp.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
  return buf.getChannelData(0);
}
function logSoftmaxAt(data, off, V, idx) { let m = -Infinity; for (let i = 0; i < V; i++) if (data[off + i] > m) m = data[off + i]; let s = 0; for (let i = 0; i < V; i++) s += Math.exp(data[off + i] - m); return data[off + idx] - m - Math.log(s); }
window.score = async (items, modelId) => {
  try {
    const t0 = performance.now();
    const tok = await AutoTokenizer.from_pretrained(modelId);
    const proc = await AutoProcessor.from_pretrained(modelId);
    const model = await MoonshineForConditionalGeneration.from_pretrained(modelId, { dtype: 'q8', device: 'wasm' });
    L('loaded', Math.round(performance.now() - t0));
    for (const [file, cands] of items) {
      const x = await wav16(file); const t1 = performance.now();
      const inputs = await proc(x);
      const res = [];
      for (const c of cands) {
        let best = -Infinity;
        for (const text of [c[0].toUpperCase() + c.slice(1) + '.', c[0].toUpperCase() + c.slice(1)]) {
          const ids = tok(text, { add_special_tokens: false }).input_ids.data; const n = ids.length;
          const dec = [1n, ...Array.from(ids)];
          const out = await model.forward({ ...inputs, decoder_input_ids: new Tensor('int64', BigInt64Array.from(dec), [1, dec.length]) });
          const lg = out.logits; const V = lg.dims[2]; const d = lg.data;
          let lp = 0; const tgt = [...Array.from(ids), 2n];
          for (let k = 0; k < tgt.length; k++) lp += logSoftmaxAt(d, k * V, V, Number(tgt[k]));
          if (lp > best) best = lp;
        }
        res.push([c, best]);
      }
      const mx = Math.max(...res.map(r => r[1])); const Z = res.reduce((s, r) => s + Math.exp(r[1] - mx), 0);
      L(file, Math.round(performance.now() - t1) + 'ms', res.map(([c, lp]) => `${c}:${(Math.exp(lp - mx) / Z * 100).toFixed(0)}%`).join(' '));
    }
  } catch (e) { L('ERR', e && e.stack || e); }
  L('done');
};

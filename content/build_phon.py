"""Expected sounds for every practice sentence, for the free on-device sound check.
For each sentence and each word: the phonemes the sound recognizer should hear (its own symbol set), with
"!" in front of a sound the recognizer gets wrong even in the model voice's own normal or slow recording, so
the app never blames the learner for it. Writes `ph` into data/sounds.json (lesson sentences) and every
data/stories/*.json (each sentence of a text)."""
import json, re, sys, glob, os, time
sys.path.insert(0, "/home/claude/phon")
from plib import Model, phones, decode, AUDIO
from align import align
import numpy as np
DATA = "/home/claude/accent-lab/public/data"
m = Model("/home/claude/phon/wav2vec2-ljspeech-gruut-ONNX", threads=int(os.environ.get("THREADS", "2")))
SR = 16000
def pieces(ipa):
    return [p for p in re.split(r"[\s‿|]+", ipa.strip().strip("/").strip()) if p]
import functools
_dec = functools.lru_cache(maxsize=4)(decode)
def heard(path, a, b):
    x = _dec(path); return m.greedy(m.logp(x[max(0, int(a * SR)):int(b * SR)]))
def mark(words, refs):
    flat = [p for w in words for p in w]
    bad = set()
    for got in refs:
        for i, r in enumerate(align(flat, got)):
            if r is not None: bad.add(i)
    out, k = [], 0
    for w in words:
        out.append(" ".join(("!" if (k + j) in bad else "") + p for j, p in enumerate(w))); k += len(w)
    return out, len(bad), len(flat)
stat = [0, 0, 0, 0]
def note(nb, nf): stat[0] += 1; stat[1] += nb; stat[2] += nf
t0 = time.time()
# lesson sentences: one entry per word of the sentence (the order the app scores them in)
which = sys.argv[1:] or ["sounds", "stories"]
if "sounds" in which:
    d = json.load(open(f"{DATA}/sounds.json"))
    for n in d["nodes"]:
        for s in n["sentences"]:
            ps = pieces(s["ipa"])
            if len(ps) != len(s["tokens"]) or not s.get("clip"): s.pop("ph", None); stat[3] += 1; continue
            try: words = [phones(p, m.vocab) for p in ps]
            except KeyError: s.pop("ph", None); stat[3] += 1; continue
            c = s["clip"]; refs = [heard(AUDIO + c[0], c[1] - 0.08, c[2] + 0.12)]
            if len(c) >= 6: refs.append(heard(AUDIO + c[3], c[4] - 0.08, c[5] + 0.12))
            s["ph"], nb, nf = mark(words, refs); note(nb, nf)
    json.dump(d, open(f"{DATA}/sounds.json", "w"), ensure_ascii=False, separators=(",", ":"))
    print("lesson sentences:", stat, f"{time.time() - t0:.0f}s", flush=True)
if "stories" in which:
    for f in sorted(glob.glob(f"{DATA}/stories/*.json")):
        if f.endswith("index.json"): continue
        st = json.load(open(f)); T = st["times"]; ST = st.get("slowTimes")
        if os.environ.get("RESUME") and all("ph" in x for pa in st["paragraphs"] for x in pa["sents"]): continue
        for para in st["paragraphs"]:
            for s in para["sents"]:
                ps = pieces(s["ipa"]); n = s["b"] - s["a"]
                if len(ps) != n: s.pop("ph", None); stat[3] += 1; continue
                try: words = [phones(p, m.vocab) for p in ps]
                except KeyError: s.pop("ph", None); stat[3] += 1; continue
                refs = [heard(AUDIO + st["audio"], T[s["a"]][0] - 0.1, T[s["b"] - 1][1] + 0.15)]
                if ST and st.get("slowAudio"): refs.append(heard(AUDIO + st["slowAudio"], ST[s["a"]][0] - 0.1, ST[s["b"] - 1][1] + 0.15))
                s["ph"], nb, nf = mark(words, refs); note(nb, nf)
        json.dump(st, open(f, "w"), ensure_ascii=False, separators=(",", ":"))
        print(os.path.basename(f), stat, f"{time.time() - t0:.0f}s", flush=True)
print(f"done: {stat[0]} sentences, {stat[1]}/{stat[2]} sounds marked unreliable ({stat[1]/max(1,stat[2])*100:.1f}%), {stat[3]} sentences skipped")

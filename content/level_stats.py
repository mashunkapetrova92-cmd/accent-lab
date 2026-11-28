"""Objective difficulty profile of each text: length, sentence length, share of less frequent words."""
import json, re, sys, statistics as S
from wordfreq import zipf_frequency as z
sys.path.insert(0, "/home/claude/content")
from check_stories import parse, norm_tokens
import glob
def split_s(p): return [x for x in re.split(r'(?<=[.!?])["”]?\s+', p) if x.strip()]
def prof(s):
    text = " ".join(s["paragraphs"]); toks = norm_tokens(text)
    sents = [x for p in s["paragraphs"] for x in split_s(p)]
    sl = S.mean(len(norm_tokens(x)) for x in sents)
    cont = [t for t in toks if len(t) > 2]
    r4 = sum(z(t, "en") < 4.0 for t in cont) / len(cont)   # outside roughly the 5,000 most common words
    r3 = sum(z(t, "en") < 3.2 for t in cont) / len(cont)
    longw = sum(len(t) >= 9 for t in toks) / len(toks)
    return {"n": len(toks), "sl": round(sl, 1), "r4": round(100 * r4, 1), "r3": round(100 * r3, 1), "lw": round(100 * longw, 1),
            "paras": len(s["paragraphs"])}
def score(p):  # single difficulty number
    return round(p["sl"] * 0.6 + p["r4"] * 1.0 + p["r3"] * 1.5 + p["lw"] * 0.8, 1)
if __name__ == "__main__":
    st = []
    for f in sorted(glob.glob("/home/claude/content/batches/*.txt")): st += parse(f)
    lv = json.load(open("/home/claude/content/levels_c.json")) if len(sys.argv) > 1 and sys.argv[1] == "c" else {}
    by = {}
    for s in st:
        p = prof(s); L = s.get("level") or lv.get(s["id"], "C")
        by.setdefault(L, []).append((score(p), p, s["id"]))
    for L in sorted(by):
        xs = by[L]; sc = [x[0] for x in xs]
        print(f"{L:3s} n={len(xs):3d} score {min(sc):5.1f}-{max(sc):5.1f} mean {S.mean(sc):5.1f} | words {S.mean(x[1]['n'] for x in xs):5.0f} sent {S.mean(x[1]['sl'] for x in xs):4.1f} rare4 {S.mean(x[1]['r4'] for x in xs):4.1f}% rare3 {S.mean(x[1]['r3'] for x in xs):4.1f}% paras {S.mean(x[1]['paras'] for x in xs):3.1f}")
    if "-v" in sys.argv:
        for L in sorted(by):
            for x in sorted(by[L], key=lambda q: q[0])[-3:]: print("  hardest", L, x[2], x[0], x[1])

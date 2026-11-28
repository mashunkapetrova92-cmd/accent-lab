"""Base word list for the New words section.
Sources (both allowed for commercial use):
  CEFR-J Wordlist v1.5 (A1-B2), Tono Laboratory, TUFS — free for research and commercial use with citation.
  Octanove Vocabulary Profile C1/C2 v1.0 — CC BY-SA 4.0.
One entry per (headword, part of speech), at its lowest level. Spelling variants -> the American one."""
import csv, json, re, collections
SRC = "/home/claude/ext/olp-en-cefrj/"
BRIT = [r"our(s|ed|ing|ite|ful|able)?$", r"our(ite|ful|able|less|er)", r"[^aeiou]re(s|d)?$", r"is(e|es|ed|ing|ation|ations|er)$", r"ys(e|es|ed|ing)$", r"ogue$", r"ence$", r"aeroplane", r"oe", r"ae", r"ll(ed|ing|er|ers)$", r"grey", r"tyre", r"cheque", r"programme", r"kerb", r"plough", r"mould", r"jewellery", r"pyjama", r"storey", r"draught", r"sceptic", r"judgement", r"ageing", r"whilst", r"amongst", r"acknowledgement"]
def score(v):
    return sum(bool(re.search(p, v.lower())) for p in BRIT)
def american(hw):
    vs = [v.strip() for v in hw.split("/") if v.strip()]
    if hw.startswith("a.m."): return "a.m."
    if hw.startswith("p.m."): return "p.m."
    best = min(range(len(vs)), key=lambda i: (score(vs[i]), i))
    return vs[best]
LV = ["A1", "A2", "B1", "B2", "C1", "C2"]
rows = list(csv.DictReader(open(SRC + "cefrj-vocabulary-profile-1.5.csv"))) + list(csv.DictReader(open(SRC + "octanove-vocabulary-profile-c1c2-1.0.csv")))
seen = {}
for r in rows:
    w = american(r["headword"]); pos = r["pos"].strip(); lv = r["CEFR"].strip()
    if lv not in LV: continue
    k = (w.lower(), pos)
    if k not in seen or LV.index(lv) < LV.index(seen[k]["level"]):
        seen[k] = {"w": w, "pos": pos, "level": lv, "src": r["headword"]}
out = sorted(seen.values(), key=lambda e: (LV.index(e["level"]), e["w"].lower(), e["pos"]))
json.dump(out, open("base.json", "w"), ensure_ascii=False, indent=0)
print(collections.Counter(e["level"] for e in out), len(out))
print(collections.Counter(e["pos"] for e in out))
print([ (e["src"], e["w"]) for e in out if "/" in e["src"]][:60])
from american import REPL, FIX_POS
have = {(e["w"].lower()) for e in out}
fin = []; done = set()
for e in out:
    k = (e["w"].lower(), e["pos"])
    if k in FIX_POS: e["pos"] = FIX_POS[k]
    if (e["w"].lower(), e["pos"]) in REPL:
        nw = REPL[(e["w"].lower(), e["pos"])]
        if nw is None: continue
        if nw.lower() in have and nw.lower() not in {"vest"}: continue
        e = dict(e, w=nw, us_for=e["w"])
    k = (e["w"].lower(), e["pos"])
    if k in done: continue
    done.add(k); fin.append(e)
json.dump(fin, open("base.json", "w"), ensure_ascii=False, indent=0)
print("final", len(fin), collections.Counter(e["level"] for e in fin))
print([(e["us_for"], e["w"]) for e in fin if "us_for" in e])

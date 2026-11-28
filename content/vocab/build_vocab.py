"""Merge the written entries (done/*.txt: word | pos | definition | example) with the base list,
add IPA and write public/data/vocab/<LEVEL>.json. Prints problems to fix."""
import json, re, sys, os, glob, collections
sys.path.insert(0, "/home/claude/content")
from ipa_lib import word_ipa, phrase_ipa, bare
PUB = "/home/claude/accent-lab/public/data/vocab"
OVR = json.load(open("ipa_vocab.json")) if os.path.exists("ipa_vocab.json") else {}
base = json.load(open("base.json"))
WM = json.load(open("/home/claude/accent-lab/public/data/words.json"))
noclip = []
todo = {}
for f in sorted(glob.glob("todo/*.txt")):
    todo[os.path.basename(f)] = [tuple(x.strip() for x in l.split("|")) for l in open(f) if l.strip()]
LV = ["A1", "A2", "B1", "B2", "C1", "C2"]
POS = {"noun": "n", "verb": "v", "adjective": "adj", "adverb": "adv", "preposition": "prep", "determiner": "det", "pronoun": "pron",
       "conjunction": "conj", "number": "num", "modal auxiliary": "modal", "be-verb": "v", "do-verb": "v", "have-verb": "v",
       "interjection": "interj", "infinitive-to": "particle"}
BRIT = re.compile(r"\b(colour|favourite|centre|theatre|metre|litre|organis|realis|apologis|travell|neighbour|lorry|petrol|holiday|queue|trousers|biscuit|mobile phone|autumn|rubbish|shop\b|shops\b|maths|whilst|amongst|programme|cheque|grey|tyre|pavement|motorway|car park|football|cinema|film\b|films\b|fortnight|towards|learnt|spelt|dreamt|got to know|at the weekend|in hospital|mum\b|lift\b|post\b|timetable|cooker)", re.I)
def forms(w):
    w = w.lower(); f = {w}
    for s in ["s", "es", "ed", "d", "ing", "er", "est", "ly", "'s", "ies", "ied"]: f.add(w + s)
    if w.endswith("e"): f |= {w[:-1] + "ing", w[:-1] + "ed"}
    if w.endswith("y"): f |= {w[:-1] + "ies", w[:-1] + "ied", w[:-1] + "ier", w[:-1] + "iest", w[:-1] + "ily"}
    if len(w) > 2 and w[-1] not in "aeiouwxy": f |= {w + w[-1] + s for s in ["ing", "ed", "er", "est"]}
    return f
RENAME = {"make-up": "makeup", "film-maker": "filmmaker", "hand-held": "handheld", "hard-working": "hardworking", "public transport": "public transportation", "second-hand": "secondhand", "takeaway": "takeout", "windscreen": "windshield", "semi-final": "semifinal", "wornout": "worn-out", "chauffer": "chauffeur", "chiselled": "chiseled", "gruelling": "grueling", "mark-up": "markup", "repellant": "repellent", "tastebud": "taste bud", "flatout": "flat-out", "porten": "portent", "side-step": "sidestep", "sulphuric": "sulfuric", "taste-maker": "tastemaker"}
PREF = {"anti": "ˌænti", "un": "ʌn", "re": "ri", "dis": "dɪs", "mis": "mɪs", "non": "nɑn", "over": "ˌoʊvɚ", "under": "ˌʌndɚ", "bio": "ˌbaɪoʊ", "multi": "ˌmʌlti", "pre": "pri", "inter": "ˌɪntɚ", "super": "ˌsupɚ", "self": "ˌsɛlf", "semi": "ˌsɛmi", "co": "ˌkoʊ", "micro": "ˌmaɪkroʊ"}
SUF = [("ically", "ɪkli"), ("ably", "əbli"), ("ibly", "əbli"), ("able", "əbəl"), ("ly", "li"), ("ness", "nəs"), ("less", "ləs"), ("ful", "fəl"), ("ment", "mənt"), ("er", "ɚ"), ("ing", "ɪŋ"), ("ed", "d")]
def compound_ipa(w):
    w = w.lower()
    if not w.isalpha(): return ""
    for suf, si in SUF:
        if w.endswith(suf):
            b = w[:-len(suf)]
            for base in (b, b + "e", b[:-1] + "y" if b.endswith("i") else None):
                if suf == "ically": base = b + "ic" if base == b else None
                if base and word_ipa(base):
                    bi = bare(word_ipa(base))
                    if suf == "ically" and bi.endswith("ɪk"): bi = bi[:-2]
                    if suf == "ly" and bi.endswith("l"): si = "i"
                    else: si = dict(SUF)[suf]
                    if "ˈ" not in bi: bi = "ˈ" + bi
                    return "/" + bi + si + "/"
    best = ""
    for i in range(2, len(w) - 1):
        a, b = w[:i], w[i:]
        ia = PREF.get(a) or bare(word_ipa(a)) if (PREF.get(a) or word_ipa(a)) else ""
        ib = bare(word_ipa(b)) if word_ipa(b) else ""
        if len(a) < 3 and a not in PREF: continue
        if len(b) < 3: continue
        if ia and ib:
            ib2 = ib.replace("ˈ", "ˌ")
            if a in PREF and "ˈ" not in ia: ib2 = ib
            if "ˈ" not in ia and "ˌ" not in ia and a not in PREF: ia = "ˈ" + ia
            if a in PREF: ib2 = ib
            cand = "/" + ia + ib2 + "/"
            if not best or abs(len(a) - len(b)) < best[1]: best = (cand, abs(len(a) - len(b)))
    return best[0] if best else ""
IRREG = json.load(open("irregular.json")) if os.path.exists("irregular.json") else {}
probs = collections.defaultdict(list); out = collections.defaultdict(list)
for fn, items in todo.items():
    done = f"done/{fn}"
    if not os.path.exists(done): continue
    rows = [[x.strip() for x in l.split("|")] for l in open(done) if l.strip()]
    if len(rows) != len(items): probs["count"].append(f"{fn}: {len(rows)} rows for {len(items)} items")
    for i, it in enumerate(items):
        if i >= len(rows): break
        r = rows[i]
        if len(r) != 4 or (r[0], r[1]) != it: probs["order"].append(f"{fn}:{i+1} {it} vs {r[:2]}"); continue
        w, pos, d, ex = r
        if d == "-": continue  # dropped: British-only word or a duplicate of an American one
        lv = fn[:2]
        key = w
        w = RENAME.get(w, w)
        ww = w.replace("-", " ")
        ipa = OVR.get(w) or OVR.get(w.lower()) or (phrase_ipa(ww) if " " in ww.strip() else word_ipa(ww))
        if not ipa: ipa = compound_ipa(ww.replace(" ", ""))
        if not ipa: probs["ipa"].append(w)
        elif ipa and w not in OVR and not (phrase_ipa(ww) if " " in ww.strip() else word_ipa(ww)): probs["ipa-guess"].append(f"{w} {ipa}")
        low = ex.lower(); toks = set(re.findall(r"[a-z][a-z'-]*", low)) | {t.split("'")[0] for t in re.findall(r"[a-z][a-z'-]*", low)}
        wl = w.lower()
        if " " in wl:
            first, rest = wl.split(" ", 1)
            ok = wl in low or any(f + " " + rest in low for f in forms(first) | set(IRREG.get(first, [])))
        elif "-" in wl or "." in wl: ok = wl in low
        else: ok = bool(toks & (forms(wl) | set(IRREG.get(wl, []))))
        if not ok: probs["example"].append(f"{fn} {w} ({pos}): {ex}")
        if BRIT.search(ex) or BRIT.search(d): probs["british"].append(f"{w}: {d} / {ex}")
        if pos != "number" and re.search(r"\d", ex + d): probs["digits"].append(f"{w}: {ex}")
        if len(d.split()) > 22: probs["long def"].append(f"{w}: {d}")
        if not ex.rstrip().endswith((".", "!", "?", '"', "”")): probs["punct"].append(f"{w}: {ex}")
        item = {"w": w, "p": POS.get(pos, pos), "i": ipa, "d": d, "e": ex}
        c = WM.get(w.lower()) if " " not in w else None
        if c: item["c"] = c
        elif " " not in w: noclip.append(w)
        out[lv].append(item)
os.makedirs(PUB, exist_ok=True)
for lv in LV:
    if out[lv]: json.dump(out[lv], open(f"{PUB}/{lv}.json", "w"), ensure_ascii=False, separators=(",", ":"))
json.dump({lv: len(out[lv]) for lv in LV}, open(f"{PUB}/index.json", "w"))
print({lv: len(out[lv]) for lv in LV}, "without audio:", len(noclip))
json.dump(sorted(set(noclip)), open("noclip.json", "w")); open("guesses.txt", "w").write("\n".join(probs["ipa-guess"]))
for k, v in probs.items():
    print(f"== {k}: {len(v)}"); [print("  ", x) for x in v[:40]]

"""Decide how each single word is checked, from the offline calibration of the model recordings (qa/calib2.mjs).
p: against its confusable words; o: also against free recognition; n: compare by ear (the recognizer cannot
confirm even the model). ref: the model recording's own result, used to normalize the learner's score."""
import json, sys, collections
PUB = "/home/claude/accent-lab/public"
def decide(rows):
    # the natural-speed recording decides (learners imitate it); the slow one is a teaching aid
    rows = [r for r in rows if not r["id"].endswith("|1")] or rows
    alts = rows[0]["alt"]
    pair = min(r["pair"] for r in rows); opn = min(r["open"] for r in rows)
    # free recognition is included whenever the model recording passes with it (it also catches errors
    # that are not among the listed confusable words); otherwise only the confusable words are compared
    if opn >= 60: return "o", opn
    if alts and pair >= 60: return "p", pair
    return "n", max(pair if alts else 0, opn)

def modules(path="/home/claude/qa/calib2_modules_base.json"):
    R = json.load(open(path)); by = collections.defaultdict(list)
    for r in R: nid, w, k = r["id"].split("|"); by[(nid, w)].append(r)
    d = json.load(open(f"{PUB}/data/sounds.json")); stats = collections.Counter()
    for n in d["nodes"]:
        for w in n["words"]:
            rows = by.get((n["id"], w["text"].lower()))
            if " " in w["text"] or not rows: continue
            m, ref = decide(rows); w["check"] = m; w["ref"] = ref; stats[m] += 1
            if m == "n": print("  compare by ear:", n["id"], w["text"], rows[0]["heard"], [(r["pair"], r["open"]) for r in rows])
    json.dump(d, open(f"{PUB}/data/sounds.json", "w"), ensure_ascii=False, separators=(",", ":"))
    print("lesson words", dict(stats))

def words(path="/home/claude/qa/calib2_words_base.json"):
    """Words of the texts. Calibrated words use their result; the rest: grammar words are compared by ear
    (alone they are hard to recognize and are practised in sentences anyway), other words are checked
    against their confusable words if they have any, otherwise against free recognition."""
    import os
    sys.path.insert(0, "/home/claude/content")
    from ipa_lib import FUNCTION
    wm = json.load(open(f"{PUB}/data/words.json"))
    alts = json.load(open(f"{PUB}/data/alts.json")) if os.path.exists(f"{PUB}/data/alts.json") else {}
    R = {r["word"]: r for r in json.load(open(path))} if os.path.exists(path) else {}
    out = {}; stats = collections.Counter()
    for w in wm:
        if w in R:
            m, ref = decide([R[w]]); a = R[w]["alt"]; src = "calibrated"
        elif w in FUNCTION:
            m, ref, a, src = "n", 0, [], "grammar word"
        else:
            a = alts.get(w, []); m, ref, src = "o", 100, "default"
        out[w] = [m, ref] + (a if m in ("p", "o") else [])
        stats[(src, m)] += 1
    json.dump(out, open(f"{PUB}/data/checks.json", "w"), separators=(",", ":"))
    print("text words", dict(stats), "of", len(wm))

if __name__ == "__main__":
    if "modules" in sys.argv: modules()
    if "words" in sys.argv: words()

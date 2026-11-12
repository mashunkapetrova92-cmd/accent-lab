"""Validate the sound curriculum against the CMU dictionary."""
import re, sys, json, cmudict
sys.path.insert(0, "/home/claude/content")
D = cmudict.dict()

# target IPA -> ARPAbet patterns (lists of phone bases, stress ignored except AH0/ER0 handling)
PAT = {
 "i": [["IY"]], "ɪ": [["IH"]], "ɛ": [["EH"]], "æ": [["AE"]], "ʌ": [["AH1"],["AH2"]], "ɑ": [["AA"]],
 "ə": [["AH0"]], "ɚ": [["ER0"]], "ɝ": [["ER1"],["ER2"]], "u": [["UW"]], "ʊ": [["UH"]], "ɔ": [["AO"]],
 "eɪ": [["EY"]], "oʊ": [["OW"]], "aɪ": [["AY"]], "aʊ": [["AW"]], "ɔɪ": [["OY"]],
 "ɑr": [["AA","R"]], "ɔr": [["AO","R"]], "ɪr": [["IH","R"],["IY","R"]], "ɛr": [["EH","R"],["AE","R"]],
 "p": [["P"]], "b": [["B"]], "t": [["T"]], "d": [["D"]], "k": [["K"]], "ɡ": [["G"]],
 "m": [["M"]], "n": [["N"]], "ŋ": [["NG"]], "f": [["F"]], "v": [["V"]], "θ": [["TH"]], "ð": [["DH"]],
 "s": [["S"]], "z": [["Z"]], "ʃ": [["SH"]], "ʒ": [["ZH"]], "tʃ": [["CH"]], "dʒ": [["JH"]], "h": [["HH"]],
 "w": [["W"]], "j": [["Y"]], "l": [["L"]], "ɹ": [["R"]],
}

def base(p, keep_stress=False):
    if keep_stress and p[:2] in ("AH", "ER"):
        return p
    return re.sub(r"\d", "", p)

def has(phones, pat):
    for alt in pat:
        n = len(alt)
        for i in range(len(phones) - n + 1):
            ok = True
            for k in range(n):
                want = alt[k]; got = phones[i + k]
                if re.search(r"\d", want):
                    if got != want and not (want in ("AH1","AH2") and got in ("AH1","AH2")) and not (want in ("ER1","ER2") and got in ("ER1","ER2")): ok = False
                elif base(got) != want: ok = False
            if ok: return True
    return False

def prons(w):
    w = w.lower()
    if w in D: return D[w]
    return None

def plain(w): return w.replace("{", "").replace("}", "")

def diff(a, b):
    """phone-level edit distance on stress-stripped bases, with AH0 kept distinct from AH1"""
    a = [base(x, True) for x in a]; b = [base(x, True) for x in b]
    a = [x.replace("AH2","AH1").replace("ER2","ER1") for x in a]; b = [x.replace("AH2","AH1").replace("ER2","ER1") for x in b]
    n, m = len(a), len(b)
    Dm = [[0]*(m+1) for _ in range(n+1)]
    for i in range(n+1): Dm[i][0] = i
    for j in range(m+1): Dm[0][j] = j
    for i in range(1, n+1):
        for j in range(1, m+1):
            Dm[i][j] = min(Dm[i-1][j]+1, Dm[i][j-1]+1, Dm[i-1][j-1] + (a[i-1] != b[j-1]))
    return Dm[n][m]

def check(nodes):
    errs = 0
    ids = set()
    for nd in nodes:
        nid = nd["id"]
        if nid in ids: print("DUP ID", nid); errs += 1
        ids.add(nid)
        pats = [PAT[t] for t in nd["targets"] if t in PAT]
        custom = nd.get("custom")
        # words
        if len(nd["words"]) < 8: print(nid, "too few words"); errs += 1
        for w in nd["words"]:
            if "{" not in w and not custom: print(nid, "no highlight:", w); errs += 1
            pw = plain(w)
            if " " in pw:
                for q in pw.split():
                    if not prons(q): print(nid, "phrase word not in dict:", q); errs += 1
                continue
            pr = prons(pw)
            if not pr: print(nid, "word not in dict:", pw); errs += 1; continue
            if pats and not custom and not any(any(has(p, pt) for pt in pats) for p in pr):
                print(nid, "word lacks target:", pw, [" ".join(p) for p in pr][:2]); errs += 1
        # sets
        for s in nd.get("sets", []):
            for w in s:
                if not prons(w): print(nid, "set word not in dict:", w); errs += 1
            if custom or any(not prons(w) for w in s): continue
            tgt = prons(s[0])
            if pats and not any(any(has(p, pt) for pt in pats) for p in tgt):
                print(nid, "set target lacks sound:", s[0]); errs += 1
            for w in s[1:]:
                d = min(diff(a, b) for a in tgt for b in prons(w))
                lim = nd.get("set_dist", 1)
                if d > lim: print(nid, f"set not minimal ({d}):", s[0], w, " ".join(tgt[0]), "|", " ".join(prons(w)[0])); errs += 1
                if pats and any(any(has(p, pt) for pt in pats) for p in prons(w)) and nd.get("strict_contrast", True):
                    print(nid, "contrast word also has target:", w); errs += 1
        # labelled items
        for it in nd.get("items", []):
            for w in re.findall(r"[A-Za-z']+", it["say"]):
                if not prons(w): print(nid, "item word not in dict:", w); errs += 1
            if it["answer"] not in it.get("options", nd.get("labels", [])): print(nid, "bad label", it); errs += 1
        # sentences
        if len(nd["sentences"]) < 5: print(nid, "too few sentences"); errs += 1
        for snt in nd["sentences"]:
            toks = re.findall(r"[A-Za-z']+", snt)
            cnt = 0
            for t in toks:
                pr = prons(t.lower().strip("'")) or (prons(t.lower()[:-2]) if t.lower().endswith("'s") else None)
                if not pr: print(nid, "sentence word not in dict:", t); errs += 1; continue
                if pats and any(any(has(p, pt) for pt in pats) for p in pr): cnt += 1
            if pats and not custom and cnt < 2: print(nid, f"sentence has {cnt} target words:", snt); errs += 1
        for k in ("tongue","lips","jaw","voicing","airflow","feel","note","contrast"):
            if not nd.get(k): print(nid, "missing", k); errs += 1
    return errs

if __name__ == "__main__":
    from sounds_a import V
    nodes = list(V)
    try:
        from sounds_b import C
        nodes += C
    except ImportError:
        pass
    e = check(nodes)
    print("nodes", len(nodes), "errors", e)

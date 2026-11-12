"""QA: recognize phonemes in every sound-module recording and compare with the expected General American IPA."""
import sys, json, os, re
sys.path.insert(0, "/home/claude/content"); sys.path.insert(0, "/home/claude/qa")
from sounds_a import V
from sounds_b import C
from ipa_lib import word_ipa, phrase_ipa
from phon import phones, load16
import hashlib
AUD = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/audio"
NEW = "audio2" in AUD
man = json.load(open(f"{AUD}/manifest.json")) if not NEW else None
MAIN = "en-US-AvaMultilingualNeural"
HVPT = ["en-US-AvaMultilingualNeural", "en-US-AndrewMultilingualNeural", "en-US-EmmaMultilingualNeural"]
def slug_old(text, voice): return hashlib.md5((voice + "|" + text).encode()).hexdigest()[:16]
def slug_new(text, voice, rate="+0%"): return hashlib.md5((voice + "|" + rate + "|" + text).encode()).hexdigest()[:16]
def path(text, voice, rate="+0%"):
    if NEW: return f"{AUD}/clips/{slug_new(text, voice, rate)}.mp3"
    sid = man["clips"].get(voice + "|" + text) or slug_old(text, voice)
    return f"{AUD}/clips/{sid}.mp3"
MAP = {"iː": "i", "i": "i", "ɪ": "ɪ", "ᵻ": "ɪ", "ɛ": "ɛ", "e": "eɪ", "eɪ": "eɪ", "eː": "eɪ", "æ": "æ", "a": "æ", "ʌ": "ʌ", "ɐ": "ə", "ə": "ə", "ɑː": "ɑ", "ɑ": "ɑ", "aː": "ɑ",
       "ɔː": "ɔ", "ɔ": "ɔ", "ɒ": "ɑ", "ʊ": "ʊ", "uː": "u", "u": "u", "o": "oʊ", "oː": "oʊ", "oʊ": "oʊ", "əʊ": "oʊ", "aɪ": "aɪ", "aʊ": "aʊ", "ɔɪ": "ɔɪ", "oɪ": "ɔɪ",
       "ɚ": "ɚ", "ɜː": "ɝ", "ɜ": "ɝ", "ɹ": "r", "r": "r", "ɾ": "ɾ", "ɡ": "ɡ", "g": "ɡ", "kh": "k", "ph": "p", "th": "t", "ɫ": "l", "əl": "l̩", "l̩": "l̩", "n̩": "n̩",
       "ɑːɹ": "ɑr", "ɔːɹ": "ɔr", "oːɹ": "ɔr", "ɪɹ": "ɪr", "iə": "ɪr", "ɛɹ": "ɛr", "ʊɹ": "ʊr", "aɪɚ": "aɪr", "aɪə": "aɪr", "ju": "ju"}
UN = ["tʃ", "dʒ", "eɪ", "oʊ", "aɪ", "aʊ", "ɔɪ", "n̩", "l̩"]
VOW = set("ɑæʌɔaeɛɪiouʊəɚɝ")
def units(ipa):
    s = re.sub(r"[/ˈˌ‿| ]", "", ipa); out = []; i = 0
    while i < len(s):
        two = s[i:i + 2]
        if two in UN: out.append(two); i += 2; continue
        c = s[i]
        if c in "ɑɔɪɛʊ" and i + 1 < len(s) and s[i + 1] == "r" and (i + 2 >= len(s) or s[i + 2] not in VOW): out.append(c + "r"); i += 2; continue
        if c == "̩": out[-1] += c; i += 1; continue
        out.append(c); i += 1
    return out
def norm_rec(ph):
    out = []
    for p in ph:
        q = MAP.get(p, p)
        if q == "ju": out += ["j", "u"]
        else: out.append(q)
    return out
def lev(a, b):
    d = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1): d[i][0] = i
    for j in range(len(b) + 1): d[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            d[i][j] = min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] != b[j-1]))
    return d[len(a)][len(b)]
MARKS = {"r": ["r"], "flap": ["ɾ"], "syllabic": ["n̩", "l̩"], "darkl": ["l", "l̩"], "reduced": ["ə", "ɚ"], "schwa": ["ə", "ɚ"], "linking": [], "voicing": ["d", "b", "ɡ", "z", "v"], "aspiration": ["p", "t", "k"], "er": ["ɝ", "ɚ"]}
rep = []; cache = {}
def rec(text, voice):
    k = (text, voice)
    if k not in cache:
        p = path(text, voice)
        cache[k] = norm_rec(phones(load16(p))) if os.path.exists(p) else None
    return cache[k]
for nd in V + C:
    marks = MARKS.get(nd["id"], nd["targets"])
    for w in nd["words"]:
        t = w.replace("{", "").replace("}", "")
        if " " in t: continue
        exp = units(word_ipa(t)); got = rec(t, MAIN)
        if got is None: rep.append({"node": nd["id"], "kind": "word", "text": t, "issue": "missing audio"}); continue
        has = [m for m in marks if m in got]
        rep.append({"node": nd["id"], "kind": "word", "text": t, "voice": "Ava", "exp": " ".join(exp), "got": " ".join(got), "per": round(lev(exp, got) / max(1, len(exp)), 2), "target_found": bool(has) or not marks})
    for st in nd.get("sets", []):
        got = {w: {v.split("-")[2].replace("MultilingualNeural", ""): rec(w, v) for v in HVPT} for w in st}
        for w in st:
            exp = units(word_ipa(w))
            for v, g in got[w].items():
                if g is None: continue
                rep.append({"node": nd["id"], "kind": "set", "text": w, "voice": v, "exp": " ".join(exp), "got": " ".join(g), "per": round(lev(exp, g) / max(1, len(exp)), 2)})
        for v in HVPT:
            vv = v.split("-")[2].replace("MultilingualNeural", "")
            seqs = [tuple(got[w][vv] or ()) for w in st]
            if len(set(seqs)) < len(seqs): rep.append({"node": nd["id"], "kind": "pair-merged", "text": " / ".join(st), "voice": vv, "got": [" ".join(s) for s in seqs]})
    print("done", nd["id"], flush=True)
json.dump(rep, open("/home/claude/qa/qa_modules_%s.json" % ("new" if NEW else "old"), "w"), ensure_ascii=False, indent=0)

"""Build app data (JSON) and audio sprites from content and the 96 kbps recordings in /home/claude/audio2.

Changes from build_data.py:
  * single words use the English-only voices (see gen_audio2.py), sentences and texts the multilingual Ava voice
  * every word, key word and sentence has a natural slow recording, stored in the same sprite (6-element clips)
  * sprites are encoded once from the 96 kbps sources at 64 kbps (texts at 48 kbps) instead of 40-48 kbps
  * gentler silence trimming, so weak final sounds (f, th, s, released stops) are never cut
  * file names carry a content hash, so an updated recording can never be mixed with old timing data
  * data/audio.json lists the exact length of every file (browsers differ in how they report MP3 length)
  * data/alts.json and per-word "alt" lists: real words that a learner's mispronunciation is likely to produce
"""
import json, os, re, sys, subprocess, hashlib, shutil, random
import numpy as np
sys.path.insert(0, "/home/claude/content")
from ipa_lib import word_ipa, phrase_ipa, norm, WEAK_SAFE, FUNCTION, bare, is_homograph, D as CMUD
from check_stories import norm_tokens
from sounds_a import V
from sounds_b import C
import gen_audio2 as G

AUD = "/home/claude/audio2"
PUB = "/home/claude/accent-lab/public"
SR = 24000
MAIN, WORD, HVPT = G.MAIN, G.WORD, G.HVPT
DURATIONS = {}

def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32)

def trim(x, lead=0.07, tail=0.14, thr_db=-50):
    """Remove leading/trailing silence, keeping generous margins for weak onsets and releases."""
    if len(x) == 0: return x
    win = int(SR * 0.01); n = len(x) // win
    if n == 0: return x
    rms = np.sqrt((x[: n * win].reshape(n, win) ** 2).mean(axis=1) + 1e-9)
    thr = 32768 * 10 ** (thr_db / 20)
    idx = np.where(rms > thr)[0]
    if len(idx) == 0: return x
    a = max(0, idx[0] * win - int(lead * SR)); b = min(len(x), (idx[-1] + 1) * win + int(tail * SR))
    y = x[a:b].copy()
    f = min(len(y) // 4, int(0.004 * SR))  # 4 ms fades: no clicks at the cut
    if f > 0: y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    return y

def encode(x, path, kbps):
    pcm = np.clip(x, -32768, 32767).astype(np.int16).tobytes()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", "-codec:a", "libmp3lame", "-b:a", f"{kbps}k", path], input=pcm, check=True)

def publish(tmp, prefix):
    """Move an encoded file to its content-hashed name; returns the published relative path."""
    h = hashlib.sha1(open(tmp, "rb").read()).hexdigest()[:8]
    rel = f"{prefix}-{h}.mp3"
    os.replace(tmp, f"{PUB}/audio/{rel}")
    return rel

class Sprite:
    """Clips separated by 0.35 s of silence; offsets are exact (seconds in the decoded, delay-free audio)."""
    GAP = 0.35; LEAD = 0.30
    def __init__(self, prefix, kbps=64): self.prefix = prefix; self.kbps = kbps; self.parts = []; self.pos = 0.0; self.refs = []
    def add(self, x):
        start = self.LEAD + self.pos
        self.parts.append(x); self.pos += len(x) / SR + self.GAP
        return [self.prefix, round(start, 3), round(start + len(x) / SR, 3)]
    def clip(self, x, slow=None):
        c = self.add(x)
        if slow is not None: c += self.add(slow)
        self.refs.append(c)
        return c
    def write(self):
        sil = np.zeros(int(self.GAP * SR), dtype=np.float32)
        allx = [np.zeros(int(self.LEAD * SR), dtype=np.float32)]
        for p in self.parts: allx += [p, sil]
        y = np.concatenate(allx)
        tmp = f"{PUB}/audio/{self.prefix}.tmp.mp3"
        encode(y, tmp, self.kbps)
        rel = publish(tmp, self.prefix)
        DURATIONS[rel] = round(len(y) / SR, 4)
        for c in self.refs:
            c[0] = rel
            if len(c) == 6: c[3] = rel
        return rel

MAN = {}
for k in ("clips", "words", "stories"):
    p = f"{AUD}/manifest-{k}.json"
    if os.path.exists(p): MAN.update(json.load(open(p)))

def clip_file(text, voice, rate="+0%"):
    tt = text if voice == MAIN else G.spoken(text)
    p = f"{AUD}/clips/{G.slug(tt, voice, rate)}.mp3"
    return p if os.path.exists(p) else None

# ---------------- confusable words ----------------
from wordfreq import zipf_frequency
REV = {}
for w, prons in CMUD.items():
    if not re.fullmatch(r"[a-z']+", w): continue
    for pr in prons:
        REV.setdefault(tuple(re.sub(r"\d", "", x) for x in pr), set()).add(w)
SUBS = {
    "IY": ["IH"], "IH": ["IY", "EH"], "EH": ["AE", "IH", "EY"], "AE": ["EH", "AH", "AA"], "AH": ["AA", "AE", "UH"],
    "AA": ["AH", "AO", "OW", "AE"], "AO": ["OW", "AA"], "UW": ["UH"], "UH": ["UW", "AH"], "EY": ["EH"], "OW": ["AO", "AA", "UW"],
    "AY": ["EY"], "AW": ["OW", "AA"], "OY": ["OW"], "ER": ["AA", "EH", "AO"],
    "TH": ["S", "F", "T"], "DH": ["Z", "D", "V"], "V": ["W", "F", "B"], "W": ["V"], "R": ["L"], "L": ["R"], "NG": ["N"],
    "SH": ["S", "CH"], "ZH": ["SH", "Z"], "CH": ["SH"], "JH": ["CH"], "Z": ["S"], "S": ["SH", "TH"], "F": ["V", "P"],
    "B": ["P", "V"], "P": ["B", "F"], "D": ["T"], "T": ["D"], "G": ["K"], "K": ["G"], "M": ["N"], "N": ["M", "NG"],
}
NODE_PH = {"i": ["IY"], "ih": ["IH"], "eh": ["EH"], "ae": ["AE"], "uh": ["AH"], "aa": ["AA"], "uw": ["UW"], "uhh": ["UH"], "ao": ["AO"],
           "p": ["P"], "b": ["B"], "t": ["T"], "d": ["D"], "k": ["K"], "g": ["G"], "aspiration": ["P", "T", "K"], "m": ["M"], "n": ["N"], "ng": ["NG"],
           "ey": ["EY"], "ow": ["OW"], "ay": ["AY"], "aw": ["AW"], "oy": ["OY"],
           "f": ["F"], "v": ["V"], "s": ["S"], "z": ["Z"], "sh": ["SH"], "zh": ["ZH"], "ch": ["CH"], "j": ["JH"], "h": [], "th": ["TH"], "dh": ["DH"],
           "w": ["W"], "y": [], "l": ["L"], "darkl": ["L"], "r": ["R"], "er": ["ER"], "ar": ["AA"], "or": ["AO"], "ir": ["IH", "IY"], "air": ["EH"]}

LEX = {l.strip() for l in open("/home/claude/content/lex/american-english") if l.strip().islower()}  # lower-case entries: no names
SHORT_OK = {"a", "i", "be", "he", "me", "we", "so", "no", "go", "do", "to", "up", "us", "at", "it", "in", "on", "an", "as", "or", "by", "my", "of", "oh", "ox", "if", "is"}
# never offered as "you said ... instead": offensive or embarrassing words
BLOCK = set("""bitch bitches shit shits shitty piss pissed fuck fucks fucked cunt dick dicks cock cocks ass asses arse damn crap slut sluts whore whores
fag fags nigger nigga tit tits titty porn porno sex sexy rape raped butt butts boob boobs bum hell bastard prick pricks wank horny nude naked
penis vagina anal anus semen sperm""".split())
def neighbors(word, focus=None, minz=3.0, k=3):
    """Real, reasonably common words that differ from `word` by one typical learner substitution."""
    out = {}; seen_pron = {}
    w = word.lower()
    own = {tuple(re.sub(r"\d", "", x) for x in pr) for pr in CMUD.get(w, [])}
    for ph in own:
        for i, p in enumerate(ph):
            if focus is not None and p not in focus: continue
            for q in SUBS.get(p, []):
                cand = ph[:i] + (q,) + ph[i + 1:]
                if cand in own: continue
                for c in REV.get(cand, ()):
                    if c == w or c.replace("'", "") == w or c not in LEX or "'" in c or c in BLOCK: continue
                    if len(c) <= 2 and c not in SHORT_OK: continue
                    z = zipf_frequency(c, "en")
                    if z < minz: continue
                    # keep one spelling per pronunciation (sink, not also sync)
                    prev = seen_pron.get(cand)
                    if prev and out.get(prev, 0) >= z: continue
                    if prev: out.pop(prev, None)
                    seen_pron[cand] = c; out[c] = z
    return [c for c, _ in sorted(out.items(), key=lambda x: -x[1])][:k]

# ---------------- sounds ----------------
SECTIONS = [
    ("vowels", "Vowel foundations", "The core vowels of American English, from clear contrasts to the reduced schwa.", "#0E7C86", ["i", "ih", "eh", "ae", "uh", "aa", "schwa", "uw", "uhh", "ao"]),
    ("consonants", "Consonant foundations", "Stops, aspiration and nasals.", "#4F5BD5", ["p", "b", "t", "d", "k", "g", "aspiration", "m", "n", "ng"]),
    ("diphthongs", "Diphthongs", "Vowels that glide from one position to another.", "#8E4CC4", ["ey", "ow", "ay", "aw", "oy"]),
    ("fricatives", "Fricatives and affricates", "Continuous hissing and buzzing sounds, including TH.", "#1C7FC0", ["f", "v", "s", "z", "sh", "zh", "ch", "j", "h", "th", "dh"]),
    ("liquids", "Liquids and glides", "W, Y, L, dark L and the American R.", "#23875C", ["w", "y", "l", "darkl", "r"]),
    ("rhotic", "R-colored vowels", "Vowels shaped by American R.", "#B8730F", ["er", "ar", "or", "ir", "air"]),
    ("connected", "Connected speech", "Flaps, reductions and linking that make speech sound natural.", "#C8445A", ["flap", "voicing", "syllabic", "reduced", "linking"]),
]
ALL = {n["id"]: n for n in V + C}
MARKS = {"r": ["r"], "flap": ["ɾ"], "syllabic": ["n̩", "l̩"], "darkl": ["l", "l̩"], "reduced": ["ə", "ɚ"], "schwa": ["ə", "ɚ"],
         "linking": ["‿"], "voicing": ["d", "b", "ɡ", "z", "v"], "aspiration": ["p", "t", "k"], "er": ["ɝ", "ɚ"]}
UNITS2 = ["tʃ", "dʒ", "eɪ", "oʊ", "aɪ", "aʊ", "ɔɪ", "n̩", "l̩"]
VOW = set("ɑæʌɔaeɛɪiouʊəɚɝ")
def units(ipa):
    s = ipa.replace("/", "").replace("ˈ", "").replace("ˌ", ""); out = []; i = 0
    while i < len(s):
        two = s[i:i + 2]
        if two in UNITS2: out.append(two); i += 2; continue
        c = s[i]
        if c in "ɑɔɪɛʊ" and i + 1 < len(s) and s[i + 1] == "r" and (i + 2 >= len(s) or s[i + 2] not in VOW): out.append(c + "r"); i += 2; continue
        out.append(c); i += 1
    return out
def parts_of(w):
    out = []
    for m in re.finditer(r"\{([^}]*)\}|([^{}]+)", w):
        out.append({"t": m.group(1), "hl": True} if m.group(1) is not None else {"t": m.group(2)})
    return out
def ipa_of(text): return phrase_ipa(text) if " " in text.strip() else word_ipa(text)

MISSING = []
def build_sounds(alt_override=None):
    nodes = []; pool = []
    for sid, title, blurb, color, ids in SECTIONS:
        for nid in ids:
            for w in ALL[nid]["words"]:
                t = G.plain(w)
                if " " not in t: pool.append((t, word_ipa(t)))
    random.seed(7)
    for sid, title, blurb, color, ids in SECTIONS:
        for nid in ids:
            nd = ALL[nid]
            sp = Sprite(f"s/{nid}", 64)
            marks = MARKS.get(nid, nd["targets"])
            def model(text, voice=WORD, slow=True, sentence=False):
                p = clip_file(text, voice)
                if not p: MISSING.append((nid, voice, text)); return None
                sl = None
                if slow:
                    ps = clip_file(text, voice, G.SLOW_SENT if (sentence or " " in text) else G.SLOW_WORD)
                    if ps: sl = trim(decode(ps))
                    else: MISSING.append((nid, voice, text, "slow"))
                return sp.clip(trim(decode(p)), sl)
            words = []
            for w in nd["words"]:
                t = G.plain(w)
                item = {"text": t, "parts": parts_of(w), "ipa": ipa_of(t), "clip": model(t)}
                if " " not in t and nid in NODE_PH:
                    alts = (alt_override or {}).get(t.lower())
                    if alts is None:
                        mates = [x for st in nd.get("sets", []) if t.lower() in [y.lower() for y in st] for x in st if x.lower() != t.lower()]
                        alts = list(dict.fromkeys(mates + neighbors(t, set(NODE_PH[nid]) or None, 3.0)))[:4]
                    if alts: item["alt"] = alts
                words.append(item)
            key = nd["key"]
            simple_key = " vs " not in key and "/" not in key
            key_clip = model(key) if simple_key else words[0]["clip"]
            key_ipa = ipa_of(key) if simple_key else ipa_of(words[0]["text"])
            drills = []; cache = {}
            def voices_for(text):
                if text not in cache:
                    cache[text] = [c for c in (model(text, v, slow=False) for v in HVPT) if c]
                return cache[text]
            for st in nd.get("sets", []):
                opt_ipa = {w: word_ipa(w) for w in st}
                opt_clips = {w: voices_for(w)[0] for w in st}
                for w in st:
                    drills.append({"say": w, "options": st, "answer": w, "clips": voices_for(w), "optIpa": opt_ipa, "optClips": opt_clips})
            for it in nd.get("items", []):
                opts = it.get("options") or nd.get("labels")
                drills.append({"say": it["say"], "options": opts, "answer": it["answer"], "clips": voices_for(it["say"])})
            sents = []
            for s in nd["sentences"]:
                toks = re.findall(r"[A-Za-z][A-Za-z'’]*", s)
                tipa = [word_ipa(t) for t in toks]
                hl = [i for i, ti in enumerate(tipa) if any(u in marks for u in units(bare(ti)))]
                if nid == "linking": hl = []
                sents.append({"text": s, "ipa": phrase_ipa(s), "clip": model(s, MAIN, True, True), "hl": hl, "tokens": toks, "tokIpa": tipa})
            idq = []
            if not nd.get("custom") and nid not in ("aspiration", "darkl"):
                cands = [w for w in words if " " not in w["text"] and any(u in marks for u in units(w["ipa"]))]
                bad = [(t, ip) for t, ip in pool if not any(u in marks for u in units(ip)) and t.lower() not in [w["text"].lower() for w in words]]
                for w in cands[:8]:
                    ds = random.sample(bad, 3)
                    idq.append({"options": [w["text"]] + [d[0] for d in ds], "answer": w["text"]})
            sp.write()
            nodes.append({
                "id": nid, "symbol": nd["symbol"], "name": nd["name"], "key": key, "keyIpa": key_ipa, "keyClip": key_clip,
                "section": sid, "category": nd["category"], "targets": nd["targets"], "diagram": nd["diagram"],
                **{k: nd[k] for k in ("tongue", "lips", "jaw", "voicing", "airflow", "feel", "note", "contrast")},
                "words": words, "drills": drills, "sentences": sents, "labels": nd.get("labels"), "marks": marks, "idq": idq, "color": color,
            })
            print("node", nid, "drills", len(drills), "idq", len(idq), flush=True)
    data = {"sections": [{"id": s[0], "title": s[1], "blurb": s[2], "color": s[3], "nodes": s[4]} for s in SECTIONS], "nodes": nodes, "voices": ["Ava", "Andrew", "Aria"]}
    json.dump(data, open(f"{PUB}/data/sounds.json", "w"), ensure_ascii=False, separators=(",", ":"))
    if MISSING: print("MISSING", len(MISSING), MISSING[:10])

# ---------------- words of the texts ----------------
def build_words(alt_override=None):
    forms = G.story_words()
    allw = sorted(forms)
    wm = {}; alts = {}
    chunk = None; n = 0; k = 0
    for w in allw:
        p = f"{AUD}/words/{G.slug(G.spoken(forms[w]), WORD, '+0%')}.mp3"
        ps = f"{AUD}/words/{G.slug(G.spoken(forms[w]), WORD, G.SLOW_WORD)}.mp3"
        if not os.path.exists(p) or not os.path.exists(ps): MISSING.append(("word", w)); continue
        if chunk is None or n >= 48:
            if chunk: chunk.write()
            chunk = Sprite(f"w/{k:03d}", 64); k += 1; n = 0
        wm[w] = chunk.clip(trim(decode(p)), trim(decode(ps))); n += 1
        a = (alt_override or {}).get(w)
        if a is None: a = neighbors(w, None, 3.0)
        if a: alts[w] = a
    if chunk: chunk.write()
    json.dump(wm, open(f"{PUB}/data/words.json", "w"), separators=(",", ":"))
    json.dump(alts, open(f"{PUB}/data/alts.json", "w"), separators=(",", ":"))
    print("words", len(wm), "chunks", k, "with alternatives", len(alts))

# ---------------- texts ----------------
AUX = {"do", "does", "did", "is", "are", "was", "were", "can", "could", "will", "would", "should", "have", "has", "had", "may", "might", "shall", "am", "isn't", "aren't", "don't", "doesn't", "didn't", "won't", "can't", "couldn't", "wouldn't"}
SENT_SPLIT = re.compile(r'(?<=[.!?])(["”’]?)\s+(?=["“‘]?[A-Z])')
def split_sentences(p):
    out = []; last = 0
    for m in SENT_SPLIT.finditer(p):
        out.append(p[last:m.start() + len(m.group(1))]); last = m.end()
    out.append(p[last:])
    return [s.strip() for s in out if s.strip()]
def ends_cons(ipa):
    u = units(bare(ipa))
    if not u: return False
    x = u[-1]
    return x[0] not in VOW or x in ("ɚ", "ɝ") or (len(x) == 2 and x.endswith("r"))
def starts_vowel(ipa):
    u = units(bare(ipa)); return bool(u) and (u[0][0] in VOW)

def align_times(tokens, bounds):
    """map text tokens to the voice's word boundaries, interpolating where needed"""
    import difflib
    bt = []
    for b in bounds:
        ns = norm_tokens(b[0])
        if not ns: continue
        d = (b[2] - b[1]) / len(ns)
        for k, n in enumerate(ns): bt.append((n, b[1] + d * k, b[1] + d * (k + 1)))
    sm = difflib.SequenceMatcher(a=tokens, b=[x[0] for x in bt], autojunk=False)
    times = [None] * len(tokens)
    for a, b, size in sm.get_matching_blocks():
        for k in range(size): times[a + k] = [round(bt[b + k][1], 3), round(bt[b + k][2], 3)]
    for i in range(len(times)):
        if times[i] is None:
            j = i
            while j < len(times) and times[j] is None: j += 1
            t0 = times[i - 1][1] if i > 0 else 0.0
            t1 = times[j][0] if j < len(times) else (t0 + 0.4 * (j - i))
            step = (t1 - t0) / (j - i)
            for k in range(i, j): times[k] = [round(t0 + step * (k - i), 3), round(t0 + step * (k - i + 1), 3)]
    return times, len(tokens) - sum(size for _, _, size in sm.get_matching_blocks())

def story_audio(src, prefix):
    tmp = f"{PUB}/audio/{prefix}.tmp.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", "48k", tmp], check=True)
    rel = publish(tmp, prefix)
    # exact length of the decoded source in seconds (the published file has the same samples)
    x = decode(src); DURATIONS[rel] = round(len(x) / SR, 4)
    return rel

def build_stories():
    stories = json.load(open("/home/claude/content/stories.json"))
    index = []
    for s in stories:
        ap, bp = f"{AUD}/stories/{s['id']}.mp3", f"{AUD}/stories/{s['id']}.json"
        sap, sbp = f"{AUD}/stories/{s['id']}.slow.mp3", f"{AUD}/stories/{s['id']}.slow.json"
        if not os.path.exists(ap): print("NO AUDIO", s["id"]); continue
        paras = []; flat = []; gi = 0; ipa = {}
        for p in s["paragraphs"]:
            sents = []
            for st in split_sentences(p):
                toks = []; a = gi
                for piece in st.split():
                    m = re.match(r"^([^A-Za-z0-9’']*)(.*?)([^A-Za-z0-9’']*)$", piece)
                    pre, core, post = m.group(1), m.group(2), m.group(3)
                    ns = norm_tokens(core)
                    if not ns:
                        if toks: toks[-1]["post"] = toks[-1].get("post", "") + " " + piece
                        continue
                    t = {"d": core.replace("’", "'"), "n": ns, "i": gi}
                    if pre: t["pre"] = pre
                    if post: t["post"] = post
                    for n in ns: ipa.setdefault(n, word_ipa(n)); flat.append(n)
                    toks.append(t); gi += len(ns)
                first = norm(toks[0]["d"]) if toks else ""
                tune = "rise" if st.rstrip('"”’').endswith("?") and first in AUX else ("fall" if st.rstrip('"”’')[-1:] in ".!?" else "none")
                sents.append({"toks": toks, "tune": tune, "a": a, "b": gi, "ipa": phrase_ipa(st)})
            paras.append({"sents": sents})
        for p in paras:
            for st in p["sents"]:
                T = st["toks"]
                for k, t in enumerate(T):
                    n = t["n"][-1]; f = 0; wi = ipa.get(n, ""); last = k == len(T) - 1
                    nxt = T[k + 1] if not last else None
                    if n in WEAK_SAFE and not last: f |= 4
                    if t["n"][0] not in FUNCTION: f |= 8
                    if "ɾ" in wi: f |= 1
                    nwi = ipa.get(nxt["n"][0], "") if nxt else ""
                    pause = bool(re.search(r"[,.;:!?—–\"”)]", t.get("post", ""))) or (nxt and re.search(r"[\"“(—]", nxt.get("pre", "") or ""))
                    if nxt and not pause and wi and nwi and ends_cons(wi) and starts_vowel(nwi): f |= 2
                    b = bare(wi)
                    if nxt and not pause and re.search(r"[aeiouæɑɔʊɪɛəʌɝɚr]t$", b) and starts_vowel(nwi) and not bare(nwi).startswith("ˈ") and (nxt["n"][0] in FUNCTION or len(units(bare(nwi))) <= 3): f |= 1
                    if any(u in ("ɝ", "ɚ") or (len(u) == 2 and u.endswith("r")) for u in units(b)): f |= 16
                    if is_homograph(n): f |= 32
                    if f: t["f"] = f
        times, unmatched = align_times(flat, json.load(open(bp)))
        if unmatched > len(flat) * 0.03: print("WARN alignment", s["id"], unmatched, "of", len(flat))
        d = {"id": s["id"], "title": s["title"], "topic": s["topic"], "words": len(flat), "minutes": max(1, round(times[-1][1] / 60)),
             "paragraphs": paras, "ipa": ipa, "audio": story_audio(ap, f"p/{s['id']}"), "times": times}
        if os.path.exists(sap) and os.path.exists(sbp):
            st_, um2 = align_times(flat, json.load(open(sbp)))
            if um2 > len(flat) * 0.03: print("WARN slow alignment", s["id"], um2)
            d["slowAudio"] = story_audio(sap, f"p/{s['id']}.slow"); d["slowTimes"] = st_
        json.dump(d, open(f"{PUB}/data/stories/{s['id']}.json", "w"), ensure_ascii=False, separators=(",", ":"))
        first = s["paragraphs"][0]
        excerpt = first[:150].rsplit(" ", 1)[0] + "…" if len(first) > 150 else first
        index.append({"id": s["id"], "title": s["title"], "topic": s["topic"], "words": d["words"], "minutes": d["minutes"], "excerpt": excerpt})
        print("story", s["id"], d["words"], "words", round(times[-1][1]), "s", "slow" if "slowAudio" in d else "", flush=True)
    json.dump(index, open(f"{PUB}/data/stories/index.json", "w"), ensure_ascii=False, separators=(",", ":"))

def files_list():
    out = []
    for root, _, fs in os.walk(PUB):
        for f in fs:
            p = os.path.join(root, f); r = os.path.relpath(p, PUB)
            if r.startswith(("audio/", "data/")) and r != "data/files.json" and not r.endswith(".tmp.mp3"): out.append([r, os.path.getsize(p)])
    json.dump({"files": sorted(out)}, open(f"{PUB}/data/files.json", "w"))
    print("files", len(out), round(sum(x[1] for x in out) / 1e6, 1), "MB")

if __name__ == "__main__":
    what = sys.argv[1:] or ["sounds", "words", "stories", "files"]
    ov = json.load(open("/home/claude/content/alt_override.json")) if os.path.exists("/home/claude/content/alt_override.json") else None
    durp = f"{PUB}/data/audio.json"
    if os.path.exists(durp): DURATIONS.update(json.load(open(durp)))
    for sub, cond in (("s", "sounds"), ("w", "words"), ("p", "stories")):
        if cond in what:
            shutil.rmtree(f"{PUB}/audio/{sub}", ignore_errors=True); os.makedirs(f"{PUB}/audio/{sub}")
            for k in [k for k in DURATIONS if k.startswith(sub + "/")]: del DURATIONS[k]
    os.makedirs(f"{PUB}/data/stories", exist_ok=True)
    if "sounds" in what: build_sounds(ov.get("sounds") if ov else None)
    if "words" in what: build_words(ov.get("words") if ov else None)
    if "stories" in what: build_stories()
    json.dump(DURATIONS, open(durp, "w"), separators=(",", ":"))
    if "files" in what: files_list()
    if MISSING: print("MISSING total", len(MISSING))

"""Build app data (JSON) and audio sprites from content + generated recordings."""
import json, os, re, sys, subprocess, hashlib, shutil
import numpy as np
sys.path.insert(0, "/home/claude/content")
from ipa_lib import word_ipa, phrase_ipa, norm, HOMO, WEAK_SAFE, FUNCTION, bare, is_homograph
from check_stories import norm_tokens
from sounds_a import V
from sounds_b import C

AUD = "/home/claude/audio"
PUB = "/home/claude/accent-lab/public"
SR = 24000
MAIN = "en-US-AvaMultilingualNeural"
HVPT = ["en-US-AvaMultilingualNeural", "en-US-AndrewMultilingualNeural", "en-US-EmmaMultilingualNeural"]
for d in ("data/stories", "audio/s", "audio/p", "audio/w"):
    os.makedirs(f"{PUB}/{d}", exist_ok=True)
manifest = json.load(open(f"{AUD}/manifest.json"))

def slug(text, voice): return hashlib.md5((voice + "|" + text).encode()).hexdigest()[:16]

def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32)

def trim(x, lead=0.04, tail=0.08, thr_db=-42):
    if len(x) == 0: return x
    win = int(SR * 0.01)
    n = len(x) // win
    if n == 0: return x
    rms = np.sqrt((x[: n * win].reshape(n, win) ** 2).mean(axis=1) + 1e-9)
    thr = 32768 * 10 ** (thr_db / 20)
    idx = np.where(rms > thr)[0]
    if len(idx) == 0: return x
    a = max(0, idx[0] * win - int(lead * SR)); b = min(len(x), (idx[-1] + 1) * win + int(tail * SR))
    return x[a:b]

def encode(x, path, kbps=48):
    pcm = np.clip(x, -32768, 32767).astype(np.int16).tobytes()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", "-codec:a", "libmp3lame", "-b:a", f"{kbps}k", path], input=pcm, check=True)

class Sprite:
    """Concatenate clips with silence; offsets are exact in samples. The MP3 encoder delay is compensated."""
    GAP = 0.35
    def __init__(self, name): self.name = name; self.parts = []; self.pos = 0.0; self.lead = 0.30
    def add(self, x):
        start = self.lead + self.pos
        self.parts.append(x); self.pos += len(x) / SR + self.GAP
        return [self.name, round(start, 3), round(start + len(x) / SR, 3)]
    def write(self, kbps=48):
        sil = np.zeros(int(self.GAP * SR), dtype=np.float32)
        allx = [np.zeros(int(self.lead * SR), dtype=np.float32)]
        for p in self.parts: allx += [p, sil]
        encode(np.concatenate(allx), f"{PUB}/audio/{self.name}", kbps)

def clip_path(text, voice):
    sid = manifest["clips"].get(voice + "|" + text) or slug(text, voice)
    p = f"{AUD}/clips/{sid}.mp3"
    return p if os.path.exists(p) else None

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
        if m.group(1) is not None: out.append({"t": m.group(1), "hl": True})
        else: out.append({"t": m.group(2)})
    return out

def ipa_of(text):
    return phrase_ipa(text) if " " in text.strip() else word_ipa(text)

def build_sounds():
    nodes = []; pool = []
    for sid, title, blurb, color, ids in SECTIONS:
        for nid in ids:
            for w in ALL[nid]["words"]:
                t = w.replace("{", "").replace("}", "")
                if " " not in t: pool.append((t, word_ipa(t)))
    import random
    random.seed(7)
    for sid, title, blurb, color, ids in SECTIONS:
        for nid in ids:
            nd = ALL[nid]
            sp = Sprite(f"s/{nid}.mp3")
            marks = MARKS.get(nid, nd["targets"])
            def add_clip(text, voice=MAIN, do_trim=True):
                p = clip_path(text, voice)
                if not p: print("missing clip", nid, voice, text); return None
                x = decode(p)
                return sp.add(trim(x) if do_trim else trim(x, 0.06, 0.15, -50))
            words = []
            for w in nd["words"]:
                t = w.replace("{", "").replace("}", "")
                words.append({"text": t, "parts": parts_of(w), "ipa": ipa_of(t), "clip": add_clip(t)})
            key = nd["key"]
            key_clip = add_clip(key) if (" vs " not in key and "/" not in key) else words[0]["clip"]
            key_ipa = ipa_of(key) if (" vs " not in key and "/" not in key) else ipa_of(words[0]["text"])
            drills = []
            ava = {}
            for st in nd.get("sets", []):
                for w in st:
                    if w not in ava: ava[w] = None
            cache = {}
            def voices_for(text):
                if text not in cache:
                    cache[text] = [c for c in (add_clip(text, v) for v in HVPT) if c]
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
                pipa = phrase_ipa(s)
                if nid == "linking": hl = []
                sents.append({"text": s, "ipa": pipa, "clip": add_clip(s, MAIN, False), "hl": hl, "tokens": toks, "tokIpa": tipa})
            idq = []
            if not nd.get("custom") and nid not in ("aspiration", "darkl"):
                cands = [w for w in words if " " not in w["text"] and any(u in marks for u in units(w["ipa"]))]
                bad = [(t, ip) for t, ip in pool if not any(u in marks for u in units(ip)) and t.lower() not in [w["text"].lower() for w in words]]
                for w in cands[:8]:
                    ds = random.sample(bad, 3)
                    idq.append({"options": [w["text"]] + [d[0] for d in ds], "answer": w["text"]})
            sp.write(48)
            nodes.append({
                "id": nid, "symbol": nd["symbol"], "name": nd["name"], "key": key, "keyIpa": key_ipa, "keyClip": key_clip,
                "section": sid, "category": nd["category"], "targets": nd["targets"], "diagram": nd["diagram"],
                **{k: nd[k] for k in ("tongue", "lips", "jaw", "voicing", "airflow", "feel", "note", "contrast")},
                "words": words, "drills": drills, "sentences": sents, "labels": nd.get("labels"), "marks": marks, "idq": idq, "color": color,
            })
            print("node", nid, "drills", len(drills), "idq", len(idq), flush=True)
    data = {"sections": [{"id": s[0], "title": s[1], "blurb": s[2], "color": s[3], "nodes": s[4]} for s in SECTIONS], "nodes": nodes, "voices": ["Ava", "Andrew", "Emma"]}
    json.dump(data, open(f"{PUB}/data/sounds.json", "w"), ensure_ascii=False, separators=(",", ":"))

# ---------------- stories ----------------
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
    """map story tokens to TTS word boundaries (difflib), interpolating where needed"""
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
    # fill gaps by interpolation
    for i in range(len(times)):
        if times[i] is None:
            j = i
            while j < len(times) and times[j] is None: j += 1
            t0 = times[i - 1][1] if i > 0 else 0.0
            t1 = times[j][0] if j < len(times) else (t0 + 0.4 * (j - i))
            step = (t1 - t0) / (j - i)
            for k in range(i, j): times[k] = [round(t0 + step * (k - i), 3), round(t0 + step * (k - i + 1), 3)]
    return times, len(tokens) - sum(size for _, _, size in sm.get_matching_blocks())

def story_audio_paths(sid):
    for p, b in ((f"{AUD}/stories/{sid}.mp3", f"{AUD}/stories/{sid}.json"), (f"{AUD}/stories/{sid}.mp3.rev.mp3", f"{AUD}/stories/{sid}.json.rev.json")):
        if os.path.exists(p) and os.path.exists(b): return p, b
    return None, None

def build_stories(word_clip):
    stories = json.load(open("/home/claude/content/stories.json"))
    index = []
    for s in stories:
        ap, bp = story_audio_paths(s["id"])
        if not ap: print("NO AUDIO", s["id"]); continue
        paras = []; flat = []; gi = 0; ipa = {}
        for p in s["paragraphs"]:
            sents = []
            for st in split_sentences(p):
                toks = []; a = gi
                pieces = st.split()
                for piece in pieces:
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
        # flags
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
        bounds = json.load(open(bp))
        times, unmatched = align_times(flat, bounds)
        if unmatched > len(flat) * 0.03: print("WARN alignment", s["id"], unmatched, "of", len(flat))
        out = f"p/{s['id']}.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", ap, "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", "40k", f"{PUB}/audio/{out}"], check=True)
        dur = times[-1][1]
        words = len(flat)
        d = {"id": s["id"], "title": s["title"], "topic": s["topic"], "words": words, "minutes": max(1, round(dur / 60)),
             "paragraphs": paras, "ipa": ipa, "audio": out, "times": times}
        json.dump(d, open(f"{PUB}/data/stories/{s['id']}.json", "w"), ensure_ascii=False, separators=(",", ":"))
        first = s["paragraphs"][0]
        excerpt = first[:150].rsplit(" ", 1)[0] + "…" if len(first) > 150 else first
        index.append({"id": s["id"], "title": s["title"], "topic": s["topic"], "words": words, "minutes": d["minutes"], "excerpt": excerpt})
        print("story", s["id"], words, "words", round(dur), "s", flush=True)
    json.dump(index, open(f"{PUB}/data/stories/index.json", "w"), ensure_ascii=False, separators=(",", ":"))

def build_words():
    stories = json.load(open("/home/claude/content/stories.json"))
    allw = sorted({n for s in stories for p in s["paragraphs"] for n in norm_tokens(p)})
    sprites = {}; wm = {}
    for w in allw:
        sid = manifest["words"].get(w)
        p = f"{AUD}/words/{sid}.mp3" if sid else None
        if not p or not os.path.exists(p): print("missing word audio", w); continue
        letter = w[0] if w[0].isalpha() else "x"
        sp = sprites.setdefault(letter, Sprite(f"w/{letter}.mp3"))
        wm[w] = sp.add(trim(decode(p)))
    for sp in sprites.values(): sp.write(40)
    json.dump(wm, open(f"{PUB}/data/words.json", "w"), separators=(",", ":"))
    print("words", len(wm))
    return wm

def files_list():
    out = []
    for root, _, fs in os.walk(PUB):
        for f in fs:
            p = os.path.join(root, f); r = os.path.relpath(p, PUB)
            if r.startswith(("audio/", "data/")) and r != "data/files.json": out.append([r, os.path.getsize(p)])
    json.dump({"files": sorted(out)}, open(f"{PUB}/data/files.json", "w"))
    print("files", len(out), round(sum(x[1] for x in out) / 1e6, 1), "MB")

if __name__ == "__main__":
    what = sys.argv[1:] or ["sounds", "words", "stories", "files"]
    if "sounds" in what: build_sounds()
    wm = build_words() if "words" in what else None
    if "stories" in what: build_stories(wm)
    if "files" in what: files_list()

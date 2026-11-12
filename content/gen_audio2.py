"""Generate all model audio again at the higher-quality 96 kbps source format, plus natural slow versions.
Resumable: existing files are skipped. Usage: python3 gen_audio2.py [stories|words|clips|all] [--only-new]"""
import certifi, asyncio, json, os, re, sys, hashlib, random, types, time
certifi.where = lambda: "/root/.ccr/ca-bundle.crt"
import edge_tts, edge_tts.communicate as _C, inspect
# the service also accepts a 96 kbps stream; the library hard-codes 48 kbps, so patch the request format
_src = inspect.getsource(_C).replace("audio-24khz-48kbitrate-mono-mp3", "audio-24khz-96kbitrate-mono-mp3")
C96 = types.ModuleType("edge_tts_communicate_96"); C96.__dict__.update(_C.__dict__)
exec(compile(_src, _C.__file__, "exec"), C96.__dict__)
# word timings of long texts (sent in several chunks) are offset by the audio length, computed from the bitrate
C96.__dict__["MP3_BITRATE_BPS"] = 96_000
sys.path.insert(0, "/home/claude/content")
from check_stories import norm_tokens
from sounds_a import V
from sounds_b import C

# Long texts: the multilingual Ava voice (most natural prosody). Single words and short phrases: the English-only
# voices. The multilingual voices guess the language of an isolated word and sometimes switch phonology
# (van -> [fan], wet -> [vet], sit -> [sit] with a tense vowel), which made many model words unclear.
MAIN = "en-US-AvaMultilingualNeural"
WORD = "en-US-AvaNeural"
HVPT = ["en-US-AvaNeural", "en-US-AndrewNeural", "en-US-AriaNeural"]
OUT = "/home/claude/audio2"
SLOW_WORD, SLOW_SENT, SLOW_STORY = "-35%", "-30%", "-25%"
for d in ("stories", "words", "clips"): os.makedirs(f"{OUT}/{d}", exist_ok=True)
# note: importing this module (build scripts) does not start any generation

def slug(text, voice, rate="+0%"):
    return hashlib.md5((voice + "|" + rate + "|" + text).encode()).hexdigest()[:16]

stats = {"ok": 0, "skip": 0, "fail": 0}
async def synth(sem, text, voice, rate, path, bpath):
    if os.path.exists(path) and os.path.getsize(path) > 500 and os.path.exists(bpath):
        stats["skip"] += 1; return "skip"
    async with sem:
        for attempt in range(8):
            try:
                c = C96.Communicate(text, voice, rate=rate, boundary="WordBoundary", receive_timeout=180)
                audio = bytearray(); bounds = []
                async for ch in c.stream():
                    if ch["type"] == "audio": audio += ch["data"]
                    elif ch["type"] == "WordBoundary":
                        bounds.append([ch["text"], round(ch["offset"] / 1e7, 3), round((ch["offset"] + ch["duration"]) / 1e7, 3)])
                if len(audio) < 500: raise RuntimeError("empty audio")
                open(path + ".part", "wb").write(audio); os.replace(path + ".part", path)
                json.dump(bounds, open(bpath, "w"))
                stats["ok"] += 1; return "ok"
            except Exception as e:
                await asyncio.sleep(2 + attempt * 4 + random.random() * 2)
        print("FAILED", voice, rate, text[:60], file=sys.stderr, flush=True)
        stats["fail"] += 1; return "fail"

def plain(w): return w.replace("{", "").replace("}", "")
def spoken(t):
    """Text sent to the voice: single words and short phrases get a full stop (tested to give the clearest citation form)."""
    return t if t[-1:] in ".?!" or len(t.split()) > 3 else t + "."

def story_words():
    stories = json.load(open("/home/claude/content/stories.json"))
    forms = {}
    for s in stories:
        for p in s["paragraphs"]:
            for raw in re.split(r"\s+|[-–—]", p):
                core = re.sub(r"^[^A-Za-z0-9']+|[^A-Za-z0-9']+$", "", raw.replace("’", "'"))
                if not core: continue
                n = norm_tokens(core)
                if len(n) != 1: continue
                forms.setdefault(n[0], core)
    out = {}
    for n, form in forms.items():
        if form.lower() == n and n != "i": form = n
        out[n] = "I" if n == "i" else form
    return out

def module_items():
    """(text, voice, rate) for every sound-module recording"""
    items = []; seen = set()
    def add(t, v, r="+0%"):
        if (t, v, r) not in seen: seen.add((t, v, r)); items.append((t, v, r))
    for nd in V + C:
        for w in nd["words"]:
            add(plain(w), WORD); add(plain(w), WORD, SLOW_WORD if " " not in plain(w) else SLOW_SENT)
        for st in nd.get("sets", []):
            for w in st:
                for v in HVPT: add(w, v)
        for it in nd.get("items", []):
            for v in HVPT: add(it["say"], v)
        for snt in nd["sentences"]:
            add(snt, MAIN); add(snt, MAIN, SLOW_SENT)
        k = nd["key"]
        if " vs " not in k and "/" not in k: add(k, WORD); add(k, WORD, SLOW_WORD if " " not in k else SLOW_SENT)
    return items

async def main(which):
    jobs = []; manifest = {"words": {}, "clips": {}, "stories": {}}
    if which in ("all", "stories"):
        sem = asyncio.Semaphore(3)
        for s in json.load(open("/home/claude/content/stories.json")):
            text = "\n\n".join(s["paragraphs"])
            for rate, tag in (("+0%", ""), (SLOW_STORY, ".slow")):
                manifest["stories"][s["id"] + tag] = s["id"] + tag
                jobs.append(synth(sem, text, MAIN, rate, f"{OUT}/stories/{s['id']}{tag}.mp3", f"{OUT}/stories/{s['id']}{tag}.json"))
    if which in ("all", "words"):
        sem2 = asyncio.Semaphore(8)
        for n, text in story_words().items():
            for rate, tag in (("+0%", ""), (SLOW_WORD, "|slow")):
                sid = slug(spoken(text), WORD, rate); manifest["words"][n + tag] = sid
                jobs.append(synth(sem2, spoken(text), WORD, rate, f"{OUT}/words/{sid}.mp3", f"{OUT}/words/{sid}.json"))
    if which in ("all", "clips"):
        sem3 = asyncio.Semaphore(8)
        for t, v, r in module_items():
            tt = t if v == MAIN else spoken(t)
            sid = slug(tt, v, r); manifest["clips"][v + "|" + r + "|" + t] = sid
            jobs.append(synth(sem3, tt, v, r, f"{OUT}/clips/{sid}.mp3", f"{OUT}/clips/{sid}.json"))
    random.seed(1); random.shuffle(jobs)
    print(which, "jobs", len(jobs), flush=True); t0 = time.time()
    for i in range(0, len(jobs), 100):
        await asyncio.gather(*jobs[i:i + 100])
        print("progress", min(i + 100, len(jobs)), "/", len(jobs), stats, "%.0fs" % (time.time() - t0), flush=True)
    mp = f"{OUT}/manifest-{which}.json"
    json.dump(manifest, open(mp, "w"))
    print("done", which, stats, flush=True)

if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "all"))

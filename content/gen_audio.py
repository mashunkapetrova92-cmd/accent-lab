"""Generate all recorded audio with Microsoft neural voices (resumable)."""
import certifi, asyncio, json, os, re, sys, hashlib, random
certifi.where = lambda: "/root/.ccr/ca-bundle.crt"
import edge_tts
sys.path.insert(0, "/home/claude/content")
from check_stories import norm_tokens
from sounds_a import V
from sounds_b import C

MAIN = "en-US-AvaMultilingualNeural"
HVPT = ["en-US-AvaMultilingualNeural", "en-US-AndrewMultilingualNeural", "en-US-EmmaMultilingualNeural"]
OUT = "/home/claude/audio"
for d in ("stories", "words", "clips"): os.makedirs(f"{OUT}/{d}", exist_ok=True)

def slug(text, voice):
    return hashlib.md5((voice + "|" + text).encode()).hexdigest()[:16]

async def synth(sem, text, voice, path, bpath=None):
    if os.path.exists(path) and os.path.getsize(path) > 500 and (bpath is None or os.path.exists(bpath)):
        return "skip"
    async with sem:
        for attempt in range(7):
            try:
                c = edge_tts.Communicate(text, voice, boundary="WordBoundary", receive_timeout=120)
                audio = bytearray(); bounds = []
                async for ch in c.stream():
                    if ch["type"] == "audio": audio += ch["data"]
                    elif ch["type"] == "WordBoundary":
                        bounds.append([ch["text"], round(ch["offset"] / 1e7, 3), round((ch["offset"] + ch["duration"]) / 1e7, 3)])
                if len(audio) < 500: raise RuntimeError("empty audio")
                open(path, "wb").write(audio)
                if bpath: json.dump(bounds, open(bpath, "w"))
                return "ok"
            except Exception as e:
                await asyncio.sleep(2 + attempt * 3 + random.random())
        print("FAILED", voice, text[:50], file=sys.stderr, flush=True)
        return "fail"

def plain(w): return w.replace("{", "").replace("}", "")

async def main(which):
    stories = json.load(open("/home/claude/content/stories.json"))
    jobs = []
    manifest = {"words": {}, "clips": {}}
    if which in ("all", "stories"):
        sem = asyncio.Semaphore(3)
        for s in stories:
            text = "\n\n".join(s["paragraphs"])
            jobs.append(synth(sem, text, MAIN, f"{OUT}/stories/{s['id']}.mp3", f"{OUT}/stories/{s['id']}.json"))
    if which in ("all", "words"):
        sem2 = asyncio.Semaphore(8)
        forms = {}
        for s in stories:
            for p in s["paragraphs"]:
                for raw in re.split(r"\s+|[-–—]", p):
                    core = re.sub(r"^[^A-Za-z0-9']+|[^A-Za-z0-9']+$", "", raw.replace("’", "'"))
                    if not core: continue
                    n = norm_tokens(core)
                    if len(n) != 1: continue
                    forms.setdefault(n[0], core)
        for n, form in forms.items():
            if form.lower() == n and n != "i": form = n
            text = "I" if n == "i" else form
            sid = slug(text, MAIN)
            manifest["words"][n] = sid
            jobs.append(synth(sem2, text, MAIN, f"{OUT}/words/{sid}.mp3"))
    if which in ("all", "clips"):
        sem3 = asyncio.Semaphore(8)
        def add(text, voice):
            sid = slug(text, voice)
            manifest["clips"][voice + "|" + text] = sid
            jobs.append(synth(sem3, text, voice, f"{OUT}/clips/{sid}.mp3", f"{OUT}/clips/{sid}.json"))
        seen = set()
        for nd in V + C:
            for w in nd["words"]:
                t = plain(w)
                if (t, MAIN) not in seen: seen.add((t, MAIN)); add(t, MAIN)
            for st in nd.get("sets", []):
                for w in st:
                    for v in HVPT:
                        if (w, v) not in seen: seen.add((w, v)); add(w, v)
            for it in nd.get("items", []):
                for v in HVPT:
                    if (it["say"], v) not in seen: seen.add((it["say"], v)); add(it["say"], v)
            for snt in nd["sentences"]:
                if (snt, MAIN) not in seen: seen.add((snt, MAIN)); add(snt, MAIN)
            k = nd["key"]
            if (k, MAIN) not in seen and " vs " not in k and "/" not in k: seen.add((k, MAIN)); add(k, MAIN)
    random.shuffle(jobs) if which == "words" else None
    print("jobs", len(jobs), flush=True)
    res = []
    for i in range(0, len(jobs), 200):
        res += await asyncio.gather(*jobs[i:i + 200])
        print("progress", i + 200, "/", len(jobs), "fails", res.count("fail"), flush=True)
    if which != "stories":
        old = {}
        if os.path.exists(f"{OUT}/manifest.json"): old = json.load(open(f"{OUT}/manifest.json"))
        for k in ("words", "clips"):
            old.setdefault(k, {}).update(manifest[k])
        json.dump(old, open(f"{OUT}/manifest.json", "w"))
    print("done", which, "ok", res.count("ok"), "skip", res.count("skip"), "fail", res.count("fail"), flush=True)

asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "all"))

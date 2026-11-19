"""Repair word recordings that sound like a different word.
Input: a check of published clips (faster-whisper small.en). For every clip heard as another word, the voice
is asked again with other renderings of the word; the first rendering heard correctly (by small.en, and also
by medium.en as a second opinion) replaces the cached recording. A recording that cannot be fixed is listed in
bad_clips.json, so the build leaves that voice out of the listening drill (or drops a real-speaker clip).
Words that only differ by the cot–caught merger (General American) count as the same word."""
import json, os, re, sys, asyncio, shutil, subprocess, numpy as np, cmudict
sys.path.insert(0, "/home/claude/content")
import gen_audio2 as G
from synthlib import synth
from faster_whisper import WhisperModel
CMU = cmudict.dict()
def prons(w): return {tuple(re.sub(r"\d", "", p).replace("AO", "AA") for p in pr) for pr in CMU.get(w.lower(), [])}
def same(a, b):
    a, b = a.strip().lower(), b.strip().lower()
    return a == b or bool(prons(a) & prons(b))
norm = lambda s: re.sub(r"[^a-z' ]", "", s.lower()).strip()
M1 = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=2)
M2 = WhisperModel("medium.en", device="cpu", compute_type="int8", cpu_threads=2)
def hear(path, m):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    # the same trimming as the lesson build (build_data2.trim), so the check hears what the app plays
    w = 160; n = len(x) // w
    if n:
        r = 20 * np.log10(np.sqrt((x[: n * w].reshape(n, w) ** 2).mean(1)) + 1e-9)
        on = np.where(r > -50)[0]
        if len(on): x = x[max(0, on[0] * w - int(0.07 * 16000) - int(0.08 * 16000)):min(len(x), (on[-1] + 1) * w + int(0.14 * 16000) + int(0.12 * 16000))]
    y = np.concatenate([np.zeros(8000, np.float32), x, np.zeros(8000, np.float32)])
    segs, _ = m.transcribe(y, language="en", beam_size=5, without_timestamps=True, condition_on_previous_text=False)
    return norm(" ".join(s.text for s in segs))
VOICE = {"v0": G.HVPT[0], "v1": G.HVPT[1], "v2": G.HVPT[2], "ava": G.WORD, "slow": G.WORD}
def target(word, kind):
    rate = G.SLOW_WORD if kind == "slow" else "+0%"
    voice = VOICE[kind]
    return f"{G.OUT}/clips/{G.slug(G.spoken(word), voice, rate)}.mp3", voice, rate
def renderings(word):
    w = word; c = w[:1].upper() + w[1:]
    return [f"{c}.", f"{w}!", f"“{w}.”", f"{c}...", f"The word: {w}.", f"{w}, {w}."]
OTHER = ["en-US-EmmaNeural", "en-US-JennyNeural", "en-US-BrianNeural", "en-US-GuyNeural", "en-US-ChristopherNeural",
         "en-US-MichelleNeural", "en-US-EricNeural", "en-US-RogerNeural", "en-US-SteffanNeural", "en-US-AnaNeural"]
async def fix(word, kind, sem):
    path, voice0, rate = target(word, kind)
    # the same voice with other renderings first, then other American voices
    tries = [(voice0, t) for t in renderings(word)] + [(v, t) for v in OTHER for t in renderings(word)[:2]]
    return await attempt(word, path, rate, tries, sem)
async def attempt(word, path, rate, tries, sem):
    tmp = "/tmp/claude-0/-home-claude/67bd35bd-b4df-50eb-98f7-d7aa4da23be2/scratchpad/fix"; os.makedirs(tmp, exist_ok=True)
    for voice, text in tries:
        if text.startswith("The word") or ", " in text: continue  # carrier phrases would need cutting; not used
        cand = f"{tmp}/{G.slug(text, voice, rate)}.mp3"
        if not os.path.exists(cand): await synth(sem, text, voice, rate, cand, cand + ".json")
        if not os.path.exists(cand): continue
        h1 = hear(cand, M1)
        if not same(h1, word): continue
        h2 = hear(cand, M2)
        if not same(h2, word): continue
        if os.path.exists(path) and not os.path.exists(path + ".orig"): shutil.copy(path, path + ".orig")
        shutil.copy(cand, path); return voice, text, h1, h2
    return None
async def main():
    res = json.load(open(sys.argv[1]))
    bad = json.load(open("bad_clips.json")) if os.path.exists("bad_clips.json") else {}
    todo = {}
    for r in res:
        nid, item, kind = r["id"].split("|")
        word = item.split(":", 1)[1] if item.startswith("drill:") else item
        if same(r["heard"], word): continue
        if kind in ("v0", "v1", "v2", "v3") and not item.startswith("drill:"): continue
        if kind == "v3" or kind == "real": bad[f"real|{word.lower()}"] = r["heard"]; continue
        if kind == "v0": kind = "ava" if G.HVPT[0] == G.WORD else kind
        todo[(word, kind)] = r["heard"]
    print(len(todo), "recordings to repair")
    sem = asyncio.Semaphore(3)
    log = json.load(open("/home/claude/phon/fix_log.json")) if os.path.exists("/home/claude/phon/fix_log.json") and "--resume" in sys.argv else []
    seen = {(x[0], x[1]) for x in log}
    for (word, kind), heard in sorted(todo.items()):
        if (word, kind) in seen: continue
        # a second opinion first: medium.en may hear the published clip correctly after all
        path, _, _ = target(word, kind)
        if os.path.exists(path) and same(hear(path, M2), word) and same(hear(path, M1), word): log.append((word, kind, "fine on recheck")); continue
        out = await fix(word, kind, sem)
        if out: log.append((word, kind, "fixed", out))
        else: bad[f"{VOICE[kind]}|{word.lower()}|{'slow' if kind == 'slow' else 'normal'}"] = heard; log.append((word, kind, "not fixed", heard))
        print(log[-1], flush=True)
        json.dump(bad, open("bad_clips.json", "w"), ensure_ascii=False, indent=0)
        json.dump(log, open("/home/claude/phon/fix_log.json", "w"), ensure_ascii=False, indent=0)
    json.dump(bad, open("bad_clips.json", "w"), ensure_ascii=False, indent=0)
    json.dump(log, open("/home/claude/phon/fix_log.json", "w"), ensure_ascii=False, indent=0)
    from collections import Counter; print(Counter(x[2] for x in log))
asyncio.run(main())

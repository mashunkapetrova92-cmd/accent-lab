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

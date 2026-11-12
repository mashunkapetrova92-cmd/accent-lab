"""Test recordings for the fake microphone, written to dist/test/ (never published)."""
import sys, os, json, subprocess, hashlib
sys.path.insert(0, "/home/claude/content")
import gen_audio2 as G
OUT = "/home/claude/accent-lab/dist/test"; os.makedirs(OUT, exist_ok=True)
A = "/home/claude/audio2"
def wav(src, dst, a=None, b=None):
    cmd = ["ffmpeg", "-v", "error", "-y"]
    if a is not None: cmd += ["-ss", str(a), "-to", str(b)]
    cmd += ["-i", src, "-ac", "1", "-ar", "24000", f"{OUT}/{dst}"]
    subprocess.run(cmd, check=True)
def clip(text, voice, rate="+0%"):
    tt = text if voice == G.MAIN else G.spoken(text)
    return f"{A}/clips/{G.slug(tt, voice, rate)}.mp3"
# words from the /i/ lesson in the model voice and in other voices
wav(clip("sleep", G.WORD), "sleep_ava.wav")
wav(clip("see", G.WORD), "see_ava.wav")
wav(clip("see", "en-US-AndrewNeural") if os.path.exists(clip("see", "en-US-AndrewNeural")) else clip("see", G.WORD), "see_andrew.wav")
# a different word said instead of the target
RU = "/tmp/claude-0/-home-claude/67bd35bd-b4df-50eb-98f7-d7aa4da23be2/scratchpad/ru"
for f in os.listdir(RU):
    if f.endswith(".mp3"): wav(f"{RU}/{f}", f.replace(".mp3", ".wav"))
# the first sentence of the /i/ lesson
import json as _j
d = _j.load(open("/home/claude/accent-lab/public/data/sounds.json"))
n = [x for x in d["nodes"] if x["id"] == "i"][0]
s0 = n["sentences"][0]["text"]
wav(clip(s0, G.MAIN), "i_sent0_ava.wav")
# first paragraph of the first text
idx = _j.load(open("/home/claude/accent-lab/public/data/stories/index.json"))
st = _j.load(open(f"/home/claude/accent-lab/public/data/stories/{idx[0]['id']}.json"))
p0 = st["paragraphs"][0]["sents"]; a = st["times"][p0[0]["a"]][0]; b = st["times"][p0[-1]["b"] - 1][1]
wav(f"{A}/stories/{idx[0]['id']}.mp3", "story0_p0.wav", max(0, a - 0.2), b + 0.4)
print("sentence:", s0, "| story:", idx[0]["id"], round(b - a, 1), "s")
print(sorted(os.listdir(OUT)))

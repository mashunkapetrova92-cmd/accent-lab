"""Real American speaker for single words: Wikimedia Commons recordings "En-us-<word>.ogg".
Keeps one speaker (Dvortygirl) for a consistent voice, checks each recording with the app's word recognizer and the
noise level, trims and volume-matches it to the synthesized word voice, and writes /home/claude/audio2/real/."""
import json, os, re, sys, glob, subprocess, numpy as np
sys.path.insert(0, "/home/claude/phon")
SRC = "/home/claude/phon/commons"; OUT = "/home/claude/audio2/real"; SR = 24000
os.makedirs(OUT, exist_ok=True)
meta = json.load(open("/home/claude/phon/commons_words.json"))
d = json.load(open("/home/claude/accent-lab/public/data/sounds.json"))
ipa, drills = {}, {}
for n in d["nodes"]:
    for w in n["words"]: ipa.setdefault(w["text"].lower(), w["ipa"])
    for dr in n["drills"]:
        for o, i in dr.get("optIpa", {}).items(): ipa.setdefault(o.lower(), i)
        if "optIpa" in dr:
            for o in dr["options"]: drills.setdefault(o.lower(), []).append({k.lower(): v for k, v in dr["optIpa"].items()})
def dec(path, sr):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32)
def frames(x, sr):
    w = int(sr * 0.01); n = len(x) // w
    return np.sqrt((x[: n * w].reshape(n, w) ** 2).mean(1) + 1e-9), w
def trim(x, sr, lead=0.07, tail=0.14):
    r, w = frames(x, sr); thr = max(r.max() * 10 ** (-35 / 20), 32768 * 10 ** (-50 / 20))
    on = np.where(r > thr)[0]
    if not len(on): return x
    a = max(0, on[0] * w - int(lead * sr)); b = min(len(x), (on[-1] + 1) * w + int(tail * sr))
    y = x[a:b].copy(); f = min(len(y) // 4, int(0.004 * sr))
    if f: y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    return y
def speech_rms(x, sr):
    r, _ = frames(x, sr); return float(np.sqrt((r[r > r.max() * 0.1] ** 2).mean()))
def ed(a, b):
    D = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        P = D[:]; D[0] = i
        for j, y in enumerate(b, 1): D[j] = min(P[j] + 1, D[j - 1] + 1, P[j - 1] + (x != y))
    return D[-1]
# loudness of the synthesized word voice (published lesson sprites)
ref = []
for n in d["nodes"][:12]:
    for w in n["words"][:4]:
        c = w["clip"]; x = dec("/home/claude/accent-lab/public/audio/" + c[0], SR)
        ref.append(speech_rms(x[int(c[1] * SR):int(c[2] * SR)], SR))
TARGET = float(np.median(ref))
WH = {r["word"]: r for r in json.load(open("/home/claude/phon/real_whisper.json"))}
acc, rej = {}, {}
for f in sorted(glob.glob(f"{SRC}/*.ogg")):
    w = os.path.basename(f)[:-4]; info = meta.get(w, {})
    who = re.sub("<[^>]+>", "", info.get("by", "")).strip()
    if open(f, "rb").read(4) != b"OggS": rej[w] = "not a recording"; continue
    if "Dvortygirl" not in who: rej[w] = f"other speaker ({who[:30]})"; continue
    if w not in ipa: rej[w] = "no transcription"; continue
    x = dec(f, SR); r, _ = frames(x, SR)
    noise = 20 * np.log10(np.percentile(r, 10) / 32768 + 1e-12); peak = 20 * np.log10(r.max() / 32768)
    if peak - noise < 32: rej[w] = f"noisy (signal-to-noise {peak - noise:.0f} dB)"; continue
    y = trim(x, SR)
    if not 0.25 <= len(y) / SR <= 2.2: rej[w] = f"length {len(y)/SR:.2f} s"; continue
    # recognizer check with the app's own word checker (Whisper base.en, qa/calib2m.mjs):
    # the word must win against the words it is confused with, and be heard as itself when listening freely
    wr = WH.get(w)
    if not wr: rej[w] = "not checked"; continue
    if wr["pair"] < 80 or wr["open"] < 50: rej[w] = f"unclear: recognizer heard “{wr['heard']}” ({wr['pair']}/{wr['open']})"; continue
    g = TARGET / speech_rms(y, SR); y = y * g
    pk = np.abs(y).max()
    if pk > 32768 * 0.89: y *= 32768 * 0.89 / pk
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", f"{OUT}/{w}.wav"], input=np.clip(y, -32768, 32767).astype(np.int16).tobytes(), check=True)
    acc[w] = {"file": f"File:En-us-{w}.ogg", "author": who, "license": info.get("lic"), "url": f"https://commons.wikimedia.org/wiki/File:En-us-{w.replace(' ', '_')}.ogg"}
json.dump(acc, open(f"{OUT}/accepted.json", "w"), ensure_ascii=False, indent=0)
json.dump(rej, open(f"{OUT}/rejected.json", "w"), ensure_ascii=False, indent=0)
print(len(acc), "accepted,", len(rej), "rejected")
from collections import Counter
print(Counter(v.split(" (")[0].split(":")[0] for v in rej.values()))

# credits page (CC BY-SA asks for author, source, licence and a note of the changes)
import html
LIC = {"CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/", "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
       "CC0": "https://creativecommons.org/publicdomain/zero/1.0/", "Public domain": "https://creativecommons.org/publicdomain/mark/1.0/"}
rows = "\n".join(f'<tr><td>{html.escape(w)}</td><td><a href="{html.escape(v["url"])}">{html.escape(v["file"])}</a></td><td>{html.escape(v["author"])}</td>'
                 f'<td><a href="{LIC.get(v["license"], "#")}">{html.escape(v["license"] or "")}</a></td></tr>' for w, v in sorted(acc.items()))
open("/home/claude/accent-lab/public/credits.html", "w").write(f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accent Lab: recording credits</title><style>body{{font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;padding:16px;color:#14202e;background:#fff}}
table{{border-collapse:collapse;width:100%;font-size:15px}}td,th{{text-align:left;padding:6px 8px;border-bottom:1px solid #e3e7ee}}a{{color:#0e6d77}}
@media (prefers-color-scheme:dark){{body{{background:#10161f;color:#e6ebf2}}td,th{{border-color:#26303d}}a{{color:#6cc7cf}}}}</style></head><body>
<h1>Recording credits</h1>
<p>Single-word recordings by a real American speaker come from <a href="https://commons.wikimedia.org/">Wikimedia Commons</a>.
Changes made for the app: silence trimmed, converted to mono 24 kHz, volume matched to the other recordings, and joined with other clips into lesson audio files.
These adapted recordings are shared under the same licence as the originals.</p>
<p>All other model audio is synthesized with Microsoft neural voices.</p>
<table><thead><tr><th>Word</th><th>Original file</th><th>Speaker</th><th>Licence</th></tr></thead><tbody>
{rows}
</tbody></table></body></html>
""")
print("credits written")

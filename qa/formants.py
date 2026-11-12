"""Vowel QA: F1/F2 at the vowel nucleus of every minimal-pair word, per voice. Flags pairs whose vowels are acoustically too close."""
import sys, json, hashlib, numpy as np, subprocess, os
sys.path.insert(0, "/home/claude/content")
import parselmouth
from sounds_a import V
AUD = "/home/claude/audio"
man = json.load(open(f"{AUD}/manifest.json"))
HV = ["en-US-AvaMultilingualNeural", "en-US-AndrewMultilingualNeural", "en-US-EmmaMultilingualNeural"]
def path(t, v):
    sid = man["clips"].get(v + "|" + t) or hashlib.md5((v + "|" + t).encode()).hexdigest()[:16]
    return f"{AUD}/clips/{sid}.mp3"
def wav(p):
    x = np.frombuffer(subprocess.run(["ffmpeg","-v","error","-i",p,"-ac","1","-ar","16000","-f","f32le","-"],capture_output=True,check=True).stdout, dtype=np.float32)
    return parselmouth.Sound(x.astype(np.float64), 16000)
def bark(f): return 13 * np.arctan(0.00076 * f) + 3.5 * np.arctan((f / 7500) ** 2)
def nucleus(p, female):
    s = wav(p)
    pitch = s.to_pitch(time_step=0.005, pitch_floor=75, pitch_ceiling=500)
    inten = s.to_intensity(time_step=0.005)
    fm = s.to_formant_burg(time_step=0.005, max_number_of_formants=5, maximum_formant=5500 if female else 5000)
    ts = [t for t in pitch.xs() if pitch.get_value_at_time(t) == pitch.get_value_at_time(t)]
    if not ts: return None
    imax = max(inten.get_value(t) or 0 for t in ts)
    vt = [t for t in ts if (inten.get_value(t) or 0) > imax - 7]
    if len(vt) < 4: vt = ts
    a, b = vt[0], vt[-1]; mid = [t for t in vt if a + 0.3 * (b - a) <= t <= a + 0.7 * (b - a)] or vt
    f1 = np.median([fm.get_value_at_time(1, t) for t in mid]); f2 = np.median([fm.get_value_at_time(2, t) for t in mid])
    # glide: F2 change from 25% to 75% of the vowel (diphthongs)
    q1 = [t for t in vt if t <= a + 0.3 * (b - a)] or vt[:2]; q3 = [t for t in vt if t >= a + 0.7 * (b - a)] or vt[-2:]
    g2 = np.median([fm.get_value_at_time(2, t) for t in q3]) - np.median([fm.get_value_at_time(2, t) for t in q1])
    g1 = np.median([fm.get_value_at_time(1, t) for t in q3]) - np.median([fm.get_value_at_time(1, t) for t in q1])
    return {"F1": round(f1), "F2": round(f2), "dur": round(b - a, 3), "gF1": round(g1), "gF2": round(g2)}
out = []; flags = []
for nd in V:
    for st in nd.get("sets", []):
        for v in HV:
            fem = "Andrew" not in v
            ms = {}
            for w in st:
                p = path(w, v)
                if os.path.exists(p): ms[w] = nucleus(p, fem)
            out.append({"node": nd["id"], "set": st, "voice": v.split("-")[2].replace("MultilingualNeural",""), "m": ms})
            ws = [w for w in st if ms.get(w)]
            for i in range(len(ws)):
                for j in range(i + 1, len(ws)):
                    A, B = ms[ws[i]], ms[ws[j]]
                    d = np.hypot(bark(A["F1"]) - bark(B["F1"]), bark(A["F2"]) - bark(B["F2"]))
                    dg = abs(A["gF2"] - B["gF2"]) / 300 + abs(A["gF1"] - B["gF1"]) / 200
                    dd = abs(A["dur"] - B["dur"]) / max(A["dur"], B["dur"])
                    score = d + dg * 0.5 + dd
                    if d < 0.55 and dg < 0.6 and dd < 0.25:
                        flags.append((nd["id"], ws[i], ws[j], out[-1]["voice"], round(d, 2), round(dg, 2), round(dd, 2), A, B))
    print("done", nd["id"], flush=True)
json.dump(out, open("/home/claude/qa/formants_old.json", "w"))
print("\nFLAGGED (vowels acoustically very close):", len(flags))
for f in flags: print(f)

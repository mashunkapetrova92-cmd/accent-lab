import os, subprocess, time, socket
os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/home/claude/pw-extra"
PULSE = "/tmp/claude-0/-home-claude/67bd35bd-b4df-50eb-98f7-d7aa4da23be2/scratchpad/pulse"
os.environ["PULSE_SERVER"] = f"unix:{PULSE}/native"

def ensure_pulse():
    r = subprocess.run(["pactl", "info"], capture_output=True)
    if r.returncode != 0:
        subprocess.run(["pulseaudio", "-n", "-F", f"{PULSE}/default.pa", "--exit-idle-time=-1", "--daemonize=yes", "--system=false", "--disallow-exit"], capture_output=True)
        time.sleep(1)

def serve(dist=os.environ.get("TEST_DIST", "/home/claude/accent-lab/dist"), port=int(os.environ.get("TEST_PORT", "4321")), prefix="/accent-lab"):
    s = socket.socket()
    if s.connect_ex(("127.0.0.1", port)) != 0:
        subprocess.Popen(["node", "/home/claude/tools/static.mjs", dist, str(port), prefix], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1)
    s.close()
    return f"http://localhost:{port}{prefix}/"

# Records every clip the app's <audio> player starts (its WAV length and loudness) and whether it ended.
AUDIO_PROBE = r"""
window.__plays = [];
(() => {
  const P = HTMLMediaElement.prototype; const op = P.play;
  P.play = function () {
    const el = this; const src = el.src;
    const rec = { src: src.slice(0, 60), dur: null, peak: null, started: false, ended: false, err: null };
    el.addEventListener('playing', () => { if (el.src === src) rec.started = true; });
    el.addEventListener('ended', () => { if (el.src === src) rec.ended = true; });
    fetch(src).then(r => r.arrayBuffer()).then(ab => {
      const v = new DataView(ab);
      if (ab.byteLength > 44 && v.getUint32(0, false) === 0x52494646) {
        const rate = v.getUint32(24, true), n = (ab.byteLength - 44) >> 1; let peak = 0;
        for (let i = 0; i < n; i++) { const s = Math.abs(v.getInt16(44 + 2 * i, true)); if (s > peak) peak = s; }
        rec.dur = +(n / rate).toFixed(3); rec.peak = +(peak / 32768).toFixed(3);
        if (peak === 0) return; // the player's silent warm-up
      }
      window.__plays.push(rec);
    }).catch(e => { rec.err = 'fetch ' + e; window.__plays.push(rec); });
    const r = op.call(this);
    if (r && r.catch) r.catch(e => { rec.err = e.name; });
    return r;
  };
})();
"""
# iPhone-like autoplay rule: an <audio> element may start only during a tap, or later if it was started during one.
STRICT_AUTOPLAY = r"""
(() => {
  let depth = 0;
  const on = () => { depth++; setTimeout(() => { depth = Math.max(0, depth - 1); }, 0); };
  for (const ev of ['touchend', 'click', 'keydown', 'pointerup', 'mouseup']) window.addEventListener(ev, on, { capture: true });
  const P = HTMLMediaElement.prototype; const op = P.play; const ok = new WeakSet();
  window.__blocked = 0;
  P.play = function () {
    if (depth > 0) ok.add(this);
    else if (!ok.has(this)) { window.__blocked++; return Promise.reject(new DOMException('Not allowed by the test autoplay rule', 'NotAllowedError')); }
    return op.call(this);
  };
})();
"""
# A fake microphone: plays a sound file into getUserMedia (works in every browser).
FAKE_MIC = r"""
window.__mic = { url: null, delay: 0.4, gain: 1 }; window.__fakeLog = [];
const md = navigator.mediaDevices; window.__md = md; // keep the wrapper alive (WebKit would otherwise drop the override)
if (md) md.getUserMedia = async (c) => {
  const L = (x) => window.__fakeLog.push(x);
  window.__fakeCalls = (window.__fakeCalls || 0) + 1;
  if (!window.__mic.url) throw Object.assign(new Error('Permission denied (no test url)'), { name: 'NotAllowedError' });
  try {
    const AC = window.AudioContext || window.webkitAudioContext; const ctx = new AC(); L('ctx ' + ctx.state);
    await ctx.resume().catch(e => L('resume err ' + e.name)); L('resumed ' + ctx.state);
    const ab = await (await fetch(window.__mic.url)).arrayBuffer(); L('fetched ' + ab.byteLength);
    const buf = await ctx.decodeAudioData(ab); L('decoded ' + buf.duration.toFixed(2));
    const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(); g.gain.value = window.__mic.gain;
    const dest = ctx.createMediaStreamDestination(); L('dest');
    src.connect(g); g.connect(dest);
    const m = window.__mic; if (m.to) src.start(ctx.currentTime + m.delay, m.from || 0, m.to - (m.from || 0)); else src.start(ctx.currentTime + m.delay); L('started');
    window.__micDone = false; src.onended = () => { window.__micDone = true; };
    const st = dest.stream; const tr = st.getAudioTracks()[0]; const ostop = tr.stop.bind(tr); tr.stop = () => { try { src.stop(); } catch (e) {} ostop(); };
    return st;
  } catch (e) { L('ERR ' + e.name + ' ' + e.message); throw e; }
};
"""

# Marks every sound before `upto` as mastered, so later lessons open (written straight into the app's IndexedDB).
async def unlock_all(pg, base):
    await pg.goto(base + "#/progress"); await pg.wait_for_timeout(800)
    await pg.evaluate("""async () => {
      const d = await (await fetch('data/sounds.json')).json();
      const sounds = {}; for (const n of d.nodes) sounds[n.id] = { stages: { learn: true, words: true, listen: true, say: true, sentences: true, test: true }, words: {}, sentences: {}, mastered: Date.now(), testBest: 95 };
      await new Promise((res, rej) => { const r = indexedDB.open('accent-lab', 1); r.onupgradeneeded = () => { for (const s of ['kv', 'blobs']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
        r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(sounds, 'sounds'); tx.oncomplete = res; tx.onerror = rej; }; r.onerror = rej; });
    }""")
    await pg.reload(); await pg.wait_for_timeout(800)

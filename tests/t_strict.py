"""iPhone emulation with a strict autoplay rule and slow audio downloads: first tap on a lesson, listening drill
autoplay after Start/Next, the reader, and playback of the learner's own recording."""
import asyncio, sys, re, time, os
sys.path.insert(0, "/home/claude/tests")
from common import *
from t_record import record
from playwright.async_api import async_playwright
NAMES = sys.argv[1].split(",") if len(sys.argv) > 1 else ["iphone"]

async def last_play(pg, wait=6.0):
    t0 = time.time(); x = None
    while time.time() - t0 < wait:
        x = await pg.evaluate("window.__plays.slice(-1)[0] || null")
        if x and (x["ended"] or x["err"]): break
        await pg.wait_for_timeout(100)
    return x

async def run(p, name, base):
    real = "webkit" if name.startswith("iphone") else name
    b = await getattr(p, real).launch()
    ctx = await b.new_context(**(p.devices["iPhone 13"] if name.startswith("iphone") else {"viewport": {"width": 390, "height": 844}}))
    await ctx.add_init_script(STRICT_AUTOPLAY); await ctx.add_init_script(AUDIO_PROBE); await ctx.add_init_script(FAKE_MIC)
    if name == "iphone-app":  # opened from the Home Screen
        await ctx.add_init_script("""Object.defineProperty(navigator, 'standalone', { get: () => true });
          const mm = window.matchMedia.bind(window);
          window.matchMedia = q => /display-mode:\\s*standalone/.test(q) ? { matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } } : mm(q);""")
    # slow network for recordings, so the first tap happens before the clip is ready
    async def slow(route):
        await asyncio.sleep(1.5); await route.continue_()
    await ctx.route(re.compile(r".*/audio/.*\.mp3$"), slow)
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None)
    tap = (lambda loc: loc.tap()) if name.startswith("iphone") else (lambda loc: loc.click())
    out = []
    await pg.goto(base + "#/sounds/i"); await pg.wait_for_timeout(300)
    # 1) the very first tap in the app is a play button whose recording is still downloading
    await pg.evaluate("window.__plays = []")
    await tap(pg.locator("main button.play:not([disabled])").first)
    x = await last_play(pg, 8); out.append(("first tap, clip still loading", x and x["ended"], x and x["err"], x and x["peak"]))
    # 2) listening drill: Start, then the question plays by itself
    await tap(pg.locator(".stage-tab", has_text="Listen").first); await pg.wait_for_timeout(300)
    await pg.evaluate("window.__plays = []")
    await tap(pg.get_by_role("button", name=re.compile("^Start")))
    x = await last_play(pg, 8); out.append(("drill autoplay after Start", x and x["ended"], x and x["err"], x and x["peak"]))
    for q in range(3):
        await tap(pg.locator(".options button.opt").first); await pg.wait_for_timeout(200)
        await pg.evaluate("window.__plays = []")
        await tap(pg.get_by_role("button", name=re.compile("^(Next|See result)")))
        x = await last_play(pg, 8); out.append((f"drill autoplay after Next {q+1}", x and x["ended"], x and x["err"]))
    # 3) say a word, then play back the learner's recording and the model
    await tap(pg.locator(".stage-tab", has_text="Say").first); await pg.wait_for_timeout(300)
    if not os.environ.get("BASE"):
        r = await record(pg, base + "test/see_andrew.wav"); out.append(("record see", r[0][:40]))
    else:  # published site: the test recordings are not there, use the model's own recording of the word
        from t_journey import say
        d = await pg.evaluate("fetch('data/sounds.json').then(r => r.json())")
        r = await say(pg, d["nodes"][0]["words"][0]["clip"]); out.append(("record " + d["nodes"][0]["words"][0]["text"], r[0][:40]))
    await pg.evaluate("window.__plays = []")
    mine = pg.locator("button[aria-label='Play your recording']")
    if await mine.count():
        await tap(mine.first); x = await last_play(pg, 8); out.append(("play my recording", x and x["ended"], x and x["err"], x and x["peak"]))
    else: out.append(("play my recording", "no button"))
    await pg.evaluate("window.__plays = []")
    await tap(pg.locator("main button.play:not([disabled])").first)
    x = await last_play(pg, 8); out.append(("model after recording", x and x["ended"], x and x["err"], x and x["peak"]))
    # 4) reader: play, pause, resume where it stopped
    idx = await pg.evaluate("fetch('data/stories/index.json').then(r => r.json())")
    await pg.goto(base + f"#/reading/{idx[2]['id']}"); await pg.wait_for_timeout(500)
    await pg.evaluate("window.__plays = []")
    await tap(pg.locator(".player button.main")); await pg.wait_for_timeout(4500)
    t1 = await pg.inner_text(".player .time"); x = await pg.evaluate("window.__plays.slice(-1)[0] || null")
    await tap(pg.locator(".player button.main")); await pg.wait_for_timeout(600)
    now = await pg.locator(".tok.now").count()
    await tap(pg.locator(".player button.main")); await pg.wait_for_timeout(1500)
    lp = await pg.evaluate("window.__lastPlay")
    out.append(("reader", t1, x and x["started"], x and x["err"], "highlight kept on pause:", now, "resumed from", round(lp["from"], 2)))
    await tap(pg.locator(".player button.main"))
    blocked = await pg.evaluate("window.__blocked")
    for o in out: print(name, *o)
    print(name, "plays blocked by the autoplay rule:", blocked, "errors:", errs[:4])
    await b.close()

async def main():
    ensure_pulse(); base = os.environ.get("BASE") or serve()
    async with async_playwright() as p:
        for n in NAMES: await run(p, n, base)
asyncio.run(main())

"""Time from tap to sound start and to the end of the clip, per browser (lesson /i/, first stage)."""
import asyncio, sys, time
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
NAMES = sys.argv[1].split(",")
PROBE_T = r"""
(() => { const P = HTMLMediaElement.prototype; const op = P.play; window.__t = [];
  P.play = function () { const el = this, src = el.src, r = { t0: performance.now(), tp: null, te: null };
    window.__t.push(r);
    el.addEventListener('playing', () => { if (el.src === src && r.tp === null) r.tp = performance.now() - r.t0; });
    el.addEventListener('ended', () => { if (el.src === src && r.te === null) r.te = performance.now() - r.t0; });
    return op.call(this); }; })();
"""
async def run(p, name, base):
    b = await getattr(p, "webkit" if name == "iphone" else name).launch(**({"firefox_user_prefs": {"media.autoplay.default": 0}} if name == "firefox" else {}))
    ctx = await b.new_context(**(p.devices["iPhone 13"] if name == "iphone" else {"viewport": {"width": 390, "height": 844}}))
    await ctx.add_init_script(PROBE_T)
    pg = await ctx.new_page()
    await pg.goto(base + "#/sounds/i"); await pg.wait_for_timeout(2500)
    btns = pg.locator("main button.play:not([disabled])")
    res = []
    for k in range(min(6, await btns.count())):
        t0 = time.time()
        await btns.nth(k).click()
        for _ in range(80):
            await pg.wait_for_timeout(50)
            x = await pg.evaluate("window.__t.filter(r => r.te !== null || r.tp !== null).slice(-1)[0] || null")
            if x and x["te"] is not None: break
        res.append((round(x["tp"] or -1), round(x["te"] or -1), round((time.time() - t0) * 1000)))
    print(name, "tap→sound ms, tap→end ms, test loop ms:", res)
    await b.close()
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        for n in NAMES: await run(p, n, base)
asyncio.run(main())

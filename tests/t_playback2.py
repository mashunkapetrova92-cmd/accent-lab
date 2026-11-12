"""Every play button on every sound page plays its clip completely. Prints progress per lesson and survives a hung page."""
import asyncio, sys, json, time
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
NODES = sys.argv[1].split(",")
NAME = sys.argv[2] if len(sys.argv) > 2 else "webkit"

async def ev(pg, js, t=10):
    return await asyncio.wait_for(pg.evaluate(js), t)

async def run(p, base):
    real = "webkit" if NAME == "iphone" else NAME
    b = await getattr(p, real).launch(**({"firefox_user_prefs": {"media.autoplay.default": 0}} if NAME == "firefox" else {}))
    ctx = await b.new_context(**(p.devices["iPhone 13"] if NAME == "iphone" else {"viewport": {"width": 390, "height": 844}}))
    ctx.set_default_timeout(15000)
    await ctx.add_init_script(AUDIO_PROBE)
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.on("console", lambda m: errs.append("console: " + m.text[:200]) if m.type == "error" else None)
    pg.on("crash", lambda: errs.append("PAGE CRASHED"))
    total = ok = 0; bad = []
    await unlock_all(pg, base)
    for nid in NODES:
        t0 = time.time(); n_ok = n_all = 0
        try:
            await pg.goto(base + f"#/sounds/{nid}"); await pg.wait_for_timeout(1500)
            for stage in ["Learn", "Words"]:
                tab = pg.locator(".stage-tab", has_text=stage)
                if await tab.count(): await tab.first.click(); await pg.wait_for_timeout(400)
                btns = pg.locator("main button.play:not([disabled])")
                n = await btns.count()
                for k in range(n):
                    await ev(pg, "window.__plays = []")
                    lab = await btns.nth(k).get_attribute("aria-label")
                    await (btns.nth(k).tap() if NAME == "iphone" else btns.nth(k).click())
                    pl = []
                    for _ in range(60):
                        await pg.wait_for_timeout(100)
                        pl = await ev(pg, "window.__plays")
                        if pl and (pl[-1]["ended"] or pl[-1]["err"]): break
                    total += 1; n_all += 1
                    toast = await pg.locator(".toast").count()
                    if pl and pl[-1]["ended"] and not toast and (pl[-1]["dur"] or 0) > 0.25 and (pl[-1]["peak"] or 0) > 0.05: ok += 1; n_ok += 1
                    else: bad.append((nid, stage, lab, pl[-1] if pl else None, toast)); print("   FAIL", bad[-1], flush=True)
        except Exception as e:
            print("   ERROR in", nid, type(e).__name__, str(e)[:200], flush=True)
            bad.append((nid, "error", str(e)[:100]))
            try:
                await pg.close()
            except Exception: pass
            pg = await ctx.new_page()
            pg.on("crash", lambda: errs.append("PAGE CRASHED"))
        print(f"{NAME} {nid:12s} {n_ok}/{n_all} in {time.time() - t0:.0f}s", flush=True)
    print(f"{NAME:9s} clips played completely: {ok}/{total}", "errors:", errs[:5], flush=True)
    await b.close()

async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p: await run(p, base)
asyncio.run(main())

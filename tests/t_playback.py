"""Every play button on a sound page plays its clip completely, in Chromium, WebKit and Firefox."""
import asyncio, sys, json
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
NODES = sys.argv[1].split(",") if len(sys.argv) > 1 else ["i"]
BROWSERS = sys.argv[2].split(",") if len(sys.argv) > 2 else ["chromium", "webkit", "firefox"]
async def run(p, name, base):
    bt = getattr(p, "webkit" if name == "iphone" else name)
    b = await bt.launch(**({"firefox_user_prefs": {"media.autoplay.default": 0}} if name == "firefox" else {}))
    ctx = await b.new_context(**(p.devices["iPhone 13"] if name == "iphone" else {"viewport": {"width": 390, "height": 844}}))
    await ctx.add_init_script(AUDIO_PROBE)
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    total = ok = 0; bad = []
    await unlock_all(pg, base)
    for nid in NODES:
        await pg.goto(base + f"#/sounds/{nid}"); await pg.wait_for_timeout(1500)
        for stage in ["Learn", "Words"]:
            tab = pg.locator(".stage-tab", has_text=stage)
            if await tab.count(): await tab.first.click(); await pg.wait_for_timeout(400)
            btns = pg.locator("main button.play:not([disabled])")
            n = await btns.count()
            for k in range(n):
                await pg.evaluate("window.__plays = []")
                lab = await btns.nth(k).get_attribute("aria-label")
                await (btns.nth(k).tap() if name == "iphone" else btns.nth(k).click())
                for _ in range(40):
                    await pg.wait_for_timeout(100)
                    pl = await pg.evaluate("window.__plays")
                    if pl and pl[-1]["ended"]: break
                pl = await pg.evaluate("window.__plays"); total += 1
                toast = await pg.locator(".toast").count()
                if pl and pl[-1]["ended"] and not toast and pl[-1]["dur"] and pl[-1]["dur"] > 0.25 and (pl[-1]["peak"] or 0) > 0.05: ok += 1
                else: bad.append((nid, stage, lab, pl[-1] if pl else None, toast))
    print(f"{name:9s} clips played completely: {ok}/{total}", "errors:", errs[:3])
    for x in bad[:6]: print("   FAIL", x)
    await b.close()
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        for name in BROWSERS: await run(p, name, base)
asyncio.run(main())

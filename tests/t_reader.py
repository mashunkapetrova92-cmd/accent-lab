"""Reader: plays the text with word highlighting, normal and slow, jumps by sentence, word sheet sounds, in every browser."""
import asyncio, sys
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
BROWSERS = sys.argv[1].split(",") if len(sys.argv) > 1 else ["chromium", "webkit", "firefox"]
async def run(p, name, base):
    real = "webkit" if name == "iphone" else name
    b = await getattr(p, real).launch(**({"firefox_user_prefs": {"media.autoplay.default": 0}} if name == "firefox" else {}))
    ctx = await b.new_context(**(p.devices["iPhone 13"] if name == "iphone" else {"viewport": {"width": 390, "height": 844}}))
    await ctx.add_init_script(AUDIO_PROBE)
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text[:200]) if m.type == "error" else None)
    await pg.goto(base + "#/reading"); await pg.wait_for_timeout(1200)
    n = await pg.locator(".lib-card").count()
    await pg.locator(".lib-card").nth(3).click(); await pg.wait_for_timeout(1500)
    out = {"cards": n}
    # play, check highlight moves
    await pg.locator(".player button.main").click(); await pg.wait_for_timeout(2500)
    t1 = await pg.inner_text(".player .time"); now1 = await pg.locator(".tok.now").count()
    await pg.wait_for_timeout(1500); t2 = await pg.inner_text(".player .time")
    out["playing"] = (t1, t2, now1)
    await pg.locator(".player button.main").click()
    # next sentence while paused, then play: starts at that sentence
    await pg.locator("button[aria-label='Next sentence']").click(); await pg.wait_for_timeout(300)
    await pg.locator(".player button.main").click(); await pg.wait_for_timeout(1200)
    pl = await pg.evaluate("[window.__plays.slice(-1)[0], window.__lastPlay]"); out["jump"] = pl
    await pg.locator(".player button.main").click()
    # slow
    await pg.locator(".player button.spd").click(); await pg.wait_for_timeout(300)
    await pg.locator(".player button.main").click(); await pg.wait_for_timeout(1500)
    out["slow"] = (await pg.inner_text(".player button.spd"), await pg.inner_text(".player .time"), await pg.evaluate("window.__lastPlay.file"))
    await pg.locator(".player button.main").click()
    await pg.locator(".player button.spd").click()
    # word sheet: word, slow word, in context
    await pg.locator(".tok").nth(12).click(); await pg.wait_for_timeout(700)
    res = []
    for lab in ["Play the word", "Play the word slowly", "Play in context"]:
        await pg.evaluate("window.__plays = []")
        await pg.locator(f".sheet button[aria-label='{lab}']").click()
        for _ in range(30):
            await pg.wait_for_timeout(100)
            x = await pg.evaluate("window.__plays.slice(-1)[0]")
            if x and x["ended"]: break
        res.append((lab, x and x["ended"], x and x["dur"]))
    out["sheet"] = res
    await pg.locator(".sheet button[aria-label='Close']").click()
    # sentence sheet in Study mode: normal and slow
    await pg.locator(".seg button", has_text="Study").click(); await pg.wait_for_timeout(300)
    await pg.locator("button[aria-label='Notes for sentence 1']").click(); await pg.wait_for_timeout(500)
    res = []
    for lab in ["Play the sentence", "Play the sentence slowly"]:
        await pg.evaluate("window.__plays = []")
        await pg.locator(f".sheet button[aria-label='{lab}']").click()
        for _ in range(80):
            await pg.wait_for_timeout(100)
            x = await pg.evaluate("window.__plays.slice(-1)[0]")
            if x and x["ended"]: break
        res.append((lab, x and x["ended"], x and x["dur"]))
    out["sentence"] = res
    toast = await pg.locator(".toast").count()
    print(name, out, "toast:", toast, "errors:", errs[:3])
    await b.close()
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        for n in BROWSERS: await run(p, n, base)
asyncio.run(main())

"""Checks on the published site: playback and on-device checking of words, a sentence and a paragraph."""
import asyncio, sys, json
sys.path.insert(0, "/home/claude/tests")
from common import *
from t_record import wait_result
from t_journey import say
from playwright.async_api import async_playwright
LIVE = "https://mashunkapetrova92-cmd.github.io/accent-lab/"
BROWSERS = sys.argv[1].split(",") if len(sys.argv) > 1 else ["chromium", "iphone"]
async def run(p, name):
    real = "webkit" if name == "iphone" else name
    b = await getattr(p, real).launch(**({"firefox_user_prefs": {"media.autoplay.default": 0}} if name == "firefox" else {}))
    ctx = await b.new_context(ignore_https_errors=True, **(p.devices["iPhone 13"] if name == "iphone" else {"viewport": {"width": 390, "height": 844}}))
    await ctx.add_init_script(FAKE_MIC); await ctx.add_init_script(AUDIO_PROBE)
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.on("console", lambda m: errs.append("console: " + m.text[:160]) if m.type == "error" else None)
    await pg.goto(LIVE + "#/sounds/i"); await pg.wait_for_timeout(2500)
    data = await pg.evaluate("fetch('data/sounds.json').then(r => r.json())")
    node = data["nodes"][0]
    # playback: every button on Learn
    btns = pg.locator("main button.play:not([disabled])"); n = await btns.count(); ok = 0
    for k in range(n):
        await pg.evaluate("window.__plays = []"); await btns.nth(k).click()
        for _ in range(40):
            await pg.wait_for_timeout(100)
            pl = await pg.evaluate("window.__plays")
            if pl and pl[-1]["ended"]: ok += 1; break
    out = [("learn playback", f"{ok}/{n}")]
    await pg.locator(".stage-tab", has_text="Say").click(); await pg.wait_for_timeout(300)
    r, t = await say(pg, node["words"][0]["clip"]); out.append(("say " + node["words"][0]["text"], r[:50], f"{t}s"))
    await pg.get_by_role("button", name=node["words"][3]["text"], exact=True).click(); await pg.wait_for_timeout(200)
    r, t = await say(pg, node["words"][3]["clip"]); out.append(("say " + node["words"][3]["text"], r[:50], f"{t}s"))
    await pg.locator(".stage-tab", has_text="Sentences").click(); await pg.wait_for_timeout(300)
    r, t = await say(pg, node["sentences"][0]["clip"]); out.append(("sentence", r[:70], f"{t}s"))
    idx = await pg.evaluate("fetch('data/stories/index.json').then(r => r.json())")
    st = await pg.evaluate(f"fetch('data/stories/{idx[7]['id']}.json').then(r => r.json())")
    p0 = st["paragraphs"][0]["sents"]; a = st["times"][p0[0]["a"]][0]; bb = st["times"][p0[-1]["b"] - 1][1]
    await pg.goto(LIVE + f"#/reading/{idx[7]['id']}"); await pg.wait_for_timeout(2000)
    await pg.locator(".seg button", has_text="Read aloud").click(); await pg.wait_for_timeout(300)
    await pg.get_by_role("button", name="Paragraph 1", exact=True).click()
    r, t = await say(pg, [st["audio"], a, bb]); out.append(("paragraph 1", r[:90], f"{t}s"))
    await pg.goto(LIVE + "#/settings"); await pg.wait_for_timeout(1500)
    out.append(("version", [l for l in (await pg.inner_text("main")).split("\n") if l.startswith("Version")]))
    for x in out: print(name, *x)
    print(name, "errors:", errs[:4])
    await b.close()
async def main():
    ensure_pulse()
    async with async_playwright() as p:
        for n in BROWSERS: await run(p, n)
asyncio.run(main())

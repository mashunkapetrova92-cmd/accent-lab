import asyncio, sys
sys.path.insert(0, "/home/claude/tests")
from common import *
from t_record import record
from playwright.async_api import async_playwright
OUT = "/tmp/claude-0/-home-claude/67bd35bd-b4df-50eb-98f7-d7aa4da23be2/scratchpad/shots/"
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        b = await p.webkit.launch(); ctx = await b.new_context(**p.devices["iPhone 13"])
        await ctx.add_init_script(FAKE_MIC); pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(base + "#/settings"); await pg.wait_for_timeout(1500); await pg.screenshot(path=OUT + "settings.png", full_page=True)
        await pg.goto(base + "#/sounds"); await pg.wait_for_timeout(1500); await pg.screenshot(path=OUT + "map.png")
        await pg.goto(base + "#/sounds/i"); await pg.wait_for_timeout(1200)
        await pg.locator(".stage-tab", has_text="Say").click(); await pg.wait_for_timeout(300)
        # recording while the model downloads (first use)
        await pg.evaluate(f"window.__mic.url = '{base}test/see_ava.wav'")
        await pg.locator("main button.rec").click(); await pg.wait_for_timeout(1500); await pg.screenshot(path=OUT + "recording.png")
        r = await record(pg, base + "test/see_ava.wav")
        await pg.wait_for_timeout(1200); await pg.screenshot(path=OUT + "word_result.png", full_page=True)
        await pg.goto(base + "#/progress"); await pg.wait_for_timeout(1200); await pg.screenshot(path=OUT + "progress.png", full_page=True)
        idx = await pg.evaluate("fetch('data/stories/index.json').then(r => r.json())")
        await pg.goto(base + f"#/reading/{idx[5]['id']}"); await pg.wait_for_timeout(1500)
        await pg.locator(".seg button", has_text="Read aloud").click(); await pg.wait_for_timeout(400); await pg.screenshot(path=OUT + "read_aloud.png")
        print("errors", errs, r)
        await b.close()
asyncio.run(main())

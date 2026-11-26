import asyncio, sys
sys.path.insert(0, "/home/claude/tests")
from common import *
from t_record import record
from playwright.async_api import async_playwright
OUT = "/tmp/claude-0/-home-claude/67bd35bd-b4df-50eb-98f7-d7aa4da23be2/scratchpad/"
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 664}, device_scale_factor=2)
        await ctx.add_init_script(FAKE_MIC)
        pg = await ctx.new_page(); T = base + "test/"
        await pg.goto(base + "#/sounds/i"); await pg.wait_for_timeout(1200)
        await pg.locator(".stage-tab", has_text="Sentences").click(); await pg.wait_for_timeout(300)
        print(await record(pg, T + "i_sent0_ava.wav"))
        m = pg.locator(".metrics-help"); print("sent help:", await m.count(), await pg.locator(".metric").count(), "na:", await pg.locator(".metric.na").count())
        if await m.count(): await m.scroll_into_view_if_needed(); await pg.locator(".help-btn").click(); await pg.wait_for_timeout(200); print(await pg.locator(".help-note").inner_text())
        await pg.screenshot(path=OUT + "sent.png")
        idx = await pg.evaluate("fetch('data/stories/index.json').then(r => r.json())")
        await pg.goto(base + f"#/reading/{idx[0]['id']}"); await pg.wait_for_timeout(1500)
        await pg.wait_for_timeout(300)
        print(await record(pg, T + "story0_p0.wav"))
        await pg.wait_for_timeout(500)
        print("read help:", await pg.locator(".metrics-help").count(), "na:", await pg.locator(".metric.na").count(), "notice:", await pg.locator(".notice.info").count())
        await pg.locator(".metrics-help").scroll_into_view_if_needed()
        await pg.screenshot(path=OUT + "read1.png")
        await pg.locator(".help-btn").click(); await pg.wait_for_timeout(200)
        print(await pg.locator(".help-note").inner_text())
        await pg.screenshot(path=OUT + "read2.png")
        await b.close()
asyncio.run(main())

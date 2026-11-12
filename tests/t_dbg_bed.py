import asyncio, sys, json
sys.path.insert(0, "/home/claude/tests")
from common import *
from t_record import record
from playwright.async_api import async_playwright
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 390, "height": 844})
        await ctx.add_init_script(FAKE_MIC); pg = await ctx.new_page()
        await unlock_all(pg, base)
        for nid, w, f in [("eh", "bed", "us_w_bed.wav"), ("eh", "bed", "ru_m_w_bed.wav"), ("aa", "hot", "us_w_hot.wav")]:
            await pg.goto(base + f"#/sounds/{nid}"); await pg.wait_for_timeout(1200)
            await pg.locator(".stage-tab", has_text="Say").click(); await pg.wait_for_timeout(300)
            await pg.get_by_role("button", name=w, exact=True).first.click(); await pg.wait_for_timeout(200)
            r = await record(pg, base + "test/" + f)
            d = await pg.evaluate("JSON.stringify({ d: window.__lastResult.detail, dur: window.__lastResult.durationSec, alt: null })")
            print(nid, w, f, r[0][:40], d[:400])
        await b.close()
asyncio.run(main())

import asyncio, sys
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
OUT = "/tmp/claude-0/-home-claude/67bd35bd-b4df-50eb-98f7-d7aa4da23be2/scratchpad/"
async def main():
    base = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 664}, device_scale_factor=2)
        await ctx.add_init_script("sessionStorage.setItem('accentlab.started','1')")
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(base + "#/reading"); await pg.wait_for_timeout(1500)
        out = {}
        for L in ["A1", "B2", "C1", "C2"]:
            await pg.locator(".level-tabs button", has_text=L).click(); await pg.wait_for_timeout(300)
            out[L] = await pg.locator(".lib-card").count()
            if L == "C1": await pg.screenshot(path=OUT + "lib_c1.png")
        await pg.fill("input.search", "letter"); await pg.wait_for_timeout(300)
        out["search"] = await pg.locator(".lib-card").count()
        await pg.screenshot(path=OUT + "lib_search.png")
        await pg.goto(base + "#/settings"); await pg.wait_for_timeout(1500)
        await pg.locator("text=Offline use").scroll_into_view_if_needed()
        await pg.screenshot(path=OUT + "settings_off.png")
        out["dlbtn"] = await pg.locator("button", has_text="texts ·").first.inner_text()
        print(out, errs)
        await b.close()
asyncio.run(main())

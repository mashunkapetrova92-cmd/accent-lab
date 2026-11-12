import asyncio, sys
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 390, "height": 844}); pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text[:300]) if m.type == 'error' else None)
        await pg.goto(base + "#/reading"); await pg.wait_for_timeout(1200)
        await pg.locator(".lib-card").nth(3).click(); await pg.wait_for_timeout(1500)
        await pg.locator(".tok").nth(12).click(); await pg.wait_for_timeout(1000)
        print(await pg.locator(".sheet").count(), (await pg.inner_text(".sheet"))[:300] if await pg.locator(".sheet").count() else None)
        print(await pg.evaluate("[...document.querySelectorAll('.sheet button')].map(b => b.getAttribute('aria-label'))"))
        print('tok count', await pg.locator('.tok').count(), 'errors', errs[:5]); print((await pg.inner_text('main'))[:300])
        await b.close()
asyncio.run(main())

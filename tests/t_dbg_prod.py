import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 390, "height": 844}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:1500])); pg.on('console', lambda m: errs.append(m.text[:1500]) if m.type == 'error' else None)
        await pg.goto("http://localhost:4330/x/#/reading"); await pg.wait_for_timeout(3000)
        await pg.locator(".lib-card").nth(3).click(); await pg.wait_for_timeout(3000)
        print("toks", await pg.locator(".tok").count(), "cards", await pg.locator(".lib-card").count())
        for e in errs[:3]: print(e, "\n---")
        await b.close()
asyncio.run(main())

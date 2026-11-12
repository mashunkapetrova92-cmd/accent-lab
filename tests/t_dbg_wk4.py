import asyncio, sys
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
async def trial(p, base, label, ctx_kw, url, extra_init=None):
    b = await p.webkit.launch(); ctx = await b.new_context(**ctx_kw)
    await ctx.add_init_script(FAKE_MIC)
    if extra_init: await ctx.add_init_script(extra_init)
    pg = await ctx.new_page(); logs = []
    pg.on('console', lambda m: logs.append(m.text[:400]))
    await pg.goto(base + "#/sounds/i"); await pg.wait_for_timeout(1200)
    await pg.locator(".stage-tab", has_text="Say").click(); await pg.wait_for_timeout(300)
    await pg.evaluate(f"window.__mic.url = '{url}'")
    await pg.locator("main button.rec").first.click(); await pg.wait_for_timeout(2500)
    n = await pg.evaluate("(document.querySelector('.notice.bad')||{}).innerText || ''")
    print(label, '->', n[:40] or 'no error', await pg.locator('.rec-label').first.inner_text())
    print('   logs:', [l for l in logs if '[mic]' in l][:2])
    await b.close()
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        await trial(p, base, 'rel, no viewport', {}, 'test/see_ava.wav')

asyncio.run(main())

import asyncio, sys
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        b = await p.webkit.launch(); ctx = await b.new_context()
        await ctx.add_init_script(FAKE_MIC)
        await ctx.add_init_script("""(() => { window.__mdRef = navigator.mediaDevices; const P = MediaDevices.prototype; const pg = P.getUserMedia; P.getUserMedia = function(c) { window.__protoCalls = (window.__protoCalls||0) + 1; return pg.call(this, c); };
  const OE = window.Error; window.__errs = []; const oAE = window.addEventListener; })()""")
        pg = await ctx.new_page(); logs = []
        pg.on("console", lambda m: logs.append(m.text[:300]))
        await pg.goto(base + "#/sounds/i"); await pg.wait_for_timeout(1000)
        await pg.locator(".stage-tab", has_text="Say").click(); await pg.wait_for_timeout(300)
        await pg.evaluate("window.__mic.url = 'test/see_ava.wav'")
        await pg.locator("main button.rec").first.click(); await pg.wait_for_timeout(3000)
        print(await pg.evaluate("({same: navigator.mediaDevices === window.__mdRef, own: Object.getOwnPropertyNames(navigator.mediaDevices), proto: window.__protoCalls, gumIsFake: navigator.mediaDevices.getUserMedia.toString().slice(0,40), notice: (document.querySelector('.notice.bad')||{}).innerText})"))
        print(logs[:10])
        await b.close()
asyncio.run(main())

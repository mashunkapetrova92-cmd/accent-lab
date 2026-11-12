import asyncio, sys
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        b = await p.webkit.launch(); ctx = await b.new_context()
        await ctx.add_init_script(FAKE_MIC)
        pg = await ctx.new_page(); await pg.goto(base + "#/sounds/i"); await pg.wait_for_timeout(1000)
        print(await pg.evaluate("""async () => { const r = { secure: isSecureContext, md: !!navigator.mediaDevices, gum: navigator.mediaDevices ? navigator.mediaDevices.getUserMedia.toString().slice(0, 60) : null, mic: JSON.stringify(window.__mic) };
          window.__mic.url = 'test/see_ava.wav';
          try { const s = await navigator.mediaDevices.getUserMedia({audio: true}); r.ok = s.getAudioTracks().length; } catch (e) { r.err = e.name + ' ' + e.message; }
          return r; }"""))
        await b.close()
asyncio.run(main())

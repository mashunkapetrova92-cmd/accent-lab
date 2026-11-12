import asyncio, sys
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        b = await p.webkit.launch(); ctx = await b.new_context()
        await ctx.add_init_script(FAKE_MIC)
        pg = await ctx.new_page()
        await pg.goto(base + "#/progress"); await pg.wait_for_timeout(1000)
        await pg.evaluate("""() => { window.__mic.url = 'test/see_ava.wav'; window.R = []; const b = document.createElement('button'); b.id = 'xx'; b.textContent = 'xx'; b.style = 'position:fixed;top:0;left:0;z-index:999;width:100px;height:50px'; document.body.appendChild(b);
          b.onclick = async () => { const L = (s) => R.push(s);
            const a1 = new AudioContext(); a1.resume().then(() => L('a1 resumed'), e => L('a1 resume err ' + e.name));
            try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); L('gum ok ' + st.getAudioTracks().length); } catch (e) { L('gum err ' + e.name + ' ' + e.message); }
          }; }""")
        await pg.click('#xx'); await pg.wait_for_timeout(3000); print(await pg.evaluate('R'), await pg.evaluate('[window.__fakeCalls, window.__fakeLog]'))
        # same, without a prior context
        await pg.evaluate("""() => { R.length = 0; document.getElementById('xx').onclick = async () => { const L = (s) => R.push(s);
            try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); L('gum ok ' + st.getAudioTracks().length); } catch (e) { L('gum err ' + e.name + ' ' + e.message); } }; }""")
        await pg.click('#xx'); await pg.wait_for_timeout(3000); print(await pg.evaluate('R'))
        await b.close()
asyncio.run(main())

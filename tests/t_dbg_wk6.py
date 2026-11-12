import asyncio, sys
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        b = await p.webkit.launch(); ctx = await b.new_context()
        pg = await ctx.new_page()
        await pg.goto(base + "#/progress"); await pg.wait_for_timeout(1000)
        await pg.evaluate("""() => { window.R = []; const b = document.createElement('button'); b.id = 'xx'; b.textContent = 'xx'; b.style = 'position:fixed;top:0;left:0;z-index:999;width:100px;height:50px'; document.body.appendChild(b);
          b.onclick = async () => { const L = (s) => R.push(s);
            try { const ctx = new AudioContext(); L('ctx ' + ctx.state); await ctx.resume().catch(e => L('resume err ' + e.name)); L('after resume ' + ctx.state);
              const ab = await (await fetch('test/see_ava.wav')).arrayBuffer(); L('fetched ' + ab.byteLength);
              const buf = await ctx.decodeAudioData(ab); L('decoded ' + buf.duration);
              const src = ctx.createBufferSource(); src.buffer = buf; const dest = ctx.createMediaStreamDestination(); L('dest ok'); src.connect(dest); src.start(ctx.currentTime + 0.4); L('started ' + dest.stream.getAudioTracks().length);
            } catch (e) { L('ERR ' + e.name + ' ' + e.message); } }; }""")
        await pg.click('#xx'); await pg.wait_for_timeout(3000); print(await pg.evaluate('R'))
        await b.close()
asyncio.run(main())

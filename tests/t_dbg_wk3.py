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
        await pg.goto(base + "#/sounds/i"); await pg.wait_for_timeout(1000)
        await pg.evaluate("window.__mic.url = 'test/see_ava.wav'")
        await pg.set_content("<button id=b>go</button>")
        await pg.evaluate("""() => { window.R = []; document.getElementById('b').onclick = async () => {
          const steps = R;
          try { steps.push('as: ' + typeof navigator.audioSession + ' ' + (navigator.audioSession && navigator.audioSession.type));
            try { navigator.audioSession.type = 'play-and-record'; steps.push('set ok ' + navigator.audioSession.type); } catch (e) { steps.push('set err ' + e.name); }
            const ctx = new AudioContext(); ctx.resume().catch(e => steps.push('resume err ' + e.name)); steps.push('ctx ' + ctx.state);
            const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } }); steps.push('gum ok');
          } catch (e) { steps.push('ERR ' + e.name + ': ' + e.message); } }; }""")
        await pg.click("#b"); await pg.wait_for_timeout(2500)
        print(await pg.evaluate("R"))
        await b.close()
asyncio.run(main())

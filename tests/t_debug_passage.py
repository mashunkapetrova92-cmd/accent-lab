import asyncio, sys, base64, json
sys.path.insert(0, "/home/claude/tests")
from common import *
from t_record import record
from playwright.async_api import async_playwright
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 390, "height": 844})
        await ctx.add_init_script(FAKE_MIC); await ctx.add_init_script("localStorage.setItem('accentlab.nativeBroken','1')")
        pg = await ctx.new_page()
        idx = None
        await pg.goto(base + "#/reading"); await pg.wait_for_timeout(1000)
        idx = await pg.evaluate("fetch('data/stories/index.json').then(r => r.json())")
        await pg.goto(base + f"#/reading/{idx[0]['id']}"); await pg.wait_for_timeout(1500)
        await pg.locator(".seg button", has_text="Read aloud").click()
        await pg.get_by_role("button", name="Paragraph 1", exact=True).click()
        r = await record(pg, base + "test/story0_p0.wav")
        print(r)
        info = await pg.evaluate("""async () => { const r = window.__lastResult; const ab = await r.audio.arrayBuffer(); let s = ''; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return { t: r.transcript, engine: r.engine, bad: r.words.filter(w => w.status !== 'good').map(w => w.ref + (w.heard ? '>' + w.heard : '')), wav: btoa(s) }; }""")
        open("/tmp/claude-0/-home-claude/67bd35bd-b4df-50eb-98f7-d7aa4da23be2/scratchpad/rec_p0.wav", "wb").write(base64.b64decode(info["wav"]))
        print(info["engine"], info["t"]); print("BAD:", info["bad"])
        await b.close()
asyncio.run(main())

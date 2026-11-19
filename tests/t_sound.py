"""Free sound check end to end: record a lesson sentence in two native and two Russian-accented voices."""
import asyncio, sys, json
sys.path.insert(0, "/home/claude/tests")
from common import *
from t_record import record
from playwright.async_api import async_playwright
NAMES = sys.argv[1].split(",") if len(sys.argv) > 1 else ["iphone"]
async def run(p, name, base):
    b = await getattr(p, "webkit" if name == "iphone" else name).launch()
    ctx = await b.new_context(**(p.devices["iPhone 13"] if name == "iphone" else {"viewport": {"width": 390, "height": 844}}))
    await ctx.add_init_script(FAKE_MIC)
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    await unlock_all(pg, base)
    await pg.goto(base + "#/sounds/i"); await pg.wait_for_timeout(800)
    await pg.locator(".stage-tab", has_text="Sentences").click(); await pg.wait_for_timeout(300)
    for v in ["andrew", "aria", "ru_m", "ru_f"]:
        r = await record(pg, base + f"test/s0_{v}.mp3")
        x = await pg.evaluate("""() => { const r = window.__lastResult; return { overall: r.overall,
            ph: (r.metrics.find(m => m.key === 'phoneme') || {}).value, heard: r.detail && r.detail.heardSounds,
            flags: r.words.flatMap(w => (w.phonemes || []).filter(p => p.score < 80).map(p => w.ref + ':' + p.p + '>' + (p.heardAs || '∅'))) }; }""")
        shown = await pg.locator(".notice").all_inner_texts()
        print(f"{name:8s} {v:6s} score {x['overall']:3d} sounds {x['ph']} flags {x['flags']}  ({r[1]} s)")
    await pg.screenshot(path="/tmp/claude-0/-home-claude/67bd35bd-b4df-50eb-98f7-d7aa4da23be2/scratchpad/sound_result.png", full_page=True)
    print(name, "errors:", errs[:3]); await b.close()
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        for n in NAMES: await run(p, n, base)
asyncio.run(main())

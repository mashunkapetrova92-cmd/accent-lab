"""Does single-word checking separate native from Russian-accented pronunciation? Same words, three speakers."""
import asyncio, sys
sys.path.insert(0, "/home/claude/tests")
from common import *
from t_record import record
from playwright.async_api import async_playwright
CASES = [("th", "think"), ("th", "three"), ("th", "thank"), ("v", "very"), ("v", "van"), ("eh", "bed"), ("ae", "cat"), ("aa", "hot")]
SPEAKERS = ["us", "ru_m", "ru_f"]
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 390, "height": 844})
        await ctx.add_init_script(FAKE_MIC); pg = await ctx.new_page()
        rows = []
        await unlock_all(pg, base)
        for nid, w in CASES:
            await pg.goto(base + f"#/sounds/{nid}"); await pg.wait_for_timeout(1200)
            await pg.locator(".stage-tab", has_text="Say").click(); await pg.wait_for_timeout(300)
            await pg.get_by_role("button", name=w, exact=True).first.click(); await pg.wait_for_timeout(200)
            res = []
            for sp in SPEAKERS:
                r, t = await record(pg, base + f"test/{sp}_w_{w}.wav")
                res.append(r.split(' [')[0].replace('done ', '') + (' ' + r.split('heard=')[1][:14] if 'heard=' in r else ''))
            rows.append((w, res)); print(f"{w:7s}", " | ".join(f"{s}: {x}" for s, x in zip(SPEAKERS, res)), flush=True)
        await b.close()
asyncio.run(main())

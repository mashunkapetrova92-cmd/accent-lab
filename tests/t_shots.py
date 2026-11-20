"""Screenshots of each lesson stage after answering, at phone size, and where the action button sits."""
import asyncio, sys, re
sys.path.insert(0, "/home/claude/tests")
from common import *
from t_record import record
from playwright.async_api import async_playwright
OUT = "/tmp/claude-0/-home-claude/67bd35bd-b4df-50eb-98f7-d7aa4da23be2/scratchpad/shots/"
H = int(sys.argv[1]) if len(sys.argv) > 1 else 664
async def where(pg, name, sel):
    vh = await pg.evaluate("innerHeight")
    loc = pg.locator(sel).last
    if not await loc.count(): print(f"{name:22s} button not found"); return
    box = await loc.bounding_box(); sh = await pg.evaluate("document.scrollingElement.scrollHeight")
    print(f"{name:22s} button bottom {box['y']+box['height']:.0f} / screen {vh}  page {sh}  {'OK' if box['y']+box['height'] <= vh else 'NEEDS SCROLL'}")
    await pg.screenshot(path=OUT + name + ".png")
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        b = await p.webkit.launch()
        dev = dict(p.devices["iPhone 13"]); dev["viewport"] = {"width": 390, "height": H}
        ctx = await b.new_context(**dev); await ctx.add_init_script(FAKE_MIC); await ctx.add_init_script(AUDIO_PROBE)
        pg = await ctx.new_page(); await unlock_all(pg, base)
        await pg.goto(base + "#/sounds/i"); await pg.wait_for_timeout(1200)
        await where(pg, "learn", "main button.btn.primary")
        await pg.locator(".stage-tab", has_text="Listen").first.tap(); await pg.wait_for_timeout(400)
        await pg.get_by_role("button", name=re.compile("^Start")).tap(); await pg.wait_for_timeout(1500)
        await pg.locator(".options button.opt").first.tap(); await pg.wait_for_timeout(500)
        await where(pg, "listen_answered", "main button.btn.primary")
        await pg.locator(".stage-tab", has_text="Say").first.tap(); await pg.wait_for_timeout(400)
        await record(pg, base + "test/see_andrew.wav"); await pg.wait_for_timeout(800)
        await where(pg, "say_result", ".step-bar")
        await pg.locator(".stage-tab", has_text="Sentences").first.tap(); await pg.wait_for_timeout(400)
        await record(pg, base + "test/s0_aria.mp3"); await pg.wait_for_timeout(800)
        await where(pg, "sentence_result", ".step-bar")
        await pg.locator(".stage-tab", has_text="Test").first.tap(); await pg.wait_for_timeout(400)
        await where(pg, "test_start", "main button.btn.primary")
        await b.close()
asyncio.run(main())

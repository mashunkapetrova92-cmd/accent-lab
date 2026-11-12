"""Upgrade of an installed app: the published version (old) is running with its service worker, then the new
version is published at the same address. Relaunch the app and check that the new version takes over and plays."""
import asyncio, sys, os, subprocess, time, shutil
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
OLD, NEW = sys.argv[1], sys.argv[2]
NAME = sys.argv[3] if len(sys.argv) > 3 else "chromium"
SITE = "/home/claude/upg/site"; PORT = 4330
def point(d):
    tmp = SITE + ".tmp"; os.symlink(d, tmp); os.replace(tmp, SITE)
async def main():
    point(OLD)
    srv = subprocess.Popen(["node", "/home/claude/tools/static.mjs", SITE, str(PORT), "/accent-lab"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1); base = f"http://localhost:{PORT}/accent-lab/"
    prof = "/tmp/claude-0/-home-claude/67bd35bd-b4df-50eb-98f7-d7aa4da23be2/scratchpad/upg-profile-" + NAME
    shutil.rmtree(prof, ignore_errors=True)
    try:
        async with async_playwright() as p:
            real = "webkit" if NAME == "iphone" else NAME
            opts = {k: v for k, v in p.devices["iPhone 13"].items() if k != "default_browser_type"} if NAME == "iphone" else {"viewport": {"width": 390, "height": 844}}
            ctx = await getattr(p, real).launch_persistent_context(prof, **opts)
            await ctx.add_init_script(AUDIO_PROBE)
            await ctx.add_init_script("try { sessionStorage.loads = String(+(sessionStorage.loads || 0) + 1); } catch (e) {}")
            pg = ctx.pages[0] if ctx.pages else await ctx.new_page()
            await pg.goto(base + "#/sounds"); await pg.wait_for_timeout(2500)
            await pg.reload(); await pg.wait_for_timeout(2000)
            ctl = await pg.evaluate("!!navigator.serviceWorker && !!navigator.serviceWorker.controller")
            await pg.goto(base + "#/settings"); await pg.wait_for_timeout(800)
            v_old = "Version" in await pg.inner_text("main")
            print(NAME, "old app controlled by its service worker:", ctl, "| shows a version line:", v_old)
            # the new version is published; the learner reopens the app from its icon
            point(NEW)
            old = pg; pg = await ctx.new_page(); await old.close()
            await pg.goto(base + "#/sounds"); await pg.wait_for_timeout(15000)
            loads = await pg.evaluate("sessionStorage.loads")
            await pg.goto(base + "#/settings"); await pg.wait_for_timeout(800)
            txt = await pg.inner_text("main")
            ver = [l for l in txt.split("\n") if l.startswith("Version")]
            print(NAME, "after relaunch: page loads in this tab", loads, "| version:", ver)
            # if the first launch still showed the old app, a second launch must show the new one
            if not ver:
                old = pg; pg = await ctx.new_page(); await old.close()
                await pg.goto(base + "#/settings"); await pg.wait_for_timeout(3000)
                txt = await pg.inner_text("main"); ver = [l for l in txt.split("\n") if l.startswith("Version")]
                print(NAME, "second relaunch: version:", ver)
            await pg.goto(base + "#/sounds/i"); await pg.wait_for_timeout(2000)
            await pg.evaluate("window.__plays = []")
            await pg.locator("main button.play:not([disabled])").first.click()
            x = None
            for _ in range(60):
                await pg.wait_for_timeout(100)
                x = await pg.evaluate("window.__plays.slice(-1)[0] || null")
                if x and (x["ended"] or x["err"]): break
            print(NAME, "clip after the update:", x)
            await ctx.close()
    finally:
        srv.terminate()
asyncio.run(main())

"""Settings → Azure token server: the connection test against a local copy of the token server (Azure stubbed),
its error messages, and on-device checking when the phone is offline."""
import asyncio, sys, os, subprocess, time, json
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
WK = "/tmp/claude-0/-home-claude/67bd35bd-b4df-50eb-98f7-d7aa4da23be2/scratchpad/wk"
def worker(env):
    p = subprocess.Popen(["node", WK + "/serve-worker.mjs"], env={**os.environ, "WENV": json.dumps(env), "PORT": "8787"}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8); return p
async def save_and_test(pg, ep):
    await pg.goto(BASE + "#/settings"); await pg.wait_for_timeout(600)
    await pg.fill("#ep", ep); await pg.get_by_role("button", name="Save and test").click()
    await pg.wait_for_selector(".notice.info, .notice.bad", timeout=10000)
    return await pg.locator(".notice.info, .notice.bad").first.inner_text()
async def main():
    global BASE
    BASE = serve(); name = sys.argv[1] if len(sys.argv) > 1 else "iphone"
    origin = BASE.split("/accent-lab")[0]
    async with async_playwright() as p:
        b = await getattr(p, "webkit" if name == "iphone" else name).launch()
        ctx = await b.new_context(**(p.devices["iPhone 13"] if name == "iphone" else {"viewport": {"width": 390, "height": 844}}))
        pg = await ctx.new_page()
        for label, env in [("right settings", {"AZURE_SPEECH_KEY": "good-key", "AZURE_REGION": "eastus", "ALLOWED_ORIGINS": origin}),
                           ("ALLOWED_ORIGINS with a mistake", {"AZURE_SPEECH_KEY": "good-key", "AZURE_REGION": "eastus", "ALLOWED_ORIGINS": origin + "/accent-lab"}),
                           ("wrong key", {"AZURE_SPEECH_KEY": "bad", "AZURE_REGION": "eastus", "ALLOWED_ORIGINS": origin}),
                           ("key missing", {"AZURE_REGION": "eastus", "ALLOWED_ORIGINS": origin})]:
            w = worker(env)
            try: print(name, label, "→", await save_and_test(pg, "http://localhost:8787/"))
            finally: w.terminate()
        # with a working server saved: online → Azure, offline → this device
        w = worker({"AZURE_SPEECH_KEY": "good-key", "AZURE_REGION": "eastus", "ALLOWED_ORIGINS": origin})
        await save_and_test(pg, "http://localhost:8787/")
        now = lambda: pg.locator("text=Now in use").first.inner_text()
        print(name, "online:", await now())
        await ctx.set_offline(True)
        await pg.goto(BASE + "#/sounds"); await pg.wait_for_timeout(300); await pg.goto(BASE + "#/settings"); await pg.wait_for_timeout(500)
        print(name, "offline:", await now())
        await ctx.set_offline(False); w.terminate()
        await b.close()
asyncio.run(main())

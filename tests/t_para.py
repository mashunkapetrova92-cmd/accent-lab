"""Reading by paragraph: one paragraph shown, plays only that paragraph, record, saved, next, resume after reload."""
import asyncio, sys
sys.path.insert(0, "/home/claude/tests")
from common import *
from t_record import record
from playwright.async_api import async_playwright
OUT = "/tmp/claude-0/-home-claude/67bd35bd-b4df-50eb-98f7-d7aa4da23be2/scratchpad/"
BROWSERS = sys.argv[1].split(",") if len(sys.argv) > 1 else ["chromium", "webkit"]
async def run(p, name, base):
    real = "webkit" if name == "iphone" else name
    b = await getattr(p, real).launch()
    ctx = await b.new_context(**(p.devices["iPhone 13"] if name == "iphone" else {"viewport": {"width": 390, "height": 664}, "device_scale_factor": 2}))
    await ctx.add_init_script(FAKE_MIC)
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    T = base + "test/"
    idx = await pg.evaluate("fetch('data/stories/index.json').then(r => r.json())") if False else None
    await pg.goto(base + "#/reading"); await pg.wait_for_timeout(1200)
    idx = await pg.evaluate("fetch('data/stories/index.json').then(r => r.json())")
    sid = [s for s in idx if s.get("level", "A1") == "A1"][0]["id"]
    await pg.goto(base + f"#/reading/{sid}"); await pg.wait_for_timeout(1500)
    out = {"paras_in_dom": await pg.locator("article.passage p").count(), "dots": await pg.locator(".para-dots button").count()}
    st = await pg.evaluate(f"fetch('data/stories/{sid}.json').then(r => r.json())")
    p0 = st["paragraphs"][0]["sents"]; a, bb = p0[0]["a"], p0[-1]["b"]; tm = st["times"]
    out["toks"] = (await pg.locator("article .tok").count(), bb - a)
    await pg.screenshot(path=OUT + f"para_{name}_0.png")
    await pg.locator(".dock-play").click(); await pg.wait_for_timeout(1500)
    lp = await pg.evaluate("window.__lastPlay"); out["play_range_ok"] = abs(lp["to"] - (tm[bb - 1][1] + 0.2)) < 0.01 and lp["from"] < tm[a][0] + 0.1
    await pg.locator(".dock-play").click()
    r = await record(pg, T + "story0_p0.wav"); out["rec"] = r[0][:40]
    await pg.wait_for_timeout(600)
    out["colored"] = await pg.locator("article .tok.g, article .tok.r, article .tok.y").count()
    await pg.screenshot(path=OUT + f"para_{name}_1.png")
    out["saved"] = await pg.evaluate("1")
    await pg.locator(".dock-next").click(); await pg.wait_for_timeout(500)
    out["now"] = await pg.inner_text(".para-head b"); out["dot1"] = await pg.locator(".para-dots button").first.get_attribute("class")
    await pg.locator(".dock-play").click(); await pg.wait_for_timeout(1200)
    lp = await pg.evaluate("window.__lastPlay"); p1 = st["paragraphs"][1]["sents"]; out["play2_ok"] = abs(lp["from"] - (tm[p1[0]["a"]][0] - 0.05)) < 0.06
    await pg.locator(".dock-play").click()
    await pg.reload(); await pg.wait_for_timeout(1800)
    out["after_reload"] = await pg.inner_text(".para-head b"); out["dot1_reload"] = await pg.locator(".para-dots button").first.get_attribute("class")
    await pg.locator(".para-dots button.sum").click(); await pg.wait_for_timeout(300)
    await pg.screenshot(path=OUT + f"para_{name}_sum.png")
    await pg.goto(base + "#/reading"); await pg.wait_for_timeout(800)
    out["lib_pill"] = await pg.locator(".lib-card").first.locator(".pill").inner_text()
    print(name, out, "errors:", errs[:3])
    await b.close()
async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        for n in BROWSERS: await run(p, n, base)
asyncio.run(main())

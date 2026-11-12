"""A full lesson, as a learner would do it, on the development server (answers are exposed there):
Learn -> Words -> Listen -> Say -> Sentences -> Test, with the model's own recordings as the learner's voice."""
import asyncio, sys, json, time
sys.path.insert(0, "/home/claude/tests")
from common import *
from t_record import wait_result
from playwright.async_api import async_playwright
BASE = "http://localhost:5175/"
NODE = sys.argv[1] if len(sys.argv) > 1 else "i"
BROWSER = sys.argv[2] if len(sys.argv) > 2 else "chromium"

async def say(pg, clip, button="main button.rec"):
    f, a, b = clip[0], clip[1], clip[2]
    await pg.evaluate(f"window.__mic = Object.assign(window.__mic, {{ url: 'audio/{f}', from: {max(0, a - 0.1)}, to: {b + 0.15} }}); window.__micDone = false")
    await pg.locator(button).first.click()
    for _ in range(200):
        await pg.wait_for_timeout(200)
        if await pg.evaluate("window.__micDone === true"): break
    await pg.wait_for_timeout(1000)
    lab = await pg.locator(".rec-label").first.inner_text()
    if "finish" in lab or "say the word" in lab: await pg.locator(button).first.click()
    return await wait_result(pg)

async def main():
    ensure_pulse()
    async with async_playwright() as p:
        real = "webkit" if BROWSER == "iphone" else BROWSER
        b = await getattr(p, real).launch(**({"firefox_user_prefs": {"media.autoplay.default": 0}} if BROWSER == "firefox" else {}))
        ctx = await b.new_context(**(p.devices["iPhone 13"] if BROWSER == "iphone" else {"viewport": {"width": 390, "height": 844}}))
        await ctx.add_init_script(FAKE_MIC); await ctx.add_init_script(AUDIO_PROBE)
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
        pg.on("console", lambda m: errs.append("console: " + m.text[:200]) if m.type == "error" else None)
        data = None
        await pg.goto(BASE + "#/sounds"); await pg.wait_for_timeout(2000)
        data = await pg.evaluate("fetch('data/sounds.json').then(r => r.json())")
        node = [n for n in data["nodes"] if n["id"] == NODE][0]
        if NODE != data["nodes"][0]["id"]: await unlock_all(pg, BASE)
        await pg.goto(BASE + f"#/sounds/{NODE}"); await pg.wait_for_timeout(1500)
        log = []
        # Learn
        import re
        await pg.locator(".stage-tab", has_text="Learn").click(); await pg.wait_for_timeout(300)
        await pg.get_by_role("button", name=re.compile("I understand this sound")).click(); await pg.wait_for_timeout(400)
        # Words
        await pg.get_by_role("button", name=re.compile("Continue to listening practice")).click(); await pg.wait_for_timeout(400)
        # Listen: answers are exposed by the dev server
        await pg.locator(".stage-tab", has_text="Listen").click(); await pg.wait_for_timeout(300)
        await pg.get_by_role("button", name=re.compile("^Start")).click(); await pg.wait_for_timeout(600)
        for q in range(30):
            card = pg.locator(".drill[data-answer]")
            if not await card.count(): break
            ans = await card.first.get_attribute("data-answer")
            await card.first.get_by_role("button", name=ans, exact=True).click(); await pg.wait_for_timeout(250)
            await pg.get_by_role("button", name=re.compile("^(Next|See result)")).click(); await pg.wait_for_timeout(300)
        txt = await pg.inner_text("main"); log.append(("listen", txt.split("\n")[:3]))
        cont = pg.get_by_role("button", name=re.compile("^Continue"))
        if await cont.count(): await cont.first.click(); await pg.wait_for_timeout(400)
        # Say: six words
        await pg.locator(".stage-tab", has_text="Say").click(); await pg.wait_for_timeout(400)
        scores = []
        for k, w in enumerate(node["words"][:6]):
            await pg.get_by_role("button", name=w["text"], exact=False).first.click(); await pg.wait_for_timeout(200)
            r, t = await say(pg, w["clip"])
            scores.append((w["text"], w.get("check"), r.split(" [")[0].replace("done ", "")))
        log.append(("say", scores))
        await pg.get_by_role("button", name=re.compile("Continue to sentences")).click(); await pg.wait_for_timeout(400)
        # Sentences
        await pg.locator(".stage-tab", has_text="Sentences").click(); await pg.wait_for_timeout(400)
        for k in range(3):
            await pg.get_by_role("button", name=f"Sentence {k + 1}", exact=True).click(); await pg.wait_for_timeout(300)
            r, t = await say(pg, node["sentences"][k]["clip"]); log.append(("sentence", k + 1, r[:70]))
        await pg.get_by_role("button", name=re.compile("Continue to the final test")).click(); await pg.wait_for_timeout(400)
        # Test
        await pg.locator(".stage-tab", has_text="Test").click(); await pg.wait_for_timeout(400)
        print("test intro:", (await pg.inner_text("main"))[-300:].replace("\n", " | "))
        await pg.locator("main button.btn.primary").first.click(); await pg.wait_for_timeout(500)
        for step in range(40):
            card = pg.locator(".drill[data-answer]")
            if await card.count():
                ans = await card.first.get_attribute("data-answer")
                await card.first.get_by_role("button", name=ans, exact=True).click(); await pg.wait_for_timeout(250)
                await pg.get_by_role("button", name=re.compile("^Next")).click(); await pg.wait_for_timeout(300)
                continue
            if await pg.locator("main button.rec").count():
                # which item is shown: a word or the sentence
                body = await pg.inner_text("main")
                item = next((w for w in node["words"] if f"“{w['text']}”" in body), None) or next((s for s in node["sentences"] if s["text"][:12] in body), None)
                if item is None: log.append(("test", "unknown item")); break
                r, t = await say(pg, item["clip"]); log.append(("test item", (item.get("text") or "")[:20], r[:40]))
                await pg.get_by_role("button", name=re.compile("^(Next word|Continue|Finish the test)")).click(); await pg.wait_for_timeout(400)
                continue
            break
        await pg.wait_for_timeout(1500)
        body = await pg.inner_text("main")
        log.append(("test result", [l for l in body.split("\n") if "/100" in l or "Mastered" in l or "pass" in l.lower() or "score" in l.lower()][:4]))
        for x in log: print(BROWSER, NODE, x)
        print(BROWSER, "errors:", [e for e in errs if "404" not in e][:4])
        await b.close()
if __name__ == '__main__':
    asyncio.run(main())

"""Recording with on-device checking in every browser: words, a sentence and a paragraph, using a fake microphone."""
import asyncio, sys, json, time
sys.path.insert(0, "/home/claude/tests")
from common import *
from playwright.async_api import async_playwright
BROWSERS = sys.argv[1].split(",") if len(sys.argv) > 1 else ["chromium", "webkit", "firefox"]

async def wait_result(pg, timeout=180):
    t0 = time.time(); st = ''
    while time.time() - t0 < timeout:
        st = await pg.evaluate("""() => { const e = document.querySelector('.notice.bad[role=alert]'); if (e) return 'error: ' + e.innerText;
          const r = window.__lastResult; const lab = document.querySelector('.rec-label');
          if (r && r !== window.__seen) { window.__seen = r; const bad = r.words.filter(w => w.status !== 'good').map(w => w.ref + (w.heard ? '>' + w.heard : ''));
            return 'done ' + r.overall + ' [' + r.engine + '] heard=' + JSON.stringify(r.transcript.slice(0, 60)) + (bad.length ? ' bad=' + bad.slice(0, 6).join(',') : ''); }
          return lab ? 'busy ' + lab.innerText : 'none'; }""")
        if st.startswith("done") or st.startswith("error"): return st, round(time.time() - t0, 1)
        await pg.wait_for_timeout(400)
    return "timeout " + st, timeout

async def record(pg, mic, button="main button.rec"):
    await pg.evaluate(f"window.__mic.url = '{mic}'")
    await pg.locator(button).first.click()
    # stop by hand when the fake speech is over (word mode also stops by itself)
    await pg.evaluate("window.__micDone = false")
    for _ in range(240):
        await pg.wait_for_timeout(250)
        if await pg.evaluate("window.__micDone === true"): break
    await pg.wait_for_timeout(900)
    lab = await pg.locator(".rec-label").first.inner_text()
    if "finish" in lab or "say the word" in lab: await pg.locator(button).first.click()
    return await wait_result(pg)

async def run(p, name, base):
    real = "webkit" if name == "iphone" else name
    b = await getattr(p, real).launch(**({"firefox_user_prefs": {"media.autoplay.default": 0}} if name == "firefox" else {}))
    ctx = await b.new_context(**(p.devices["iPhone 13"] if name == "iphone" else {"viewport": {"width": 390, "height": 844}}))
    await ctx.add_init_script(FAKE_MIC)
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text[:200]) if m.type == "error" else None)
    T = base + "test/"
    await pg.goto(base + "#/sounds/i"); await pg.wait_for_timeout(1200)
    await pg.locator(".stage-tab", has_text="Say").click(); await pg.wait_for_timeout(300)
    out = []
    # 1) "see" said by the model voice: should pass
    r1 = await record(pg, T + "see_andrew.wav"); out.append(("see by Andrew", r1))
    txt1 = (await pg.locator("main").inner_text())[:0]
    # 2) "sleep": say "slip" instead (from the /ɪ/ lesson voice) -> should fail
    await pg.get_by_role("button", name="sleep", exact=True).click(); await pg.wait_for_timeout(300)
    r2 = await record(pg, T + "sleep_ava.wav"); out.append(("sleep by Ava", r2))
    # 3) Russian-accented "sheep"/"ship" are not in this lesson; use the sentence stage instead
    await pg.locator(".stage-tab", has_text="Sentences").click(); await pg.wait_for_timeout(300)
    r3 = await record(pg, T + "i_sent0_ava.wav"); out.append(("sentence 1 by Ava", r3))
    # 4) paragraph of the first text
    idx = await pg.evaluate("fetch('data/stories/index.json').then(r => r.json())")
    await pg.goto(base + f"#/reading/{idx[0]['id']}"); await pg.wait_for_timeout(1500)
    await pg.locator(".seg button", has_text="Read aloud").click(); await pg.wait_for_timeout(300)
    await pg.get_by_role("button", name="Paragraph 1", exact=True).click()
    r4 = await record(pg, T + "story0_p0.wav"); out.append(("paragraph 1", r4))
    for k, v in out: print(f"{name:9s} {k:22s} {v}")
    print(f"{name:9s} errors:", [e for e in errs if 'Warning' not in e][:4])
    await b.close()

async def main():
    ensure_pulse(); base = serve()
    async with async_playwright() as p:
        for name in BROWSERS: await run(p, name, base)
if __name__ == '__main__':
    asyncio.run(main())

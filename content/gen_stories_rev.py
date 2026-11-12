import asyncio, json, os, sys
sys.argv = [sys.argv[0], "none"]
import gen_audio as g
async def main():
    stories = json.load(open("/home/claude/content/stories.json"))[::-1]
    sem = asyncio.Semaphore(3)
    async def one(s):
        async with sem:
            p = f"{g.OUT}/stories/{s['id']}.mp3"; b = f"{g.OUT}/stories/{s['id']}.json"
            if os.path.exists(p) and os.path.exists(b): return "skip"
            return await g.synth(asyncio.Semaphore(1), "\n\n".join(s["paragraphs"]), g.MAIN, p + ".rev.mp3", b + ".rev.json")
    res = await asyncio.gather(*[one(s) for s in stories])
    print("rev done", res.count("ok"), res.count("skip"), res.count("fail"), flush=True)
asyncio.run(main())

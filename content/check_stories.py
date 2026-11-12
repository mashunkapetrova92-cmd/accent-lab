"""Parse story batches, report word counts, dictionary misses, British spellings and digits."""
import glob, re, sys, json, cmudict

D = cmudict.dict()
BRIT = re.compile(r"\b(\w*(?:colour|favour|honour|labour|neighbour|behaviour|humour|rumour|harbour|flavour|savour|vapour|odour|armour)\w*|\w+(?:ise|ised|ising|isation|yse|ysed|ysing)|centre\w*|theatre\w*|metre\w*|litre\w*|travell\w+|cancell(?:ed|ing)|modell\w+|labell\w+|fulfil|enrol\w*|grey\w*|catalogue|programme\w*|defence|offence|licence|practise\w*|mould\w*|ageing|judgement|towards|afterwards|amongst|whilst|learnt|spelt|dreamt|burnt|aluminium|cheque|kerb|tyre\w*|pyjamas|plough\w*|sceptic\w*|manoeuvre|aeroplane|storey|jewellery|analogue|dialogue)\b", re.I)
# words that legitimately end in -ise etc.
OK_ISE = {"rise","wise","otherwise","promise","promised","promises","exercise","exercised","exercises","advertise","advertised","advertising","surprise","surprised","surprising","surprisingly","surprises","expertise","compromise","compromised","enterprise","enterprises","franchise","despise","despised","revise","revised","supervise","supervised","precise","concise","noise","praise","praised","raise","raised","raising","arise","arising","arisen","paradise","premise","premises","demise","merchandise","improvise","improvised","devise","devised","disguise","disguised","televised","comprise","comprised","excise","incise","chastise","cruise","bruise","bruised","poise","poised","treatise","sunrise","likewise","clockwise","worldwide","anise","denise","louise","promising","uprising","raisin","praising","exercising","surmise","apprise","franchises","guise","noises","praises","raises","rises","wisest","wisely","appraise","appraised","reprise","enterprising","merchandising","advise","advised","advising","revising","supervising","devising","comprising","analyse","rising","improvisation","mise","risings","cruising","devised","premises","praised","franchise","wise"}
OK_ISE.discard("analyse")

def parse(path):
    out = []
    txt = open(path, encoding="utf-8").read()
    for block in txt.split("=== ")[1:]:
        head, body = block.split("\n", 1)
        slug, title, topic = [x.strip() for x in head.split("|")]
        paras = [re.sub(r"\s+", " ", p).strip() for p in body.strip().split("\n\n") if p.strip()]
        out.append({"id": slug, "title": title, "topic": topic, "paragraphs": paras})
    return out

def norm_tokens(text):
    text = text.replace("’", "'").replace("‘", "'")
    text = re.sub(r"[-–—]", " ", text)
    res = []
    for w in text.split():
        w = re.sub(r"[^a-zA-Z']", "", w).lower().strip("'")
        if w: res.append(w)
    return res

def known(w):
    if w in D: return True
    if w.endswith("'s") and w[:-2] in D: return True
    if w.endswith("s'") and w[:-1] in D: return True
    return False

if __name__ == "__main__":
    stories = []
    for p in sorted(glob.glob("/home/claude/content/batches/b*.txt")):
        stories += parse(p)
    ids = [s["id"] for s in stories]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup: print("DUPLICATE IDS", dup)
    allmiss = {}
    for s in stories:
        text = " ".join(s["paragraphs"])
        n = len(norm_tokens(text))
        miss = sorted({w for w in norm_tokens(text) if not known(w)})
        brit = sorted({m.group(0) for m in BRIT.finditer(text) if m.group(0).lower() not in OK_ISE})
        digits = re.findall(r"\d+", text)
        imp = re.findall(r"\b(miles?|feet|foot|inch(?:es)?|pounds?|ounces?|yards?|gallons?|fahrenheit|acres?)\b", text, re.I)
        if imp: print("    IMPERIAL:", imp)
        flag = "" if 380 <= n <= 900 else "  <-- LENGTH"
        print(f"{s['id']:34s} {s['topic']:14s} {n:4d}{flag}")
        if miss: print("    missing:", " ".join(miss))
        if brit: print("    BRITISH?:", " ".join(brit))
        if digits: print("    DIGITS:", digits)
        for w in miss: allmiss.setdefault(w, []).append(s["id"])
    print("stories:", len(stories))
    json.dump(stories, open("/home/claude/content/stories.json", "w"), indent=1, ensure_ascii=False)

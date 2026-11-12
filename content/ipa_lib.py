"""General American IPA from the CMU dictionary, with flaps, weak forms and linking."""
import re, json, cmudict

D = cmudict.dict()
OVR = json.load(open("/home/claude/content/ipa_overrides.json"))
OVR.update({
 "and": "/ænd/", "address": "/ˈædrɛs/", "nobody": "/ˈnoʊbɑɾi/", "records": "/ˈrɛkɚdz/", "decades": "/ˈdɛkeɪdz/",
 "tuesday": "/ˈtuzdeɪ/", "sunday": "/ˈsʌndeɪ/", "monday": "/ˈmʌndeɪ/", "thursday": "/ˈθɝzdeɪ/", "wednesday": "/ˈwɛnzdeɪ/",
 "illegible": "/ɪˈlɛdʒəbəl/", "particularly": "/pɚˈtɪkjəlɚli/", "without": "/wɪˈðaʊt/", "every": "/ˈɛvri/",
 "practical": "/ˈpræktɪkəl/", "archive": "/ˈɑrkaɪv/", "romance": "/ˈroʊmæns/", "retirement": "/rɪˈtaɪɚmənt/",
 "inside": "/ɪnˈsaɪd/", "inquiries": "/ɪnˈkwaɪəriz/", "than": "/ðæn/", "photocopied": "/ˈfoʊɾoʊˌkɑpid/",
 "margaret": "/ˈmɑrɡrɪt/", "margaret's": "/ˈmɑrɡrɪts/", "imagined": "/ɪˈmædʒɪnd/", "decided": "/dɪˈsaɪdɪd/",
 "indeed": "/ɪnˈdid/", "myself": "/maɪˈsɛlf/", "almost": "/ˈɔlmoʊst/", "company": "/ˈkʌmpəni/", "inland": "/ˈɪnlənd/",
 "unevenly": "/ʌnˈivənli/", "unclaimed": "/ʌnˈkleɪmd/", "unfinished": "/ʌnˈfɪnɪʃt/", "promised": "/ˈprɑmɪst/",
 "honest": "/ˈɑnɪst/", "pocket": "/ˈpɑkɪt/", "dearest": "/ˈdɪrɪst/", "even": "/ˈivən/", "recorded": "/rɪˈkɔrdɪd/",
 "preserving": "/prɪˈzɝvɪŋ/", "preserve": "/prɪˈzɝv/", "precision": "/prɪˈsɪʒən/", "required": "/rɪˈkwaɪɚd/",
 "button": "/ˈbʌʔn̩/", "kitten": "/ˈkɪʔn̩/", "cotton": "/ˈkɑʔn̩/", "certain": "/ˈsɝʔn̩/", "certainly": "/ˈsɝʔn̩li/",
 "mountain": "/ˈmaʊʔn̩/", "written": "/ˈrɪʔn̩/", "garden": "/ˈɡɑrdn̩/", "sudden": "/ˈsʌdn̩/", "suddenly": "/ˈsʌdn̩li/",
 "little": "/ˈlɪɾl̩/", "bottle": "/ˈbɑɾl̩/", "middle": "/ˈmɪdl̩/", "people": "/ˈpipl̩/", "model": "/ˈmɑdl̩/",
 "i": "/aɪ/", "a": "/ə/", "the": "/ðə/", "new": "/nu/", "student": "/ˈstudənt/", "students": "/ˈstudənts/",
 "often": "/ˈɔfən/", "either": "/ˈiðɚ/", "neither": "/ˈniðɚ/", "data": "/ˈdeɪɾə/", "route": "/rut/",
 "caught": "/kɔt/", "thought": "/θɔt/", "bought": "/bɔt/", "taught": "/tɔt/", "daughter": "/ˈdɔɾɚ/",
 "garage": "/ɡəˈrɑʒ/", "beige": "/beɪʒ/", "rouge": "/ruʒ/", "asia": "/ˈeɪʒə/", "really": "/ˈrɪli/",
 "orange": "/ˈɔrɪndʒ/", "coupon": "/ˈkupɑn/", "vase": "/veɪs/", "tomato": "/təˈmeɪɾoʊ/", "either's": "/ˈiðɚz/",
 "water": "/ˈwɑɾɚ/", "leisure": "/ˈliʒɚ/", "dogs": "/dɔɡz/", "interesting": "/ˈɪntrəstɪŋ/", "vegetable": "/ˈvɛdʒtəbəl/", "comfortable": "/ˈkʌmftɚbəl/",
 "family": "/ˈfæməli/", "chocolate": "/ˈtʃɑklət/", "different": "/ˈdɪfrənt/", "restaurant": "/ˈrɛstərɑnt/",
 "temperature": "/ˈtɛmprətʃɚ/", "probably": "/ˈprɑbəbli/", "library": "/ˈlaɪbrɛri/", "february": "/ˈfɛbjuɛri/",
})
# homographs: show both forms; the app plays these from the passage in context
HOMO = {
 "read": "/rid/ · past /rɛd/", "live": "/lɪv/ (verb) · /laɪv/ (adj.)", "lives": "/lɪvz/ (verb) · /laɪvz/ (noun)",
 "lead": "/lid/ (verb) · /lɛd/ (metal)", "close": "/kloʊz/ (verb) · /kloʊs/ (adj.)", "wind": "/wɪnd/ (air) · /waɪnd/ (verb)",
 "tear": "/tɛr/ (rip) · /tɪr/ (eye)", "record": "/ˈrɛkɚd/ (noun) · /rɪˈkɔrd/ (verb)", "object": "/ˈɑbdʒɪkt/ (noun) · /əbˈdʒɛkt/ (verb)",
 "present": "/ˈprɛzənt/ (noun) · /prɪˈzɛnt/ (verb)", "content": "/ˈkɑntɛnt/ (noun) · /kənˈtɛnt/ (adj.)", "minute": "/ˈmɪnɪt/ (time) · /maɪˈnut/ (tiny)",
 "use": "/juz/ (verb) · /jus/ (noun)", "used": "/juzd/ · /just/ (used to)", "desert": "/ˈdɛzɚt/ (noun) · /dɪˈzɝt/ (verb)",
 "bow": "/baʊ/ (bend) · /boʊ/ (ribbon)", "row": "/roʊ/ (line) · /raʊ/ (quarrel)", "wound": "/wund/ (injury) · /waʊnd/ (wrapped)",
 "conduct": "/ˈkɑndʌkt/ (noun) · /kənˈdʌkt/ (verb)", "permit": "/ˈpɝmɪt/ (noun) · /pɚˈmɪt/ (verb)", "refuse": "/rɪˈfjuz/ (verb) · /ˈrɛfjus/ (noun)",
 "produce": "/prəˈdus/ (verb) · /ˈproʊdus/ (noun)", "progress": "/ˈprɑɡrɛs/ (noun) · /prəˈɡrɛs/ (verb)", "project": "/ˈprɑdʒɛkt/ (noun) · /prəˈdʒɛkt/ (verb)",
 "contract": "/ˈkɑntrækt/ (noun) · /kənˈtrækt/ (verb)", "increase": "/ˈɪnkris/ (noun) · /ɪnˈkris/ (verb)", "decrease": "/ˈdikris/ (noun) · /dɪˈkris/ (verb)",
 "estimate": "/ˈɛstəmət/ (noun) · /ˈɛstəˌmeɪt/ (verb)", "separate": "/ˈsɛpərət/ (adj.) · /ˈsɛpəˌreɪt/ (verb)", "moderate": "/ˈmɑdərət/ (adj.) · /ˈmɑdəˌreɪt/ (verb)",
 "excuse": "/ɪkˈskjus/ (noun) · /ɪkˈskjuz/ (verb)", "house": "/haʊs/ (noun) · /haʊz/ (verb)", "abuse": "/əˈbjus/ (noun) · /əˈbjuz/ (verb)",
 "advocate": "/ˈædvəkət/ (noun) · /ˈædvəˌkeɪt/ (verb)", "graduate": "/ˈɡrædʒuət/ (noun) · /ˈɡrædʒuˌeɪt/ (verb)", "alternate": "/ˈɔltɚnət/ (adj.) · /ˈɔltɚˌneɪt/ (verb)",
 "attribute": "/ˈætrəˌbjut/ (noun) · /əˈtrɪbjut/ (verb)", "subject": "/ˈsʌbdʒɪkt/ (noun) · /səbˈdʒɛkt/ (verb)", "contrast": "/ˈkɑntræst/ (noun) · /kənˈtræst/ (verb)",
 "convert": "/ˈkɑnvɚt/ (noun) · /kənˈvɝt/ (verb)", "address's": "/ˈædrɛsɪz/", "polish": "/ˈpɑlɪʃ/",
 "invalid": "/ˈɪnvəlɪd/ (noun) · /ɪnˈvælɪd/ (adj.)", "perfect": "/ˈpɝfɪkt/ (adj.) · /pɚˈfɛkt/ (verb)", "upset": "/ʌpˈsɛt/ · /ˈʌpˌsɛt/ (noun)",
 "lives'": "/laɪvz/",
}
V = {"AA":"ɑ","AE":"æ","AO":"ɔ","AW":"aʊ","AY":"aɪ","EH":"ɛ","EY":"eɪ","IH":"ɪ","IY":"i","OW":"oʊ","OY":"ɔɪ","UH":"ʊ","UW":"u"}
C = {"B":"b","CH":"tʃ","D":"d","DH":"ð","F":"f","G":"ɡ","HH":"h","JH":"dʒ","K":"k","L":"l","M":"m","N":"n","NG":"ŋ","P":"p","R":"r","S":"s","SH":"ʃ","T":"t","TH":"θ","V":"v","W":"w","Y":"j","Z":"z","ZH":"ʒ"}
ONSETS = set("""b d f g h k l m n p r s t v w y z ch jh sh th dh zh
bl br by dr dw dy fl tr tw fr fy gl gr gw gy hy hw kl kr kw ky ly my ny pl pr py sk skr skw sky sl sm sn sp spl spr spy st str sw thr thw ty vy shr""".split())
VOWELS = set(V) | {"AH", "ER"}

def isv(p): return re.sub(r"\d", "", p) in VOWELS
def stress(p): return p[-1] if p[-1].isdigit() else None

def onset_ok(cs):
    m = {"HH": "h", "Y": "y"}
    return "".join(m.get(c, c.lower()) for c in cs) in ONSETS or len(cs) == 0

def to_ipa(phones, word=""):
    phones = list(phones)
    if len(phones) >= 2 and phones[-2] == "AH0" and ((word.endswith("ed") and phones[-1] == "D") or (word.endswith("es") and phones[-1] == "Z")):
        phones[-2] = "IH0"
    toks = []
    for k, p in enumerate(phones):
        b = re.sub(r"\d", "", p); st = stress(p)
        if b == "ER" and k + 1 < len(phones) and isv(phones[k + 1]):
            toks.append(("V", "ə" if st == "0" else "ɝ", st, "ER")); toks.append(("C", "r", None, "R")); continue
        if b in VOWELS:
            s = ("ə" if st == "0" else "ʌ") if b == "AH" else (("ɚ" if st == "0" else "ɝ") if b == "ER" else V[b])
            # before a syllable-final r, General American uses the lax vowel: here /hɪr/, there /ðɛr/, tour /tʊr/
            if b in ("IY", "EY", "UW") and k + 1 < len(phones) and re.sub(r"\d", "", phones[k + 1]) == "R" and (k + 2 >= len(phones) or not isv(phones[k + 2])):
                s = {"IY": "ɪ", "EY": "ɛ", "UW": "ʊ"}[b]
            toks.append(("V", s, st, b)); continue
        sym = C[b]
        if b in ("T", "D") and 0 < k < len(phones) - 1:
            prev = phones[k - 1]; nxt = phones[k + 1]
            prev_ok = isv(prev) or (re.sub(r"\d", "", prev) == "R" and k >= 2 and isv(phones[k - 2]))
            nxt_ok = isv(nxt) and stress(nxt) != "1"
            syllabic_n = (k + 2 == len(phones) - 1 and nxt == "AH0" and phones[-1] == "N")
            if prev_ok and nxt_ok and not syllabic_n: sym = "ɾ"
        toks.append(("C", sym, None, b))
    nvow = sum(1 for t in toks if t[0] == "V")
    marks = {}
    prim = next((i for i, t in enumerate(toks) if t[0] == "V" and t[2] == "1"), None)
    vbefore = lambda i: sum(1 for t in toks[:i] if t[0] == "V")
    if nvow > 1:
        for i, t in enumerate(toks):
            if t[0] == "V" and t[2] == "2" and (prim is None or i > prim or vbefore(i) == 0 and vbefore(prim) < 2):
                continue
            if t[0] == "V" and t[2] in ("1", "2"):
                j = i
                while j > 0 and toks[j - 1][0] == "C" and onset_ok([x[3] for x in toks[j - 1:i]]): j -= 1
                marks[j] = "ˈ" if t[2] == "1" else "ˌ"
    out = "".join(marks.get(i, "") + t[1] for i, t in enumerate(toks))
    return "/" + out + "/"

def norm(w):
    w = w.replace("’", "'").replace("‘", "'")
    return re.sub(r"[^a-zA-Z']", "", w).lower().strip("'")

def cmu(w):
    if w in D: return D[w][0]
    if w.endswith("'s") and w[:-2] in D:
        ph = D[w[:-2]][0]; last = re.sub(r"\d", "", ph[-1])
        add = ["IH0", "Z"] if last in ("S", "Z", "SH", "ZH", "CH", "JH") else (["S"] if last in ("P", "T", "K", "F", "TH") else ["Z"])
        return ph + add
    if w.endswith("s'") and w[:-1] in D: return D[w[:-1]][0]
    return None

def word_ipa(w):
    w = norm(w)
    if w in HOMO: return HOMO[w]
    if w in OVR: return OVR[w]
    ph = cmu(w)
    return to_ipa(ph, w) if ph else ""

def is_homograph(w): return norm(w) in HOMO

def bare(ipa):
    """single transcription without slashes; for homographs take the first form"""
    s = ipa.split(" · ")[0]
    s = re.sub(r"\s*\(.*?\)", "", s)
    return s.strip().strip("/")

WEAK = {"a": "ə", "an": "ən", "the": "ðə", "and": "ən", "of": "əv", "to": "tə", "for": "fɚ", "from": "frəm", "at": "ət",
        "as": "əz", "was": "wəz", "were": "wɚ", "can": "kən", "than": "ðən", "but": "bət", "or": "ɚ", "are": "ɚ",
        "them": "ðəm", "your": "jɚ", "some": "səm", "has": "həz", "have": "həv", "had": "həd", "would": "wəd", "could": "kəd",
        "should": "ʃəd", "do": "də", "does": "dəz", "been": "bɪn", "him": "ɪm", "her": "hɚ", "his": "ɪz", "you": "jə", "that": "ðət", "there": "ðɚ"}
WEAK_SAFE = {"a", "an", "the", "and", "of", "to", "for", "from", "at", "as", "was", "were", "can", "than", "but", "or", "are", "them", "your"}
FUNCTION = set("""a an the and of to for from at as was were can than but or are them your some has have had would could should do does been
him her his you that there is it its in on by with be will i we he she they me my our us their this these those which who whom what when where
not no so if then into onto upon about over under up out off am an shall may might must just very also too""".split())
VOWEL_START = set("ɑæʌɔaeɛɪiouʊəɚɝ")

def phrase_ipa(text):
    """broad transcription of a phrase or sentence with weak forms and linking marks"""
    words, brk = [], []
    for m in re.finditer(r"([A-Za-z][A-Za-z'’]*)([^A-Za-z'’]*)", text):
        words.append(m.group(1)); brk.append(bool(re.search(r"[,.;:!?—–\"”()]", m.group(2))))
    parts = []
    for i, w in enumerate(words):
        n = norm(w); last = i == len(words) - 1
        if n in WEAK_SAFE and not last:
            nxt = norm(words[i + 1]) if i + 1 < len(words) else ""
            nxt_ipa = bare(word_ipa(nxt)).lstrip("ˈˌ")
            if n == "the" and nxt_ipa[:1] in VOWEL_START: s = "ði"
            elif n == "to" and nxt_ipa[:1] in VOWEL_START: s = "tu"
            else: s = WEAK[n]
        else:
            s = bare(word_ipa(n))
        parts.append(s)
    # cross-word flap: final t or d after a vowel or r, before a vowel-initial word (get it, not at all)
    for i in range(len(parts) - 1):
        a = parts[i]; b = parts[i + 1].lstrip("ˈˌ")
        if not brk[i] and len(a) >= 2 and a[-1] in "td" and (a[-2] in VOWEL_START or a[-2] == "r") and b[:1] in VOWEL_START:
            parts[i] = a[:-1] + "ɾ"
    out = parts[0] if parts else ""
    for i in range(1, len(parts)):
        a = parts[i - 1].rstrip("ˈˌ"); b = parts[i].lstrip("ˈˌ")
        link = not brk[i - 1] and a and b and a[-1] not in VOWEL_START and a[-1] not in "ːʊɪ" and b[0] in VOWEL_START
        out += ("‿" if link else (" | " if brk[i - 1] else " ")) + parts[i]
    return "/" + out + "/"

if __name__ == "__main__":
    for w in ["water", "city", "party", "attack", "hotel", "potato", "button", "little", "nobody", "today", "Italian", "photo", "ready", "winter", "beautiful", "particularly", "thoroughly", "around", "answering", "however", "computer"]:
        print(w, word_ipa(w))
    for s in ["The cat sat on the black mat.", "Turn it off and go on.", "I want to go for a walk.", "A cup of tea and a piece of cake."]:
        print(s, phrase_ipa(s))

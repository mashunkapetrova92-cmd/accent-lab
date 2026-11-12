// Text normalization and word alignment shared by both assessment engines.

const ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS = ',,twenty,thirty,forty,fifty,sixty,seventy,eighty,ninety'.split(',');
const ORD: Record<string, string> = {
  one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth',
};

export function numWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numWords(n % 100) : '');
  if (n < 1000000) return numWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numWords(n % 1000) : '');
  return String(n);
}

/** How a recognizer's digits are usually spoken: years as pairs, other numbers in full. */
function spokenNumber(raw: string): string {
  const n = parseInt(raw, 10);
  if (raw.length === 4 && n >= 1100 && n <= 1999) {
    const hi = Math.floor(n / 100), lo = n % 100;
    return numWords(hi) + ' ' + (lo === 0 ? 'hundred' : lo < 10 ? 'oh ' + numWords(lo) : numWords(lo));
  }
  if (raw.length === 4 && n >= 2010 && n <= 2099) return 'twenty ' + numWords(n % 100);
  return numWords(n);
}

function ordinal(words: string): string {
  const parts = words.split(' ');
  const last = parts.pop()!;
  let o = ORD[last];
  if (!o) o = last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th';
  parts.push(o);
  return parts.join(' ');
}

/** Lowercase word tokens; digits, prices and ordinals become words; hyphens split words. */
export function normTokens(text: string): string[] {
  let t = String(text).replace(/[’‘]/g, "'").replace(/[–—-]/g, ' ');
  t = t.replace(/\$(\d+)(?:\.(\d{2}))?/g, (_m, d, c) => {
    let s = numWords(parseInt(d, 10)) + (d === '1' ? ' dollar' : ' dollars');
    if (c && c !== '00') s += ' and ' + numWords(parseInt(c, 10)) + ' cents';
    return ' ' + s + ' ';
  });
  t = t.replace(/(\d+)%/g, (_m, d) => ' ' + numWords(parseInt(d, 10)) + ' percent ');
  t = t.replace(/(\d),(\d{3})/g, '$1$2');
  const out: string[] = [];
  for (let w of t.split(/\s+/)) {
    w = w.toLowerCase();
    const ord = w.match(/^(\d+)(st|nd|rd|th)$/);
    if (ord) { out.push(...ordinal(spokenNumber(ord[1])).split(' ')); continue; }
    w = w.replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');
    if (!w) continue;
    if (/^\d+$/.test(w)) { out.push(...spokenNumber(w).split(' ')); continue; }
    out.push(w);
  }
  return out;
}

const VARIANT: Record<string, string> = {
  grey: 'gray', catalogue: 'catalog', harbour: 'harbor', colour: 'color', neighbour: 'neighbor', neighbours: 'neighbors',
  recognised: 'recognized', centre: 'center', theatre: 'theater', travelled: 'traveled', cancelled: 'canceled', ok: 'okay',
  towards: 'toward', afterwards: 'afterward', mr: 'mister', mrs: 'missus', dr: 'doctor',
};
const HOMO_GROUPS = [
  ['there', 'their', 'theyre'], ['to', 'too', 'two'], ['know', 'no'], ['knew', 'new', 'gnu'], ['write', 'right', 'rite'],
  ['whether', 'weather'], ['through', 'threw'], ['sea', 'see'], ['one', 'won'], ['for', 'four', 'fore'], ['hear', 'here'],
  ['our', 'hour'], ['by', 'buy', 'bye'], ['would', 'wood'], ['read', 'red', 'reed'], ['pier', 'peer'], ['great', 'grate'],
  ['lay', 'lei', 'leigh'], ['whose', 'whos'], ['tied', 'tide'], ['allowed', 'aloud'], ['some', 'sum'], ['in', 'inn'],
  ['be', 'bee'], ['so', 'sew', 'sow'], ['blue', 'blew'], ['passed', 'past'], ['heard', 'herd'], ['which', 'witch'],
  ['dear', 'deer'], ['wet', 'whet'], ['eyes', 'ayes'], ['days', 'daze'], ['sail', 'sale'], ['seemed', 'seamed'],
  ['missed', 'mist'], ['tail', 'tale'], ['meet', 'meat'], ['course', 'coarse'], ['hole', 'whole'], ['led', 'lead'],
  ['wrote', 'rote'], ['rows', 'rose'], ['made', 'maid'], ['raised', 'razed'], ['sweet', 'suite'], ['ate', 'eight'],
  ['weak', 'week'], ['peace', 'piece'], ['plain', 'plane'], ['rain', 'reign', 'rein'], ['role', 'roll'], ['site', 'sight', 'cite'],
  ['steal', 'steel'], ['principal', 'principle'], ['waist', 'waste'], ['wait', 'weight'], ['brake', 'break'], ['flour', 'flower'],
  ['bear', 'bare'], ['pair', 'pear', 'pare'], ['stair', 'stare'], ['fair', 'fare'], ['hair', 'hare'], ['rite', 'right'],
  ['its', 'its'], ['youre', 'your'], ['whole', 'hole'], ['nora', 'norah'], ['gerald', 'jerald', 'jerrold'], ['cell', 'sell'],
  ['seller', 'cellar'], ['scene', 'seen'], ['sun', 'son'], ['tea', 'tee'], ['toe', 'tow'], ['vain', 'vein'], ['way', 'weigh'],
  ['would', 'wood'], ['ad', 'add'], ['aisle', 'isle'], ['bored', 'board'], ['buy', 'by'], ['cent', 'scent', 'sent'],
  ['coral', 'choral'], ['dew', 'due'], ['die', 'dye'], ['fir', 'fur'], ['hi', 'high'], ['knight', 'night'], ['knot', 'not'],
  ['mail', 'male'], ['mind', 'mined'], ['pole', 'poll'], ['pray', 'prey'], ['rap', 'wrap'], ['ring', 'wring'], ['sole', 'soul'],
  ['stake', 'steak'], ['storey', 'story'], ['tents', 'tense'], ['throne', 'thrown'], ['vary', 'very'], ['ware', 'wear', 'where'],
];
const HOMO: Record<string, string> = {};
for (const g of HOMO_GROUPS) for (const w of g) if (!HOMO[w]) HOMO[w] = g[0];

/** Comparison key: ignores apostrophes, spelling variants and homophones. */
export function key(w: string): string {
  let k = w.replace(/'/g, '');
  k = VARIANT[k] || k;
  return HOMO[k] || k;
}

export type AlignOp = { st: 'ok' | 'sub' | 'miss'; h: number };

/** Word-level alignment (Levenshtein). Returns, for each reference word, the matching heard index. */
export function align(T: string[], H: string[]): AlignOp[] {
  const n = T.length, m = H.length;
  const D: Uint32Array[] = [];
  for (let i = 0; i <= n; i++) { D.push(new Uint32Array(m + 1)); D[i][0] = i; }
  for (let j = 0; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const s = D[i - 1][j - 1] + (T[i - 1] === H[j - 1] ? 0 : 1);
    D[i][j] = Math.min(s, D[i - 1][j] + 1, D[i][j - 1] + 1);
  }
  const res: AlignOp[] = new Array(n);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && T[i - 1] === H[j - 1] && D[i][j] === D[i - 1][j - 1]) { res[i - 1] = { st: 'ok', h: j - 1 }; i--; j--; }
    else if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + 1) { res[i - 1] = { st: 'sub', h: j - 1 }; i--; j--; }
    else if (i > 0 && D[i][j] === D[i - 1][j] + 1) { res[i - 1] = { st: 'miss', h: -1 }; i--; }
    else j--;
  }
  return res;
}

/** Recognizer output → tokens. Joins split compounds ("sea shore" for "seashore") and splits joined ones
 *  ("seashells" for "sea shells") when that matches the reference text. */
export function heardTokens(transcript: string, refKeys: string[]): { w: string; k: string }[] {
  const raw = normTokens(transcript);
  const set = new Set(refKeys);
  const joinedRef = new Map<string, [string, string]>();
  for (let i = 0; i + 1 < refKeys.length; i++) joinedRef.set(key(refKeys[i] + refKeys[i + 1]), [refKeys[i], refKeys[i + 1]]);
  const out: { w: string; k: string }[] = [];
  for (let j = 0; j < raw.length; j++) {
    if (j + 1 < raw.length) {
      const joined = key(raw[j] + raw[j + 1]);
      if (set.has(joined) && !(set.has(key(raw[j])) && set.has(key(raw[j + 1])))) { out.push({ w: raw[j] + ' ' + raw[j + 1], k: joined }); j++; continue; }
    }
    const k = key(raw[j]);
    const split = !set.has(k) ? joinedRef.get(k) : undefined;
    if (split) { out.push({ w: split[0], k: split[0] }, { w: split[1], k: split[1] }); continue; }
    out.push({ w: raw[j], k });
  }
  return out;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const fmtTime = (s: number) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export function shuffle<T>(a: T[]): T[] { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

// Words the app never displays as "you said … instead" (the recognizer may still hear them).
const BLOCKED = new Set(`bitch bitches shit shits shitty piss pissed fuck fucks fucked fucking cunt dick dicks cock cocks ass asses arse damn crap slut sluts whore whores
fag fags nigger nigga tit tits titty porn porno sex sexy rape raped butt butts boob boobs bum bastard prick pricks wank horny nude naked penis vagina anal anus semen sperm`.split(/\s+/));
/** A recognized word that is safe to show, or undefined. */
export function shownWord(w?: string): string | undefined {
  if (!w) return undefined;
  return w.toLowerCase().split(/\s+/).some(x => BLOCKED.has(x.replace(/[^a-z]/g, ''))) ? undefined : w;
}

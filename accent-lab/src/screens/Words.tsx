import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { ErrorBox, Loading, PlayButton } from '../components/ui';
import { loadVocab, loadVocabIndex } from '../data/load';
import { LEVELS, LEVEL_NAME, type Level, type VocabItem } from '../data/types';
import { setKnown, useAsync, useStore } from '../lib/store';
import { go } from '../router';

const PAGE = 30;
const POS_NAME: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', prep: 'preposition', det: 'determiner', pron: 'pronoun', conj: 'conjunction', num: 'number', modal: 'modal verb', interj: 'interjection', particle: 'particle' };
type Filter = 'all' | 'learn' | 'known';
const kOf = (l: Level, x: VocabItem) => `${l}|${x.w}|${x.p}`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** the example sentence with the word (or its form: run, runs, running, ran...) in bold */
function Example({ text, word }: { text: string; word: string }) {
  const w = word.toLowerCase();
  const stem = w.includes(' ') || w.length < 4 ? w : w.replace(/(e|y)$/, '');
  const re = new RegExp(`(^|[^A-Za-z])(${esc(stem)}[A-Za-z']*)`, 'i');
  const m = text.match(re);
  if (!m || m.index === undefined) return <p className="vw-ex">{text}</p>;
  const a = m.index + m[1].length, b = a + m[2].length;
  return <p className="vw-ex">{text.slice(0, a)}<b>{text.slice(a, b)}</b>{text.slice(b)}</p>;
}

export default function Words() {
  const idx = useAsync(loadVocabIndex, []);
  const known = useStore(s => s.known);
  const [level, setLevelRaw] = useState<Level>(() => { try { const v = localStorage.getItem('accentlab.vlevel') as Level; return LEVELS.includes(v) ? v : 'A1'; } catch { return 'A1'; } });
  const setLevel = (l: Level) => { setLevelRaw(l); setN(PAGE); try { localStorage.setItem('accentlab.vlevel', l); } catch { /* ignore */ } };
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [n, setN] = useState(PAGE);
  const ready = !!idx.data && !!idx.data[level];
  const cur = useAsync(() => idx.data && !idx.data[level] ? Promise.resolve([] as VocabItem[]) : loadVocab(level), [level, idx.data]);
  // a search looks through every level
  const [all, setAll] = useState<Record<Level, VocabItem[]> | null>(null);
  useEffect(() => {
    if (!q || all || !idx.data) return;
    const ls = LEVELS.filter(l => idx.data![l]);
    Promise.all(ls.map(l => loadVocab(l))).then(r => setAll(Object.fromEntries(ls.map((l, i) => [l, r[i]])) as Record<Level, VocabItem[]>)).catch(() => {});
  }, [q, all, idx.data]);
  useEffect(() => { setN(PAGE); }, [q, filter]);

  const knownIn = useMemo(() => {
    const c = {} as Record<Level, number>;
    for (const L of LEVELS) c[L] = 0;
    for (const k of Object.keys(known)) { const L = k.slice(0, 2) as Level; if (L in c) c[L]++; }
    return c;
  }, [known]);

  const list = useMemo(() => {
    let rows: { l: Level; x: VocabItem }[];
    if (q) {
      const t = q.trim().toLowerCase();
      rows = all ? LEVELS.flatMap(l => (all[l] || []).filter(x => x.w.toLowerCase().startsWith(t) || (t.length > 3 && x.d.toLowerCase().includes(t))).map(x => ({ l, x }))) : [];
      rows.sort((a, b) => Number(!a.x.w.toLowerCase().startsWith(t)) - Number(!b.x.w.toLowerCase().startsWith(t)));
    } else rows = (cur.data || []).map(x => ({ l: level, x }));
    if (filter !== 'all') rows = rows.filter(r => (filter === 'known') === !!known[kOf(r.l, r.x)]);
    return rows;
  }, [q, all, cur.data, level, filter, known]);

  const total = idx.data?.[level] || 0;
  const pct = total ? Math.round(knownIn[level] / total * 100) : 0;

  return (
    <div className="screen">
      <div className="topbar"><h1>New words</h1><button className="icon-btn" aria-label="Settings" onClick={() => go('/settings')}><Icon name="gear" /></button></div>
      <p className="lead" style={{ marginBottom: 12 }}>Words for every level. Listen, read the meaning and the example, then mark the words you know.</p>
      <div className="level-tabs" role="tablist" aria-label="Level">
        {LEVELS.map(L => (
          <button key={L} role="tab" aria-selected={L === level && !q} onClick={() => { setLevel(L); setQ(''); }}>
            <b>{L}</b><span>{knownIn[L] ? `${knownIn[L]}/${idx.data?.[L] ?? ''}` : idx.data?.[L] || 'soon'}</span>
          </button>
        ))}
      </div>
      {!q && <div className="vw-level">
        <div className="level-name" style={{ margin: 0 }}>{LEVEL_NAME[level]} · {total.toLocaleString('en-US')} words</div>
        <div className="vw-meter" aria-label={`${pct}% known`}><i style={{ width: `${pct}%` }} /></div>
      </div>}
      <div className="search-wrap"><Icon name="search" /><input className="search" type="search" placeholder="Search words" value={q} onChange={e => setQ(e.target.value)} aria-label="Search words" /></div>
      <div className="chips">
        {([['all', 'All'], ['learn', 'To learn'], ['known', 'Known']] as [Filter, string][]).map(([f, t]) => <button key={f} className="chip" aria-pressed={f === filter} onClick={() => setFilter(f)}>{t}</button>)}
      </div>
      {(idx.error || cur.error) && <ErrorBox text={idx.error || cur.error || ''} onRetry={() => location.reload()} />}
      {((!q && !cur.data) || (q && !all)) && !cur.error && <Loading lines={4} />}
      {!q && idx.data && !ready && <p className="muted" style={{ padding: '18px 4px' }}>The words for this level are coming soon.</p>}
      {list.length === 0 && (q ? all : cur.data) && (q || ready) && <p className="muted" style={{ padding: '18px 4px' }}>{q ? 'No words found.' : filter === 'known' ? 'No words marked as known yet.' : 'You know every word on this level!'}</p>}
      <div className="stack" style={{ marginTop: 6 }}>
        {list.slice(0, n).map(({ l, x }) => {
          const k = kOf(l, x); const on = !!known[k];
          return (
            <article key={k} className={`vw-card${on ? ' known' : ''}`}>
              <div className="vw-head">
                <div className="vw-word">
                  <h3>{x.w}</h3>
                  <div className="vw-sub"><span className="ipa">{x.i}</span><span className="vw-pos">{POS_NAME[x.p] || x.p}</span>{q && <span className="pill">{l}</span>}</div>
                </div>
                {x.c && <PlayButton clip={x.c} label={`Play ${x.w}`} />}
                {x.c && x.c.length >= 6 && <PlayButton clip={x.c} slow label={`Play ${x.w} slowly`} />}
              </div>
              <p className="vw-def">{x.d}</p>
              <Example text={x.e} word={x.w} />
              <button className="vw-know" aria-pressed={on} onClick={() => setKnown(k, !on)}>
                <Icon name="check" />{on ? 'Known' : 'I know this word'}
              </button>
            </article>
          );
        })}
      </div>
      {list.length > n && <button className="btn block" style={{ marginTop: 14 }} onClick={() => setN(n + PAGE * 2)}>Show more ({list.length - n} left)</button>}
      <p className="small muted" style={{ marginTop: 18, textAlign: 'center' }}>Word lists: CEFR-J Wordlist v1.5 (Tono Laboratory, TUFS) and Octanove Vocabulary Profile C1/C2 (CC BY-SA 4.0). <a href={`${import.meta.env.BASE_URL}credits.html#words`}>Credits</a></p>
    </div>
  );
}

import { useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { ErrorBox, Loading } from '../components/ui';
import { loadLibrary } from '../data/load';
import { LEVELS, LEVEL_NAME, type Level } from '../data/types';
import { useAsync, useStore } from '../lib/store';
import { go } from '../router';

export default function Library() {
  const { data, error } = useAsync(loadLibrary, []);
  const reading = useStore(s => s.reading);
  const [level, setLevelRaw] = useState<Level>(() => { try { const v = localStorage.getItem('accentlab.level') as Level; return LEVELS.includes(v) ? v : 'A1'; } catch { return 'A1'; } });
  const setLevel = (l: Level) => { setLevelRaw(l); setTopic('All'); try { localStorage.setItem('accentlab.level', l); } catch { /* ignore */ } };
  const [topic, setTopic] = useState('All');
  const [q, setQ] = useState('');
  const best = useMemo(() => {
    // whole-text score: the best score of every paragraph, once all of them are read (older whole-text attempts count too)
    const all: Record<string, number> = {}, per: Record<string, Record<number, number>> = {};
    for (const a of reading) {
      if (a.scope === 'all') all[a.story] = Math.max(all[a.story] || 0, a.overall);
      else if (a.scope.startsWith('p')) { const k = Number(a.scope.slice(1)); const m = (per[a.story] ||= {}); m[k] = Math.max(m[k] ?? 0, a.overall); }
    }
    const m: Record<string, number> = {}; const part: Record<string, number> = {};
    for (const s of data || []) {
      const p = per[s.id]; const n = p ? Object.keys(p).length : 0;
      if (s.paras && n >= s.paras) m[s.id] = Math.round(Object.values(p).reduce((x, y) => x + y, 0) / n);
      else if (n) part[s.id] = n;
      if (all[s.id] !== undefined && m[s.id] === undefined) m[s.id] = all[s.id];
    }
    return { m, part };
  }, [reading, data]);
  const practiced = useMemo(() => new Set(reading.map(r => r.story)), [reading]);
  const lv = (s: { level?: Level }) => s.level || 'C1';
  const counts = useMemo(() => {
    const c = {} as Record<Level, { n: number; done: number }>;
    for (const L of LEVELS) c[L] = { n: 0, done: 0 };
    for (const s of data || []) { const x = c[lv(s)]; x.n++; if (best.m[s.id] !== undefined) x.done++; }
    return c;
  }, [data, best]);
  // a search looks through every level
  const inLevel = (data || []).filter(s => q ? true : lv(s) === level);
  const topics = useMemo(() => ['All', ...Array.from(new Set(inLevel.map(s => s.topic))).sort()], [inLevel]);
  const list = inLevel.filter(s => (topic === 'All' || s.topic === topic) && (!q || (s.title + ' ' + s.excerpt).toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="screen">
      <div className="topbar"><h1>Reading</h1><button className="icon-btn" aria-label="Settings" onClick={() => go('/settings')}><Icon name="gear" /></button></div>
      <p className="lead" style={{ marginBottom: 12 }}>Choose your level. Go paragraph by paragraph: listen to the model, read it aloud yourself and get word-by-word feedback.</p>
      <div className="level-tabs" role="tablist" aria-label="Level">
        {LEVELS.map(L => (
          <button key={L} role="tab" aria-selected={L === level && !q} onClick={() => { setLevel(L); setQ(''); }}>
            <b>{L}</b><span>{counts[L].done ? `${counts[L].done}/${counts[L].n}` : counts[L].n || ''}</span>
          </button>
        ))}
      </div>
      {!q && <div className="level-name">{LEVEL_NAME[level]} · {counts[level].n} texts</div>}
      <div className="search-wrap"><Icon name="search" /><input className="search" type="search" placeholder="Search texts" value={q} onChange={e => setQ(e.target.value)} aria-label="Search texts" /></div>
      <div className="chips">{topics.map(t => <button key={t} className="chip" aria-pressed={t === topic} onClick={() => setTopic(t)}>{t}</button>)}</div>
      {error && <ErrorBox text={error} onRetry={() => location.reload()} />}
      {!data && !error && <Loading lines={4} />}
      <div className="stack" style={{ marginTop: 6 }}>
        {list.map(s => (
          <button key={s.id} className="lib-card" onClick={() => go(`/reading/${s.id}`)}>
            <div className="lib-meta">
              {q && <span className="pill">{lv(s)}</span>}<span>{s.topic}</span><span>·</span><span>{s.minutes} min</span><span>·</span><span>{s.words} words</span>
              <span className="grow" />
              {best.m[s.id] !== undefined ? <span className={`pill ${best.m[s.id] >= 90 ? 'good' : best.m[s.id] >= 70 ? 'warn' : 'bad'}`}>{best.m[s.id]}</span> : best.part[s.id] ? <span className="pill accent">{best.part[s.id]} of {s.paras} paragraphs</span> : practiced.has(s.id) ? <span className="pill accent">Started</span> : null}
            </div>
            <h3>{s.title}</h3>
            <p>{s.excerpt}</p>
          </button>
        ))}
        {data && !list.length && <p className="muted center" style={{ padding: 24 }}>No texts match your search.</p>}
      </div>
    </div>
  );
}

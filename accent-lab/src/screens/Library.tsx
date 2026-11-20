import { useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { ErrorBox, Loading } from '../components/ui';
import { loadLibrary } from '../data/load';
import { useAsync, useStore } from '../lib/store';
import { go } from '../router';

export default function Library() {
  const { data, error } = useAsync(loadLibrary, []);
  const reading = useStore(s => s.reading);
  const [topic, setTopic] = useState('All');
  const [q, setQ] = useState('');
  const best = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of reading) if (a.scope === 'all') m[a.story] = Math.max(m[a.story] || 0, a.overall);
    return m;
  }, [reading]);
  const practiced = useMemo(() => new Set(reading.map(r => r.story)), [reading]);
  const topics = useMemo(() => ['All', ...Array.from(new Set((data || []).map(s => s.topic)))], [data]);
  const list = (data || []).filter(s => (topic === 'All' || s.topic === topic) && (!q || (s.title + ' ' + s.excerpt).toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="screen">
      <div className="topbar"><h1>Reading</h1><button className="icon-btn" aria-label="Settings" onClick={() => go('/settings')}><Icon name="gear" /></button></div>
      <p className="lead" style={{ marginBottom: 12 }}>Listen, study the connected speech, then read the whole text aloud and get word-by-word feedback.</p>
      <div className="search-wrap"><Icon name="search" /><input className="search" type="search" placeholder="Search texts" value={q} onChange={e => setQ(e.target.value)} aria-label="Search texts" /></div>
      <div className="chips">{topics.map(t => <button key={t} className="chip" aria-pressed={t === topic} onClick={() => setTopic(t)}>{t}</button>)}</div>
      {error && <ErrorBox text={error} onRetry={() => location.reload()} />}
      {!data && !error && <Loading lines={4} />}
      <div className="stack" style={{ marginTop: 6 }}>
        {list.map(s => (
          <button key={s.id} className="lib-card" onClick={() => go(`/reading/${s.id}`)}>
            <div className="lib-meta">
              <span>{s.topic}</span><span>·</span><span>{s.minutes} min</span><span>·</span><span>{s.words} words</span>
              <span className="grow" />
              {best[s.id] !== undefined ? <span className={`pill ${best[s.id] >= 90 ? 'good' : best[s.id] >= 70 ? 'warn' : 'bad'}`}>{best[s.id]}</span> : practiced.has(s.id) ? <span className="pill accent">Started</span> : null}
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

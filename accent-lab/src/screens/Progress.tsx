import { useMemo } from 'react';
import Icon from '../components/Icon';
import { Loading } from '../components/ui';
import { loadLibrary, loadSounds } from '../data/load';
import { PH_NODE } from '../assess/feedback';
import { dayKey, useAsync, useStore } from '../lib/store';
import { go } from '../router';
import type { SoundNode } from '../data/types';

const fmtDur = (s: number) => s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
function streak(act: Record<string, number>): number {
  let n = 0; const d = new Date();
  if (!act[dayKey()]) d.setDate(d.getDate() - 1);
  for (;;) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if ((act[k] || 0) >= 60) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}

export default function Progress() {
  const { data: sounds } = useAsync(loadSounds, []);
  const { data: lib } = useAsync(loadLibrary, []);
  const st = useStore(s => s);
  const nodes = sounds?.nodes || [];
  const byId = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);

  const stats = useMemo(() => {
    const time = Object.values(st.activity).reduce((a, b) => a + b, 0);
    const mastered = nodes.filter(n => st.sounds[n.id]?.mastered).length;
    const prod = st.points.filter(p => p.kind !== 'listen');
    const recent = prod.slice(-60);
    const avg = recent.length ? Math.round(recent.reduce((a, p) => a + p.score, 0) / recent.length) : null;
    const full = st.reading.filter(r => r.scope === 'all');
    const texts = new Set(st.reading.map(r => r.story)).size;
    const readAvg = st.reading.length ? Math.round(st.reading.reduce((a, r) => a + r.overall, 0) / st.reading.length) : null;
    // daily averages, last 30 days with data
    const days: Record<string, number[]> = {};
    for (const p of prod) { const d = new Date(p.t); const k = `${d.getMonth() + 1}/${d.getDate()}`; (days[k] ||= []).push(p.score); }
    const series = Object.entries(days).slice(-30).map(([k, v]) => ({ k, v: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }));
    return { time, mastered, avg, full: full.length, texts, readAvg, attempts: st.reading.length, series };
  }, [st, nodes]);

  // weakest sounds: measured phoneme scores when available, otherwise practice scores per lesson
  const weak = useMemo(() => {
    const ph = Object.entries(st.phonemes).filter(([, v]) => v.n >= 5).map(([p, v]) => ({ id: PH_NODE[p], label: `/${p}/`, score: Math.round(v.sum / v.n), n: v.n, src: 'measured' as const }));
    if (ph.length) return ph.filter(x => x.id).sort((a, b) => a.score - b.score).slice(0, 5);
    return nodes.map(n => {
      const p = st.sounds[n.id]; if (!p) return null;
      const vals = [...Object.values(p.words), ...Object.values(p.sentences)];
      if (p.listenLast !== undefined) vals.push(p.listenLast);
      if (!vals.length) return null;
      return { id: n.id, label: `/${n.symbol}/`, score: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), n: vals.length, src: 'practice' as const };
    }).filter((x): x is NonNullable<typeof x> => !!x && x.score < 90).sort((a, b) => a.score - b.score).slice(0, 5);
  }, [st, nodes]);

  const improved = useMemo(() => {
    const per: Record<string, number[]> = {};
    for (const p of st.points) if (p.kind === 'test' || p.kind === 'listen') (per[p.ref] ||= []).push(p.score);
    return Object.entries(per).filter(([, v]) => v.length >= 2).map(([id, v]) => ({ id, gain: Math.max(...v) - v[0] })).filter(x => x.gain > 0 && byId[x.id]).sort((a, b) => b.gain - a.gain).slice(0, 4);
  }, [st.points, byId]);

  const insights = useMemo(() => {
    const out: { text: string; to?: string }[] = [];
    for (const [p, v] of Object.entries(st.phonemes)) {
      const top = Object.entries(v.conf).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 3 && top[1] / v.n >= 0.15) out.push({ text: `You frequently pronounce /${p}/ too close to /${top[0]}/.`, to: PH_NODE[p] });
    }
    const P = st.patterns;
    if ((P['final:n'] || 0) >= 15 && (P['final:weak'] || 0) / P['final:n'] >= 0.25) out.push({ text: 'You tend to weaken final consonants. Finish every word, especially before a pause.', to: 'voicing' });
    if ((P['finals:n'] || 0) >= 15 && (P['finals:drop'] || 0) / P['finals:n'] >= 0.12) out.push({ text: 'You often drop final /s/ and /z/ in connected speech (plurals, verbs ending in -s).', to: 'z' });
    if ((P['ed:n'] || 0) >= 10 && (P['ed:drop'] || 0) / P['ed:n'] >= 0.15) out.push({ text: 'Past-tense endings (-ed) are often not heard. Pronounce the final /t/, /d/ or /ɪd/.', to: 'd' });
    if ((P['words:n'] || 0) >= 80 && (P['words:miss'] || 0) / P['words:n'] >= 0.15) out.push({ text: `About ${Math.round(P['words:miss'] / P['words:n'] * 100)}% of words were not recognized as intended. Slow down slightly and open vowels fully.` });
    return out.slice(0, 6);
  }, [st.phonemes, st.patterns]);

  const nextNode = nodes.find((n, i) => !st.sounds[n.id]?.mastered && (i === 0 || st.sounds[nodes[i - 1].id]?.mastered));
  const unread = lib?.find(s => !st.reading.some(r => r.story === s.id));
  const attention = nodes.filter(n => { const p = st.sounds[n.id]; return p && !p.mastered && (p.testLast !== undefined || (p.listenBest ?? 100) < 80); });

  if (!sounds) return <div className="screen"><div className="topbar"><h1>My progress</h1></div><Loading /></div>;
  const empty = !st.points.length && !Object.keys(st.activity).length;
  const maxY = 100, W = 320, H = 130;

  return (
    <div className="screen">
      <div className="topbar"><h1>My progress</h1><button className="icon-btn" aria-label="Settings" onClick={() => go('/settings')}><Icon name="gear" /></button></div>
      {empty && <div className="notice info" style={{ marginBottom: 12 }}>Your statistics will appear here after your first lesson or reading. Everything shown is calculated from your own recordings and answers.</div>}
      <div className="stat-grid">
        <div className="stat"><div className="k">Learning time</div><div className="v">{fmtDur(stats.time)}</div></div>
        <div className="stat"><div className="k">Current streak</div><div className="v">{streak(st.activity)} <small>days</small></div></div>
        <div className="stat"><div className="k">Sounds mastered</div><div className="v">{stats.mastered} <small>/ {nodes.length}</small></div></div>
        <div className="stat"><div className="k">Remaining</div><div className="v">{nodes.length - stats.mastered}</div></div>
        <div className="stat"><div className="k">Average score</div><div className="v">{stats.avg ?? '–'}{stats.avg !== null && <small> /100</small>}</div></div>
        <div className="stat"><div className="k">Texts read aloud</div><div className="v">{stats.texts} <small>/ {lib?.length ?? 100}</small></div></div>
      </div>

      <h2 className="section-title">Score history</h2>
      <div className="card chart">
        {stats.series.length < 2 ? <p className="muted small">Practice on at least two days to see your trend.</p> : (
          <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Average daily pronunciation score">
            {[50, 70, 90].map(v => <g key={v}><line x1="26" x2={W} y1={H - v / maxY * (H - 10)} y2={H - v / maxY * (H - 10)} stroke="#E9EDF3" /><text x="0" y={H - v / maxY * (H - 10) + 4} fontSize="10" fill="#9AA4B8">{v}</text></g>)}
            <path d={`M ${stats.series.map((p, i) => `${26 + i / (stats.series.length - 1) * (W - 32)} ${H - p.v / maxY * (H - 10)}`).join(' L ')} L ${W - 6} ${H} L 26 ${H} Z`} fill="var(--accent)" opacity=".08" />
            <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" points={stats.series.map((p, i) => `${26 + i / (stats.series.length - 1) * (W - 32)},${H - p.v / maxY * (H - 10)}`).join(' ')} />
            {stats.series.map((p, i) => <circle key={i} cx={26 + i / (stats.series.length - 1) * (W - 32)} cy={H - p.v / maxY * (H - 10)} r={i === stats.series.length - 1 ? 4.5 : 2.5} fill="var(--accent)" />)}
            <text x="26" y={H + 14} fontSize="10" fill="#9AA4B8">{stats.series[0].k}</text>
            <text x={W - 6} y={H + 14} fontSize="10" fill="#9AA4B8" textAnchor="end">{stats.series[stats.series.length - 1].k}</text>
          </svg>
        )}
      </div>

      <h2 className="section-title">Reading practice</h2>
      <div className="stat-grid">
        <div className="stat"><div className="k">Recordings</div><div className="v">{stats.attempts}</div></div>
        <div className="stat"><div className="k">Average reading score</div><div className="v">{stats.readAvg ?? '–'}</div></div>
      </div>

      <h2 className="section-title">Recurring problems</h2>
      <div className="card">
        {insights.length ? insights.map((x, i) => (
          <div key={i} className="list-row"><span className="grow">{x.text}</span>{x.to && byId[x.to] && <button className="btn small" onClick={() => go(`/sounds/${x.to}`)}>Practice</button>}</div>
        )) : <p className="muted small">No recurring pattern yet. Patterns appear after enough recordings{st.settings.engine !== 'azure' ? '; sound-level patterns need Azure assessment (Settings)' : ''}.</p>}
      </div>

      <h2 className="section-title">Sounds that need attention</h2>
      <div className="card">
        {weak.length ? weak.map(w => byId[w.id] && <SoundRow key={w.id} n={byId[w.id]} right={<span className={`pill ${w.score >= 80 ? 'warn' : 'bad'}`}>{w.score}</span>} sub={w.src === 'measured' ? `Measured in ${w.n} sounds` : `Average of your practice scores`} />)
          : attention.length ? attention.map(n => <SoundRow key={n.id} n={n} sub="Test not passed yet" right={<Icon name="next" size={18} />} />)
          : <p className="muted small">Nothing flagged yet.</p>}
      </div>

      {improved.length > 0 && <>
        <h2 className="section-title">Most improved</h2>
        <div className="card">{improved.map(x => <SoundRow key={x.id} n={byId[x.id]} sub="Listening and test scores" right={<span className="pill good">+{x.gain}</span>} />)}</div>
      </>}

      <h2 className="section-title">Recommended next</h2>
      <div className="stack">
        {nextNode && <button className="lib-card" onClick={() => go(`/sounds/${nextNode.id}`)}><div className="lib-meta">Next sound</div><h3><span className="ipa">/{nextNode.symbol}/</span> as in {nextNode.key}</h3></button>}
        {weak[0] && byId[weak[0].id] && <button className="lib-card" onClick={() => go(`/sounds/${weak[0].id}`)}><div className="lib-meta">Review</div><h3>Revisit <span className="ipa">{weak[0].label}</span> — your weakest sound</h3></button>}
        {unread && <button className="lib-card" onClick={() => go(`/reading/${unread.id}`)}><div className="lib-meta">{unread.topic}</div><h3>Read “{unread.title}”</h3></button>}
      </div>
    </div>
  );
}

function SoundRow({ n, sub, right }: { n: SoundNode; sub: string; right: React.ReactNode }) {
  return (
    <button className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => go(`/sounds/${n.id}`)}>
      <span className="sym-sm ipa" style={{ background: n.color }}>{n.symbol}</span>
      <span className="grow"><b>{n.key}</b><br /><span className="small muted">{sub}</span></span>
      {right}
    </button>
  );
}

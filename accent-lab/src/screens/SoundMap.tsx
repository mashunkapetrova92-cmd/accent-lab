import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { Loading, ErrorBox } from '../components/ui';
import { loadSounds } from '../data/load';
import { STAGES, useAsync, useStore, type SoundProgress } from '../lib/store';
import { go } from '../router';
import type { SoundNode } from '../data/types';

const XS = [50, 72, 80, 64, 40, 24, 22, 36];
const ROW = 108;

export function nodeState(nodes: SoundNode[], sounds: Record<string, SoundProgress>, i: number) {
  const p = sounds[nodes[i].id];
  if (p?.mastered) return 'mastered';
  if (i === 0 || sounds[nodes[i - 1].id]?.mastered) return 'open';
  return 'locked';
}
export function stagePct(p?: SoundProgress) { return p ? Math.round(STAGES.filter(s => p.stages[s.id]).length / STAGES.length * 100) : 0; }

export default function SoundMap() {
  const { data, error } = useAsync(loadSounds, []);
  const sounds = useStore(s => s.sounds);
  const [toast, setToast] = useState('');
  const currentRef = useRef<HTMLButtonElement>(null);
  const flat = data?.nodes || [];
  const mastered = flat.filter(n => sounds[n.id]?.mastered).length;
  const curIdx = flat.findIndex((_, i) => nodeState(flat, sounds, i) === 'open');

  useEffect(() => {
    if (!data) return;
    const k = 'map-scrolled';
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, '1');
    setTimeout(() => currentRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
  }, [data]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2400); return () => clearTimeout(t); }, [toast]);

  const sections = useMemo(() => {
    if (!data) return [];
    let i = 0;
    return data.sections.map(sec => ({ sec, items: sec.nodes.map(id => ({ node: data.nodes.find(n => n.id === id)!, idx: i++ })) }));
  }, [data]);

  if (error) return <div className="screen"><ErrorBox text={error} onRetry={() => location.reload()} /></div>;
  if (!data) return <div className="screen"><div className="topbar"><h1>Sounds</h1></div><Loading /></div>;

  return (
    <div className="screen">
      <div className="topbar"><h1>Sounds</h1><button className="icon-btn" aria-label="Settings" onClick={() => go('/settings')}><Icon name="gear" /></button></div>
      <div className="card">
        <div className="map-hero">
          <div><div className="big">{mastered}<span className="muted" style={{ fontSize: 20, fontWeight: 650 }}> / {flat.length}</span></div><div className="small muted">sounds mastered</div></div>
          <div className="grow">
            <div className="bar"><i style={{ width: `${mastered / flat.length * 100}%` }} /></div>
            <div className="small muted" style={{ marginTop: 8 }}>{curIdx >= 0 ? <>Next: <b style={{ color: 'var(--ink)' }}>/{flat[curIdx].symbol}/ as in {flat[curIdx].key}</b></> : 'Every sound is mastered. Keep reviewing.'}</div>
          </div>
        </div>
      </div>

      {sections.map(({ sec, items }, si) => {
        const h = items.length * ROW;
        const pts = items.map((it, k) => [XS[(it.idx) % XS.length], k * ROW + 45] as [number, number]);
        return (
          <section key={sec.id} aria-labelledby={`sec-${sec.id}`}>
            <div className="unit">
              <div className="unit-badge" style={{ background: sec.color }}>{si + 1}</div>
              <div><h2 id={`sec-${sec.id}`}>{sec.title}</h2><p>{sec.blurb}</p></div>
            </div>
            <div className="map" style={{ height: h }}>
              <svg className="path" viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" aria-hidden="true">
                {pts.slice(1).map((p, k) => {
                  const a = pts[k];
                  const done = sounds[items[k].node.id]?.mastered && nodeState(flat, sounds, items[k + 1].idx) !== 'locked';
                  const d = `M ${a[0]} ${a[1]} C ${a[0]} ${a[1] + 55}, ${p[0]} ${p[1] - 55}, ${p[0]} ${p[1]}`;
                  return <path key={k} d={d} fill="none" vectorEffect="non-scaling-stroke" stroke={done ? sec.color : '#D3D9E3'} strokeWidth={done ? 6 : 4} strokeLinecap="round" strokeDasharray={done ? undefined : '1 10'} pathLength={done ? 1 : undefined} className={done ? 'seg-done' : undefined} />;
                })}
              </svg>
              {items.map(({ node, idx }, k) => {
                const st = nodeState(flat, sounds, idx);
                const p = sounds[node.id];
                const pct = stagePct(p);
                const isCur = idx === curIdx;
                const R = 40, L = 2 * Math.PI * R;
                return (
                  <div key={node.id} className="node-row" style={{ position: 'absolute', top: k * ROW, left: 0, right: 0 }}>
                    <button ref={isCur ? currentRef : undefined} className={`node ${st}${isCur ? ' current' : ''}`} style={{ left: `${pts[k][0]}%`, ['--node-c' as string]: sec.color }}
                      aria-label={`${node.symbol} as in ${node.key}, ${st === 'locked' ? 'locked' : st === 'mastered' ? 'mastered' : `${pct}% complete`}`}
                      onClick={() => st === 'locked' ? setToast(`Master /${flat[idx - 1].symbol}/ first to unlock this sound. Completed sounds stay open for review.`) : go(`/sounds/${node.id}`)}>
                      {isCur && <span className="start-tag">{pct ? 'CONTINUE' : 'START'}</span>}
                      <span className="disc ipa" style={st === 'mastered' ? { background: sec.color } : undefined}>
                        {st !== 'locked' && st !== 'mastered' && pct > 0 && (
                          <svg className="ring" viewBox="0 0 88 88"><circle cx="44" cy="44" r={R} fill="none" stroke="#E3E7EE" strokeWidth="5" /><circle cx="44" cy="44" r={R} fill="none" stroke={sec.color} strokeWidth="5" strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - pct / 100)} /></svg>
                        )}
                        {node.symbol}
                        {st === 'locked' && <span className="badge" style={{ color: '#A3ACBD' }}><Icon name="lock" /></span>}
                        {st === 'mastered' && <span className="badge" style={{ color: sec.color }}><Icon name="check" /></span>}
                      </span>
                      <span className="label">{node.key}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {toast && <div role="status" style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(var(--nav-h) + var(--safe-b) + 14px)', zIndex: 50, maxWidth: 520, margin: '0 auto' }} className="notice">{toast}</div>}
    </div>
  );
}

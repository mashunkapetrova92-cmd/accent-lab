import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { PlayButton, ScoreRing } from '../../components/ui';
import { playClip } from '../../lib/audio';
import { getState, recordListen, soundProgress, touch, useStore } from '../../lib/store';
import { shuffle } from '../../lib/text';
import type { Clip, Drill, SoundNode, SoundsData } from '../../data/types';

export interface Q { drill: Drill; clip: Clip; options: string[] }

export function makeQuestions(drills: Drill[], n: number): Q[] {
  if (!drills.length) return [];
  const hv = getState().settings.hvpt;
  const pool: Drill[] = [];
  while (pool.length < n) pool.push(...shuffle(drills));
  return pool.slice(0, n).map(d => ({ drill: d, clip: hv ? d.clips[Math.floor(Math.random() * d.clips.length)] : d.clips[0], options: d.options.length > 2 ? shuffle(d.options) : d.options }));
}

export function QuestionCard({ q, index, total, results, onAnswer, explain, autoPlay = true }: {
  q: Q; index: number; total: number; results: (boolean | null)[]; onAnswer: (ok: boolean) => void; explain: string; autoPlay?: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { setPicked(null); if (autoPlay) playClip(q.clip, false, 'q').catch(() => {}); }, [q, autoPlay]);
  const ok = picked === q.drill.answer;
  return (
    <div className="card drill" data-answer={import.meta.env.DEV ? q.drill.answer : undefined}>
      <div className="progress-dots" aria-label={`Question ${index + 1} of ${total}`}>
        {Array.from({ length: total }, (_, i) => <i key={i} className={i === index ? 'cur' : results[i] === true ? 'ok' : results[i] === false ? 'no' : ''} />)}
      </div>
      <div className="small muted">Question {index + 1} of {total}</div>
      <button className="big-play" onClick={() => { touch(); playClip(q.clip, false, 'q').catch(() => {}); }} aria-label="Play the recording again"><Icon name="play" /></button>
      <div className="small muted">What did you hear?</div>
      <div className={`options${q.options.length === 1 ? ' one' : ''}`}>
        {q.options.map(o => (
          <button key={o} className={`opt${picked ? (o === q.drill.answer ? ' right' : o === picked ? ' wrong' : '') : ''}`} disabled={!!picked}
            onClick={() => { touch(); setPicked(o); onAnswer(o === q.drill.answer); }}>{o}</button>
        ))}
      </div>
      {picked && (
        <div className={`feedback ${ok ? 'ok' : 'no'}`} role="status">
          <b>{ok ? 'Correct.' : `Not quite. You heard “${q.drill.answer}”, not “${picked}”.`}</b> {explain}
          {q.drill.optClips && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {q.options.map(o => q.drill.optClips![o] ? (
                <span key={o} className="row" style={{ gap: 6 }}>
                  <PlayButton clip={q.drill.optClips![o]} label={`Play ${o}`} />
                  <span><b>{o}</b> <span className="ipa">{q.drill.optIpa?.[o]}</span></span>
                </span>) : null)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ListenStage({ node, onDone }: { node: SoundNode; data: SoundsData; onDone: (passed: boolean) => void }) {
  const N = 10;
  const [round, setRound] = useState(0);
  const qs = useMemo(() => makeQuestions(node.drills, N), [node, round]);
  const [i, setI] = useState(-1);
  const [res, setRes] = useState<(boolean | null)[]>([]);
  const [answered, setAnswered] = useState(false);
  const best = useStore(() => soundProgress(node.id).listenBest);

  if (i === -1) return (
    <div className="card stack">
      <h2 style={{ fontSize: 22 }}>Listening discrimination</h2>
      <p className="lead">You will hear {N} recordings. Choose the word or phrase you heard. Train your ear before your mouth: hearing the difference makes it much easier to produce.</p>
      {getState().settings.hvpt && <p className="small muted">Recordings use three different American voices. Hearing several voices helps you recognize the sound in real life.</p>}
      <p className="small muted"><b>Contrast:</b> {node.contrast}</p>
      {best !== undefined && <p className="small">Your best result: <b>{best}%</b></p>}
      <button className="btn primary block" onClick={() => { touch(); setRes(Array(N).fill(null)); setI(0); setAnswered(false); }}>Start <Icon name="play" /></button>
    </div>
  );
  if (i >= N) {
    const score = Math.round(res.filter(Boolean).length / N * 100);
    const pass = score >= 80;
    return (
      <div className="card stack center">
        <div style={{ display: 'grid', placeItems: 'center' }}><ScoreRing value={score} label="%" /></div>
        <h2 style={{ fontSize: 22 }}>{pass ? 'Your ear can hear the difference.' : 'Keep training your ear.'}</h2>
        <p className="lead">{pass ? 'You reached the 80% needed for this stage.' : 'You need 80% to complete this stage. Replay the pairs you missed and try again.'}</p>
        <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => { setRound(r => r + 1); setRes(Array(N).fill(null)); setI(0); setAnswered(false); }}><Icon name="replay" /> Try again</button>
          {pass && <button className="btn primary" onClick={() => onDone(true)}>Continue <Icon name="next" /></button>}
        </div>
      </div>
    );
  }
  return (
    <div className="stack">
      <QuestionCard q={qs[i]} index={i} total={N} results={res} explain={node.contrast}
        onAnswer={ok => { setRes(r => { const c = r.slice(); c[i] = ok; return c; }); setAnswered(true); }} />
      <button className="btn primary block" disabled={!answered} onClick={() => {
        if (i + 1 >= N) { const sc = Math.round([...res].filter(Boolean).length / N * 100); recordListen(node.id, sc); }
        setI(i + 1); setAnswered(false);
      }}>{i + 1 >= N ? 'See result' : 'Next'} <Icon name="next" /></button>
    </div>
  );
}

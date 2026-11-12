import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { IpaMark, MetricGrid, PlayButton, ScoreRing } from '../../components/ui';
import { RecordButton, useRecorder } from '../../components/Recorder';
import { Compare, PhonemeStrip, wordProblem } from '../../components/Results';
import { recordSentenceScore, soundProgress, useStore } from '../../lib/store';
import { normTokens, key } from '../../lib/text';
import type { Assessment } from '../../assess/types';
import type { SentenceItem, SoundNode } from '../../data/types';

export function SentenceText({ s, r, onWord }: { s: SentenceItem; r?: Assessment | null; onWord?: (i: number) => void }) {
  return (
    <p style={{ fontSize: 22, lineHeight: 1.6, fontWeight: 550 }}>
      {s.tokens.map((t, i) => {
        const w = r?.words[i];
        const cls = w ? (w.status === 'good' ? 'g' : w.status === 'fair' ? 'y' : 'r') : '';
        return <span key={i}><span className={`tok ${cls}`} style={!w && s.hl.includes(i) ? { color: 'var(--hl)', fontWeight: 750 } : undefined} onClick={() => onWord?.(i)}>{t}</span>{i < s.tokens.length - 1 ? ' ' : ''}</span>;
      })}
    </p>
  );
}

export function SentenceResultView({ s, r, marks, knownIpa }: { s: SentenceItem; r: Assessment; marks: string[]; knownIpa?: Record<string, string> }) {
  const problems = r.words.filter(w => w.status !== 'good').sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, 4);
  const metrics = r.metrics;
  return (
    <div className="stack" style={{ animation: 'pop .3s ease both' }}>
      <div className="row">
        <ScoreRing value={r.overall} label="score" />
        <div className="grow">
          <div style={{ fontWeight: 750, fontSize: 18 }}>{r.overall >= 90 ? 'Clear sentence.' : r.overall >= 70 ? 'Mostly clear.' : 'Practice the marked words.'}</div>
          <div className="small muted">Green: clear · Yellow: partly accurate · Red: needs work</div>
        </div>
      </div>
      <SentenceText s={s} r={r} />
      <Compare r={r} model={s.clip} />
      {problems.length > 0 && (
        <div className="card" style={{ padding: 14, boxShadow: 'none', background: 'var(--surface-2)' }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Most important to fix</div>
          {problems.map(w => {
            const p = wordProblem(w, s.tokIpa[w.idx], knownIpa);
            return (
              <div key={w.idx} className="list-row" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <b style={{ fontSize: 18 }}>{s.tokens[w.idx]}</b> <span className="ipa muted"><IpaMark ipa={s.tokIpa[w.idx]} marks={marks} /></span>
                  {p && <div className="small" style={{ marginTop: 2 }}><b>{p.title}.</b> {p.text}</div>}
                  <div style={{ marginTop: 6 }}><PhonemeStrip w={w} /></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <MetricGrid metrics={metrics} />
    </div>
  );
}

export default function SentenceStage({ node, onDone }: { node: SoundNode; onDone: () => void }) {
  const [i, setI] = useState(0);
  const rec = useRecorder();
  const scores = useStore(() => soundProgress(node.id).sentences);
  const s = node.sentences[i];
  const need = 3;
  const done = Object.keys(scores).length;
  useEffect(() => { rec.reset(); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (rec.state === 'done' && rec.result) recordSentenceScore(node.id, i, rec.result.overall, rec.result.engine); }, [rec.state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="stack">
      <p className="lead">Read each sentence aloud. Words with the target sound are colored. Record at least {need} sentences to complete this stage.</p>
      <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
        {node.sentences.map((_, k) => (
          <button key={k} className="chip" aria-pressed={k === i} onClick={() => setI(k)} aria-label={`Sentence ${k + 1}`}>
            {k + 1}{scores[k] !== undefined && <span className={`pill ${scores[k] >= 90 ? 'good' : scores[k] >= 70 ? 'warn' : 'bad'}`}>{scores[k]}</span>}
          </button>
        ))}
      </div>
      <div className="card stack">
        {rec.state !== 'done' && <SentenceText s={s} />}
        <div className="ipa muted" style={{ fontSize: 17 }}><IpaMark ipa={s.ipa} marks={node.marks} /></div>
        <div className="row">
          <PlayButton clip={s.clip} label="Play at natural speed" /><span className="small">Natural</span>
          <PlayButton clip={s.clip} slow label="Play slowly" /><span className="small">Slow</span>
        </div>
        <RecordButton mode="sentence" rec={rec} onStart={() => rec.start(s.text, normTokens(s.text).map(key), 'sentence')} labelIdle="Tap and read the sentence" />
        {rec.state === 'done' && rec.result && <SentenceResultView s={s} r={rec.result} marks={node.marks} />}
      </div>
      <div className="row">
        <button className="btn grow" disabled={i === 0} onClick={() => setI(i - 1)}><Icon name="back" /> Previous</button>
        <button className="btn grow" disabled={i === node.sentences.length - 1} onClick={() => setI(i + 1)}>Next <Icon name="next" /></button>
      </div>
      <button className="btn primary block" disabled={done < need} onClick={onDone}>{done < need ? `Record ${need - done} more sentence${need - done === 1 ? '' : 's'}` : 'Continue to the final test'} <Icon name="next" /></button>
    </div>
  );
}

export { MetricGrid };

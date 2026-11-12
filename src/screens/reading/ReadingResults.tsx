import { useEffect, useMemo, useRef } from 'react';
import Icon from '../../components/Icon';
import { MetricGrid, ScoreRing } from '../../components/ui';
import { wordProblem } from '../../components/Results';
import { recordReading, useStore } from '../../lib/store';
import type { Story, Tok } from '../../data/types';
import type { Assessment } from '../../assess/types';
import { tokenAt } from './WordSheet';

export default function ReadingResults({ story, result, onWord, onSentence, onAgain }: {
  story: Story; toks: Tok[]; result: { r: Assessment; scope: string; first: number };
  onWord: (i: number) => void; onSentence: (si: number) => void; onAgain: () => void;
}) {
  const { r, scope, first } = result;
  const saved = useRef(false);
  const reading = useStore(s => s.reading);
  const history = useMemo(() => reading.filter(a => a.story === story.id && a.scope === scope), [reading, story.id, scope]);
  const problems = useMemo(() => r.words
    .filter(w => w.status !== 'good')
    .map(w => ({ w, tok: tokenAt(story, first + w.idx) }))
    .filter(x => x.tok)
    // the most damaging errors first: skipped and misrecognized content words, then low scores
    .sort((a, b) => (a.w.score ?? 0) - (b.w.score ?? 0) || (b.tok!.d.length - a.tok!.d.length))
    .slice(0, 8), [r, story, first]);

  useEffect(() => {
    if (saved.current) return; saved.current = true;
    const m: Record<string, number | null> = {}; r.metrics.forEach(x => { m[x.key] = x.value; });
    recordReading({ story: story.id, t: Date.now(), scope, engine: r.engine, overall: r.overall, metrics: m, durationSec: Math.round(r.durationSec), words: r.words.length, problems: problems.map(p => p.tok!.d) });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const delta = prev ? r.overall - prev.overall : null;
  const sentIndex = (tokI: number) => story.paragraphs.flatMap(p => p.sents).findIndex(s => tokI >= s.a && tokI < s.b);
  const good = r.words.filter(w => w.status === 'good').length;

  return (
    <div className="stack">
      <div className="row">
        <ScoreRing value={r.overall} label="score" />
        <div className="grow">
          <div style={{ fontWeight: 800, fontSize: 19 }}>{r.overall >= 90 ? 'Excellent reading.' : r.overall >= 75 ? 'Good, with a few words to polish.' : 'Practice the highlighted words, then read again.'}</div>
          <div className="small muted">{good} of {r.words.length} words clear · {Math.round(r.durationSec)} s</div>
          {delta !== null && <div className={`pill ${delta >= 0 ? 'good' : 'bad'}`} style={{ marginTop: 6 }}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs previous attempt ({prev!.overall})</div>}
        </div>
      </div>
      <MetricGrid metrics={r.metrics} />
      {r.engine !== 'azure' && <div className="notice info small">Word recognition checks whether each word was understood. It cannot hear vowel quality, stress or intonation. Connect Azure in Settings for sound-by-sound scores.</div>}

      {problems.length > 0 && (
        <div>
          <div className="eyebrow" style={{ margin: '6px 0 4px' }}>Fix these first</div>
          {problems.map(({ w, tok }) => {
            const p = wordProblem(w, story.ipa[tok!.n[0]]);
            return (
              <button key={w.idx} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => onWord(first + w.idx)}>
                <span className={`pill ${w.status === 'fair' ? 'warn' : 'bad'}`}>{w.score ?? '–'}</span>
                <span className="grow"><b>{tok!.d}</b> <span className="ipa muted">{story.ipa[tok!.n[0]]}</span><br /><span className="small muted">{p?.title}</span></span>
                <Icon name="next" size={18} />
              </button>
            );
          })}
        </div>
      )}

      {history.length > 1 && (
        <div>
          <div className="eyebrow" style={{ margin: '6px 0 6px' }}>Your attempts{scope !== 'all' ? ` · paragraph ${Number(scope.slice(1)) + 1}` : ''}</div>
          <svg viewBox="0 0 300 70" style={{ width: '100%', height: 70 }} role="img" aria-label="Scores of your attempts">
            {[50, 75, 100].map(v => <line key={v} x1="0" x2="300" y1={66 - v * 0.6} y2={66 - v * 0.6} stroke="#E9EDF3" />)}
            <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={history.slice(-12).map((h, i, a) => `${a.length === 1 ? 150 : i / (a.length - 1) * 290 + 5},${66 - h.overall * 0.6}`).join(' ')} />
            {history.slice(-12).map((h, i, a) => <circle key={i} cx={a.length === 1 ? 150 : i / (a.length - 1) * 290 + 5} cy={66 - h.overall * 0.6} r={i === a.length - 1 ? 5 : 3} fill="var(--accent)" />)}
          </svg>
        </div>
      )}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {problems[0] && <button className="btn grow" onClick={() => onSentence(sentIndex(first + problems[0].w.idx))}>Practice a sentence</button>}
        <button className="btn primary grow" onClick={onAgain}><Icon name="mic" /> Record again</button>
      </div>
      <p className="small muted">Tap any colored word in the text for its transcription, the model audio{r.audio ? ', your own pronunciation' : ''} and a practice recorder.</p>
    </div>
  );
}

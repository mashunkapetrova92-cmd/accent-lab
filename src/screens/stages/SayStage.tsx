import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { HlWord, IpaMark, PlayButton } from '../../components/ui';
import { RecordButton, useRecorder } from '../../components/Recorder';
import { WordResultView } from '../../components/Results';
import { normTokens, key } from '../../lib/text';
import { recordWordScore, soundProgress, useStore } from '../../lib/store';
import type { SoundNode } from '../../data/types';

export function knownIpaOf(node: SoundNode) {
  const m: Record<string, string> = {};
  for (const d of node.drills) Object.assign(m, d.optIpa || {});
  for (const w of node.words) m[w.text.toLowerCase()] = w.ipa;
  return m;
}

export default function SayStage({ node, onDone }: { node: SoundNode; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [tried, setTried] = useState<Set<number>>(new Set());
  const rec = useRecorder();
  const scores = useStore(() => soundProgress(node.id).words);
  const w = node.words[i];
  const known = useMemo(() => knownIpaOf(node), [node]);
  const need = Math.min(6, node.words.length);

  useEffect(() => { rec.reset(); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (rec.state === 'done' && rec.result) {
      if (rec.result.checked !== false) recordWordScore(node.id, w.text, rec.result.overall, rec.result.engine);
      setTried(t => new Set(t).add(i));
    }
  }, [rec.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const refKeys = normTokens(w.text).map(key);
  return (
    <div className="stack">
      <p className="lead">Listen to the model, then record yourself. Try at least {need} words to complete this stage.</p>
      <div className="chips" role="tablist" aria-label="Words">
        {node.words.map((x, k) => {
          const s = scores[x.text];
          return <button key={x.text} className="chip" aria-pressed={k === i} onClick={() => setI(k)}>
            {x.text}{s !== undefined && <span className={`pill ${s >= 90 ? 'good' : s >= 70 ? 'warn' : 'bad'}`} style={{ marginLeft: 2 }}>{s}</span>}
          </button>;
        })}
      </div>
      <div className="card stack">
        <div className="row">
          <div className="grow">
            <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1 }}><HlWord w={w} /></div>
            <div style={{ fontSize: 19 }}><IpaMark ipa={w.ipa} marks={node.marks} /></div>
          </div>
          <PlayButton clip={w.clip} label={`Play ${w.text}`} />
          <PlayButton clip={w.clip} slow label={`Play ${w.text} slowly`} />
        </div>
        <RecordButton mode={w.text.includes(' ') ? 'sentence' : 'word'} rec={rec} onStart={() => rec.start(w.text, refKeys, w.text.includes(' ') ? 'sentence' : 'word', w)} labelIdle={`Tap and say “${w.text}”`} />
        {rec.state === 'done' && rec.result && <WordResultView r={rec.result} refIpa={w.ipa} marks={node.marks} model={w.clip} knownIpa={known} word={w.text} />}
      </div>
      <div className="row">
        <button className="btn grow" disabled={i === 0} onClick={() => setI(i - 1)}><Icon name="back" /> Previous</button>
        <button className="btn grow" disabled={i === node.words.length - 1} onClick={() => setI(i + 1)}>Next word <Icon name="next" /></button>
      </div>
      <button className="btn primary block" disabled={tried.size < need && Object.keys(scores).length < need} onClick={onDone}>
        {tried.size < need && Object.keys(scores).length < need ? `Try ${need - Math.max(tried.size, Object.keys(scores).length)} more word${need - Math.max(tried.size, Object.keys(scores).length) === 1 ? '' : 's'}` : 'Continue to sentences'} <Icon name="next" />
      </button>
    </div>
  );
}

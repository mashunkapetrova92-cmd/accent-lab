import { pickEngine } from '../../assess';
import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { Celebrate, HlWord, IpaMark, PlayButton, ScoreRing } from '../../components/ui';
import { RecordButton, useRecorder } from '../../components/Recorder';
import { QuestionCard, makeQuestions } from './ListenStage';
import { SentenceText } from './SentenceStage';
import { STAGES, recordTest, soundProgress, touch, useStore } from '../../lib/store';
import { key, normTokens, shuffle } from '../../lib/text';
import type { SoundNode, SoundsData } from '../../data/types';

type Part = 'id' | 'disc' | 'word' | 'sent';
const PASS = 90;

export default function TestStage({ node, onNext }: { node: SoundNode; data: SoundsData; onNext: () => void }) {
  const prog = useStore(() => soundProgress(node.id));
  const missing = STAGES.filter(s => s.id !== 'test' && !prog.stages[s.id]);
  const hasId = node.idq.length >= 4;
  const weights: Record<Part, number> = hasId ? { id: 20, disc: 30, word: 30, sent: 20 } : { id: 0, disc: 40, word: 35, sent: 25 };
  const [run, setRun] = useState(0);
  const plan = useMemo(() => ({
    id: shuffle(node.idq).slice(0, 4).map(q => ({ ...q, options: shuffle(q.options) })),
    disc: makeQuestions(node.drills, hasId ? 6 : 8),
    // only words the checker can score reliably go into the test
    words: shuffle(node.words.filter(w => w.check !== 'n')).slice(0, 3),
    sent: shuffle(node.sentences)[0],
  }), [node, run, hasId]);
  const parts: Part[] = hasId ? ['id', 'disc', 'word', 'sent'] : ['disc', 'word', 'sent'];
  const [step, setStep] = useState(-1);
  const [scores, setScores] = useState<Partial<Record<Part, number>>>({});
  const [celebrate, setCelebrate] = useState(false);
  const [final, setFinal] = useState<{ total: number; passed: boolean } | null>(null);

  const finishPart = (p: Part, v: number) => {
    const s = { ...scores, [p]: v };
    setScores(s);
    if (step + 1 >= parts.length) {
      const total = Math.round(parts.reduce((acc, q) => acc + (s[q] ?? 0) * weights[q], 0) / parts.reduce((a, q) => a + weights[q], 0));
      const passed = total >= PASS && missing.length === 0;
      const newly = recordTest(node.id, total, passed, pickEngine('word').id);
      setFinal({ total, passed });
      if (newly) setCelebrate(true);
    }
    setStep(step + 1);
  };

  if (step === -1) return (
    <div className="card stack">
      <h2 style={{ fontSize: 22 }}>Final test for /{node.symbol}/</h2>
      <p className="lead">The test combines {hasId ? 'sound identification, ' : ''}listening, word pronunciation and one sentence. You need <b>{PASS}/100</b> to master this sound and unlock the next one. Unlimited attempts.</p>
      <div className="stack small">
        {parts.map(p => <div key={p} className="row"><span className="pill accent">{weights[p]}%</span>{{ id: 'Which word contains the sound? (4 questions)', disc: `Listening discrimination (${hasId ? 6 : 8} questions)`, word: 'Say 3 words', sent: 'Read 1 sentence' }[p]}</div>)}
      </div>
      {(prog.testBest !== undefined) && <p className="small">Best score: <b>{prog.testBest}</b> · Most recent: <b>{prog.testLast}</b></p>}
      {missing.length > 0 && <div className="notice">Complete these stages first: {missing.map(m => m.label).join(', ')}.</div>}
      <button className="btn primary block" disabled={missing.length > 0} onClick={() => { touch(); setScores({}); setFinal(null); setStep(0); }}>Start the test <Icon name="play" /></button>
    </div>
  );

  if (step >= parts.length && final) {
    const weakest = parts.filter(p => (scores[p] ?? 0) < PASS);
    const labels: Record<Part, string> = { id: 'Sound identification', disc: 'Listening discrimination', word: 'Word pronunciation', sent: 'Sentence pronunciation' };
    const advise: Record<Part, string> = { id: 'Review the Words stage and notice which spellings carry the sound.', disc: 'Repeat the Listen stage until you reach 90% or more.', word: 'Go back to the Say stage and compare your recordings with the model.', sent: 'Practice the Sentences stage, slowly first.' };
    return (
      <div className="stack">
        {celebrate && <Celebrate title={`/${node.symbol}/ mastered`} text="The next sound is now unlocked." onDone={() => setCelebrate(false)} />}
        <div className="card stack center">
          <div style={{ display: 'grid', placeItems: 'center' }}><ScoreRing value={final.total} label="/100" /></div>
          <h2 style={{ fontSize: 22 }}>{final.passed ? 'Mastered!' : 'Not yet — you need 90.'}</h2>
          <p className="small muted">Best: {prog.testBest} · Most recent: {prog.testLast}</p>
        </div>
        <div className="card">
          {parts.map(p => (
            <div key={p} className="list-row">
              <div className="grow"><b>{labels[p]}</b>{(scores[p] ?? 0) < PASS && <div className="small muted">{advise[p]}</div>}</div>
              <span className={`pill ${(scores[p] ?? 0) >= PASS ? 'good' : (scores[p] ?? 0) >= 70 ? 'warn' : 'bad'}`}>{scores[p]}</span>
            </div>
          ))}
        </div>
        {!final.passed && weakest.length > 0 && <div className="notice">Focus on: {weakest.map(w => labels[w].toLowerCase()).join(', ')}.</div>}
        <div className="row">
          <button className="btn grow" onClick={() => { setRun(r => r + 1); setStep(-1); }}><Icon name="replay" /> Retake</button>
          {final.passed && <button className="btn primary grow" onClick={onNext}>Next sound <Icon name="next" /></button>}
        </div>
      </div>
    );
  }

  const part = parts[step];
  return (
    <div className="stack">
      <div className="row small muted" style={{ justifyContent: 'space-between' }}><span>Part {step + 1} of {parts.length}</span><span>Pass mark {PASS}</span></div>
      {part === 'id' && <IdPart node={node} qs={plan.id} onDone={v => finishPart('id', v)} />}
      {part === 'disc' && <DiscPart node={node} qs={plan.disc} onDone={v => finishPart('disc', v)} />}
      {part === 'word' && <WordPart node={node} words={plan.words} onDone={v => finishPart('word', v)} />}
      {part === 'sent' && <SentPart node={node} s={plan.sent} onDone={v => finishPart('sent', v)} />}
    </div>
  );
}

function IdPart({ node, qs, onDone }: { node: SoundNode; qs: SoundNode['idq']; onDone: (v: number) => void }) {
  const [i, setI] = useState(0); const [ok, setOk] = useState(0); const [picked, setPicked] = useState<string | null>(null);
  const q = qs[i];
  return (
    <div className="card drill" data-answer={import.meta.env.DEV ? q.answer : undefined}>
      <div className="small muted">Question {i + 1} of {qs.length}</div>
      <h2 style={{ fontSize: 22, margin: '6px 0 4px' }}>Which word contains <span className="ipa" style={{ color: node.color }}>/{node.symbol}/</span>?</h2>
      <div className="options">
        {q.options.map(o => <button key={o} className={`opt${picked ? (o === q.answer ? ' right' : o === picked ? ' wrong' : '') : ''}`} disabled={!!picked} onClick={() => { setPicked(o); if (o === q.answer) setOk(k => k + 1); }}>{o}</button>)}
      </div>
      {picked && <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => { if (i + 1 >= qs.length) onDone(Math.round(ok / qs.length * 100)); else { setI(i + 1); setPicked(null); } }}>Next <Icon name="next" /></button>}
    </div>
  );
}

function DiscPart({ node, qs, onDone }: { node: SoundNode; qs: ReturnType<typeof makeQuestions>; onDone: (v: number) => void }) {
  const [i, setI] = useState(0); const [res, setRes] = useState<(boolean | null)[]>(Array(qs.length).fill(null)); const [ans, setAns] = useState(false);
  return (
    <div className="stack">
      <QuestionCard q={qs[i]} index={i} total={qs.length} results={res} explain={node.contrast} onAnswer={ok => { setRes(r => { const c = r.slice(); c[i] = ok; return c; }); setAns(true); }} />
      <button className="btn primary block" disabled={!ans} onClick={() => { if (i + 1 >= qs.length) onDone(Math.round(res.filter(Boolean).length / qs.length * 100)); else { setI(i + 1); setAns(false); } }}>Next <Icon name="next" /></button>
    </div>
  );
}

function WordPart({ node, words, onDone }: { node: SoundNode; words: SoundNode['words']; onDone: (v: number) => void }) {
  const [i, setI] = useState(0); const [got, setGot] = useState<number[]>([]);
  const rec = useRecorder(); const w = words[i];
  useEffect(() => { rec.reset(); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const score = rec.state === 'done' ? rec.result!.overall : null;
  return (
    <div className="card stack center">
      <div className="small muted">Word {i + 1} of {words.length}</div>
      <div style={{ fontSize: 40, fontWeight: 700 }}><HlWord w={w} /></div>
      <div><IpaMark ipa={w.ipa} marks={node.marks} /></div>
      <div className="row" style={{ justifyContent: 'center' }}><PlayButton clip={w.clip} /><PlayButton clip={w.clip} slow /></div>
      <RecordButton mode={w.text.includes(' ') ? 'sentence' : 'word'} rec={rec} onStart={() => rec.start(w.text, normTokens(w.text).map(key), w.text.includes(' ') ? 'sentence' : 'word', w)} labelIdle={`Say “${w.text}”`} />
      {score !== null && <div className="row" style={{ justifyContent: 'center' }}><ScoreRing value={score} size="sm" /><span className="small muted">Recorded. You can record again before continuing.</span></div>}
      {score !== null && <button className="btn primary block" onClick={() => { const g = [...got, score]; setGot(g); if (i + 1 >= words.length) onDone(Math.round(g.reduce((a, b) => a + b, 0) / g.length)); else setI(i + 1); }}>{i + 1 >= words.length ? 'Continue' : 'Next word'} <Icon name="next" /></button>}
    </div>
  );
}

function SentPart({ node, s, onDone }: { node: SoundNode; s: SoundNode['sentences'][number]; onDone: (v: number) => void }) {
  const rec = useRecorder();
  const score = rec.state === 'done' ? rec.result!.overall : null;
  return (
    <div className="card stack">
      <SentenceText s={s} r={rec.state === 'done' ? rec.result : null} />
      <div className="ipa muted"><IpaMark ipa={s.ipa} marks={node.marks} /></div>
      <div className="row"><PlayButton clip={s.clip} /><PlayButton clip={s.clip} slow /></div>
      <RecordButton mode="sentence" rec={rec} onStart={() => rec.start(s.text, normTokens(s.text).map(key), 'sentence')} labelIdle="Read the sentence" />
      {score !== null && <div className="row" style={{ justifyContent: 'center' }}><ScoreRing value={score} size="sm" /><span className="small muted">You can record again before finishing.</span></div>}
      {score !== null && <button className="btn primary block" onClick={() => onDone(score)}>Finish the test <Icon name="check" /></button>}
    </div>
  );
}

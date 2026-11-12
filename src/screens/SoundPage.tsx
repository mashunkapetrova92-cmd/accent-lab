import { useState } from 'react';
import Icon from '../components/Icon';
import { ErrorBox, HlWord, IpaMark, Loading, PlayButton } from '../components/ui';
import MouthDiagram, { VowelChart } from '../components/MouthDiagram';
import { loadSounds } from '../data/load';
import { STAGES, completeStage, useAsync, useStore, type StageId } from '../lib/store';
import { back, go } from '../router';
import { nodeState } from './SoundMap';
import ListenStage from './stages/ListenStage';
import SayStage from './stages/SayStage';
import SentenceStage from './stages/SentenceStage';
import TestStage from './stages/TestStage';
import type { SoundNode, SoundsData } from '../data/types';

export default function SoundPage({ id }: { id: string }) {
  const { data, error } = useAsync(loadSounds, []);
  const sounds = useStore(s => s.sounds);
  const p = sounds[id];
  const [stage, setStage] = useState<StageId>(() => {
    const first = STAGES.find(s => !p?.stages[s.id]);
    return first ? first.id : 'learn';
  });
  if (error) return <div className="screen"><ErrorBox text={error} /></div>;
  if (!data) return <div className="screen"><Loading /></div>;
  const idx = data.nodes.findIndex(n => n.id === id);
  const node = data.nodes[idx];
  if (!node) return <div className="screen"><ErrorBox text="This sound was not found." /></div>;
  if (nodeState(data.nodes, sounds, idx) === 'locked') {
    return <div className="screen"><div className="topbar"><button className="icon-btn" onClick={() => back('/sounds')} aria-label="Back"><Icon name="back" /></button></div>
      <div className="notice">Master /{data.nodes[idx - 1].symbol}/ first. This sound unlocks when the previous one is mastered.</div></div>;
  }
  const next = (s: StageId) => { const i = STAGES.findIndex(x => x.id === s); setStage(STAGES[Math.min(i + 1, STAGES.length - 1)].id); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const done = (s: StageId) => completeStage(node.id, s);

  return (
    <div className="screen" style={{ ['--hl' as string]: node.color }}>
      <div className="topbar">
        <button className="icon-btn" onClick={() => back('/sounds')} aria-label="Back to the sound map"><Icon name="back" /></button>
        <div className="grow" />
        {p?.mastered && <span className="pill good"><Icon name="check" size={14} /> Mastered</span>}
      </div>
      <div className="sound-head">
        <div className="sound-sym ipa" style={{ background: node.color }}>{node.symbol}</div>
        <div className="grow">
          <div className="eyebrow">{node.category}</div>
          <h1>{node.name}</h1>
          <div className="muted">as in <b style={{ color: 'var(--ink)' }}>{node.key}</b> <span className="ipa">{node.keyIpa}</span></div>
        </div>
      </div>
      <nav className="stages" aria-label="Lesson stages">
        {STAGES.map((s, i) => (
          <button key={s.id} className={`stage-tab${p?.stages[s.id] ? ' done' : ''}`} aria-current={stage === s.id ? 'step' : undefined} onClick={() => setStage(s.id)}>
            <span className="n">{p?.stages[s.id] ? <Icon name="check" /> : i + 1}</span>{s.label}
          </button>
        ))}
      </nav>
      {stage === 'learn' && <LearnStage node={node} onDone={() => { done('learn'); next('learn'); }} />}
      {stage === 'words' && <WordsStage node={node} onDone={() => { done('words'); next('words'); }} />}
      {stage === 'listen' && <ListenStage node={node} data={data} onDone={pass => { if (pass) done('listen'); next('listen'); }} />}
      {stage === 'say' && <SayStage node={node} onDone={() => { done('say'); next('say'); }} />}
      {stage === 'sentences' && <SentenceStage node={node} onDone={() => { done('sentences'); next('sentences'); }} />}
      {stage === 'test' && <TestStage node={node} data={data} onNext={() => {
        const n = data.nodes[idx + 1];
        if (n) go(`/sounds/${n.id}`); else go('/sounds');
      }} />}
    </div>
  );
}

const ROWS: [keyof SoundNode, string, string][] = [
  ['tongue', 'Tongue', 'tongue'], ['lips', 'Lips', 'lips'], ['jaw', 'Jaw', 'jaw'],
  ['voicing', 'Voicing', 'wave'], ['airflow', 'Airflow', 'air'], ['feel', 'What you should feel', 'hand'],
];

function LearnStage({ node, onDone }: { node: SoundNode; onDone: () => void }) {
  const isVowel = ['vowel', 'diphthong', 'rhotic'].includes(node.diagram.kind);
  return (
    <div className="stack">
      <div className="card">
        <div className="row">
          <div className="grow">
            <div className="eyebrow">Native model</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{node.key}</div>
            <div className="ipa muted"><IpaMark ipa={node.keyIpa} marks={node.marks} /></div>
          </div>
          <PlayButton clip={node.keyClip} label={`Play ${node.key}`} />
          <PlayButton clip={node.keyClip} slow label={`Play ${node.key} slowly`} />
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>The sound is presented inside a key word, recorded with a natural General American voice. Listen several times before reading the description.</p>
      </div>

      <div className={`diagram-wrap${isVowel ? ' two' : ''}`}>
        <div className="diagram">
          <MouthDiagram d={node.diagram} color={node.color} />
          <div className="legend">
            <span><i style={{ background: node.color }} />Tongue</span>
            <span><i style={{ background: '#E7A3A3' }} />Lips</span>
            <span><i style={{ background: '#5B5BD6' }} />Airflow</span>
            <span><i style={{ background: '#CF3F4F', borderRadius: 9 }} />Contact or narrowing</span>
            <span><i style={{ background: '#D4952A' }} />{node.diagram.kind !== 'consonant' || node.diagram.voiced ? 'Vocal folds vibrate' : 'No voicing'}</span>
          </div>
        </div>
        {isVowel && <div className="diagram"><VowelChart d={node.diagram} symbol={node.symbol} color={node.color} /><div className="legend"><span>Tongue position in the mouth, General American vowels</span></div></div>}
      </div>

      <div className="card">
        <div className="artic">
          {ROWS.map(([k, label, icon]) => (
            <div className="artic-row" key={k}>
              <span className="ic"><Icon name={icon} /></span>
              <div><b>{label}</b>{node[k] as string}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="notice info"><b>Phonology note. </b>{node.note}</div>
      <button className="btn primary block" onClick={onDone}>I understand this sound — continue <Icon name="next" /></button>
    </div>
  );
}

function WordsStage({ node, onDone }: { node: SoundNode; onDone: () => void }) {
  return (
    <div className="stack">
      <p className="lead">Listen to each word at normal speed, then slowly. The colored letters spell the target sound.</p>
      <div className="grid-words">
        {node.words.map(w => (
          <div className="word-card" key={w.text}>
            <div className="grow"><HlWord w={w} /><div className="i"><IpaMark ipa={w.ipa} marks={node.marks} /></div></div>
            <PlayButton clip={w.clip} label={`Play ${w.text}`} />
            <PlayButton clip={w.clip} slow label={`Play ${w.text} slowly`} />
          </div>
        ))}
      </div>
      <button className="btn primary block" onClick={onDone}>Continue to listening practice <Icon name="next" /></button>
    </div>
  );
}

export type { SoundsData };

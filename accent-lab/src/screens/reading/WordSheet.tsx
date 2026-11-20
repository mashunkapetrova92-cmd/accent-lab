import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { PlayButton, Sheet } from '../../components/ui';
import { RecordButton, useRecorder } from '../../components/Recorder';
import { PhonemeStrip, WordResultView, wordProblem } from '../../components/Results';
import { advice, PH_NODE } from '../../assess/feedback';
import { loadCheckMap, loadWordMap } from '../../data/load';
import { playBlob, playRange, stop as stopAudio, usePlaying } from '../../lib/audio';
import { F, type Clip, type Story, type Tok } from '../../data/types';
import type { Assessment } from '../../assess/types';
import { go } from '../../router';

const checkOf = (c?: (string | number)[]) => c ? { check: c[0] as 'p' | 'o' | 'n', ref: Number(c[1]), alt: c.slice(2).map(String) } : undefined;

export function tokenAt(story: Story, i: number): Tok | undefined {
  for (const p of story.paragraphs) for (const s of p.sents) if (i >= s.a && i < s.b) return s.toks.find(t => i >= t.i && i < t.i + t.n.length);
  return undefined;
}

export default function WordSheet({ story, tokIndex, onClose, result, onSentence }: {
  story: Story; tokIndex: number | null; onClose: () => void; result: { r: Assessment; first: number } | null; onSentence: (i: number) => void;
}) {
  const [map, setMap] = useState<Record<string, Clip> | null>(null);
  const [checks, setChecks] = useState<Record<string, (string | number)[]>>({});
  const rec = useRecorder();
  useEffect(() => { if (tokIndex !== null && !map) { loadWordMap().then(setMap).catch(() => setMap({})); loadCheckMap().then(setChecks).catch(() => {}); } }, [tokIndex, map]);
  useEffect(() => { rec.reset(); }, [tokIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctxOn = usePlaying('ctx');
  const mineOn = usePlaying('mine-word');
  if (tokIndex === null) return null;
  const tok = tokenAt(story, tokIndex);
  if (!tok) return null;
  const n = tok.n[0];
  const ipa = story.ipa[n] || '';
  const clip = map?.[n] || null;
  const homograph = (tok.f || 0) & F.HOMOGRAPH;
  const t0 = story.times[tok.i]?.[0], t1 = story.times[tok.i + tok.n.length - 1]?.[1];
  const w = result && tokIndex - result.first >= 0 && tokIndex - result.first < result.r.words.length ? result.r.words[tokIndex - result.first] : null;
  const prob = w ? wordProblem(w, ipa) : null;
  const worst = w?.phonemes?.length ? [...w.phonemes].sort((a, b) => a.score - b.score)[0] : null;
  const lesson = worst && worst.score < 80 ? PH_NODE[worst.p] : undefined;

  return (
    <Sheet open onClose={onClose} label={`Word: ${tok.d}`}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h2>{tok.d.replace(/^['’]|['’]$/g, '')}</h2>
          <div className="ipa" style={{ fontSize: 20, color: 'var(--ink-2)' }}>{ipa || '—'}</div>
          {homograph ? <div className="small muted" style={{ marginTop: 4 }}>This spelling has two pronunciations. Use “In context” to hear the one used here.</div> : null}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </div>
      <div className="row" style={{ margin: '14px 0', flexWrap: 'wrap' }}>
        <span className="row" style={{ gap: 6 }}><PlayButton clip={clip} label="Play the word" /><span className="small">Word</span></span>
        <span className="row" style={{ gap: 6 }}><PlayButton clip={clip} slow label="Play the word slowly" /><span className="small">Slow</span></span>
        {t0 !== undefined && <span className="row" style={{ gap: 6 }}>
          <button className={`play${ctxOn ? ' playing' : ''}`} aria-label="Play in context" onClick={() => { if (ctxOn) { stopAudio(); return; } playRange(story.audio, Math.max(0, t0 - 0.06), t1 + 0.1, { id: 'ctx' }).catch(() => {}); }}><Icon name={ctxOn ? 'pause' : 'ear'} /></button>
          <span className="small">In context</span></span>}
        {w && result?.r.audio && w.offset !== undefined && <span className="row" style={{ gap: 6 }}>
          <button className="play mine" aria-label="Play your pronunciation" onClick={() => { if (mineOn) { stopAudio(); return; } playBlob(result.r.audio!, Math.max(0, w.offset! - 0.08), w.offset! + (w.duration || 0.5) + 0.1, 'mine-word').catch(() => {}); }}><Icon name={mineOn ? 'pause' : 'play'} /></button>
          <span className="small">You</span></span>}
      </div>

      {w && (
        <div className="card" style={{ background: w.status === 'good' ? 'var(--good-soft)' : w.status === 'fair' ? 'var(--warn-soft)' : 'var(--bad-soft)', boxShadow: 'none', marginBottom: 12 }}>
          <div className="row"><b className="grow">{w.status === 'good' ? 'Pronounced clearly' : w.status === 'fair' ? 'Partly accurate' : w.status === 'omitted' ? 'Not heard' : 'Needs improvement'}</b>{w.score !== null && <span className="pill">{w.score}/100</span>}</div>
          {prob && <p className="small" style={{ marginTop: 6 }}><b>{prob.title}.</b> {prob.text}</p>}
          {worst && worst.score < 80 && <p className="small" style={{ marginTop: 6 }}><b>Articulation.</b> {advice(worst.p, worst.heardAs)}</p>}
          <div style={{ marginTop: 8 }}><PhonemeStrip w={w} /></div>
          {lesson && <button className="btn small" style={{ marginTop: 10 }} onClick={() => { onClose(); go(`/sounds/${lesson}`); }}>Open the /{worst!.p}/ lesson</button>}
        </div>
      )}

      <div className="eyebrow" style={{ marginBottom: 4 }}>Practice this word</div>
      <RecordButton mode="word" rec={rec} onStart={() => rec.start(tok.d, tok.n.map(x => story.keys[tok.i + tok.n.indexOf(x)]), tok.n.length > 1 ? 'sentence' : 'word', checkOf(checks[n]))} labelIdle={`Say “${tok.d.replace(/^['’]|['’]$/g, '')}”`} />
      {rec.state === 'done' && rec.result && <WordResultView r={rec.result} refIpa={ipa} marks={[]} model={clip} word={tok.d} />}
      <button className="btn block" style={{ marginTop: 12 }} onClick={() => onSentence(tokIndex)}>Practice the whole sentence</button>
    </Sheet>
  );
}

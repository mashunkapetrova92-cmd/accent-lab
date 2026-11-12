import Icon from './Icon';
import { IpaMark, MetricGrid, PlayButton, ScoreRing, ipaUnits } from './ui';
import { advice } from '../assess/feedback';
import { playBlob, stop as stopAudio, usePlaying } from '../lib/audio';
import type { Assessment, WordResult } from '../assess/types';
import type { Clip } from '../data/types';

/** First differing phoneme between the intended word and the word the recognizer heard. */
export function diffUnits(target: string, heard: string): [string, string] | null {
  const a = ipaUnits(target.replace(/[/ˈˌ]/g, '')), b = ipaUnits(heard.replace(/[/ˈˌ]/g, ''));
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return [a[i] || '', b[i] || ''];
  return null;
}

export function wordProblem(w: WordResult, refIpa?: string, knownIpa?: Record<string, string>): { title: string; text: string } | null {
  if (w.status === 'good') return null;
  if (w.status === 'omitted') return { title: 'Not heard', text: 'This word was skipped or too quiet to recognize. Say every word clearly, including short grammar words.' };
  if (w.phonemes?.length) {
    const worst = [...w.phonemes].sort((a, b) => a.score - b.score)[0];
    return { title: `/${worst.p}/ scored ${worst.score}`, text: advice(worst.p, worst.heardAs) };
  }
  if (w.heard && refIpa && knownIpa?.[w.heard]) {
    const d = diffUnits(refIpa, knownIpa[w.heard]);
    if (d && d[0]) return { title: `Heard as “${w.heard}”`, text: advice(d[0], d[1] || undefined) };
  }
  if (w.heard) return { title: `Heard as “${w.heard}”`, text: 'The recognizer understood a different word. Compare your recording with the model and check the highlighted sound.' };
  return { title: 'Unclear', text: 'This word was not recognized clearly.' };
}

export function PhonemeStrip({ w }: { w: WordResult }) {
  if (!w.phonemes?.length) return null;
  return (
    <div className="row" style={{ gap: 4, flexWrap: 'wrap' }} aria-label="Score for each sound">
      {w.phonemes.map((p, i) => (
        <span key={i} className={`pill ${p.score >= 80 ? 'good' : p.score >= 60 ? 'warn' : 'bad'}`} title={p.heardAs ? `sounded like /${p.heardAs}/` : undefined}>
          <span className="ipa" style={{ fontSize: 16 }}>{p.p}</span> {p.score}
        </span>
      ))}
    </div>
  );
}

export function WordResultView({ r, refIpa, marks, model, knownIpa, word }: { r: Assessment; refIpa: string; marks: string[]; model: Clip | null; knownIpa?: Record<string, string>; word?: string }) {
  const w = r.words[0];
  if (r.checked === false) return (
    <div className="stack" style={{ animation: 'pop .3s ease both' }}>
      <div className="notice info"><b>Recorded.</b> The on-device checker cannot score this word reliably, even when it is said perfectly, so compare by ear: play the model, then yourself, and listen for the highlighted sound.</div>
      <Compare r={r} model={model} />
      {!refIpa ? null : <div className="small muted">Target: <IpaMark ipa={refIpa} marks={marks} /></div>}
    </div>
  );
  const prob = w ? wordProblem(w, refIpa, knownIpa) : null;
  const target = w?.phonemes?.filter(p => marks.includes(p.p));
  const tScore = target?.length ? Math.round(target.reduce((s, p) => s + p.score, 0) / target.length) : null;
  const metrics = r.metrics.filter(m => m.key !== 'rate');
  if (tScore !== null) metrics.unshift({ key: 'target', label: `Target sound /${marks[0]}/`, value: tScore, kind: 'measured' });
  return (
    <div className="stack" style={{ animation: 'pop .3s ease both' }}>
      <div className="row">
        <ScoreRing value={r.overall} label="score" />
        <div className="grow">
          <div style={{ fontWeight: 750, fontSize: 18 }}>{r.overall >= 90 ? 'Clear and accurate.' : r.overall >= 70 ? 'Understandable, with a detail to fix.' : 'This needs another try.'}</div>
          <div className="small muted">{r.engine === 'azure' ? 'Scored sound by sound by Azure.' : r.overall === 100 ? `Recognized as “${word || w?.ref}”.` : w?.heard ? `The recognizer heard “${w.heard}”.` : 'The word was not recognized.'}</div>
          {w && <div style={{ marginTop: 6 }}><PhonemeStrip w={w} /></div>}
        </div>
      </div>
      {prob && <div className="notice"><b>{prob.title}. </b>{prob.text}</div>}
      <Compare r={r} model={model} />
      <MetricGrid metrics={metrics} />
      {!refIpa ? null : <div className="small muted">Target: <IpaMark ipa={refIpa} marks={marks} /></div>}
    </div>
  );
}

export function Compare({ r, model, from, to }: { r: Assessment; model: Clip | null; from?: number; to?: number }) {
  const mine = usePlaying('mine');
  return (
    <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
      <span className="row" style={{ gap: 6 }}><PlayButton clip={model} label="Play the model" /><span className="small"><b>Model</b></span></span>
      {r.audio
        ? <span className="row" style={{ gap: 6 }}>
            <button className={`play mine${mine ? ' playing' : ''}`} aria-label="Play your recording" onClick={() => { if (mine) { stopAudio(); return; } playBlob(r.audio!, from, to).catch(() => {}); }}><Icon name={mine ? 'pause' : 'play'} /></button>
            <span className="small"><b>You</b></span>
          </span>
        : <span className="small muted">Your own recording is not kept with this checking method.</span>}
    </div>
  );
}

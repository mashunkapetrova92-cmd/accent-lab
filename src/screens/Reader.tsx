import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { ErrorBox, Loading, Sheet } from '../components/ui';
import { RecordButton, useRecorder } from '../components/Recorder';
import { loadStory } from '../data/load';
import { F, type Story, type Tok } from '../data/types';
import { playRange, preload, pause as pauseAudio, stop as stopAudio, usePlayingAny } from '../lib/audio';
import { setSettings, touch, useAsync, useStore } from '../lib/store';
import { align, fmtTime, heardTokens } from '../lib/text';
import { back } from '../router';
import WordSheet from './reading/WordSheet';
import SentenceSheet from './reading/SentenceSheet';
import ReadingResults from './reading/ReadingResults';
import type { Assessment } from '../assess/types';

type Mode = 'listen' | 'study' | 'record';
const FEATURES = [
  { k: 'stress', label: 'Sentence stress', c: '#14213D' }, { k: 'weak', label: 'Weak forms', c: '#8790A6' },
  { k: 'link', label: 'Linking', c: '#0E7C86' }, { k: 'flap', label: 'Flap T', c: '#5B5BD6' },
  { k: 'r', label: 'American R', c: '#D4952A' }, { k: 'tune', label: 'Intonation', c: '#5B5BD6' },
] as const;

export default function Reader({ id }: { id: string }) {
  const { data: story, error } = useAsync(() => loadStory(id), [id]);
  const [mode, setMode] = useState<Mode>('listen');
  if (error) return <div className="screen"><ErrorBox text={error} onRetry={() => location.reload()} /></div>;
  if (!story) return <div className="screen"><Loading lines={5} /></div>;
  return <ReaderInner story={story} mode={mode} setMode={setMode} />;
}

function ReaderInner({ story, mode, setMode }: { story: Story; mode: Mode; setMode: (m: Mode) => void }) {
  const slowPref = useStore(s => s.settings.slowReading);
  const slow = slowPref && !!story.slowAudio && !!story.slowTimes;
  const playingId = usePlayingAny();
  const playing = playingId.startsWith('story:');
  const [cur, setCur] = useState(-1);
  const [pos, setPos] = useState(0);
  const [bySentence, setBySentence] = useState(false);
  const [wordSheet, setWordSheet] = useState<number | null>(null);
  const [sentSheet, setSentSheet] = useState<number | null>(null);
  const [feat, setFeat] = useState<Record<string, boolean>>({ stress: true, weak: true, link: true, flap: true, r: false, tune: true });
  const [scope, setScope] = useState<string>('all');
  const [result, setResult] = useState<{ r: Assessment; scope: string; first: number } | null>(null);
  const rec = useRecorder();
  const [live, setLive] = useState<Set<number>>(new Set());

  const sents = useMemo(() => story.paragraphs.flatMap(p => p.sents), [story]);
  const toks = useMemo(() => story.paragraphs.flatMap(p => p.sents.flatMap(s => s.toks)), [story]);
  const T = slow ? story.slowTimes! : story.times;
  const file = slow ? story.slowAudio! : story.audio;
  const total = T.length ? T[T.length - 1][1] : 0;
  useEffect(() => { preload([file]); }, [file]);

  // token index at time t
  const tokAt = useCallback((t: number) => {
    let lo = 0, hi = T.length - 1, best = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (T[m][0] <= t + 0.05) { best = m; lo = m + 1; } else hi = m - 1; }
    return best;
  }, [T]);
  const sentOf = useCallback((i: number) => sents.findIndex(s => i >= s.a && i < s.b), [sents]);

  const play = useCallback((from: number, to?: number) => {
    touch();
    playRange(file, Math.max(0, from - 0.05), to, {
      id: 'story:' + story.id,
      onTime: t => { setPos(t); setCur(tokAt(t)); },
      onEnd: () => { setCur(-1); },
    }).catch(() => {});
  }, [file, story.id, tokAt]);

  const playSentence = (si: number) => { const s = sents[si]; if (!s) return; play(T[s.a][0], T[s.b - 1][1] + 0.2); };
  const toggle = () => {
    if (playing) { pauseAudio(); return; }
    const si = Math.max(0, sentOf(Math.max(cur, 0)));
    if (bySentence) playSentence(cur >= 0 ? si : 0); else play(pos >= total - 0.2 ? 0 : pos);
  };
  const step = (d: number) => {
    const si = Math.max(0, sentOf(Math.max(cur, 0)));
    const n = Math.min(sents.length - 1, Math.max(0, si + d));
    setCur(sents[n].a); setPos(T[sents[n].a][0]);
    if (playing || bySentence) { if (bySentence) playSentence(n); else play(T[sents[n].a][0]); }
  };
  const switchSpeed = () => {
    if (!story.slowAudio) return;
    const was = playing;
    const tokNow = cur >= 0 ? cur : tokAt(pos);
    stopAudio();
    setSettings({ slowReading: !slowPref });
    const NT = !slowPref ? story.slowTimes! : story.times;
    const p = tokNow >= 0 ? NT[Math.max(0, sents[Math.max(0, sentOf(tokNow))].a)][0] : 0;
    setPos(p);
    if (was) setTimeout(() => playRange(!slowPref ? story.slowAudio! : story.audio, Math.max(0, p - 0.05), undefined, {
      id: 'story:' + story.id,
      onTime: t => { setPos(t); let lo = 0, hi = NT.length - 1, best = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (NT[m][0] <= t + 0.05) { best = m; lo = m + 1; } else hi = m - 1; } setCur(best); },
      onEnd: () => setCur(-1),
    }).catch(() => {}), 30);
  };
  useEffect(() => () => stopAudio(), []);
  useEffect(() => { stopAudio(); setCur(-1); }, [mode]);

  // live highlighting while recording with basic recognition
  const scopeRange = useMemo(() => {
    if (scope === 'all') return [0, toks.length] as const;
    const pi = Number(scope.slice(1));
    const ss = story.paragraphs[pi].sents; return [ss[0].a, ss[ss.length - 1].b] as const;
  }, [scope, story, toks.length]);
  const scopeKeys = useMemo(() => story.keys.slice(scopeRange[0], scopeRange[1]), [story, scopeRange]);
  const scopeText = useMemo(() => toks.slice(scopeRange[0], scopeRange[1]).map(t => (t.pre || '') + t.d + (t.post || '')).join(' '), [toks, scopeRange]);
  useEffect(() => {
    if (rec.state !== 'listening' || !rec.partial) return;
    const H = heardTokens(rec.partial, scopeKeys);
    const a = align(scopeKeys.slice(0, Math.min(scopeKeys.length, H.length + 8)), H.map(h => h.k));
    setLive(new Set(a.map((x, i) => x.st === 'ok' ? i + scopeRange[0] : -1).filter(i => i >= 0)));
  }, [rec.partial, rec.state, scopeKeys, scopeRange]);
  useEffect(() => {
    if (rec.state === 'done' && rec.result) { setResult({ r: rec.result, scope, first: scopeRange[0] }); setLive(new Set()); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    if (rec.state === 'error') setLive(new Set());
  }, [rec.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const curSent = cur >= 0 ? sentOf(cur) : -1;
  const resultFor = (i: number) => {
    if (!result || mode !== 'record') return null;
    const k = i - result.first;
    return k >= 0 && k < result.r.words.length ? result.r.words[k] : null;
  };

  const renderTok = (t: Tok, s: { a: number; b: number; tune: string }, last: boolean) => {
    const f = t.f || 0;
    const cls = ['tok'];
    if (mode === 'listen' || mode === 'study') { if (t.i === cur) cls.push('now'); else if (curSent >= 0 && t.i >= sents[curSent].a && t.i < sents[curSent].b) cls.push('sent'); }
    if (mode === 'study') {
      if (feat.stress && f & F.CONTENT) cls.push('content');
      if (feat.weak && f & F.WEAK) cls.push('weak');
      if (feat.flap && f & F.FLAP) cls.push('f-flap');
      if (feat.r && f & F.RHOTIC) cls.push('f-r');
    }
    if (mode === 'record') {
      const w = resultFor(t.i);
      if (w) cls.push(w.status === 'good' ? 'g' : w.status === 'fair' ? 'y' : 'r');
      else if (live.has(t.i)) cls.push('heard');
    }
    return (
      <Fragment key={t.i}>
        {t.pre}<span className={cls.join(' ')} onClick={() => { touch(); if (mode === 'listen' && !playing) { setCur(t.i); setPos(T[t.i][0]); } setWordSheet(t.i); }}>{t.d}</span>{t.post}
        {mode === 'study' && feat.tune && last && s.tune !== 'none' && <span className="into" aria-label={s.tune === 'rise' ? 'rising intonation' : 'falling intonation'}>{s.tune === 'rise' ? '↗' : '↘'}</span>}
        {mode === 'study' && feat.link && f & F.LINK ? <span className="lk" aria-hidden="true">‿</span> : ' '}
      </Fragment>
    );
  };

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" onClick={() => back('/reading')} aria-label="Back to the library"><Icon name="back" /></button>
        <div className="title-sm">{story.title}</div>
      </div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{story.topic} · {story.minutes} min · {story.words} words</div>
      <div className="seg" role="group" aria-label="Mode">
        {(['listen', 'study', 'record'] as Mode[]).map(m => <button key={m} aria-pressed={mode === m} onClick={() => { setMode(m); if (m !== 'record') rec.reset(); }}>{m === 'listen' ? 'Listen' : m === 'study' ? 'Study' : 'Read aloud'}</button>)}
      </div>

      {mode === 'study' && (
        <>
          <div className="feature-toggles">
            {FEATURES.map(x => <button key={x.k} className="ft" aria-pressed={!!feat[x.k]} onClick={() => setFeat(o => ({ ...o, [x.k]: !o[x.k] }))}><i style={{ background: x.c }} />{x.label}</button>)}
          </div>
          <p className="small muted" style={{ marginBottom: 12 }}>Bold words carry sentence stress; gray words are weak forms. Tap any word for its transcription, or the ¶ button for notes on a sentence.</p>
        </>
      )}

      {mode === 'record' && (
        <div className="card stack" style={{ marginBottom: 14 }}>
          {result
            ? <ReadingResults story={story} toks={toks} result={result} onWord={i => setWordSheet(i)} onSentence={si => setSentSheet(si)} onAgain={() => { setResult(null); rec.reset(); }} />
            : <>
                <div className="chips">
                  <button className="chip" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>Whole text</button>
                  {story.paragraphs.map((_, pi) => <button key={pi} className="chip" aria-pressed={scope === 'p' + pi} onClick={() => setScope('p' + pi)}>Paragraph {pi + 1}</button>)}
                </div>
                <RecordButton big mode="passage" rec={rec} onStart={() => rec.start(scopeText, scopeKeys, 'passage')} labelIdle={scope === 'all' ? 'Tap and read the whole text aloud' : `Tap and read paragraph ${Number(scope.slice(1)) + 1}`} />
                <p className="small muted center">Read at a natural pace and tap the button again when you finish. Recognized words turn green as you go.</p>
              </>}
        </div>
      )}

      <article className={`passage${mode === 'study' ? ' study' : ''}`} lang="en-US">
        {story.paragraphs.map((p, pi) => {
          const dim = mode === 'record' && scope !== 'all' && scope !== 'p' + pi && !result;
          return (
            <p key={pi} style={dim ? { opacity: 0.35 } : undefined}>
              {p.sents.map((s) => {
                const si = sents.indexOf(s);
                return (
                  <Fragment key={si}>
                    {mode === 'study' && <button className="pill accent" style={{ marginRight: 4, verticalAlign: 2 }} onClick={() => setSentSheet(si)} aria-label={`Notes for sentence ${si + 1}`}>¶</button>}
                    {s.toks.map((t, k) => renderTok(t, s, k === s.toks.length - 1))}
                  </Fragment>
                );
              })}
            </p>
          );
        })}
      </article>

      {(mode === 'listen' || mode === 'study') && (
        <div className="player" role="group" aria-label="Audio player">
          <button onClick={() => step(-1)} aria-label="Previous sentence"><Icon name="prev" /></button>
          <button className="main" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} /></button>
          <button onClick={() => step(1)} aria-label="Next sentence"><Icon name="next" /></button>
          <button className="spd" disabled={!story.slowAudio} onClick={switchSpeed} aria-label={slow ? 'Switch to natural speed' : 'Switch to the slow recording'}>{slow ? 'Slow' : '1×'}</button>
          <button className="tgl" aria-pressed={bySentence} onClick={() => setBySentence(b => !b)} title="Stop after each sentence">1 sentence</button>
          <span className="time">{fmtTime(pos)} / {fmtTime(total)}</span>
        </div>
      )}

      <WordSheet story={story} tokIndex={wordSheet} onClose={() => setWordSheet(null)} result={result ? { r: result.r, first: result.first } : null}
        onSentence={i => { setWordSheet(null); setSentSheet(sentOf(i)); }} />
      <Sheet open={sentSheet !== null} onClose={() => setSentSheet(null)} label="Sentence practice">
        {sentSheet !== null && <SentenceSheet story={story} si={sentSheet} sent={sents[sentSheet]} toks={toks} />}
      </Sheet>
    </div>
  );
}

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { ErrorBox, Loading, ScoreRing, Sheet } from '../components/ui';
import { RecordButton, useRecorder } from '../components/Recorder';
import { loadStory } from '../data/load';
import { F, type Story, type Tok } from '../data/types';
import { playRange, preload, pause as pauseAudio, stop as stopAudio, usePlayingAny } from '../lib/audio';
import { setSettings, touch, useAsync, useStore } from '../lib/store';
import { align, heardTokens } from '../lib/text';
import { back } from '../router';
import WordSheet from './reading/WordSheet';
import SentenceSheet from './reading/SentenceSheet';
import ReadingResults from './reading/ReadingResults';
import type { Assessment } from '../assess/types';

const FEATURES = [
  { k: 'stress', label: 'Sentence stress', c: '#14213D' }, { k: 'weak', label: 'Weak forms', c: '#8790A6' },
  { k: 'link', label: 'Linking', c: '#0E7C86' }, { k: 'flap', label: 'Flap T', c: '#5B5BD6' },
  { k: 'r', label: 'American R', c: '#D4952A' }, { k: 'tune', label: 'Intonation', c: '#5B5BD6' },
] as const;

export default function Reader({ id }: { id: string }) {
  const { data: story, error } = useAsync(() => loadStory(id), [id]);
  if (error) return <div className="screen"><ErrorBox text={error} onRetry={() => location.reload()} /></div>;
  if (!story) return <div className="screen"><Loading lines={5} /></div>;
  return <ReaderInner key={story.id} story={story} />;
}

type Res = { r: Assessment; scope: string; first: number; saved?: boolean };
const PI_KEY = (id: string) => 'accentlab.para.' + id;
const loadPi = (id: string, n: number) => { try { const v = Number(localStorage.getItem(PI_KEY(id))); return Number.isFinite(v) && v >= 0 && v <= n ? v : 0; } catch { return 0; } };

function ReaderInner({ story }: { story: Story }) {
  const slowPref = useStore(s => s.settings.slowReading);
  const reading = useStore(s => s.reading);
  const slow = slowPref && !!story.slowAudio && !!story.slowTimes;
  const playingId = usePlayingAny();
  const playing = playingId.startsWith('story:');
  const nP = story.paragraphs.length;
  // current paragraph; nP means the summary after the last one
  const [pi, setPiRaw] = useState(() => loadPi(story.id, nP));
  const setPi = (v: number) => { setPiRaw(v); try { localStorage.setItem(PI_KEY(story.id), String(v)); } catch { /* ignore */ } window.scrollTo({ top: 0 }); };
  const [cur, setCur] = useState(-1);
  const [pos, setPos] = useState(0);
  const [study, setStudy] = useState(false);
  const [wordSheet, setWordSheet] = useState<number | null>(null);
  const [sentSheet, setSentSheet] = useState<number | null>(null);
  const [feat, setFeat] = useState<Record<string, boolean>>({ stress: true, weak: true, link: true, flap: true, r: false, tune: true });
  const [results, setResults] = useState<Record<number, Res>>({});
  const rec = useRecorder();
  const [live, setLive] = useState<Set<number>>(new Set());

  const sents = useMemo(() => story.paragraphs.flatMap(p => p.sents), [story]);
  const toks = useMemo(() => story.paragraphs.flatMap(p => p.sents.flatMap(s => s.toks)), [story]);
  const T = slow ? story.slowTimes! : story.times;
  const file = slow ? story.slowAudio! : story.audio;
  useEffect(() => { preload([file]); }, [file]);

  // best saved score of every paragraph (from attempt history), for the dots and the summary
  const best = useMemo(() => {
    const m: Record<number, number> = {};
    for (const a of reading) if (a.story === story.id && a.scope.startsWith('p')) { const k = Number(a.scope.slice(1)); m[k] = Math.max(m[k] ?? 0, a.overall); }
    return m;
  }, [reading, story.id]);

  const para = pi < nP ? story.paragraphs[pi] : null;
  const range = useMemo(() => {
    if (!para) return [0, 0] as const;
    return [para.sents[0].a, para.sents[para.sents.length - 1].b] as const;
  }, [para]);
  const pStart = para ? T[range[0]][0] : 0;
  const pEnd = para ? T[range[1] - 1][1] + 0.2 : 0;
  const result = results[pi] || null;

  const tokAt = useCallback((t: number, TT = T) => {
    let lo = 0, hi = TT.length - 1, b = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (TT[m][0] <= t + 0.05) { b = m; lo = m + 1; } else hi = m - 1; }
    return b;
  }, [T]);
  const sentOf = useCallback((i: number) => sents.findIndex(s => i >= s.a && i < s.b), [sents]);
  const paraSents = useMemo(() => para ? para.sents.map(s => sents.indexOf(s)) : [], [para, sents]);

  const playIn = useCallback((f: string, TT: [number, number][], from: number, to: number) => {
    touch();
    playRange(f, Math.max(0, from - 0.05), to, {
      id: 'story:' + story.id,
      onTime: t => { setPos(t); setCur(tokAt(t, TT)); },
      onEnd: () => { setCur(-1); setPos(TT[range[0]] ? TT[range[0]][0] : 0); },
    }).catch(() => {});
  }, [story.id, tokAt, range]);
  const play = (from: number, to: number) => playIn(file, T, from, to);
  const curSi = () => { const si = cur >= 0 ? sentOf(cur) : sentOf(Math.max(range[0], tokAt(pos))); return paraSents.includes(si) ? si : paraSents[0]; };
  const toggle = () => {
    if (playing) { pauseAudio(); return; }
    play(pos >= pStart && pos < pEnd - 0.3 ? pos : pStart, pEnd);
  };
  const switchSpeed = () => {
    if (!story.slowAudio) return;
    const was = playing;
    const si = curSi();
    stopAudio();
    setSettings({ slowReading: !slowPref });
    const NT = !slowPref ? story.slowTimes! : story.times;
    const NF = !slowPref ? story.slowAudio! : story.audio;
    const p = NT[sents[si].a][0];
    setPos(p);
    if (was) setTimeout(() => playIn(NF, NT, p, NT[range[1] - 1][1] + 0.2), 30);
  };
  useEffect(() => () => stopAudio(), []);
  useEffect(() => { stopAudio(); setCur(-1); setPos(pStart); setLive(new Set()); rec.reset(); }, [pi]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!playing && cur < 0) setPos(pStart); }, [slow]); // eslint-disable-line react-hooks/exhaustive-deps

  const keys = useMemo(() => story.keys.slice(range[0], range[1]), [story, range]);
  const text = useMemo(() => toks.slice(range[0], range[1]).map(t => (t.pre || '') + t.d + (t.post || '')).join(' '), [toks, range]);
  useEffect(() => {
    if (rec.state !== 'listening' || !rec.partial) return;
    const H = heardTokens(rec.partial, keys);
    const a = align(keys.slice(0, Math.min(keys.length, H.length + 8)), H.map(h => h.k));
    setLive(new Set(a.map((x, i) => x.st === 'ok' ? i + range[0] : -1).filter(i => i >= 0)));
  }, [rec.partial, rec.state, keys, range]);
  useEffect(() => {
    if (rec.state === 'done' && rec.result) { const r = rec.result; setResults(o => ({ ...o, [pi]: { r, scope: 'p' + pi, first: range[0] } })); setLive(new Set()); }
    if (rec.state === 'error') setLive(new Set());
  }, [rec.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const curSent = cur >= 0 ? sentOf(cur) : -1;
  const resultFor = (i: number) => {
    if (!result || study) return null;
    const k = i - result.first;
    return k >= 0 && k < result.r.words.length ? result.r.words[k] : null;
  };

  const renderTok = (t: Tok, s: { a: number; b: number; tune: string }, last: boolean) => {
    const f = t.f || 0;
    const cls = ['tok'];
    if (t.i === cur) cls.push('now'); else if (curSent >= 0 && t.i >= sents[curSent].a && t.i < sents[curSent].b) cls.push('sent');
    if (study) {
      if (feat.stress && f & F.CONTENT) cls.push('content');
      if (feat.weak && f & F.WEAK) cls.push('weak');
      if (feat.flap && f & F.FLAP) cls.push('f-flap');
      if (feat.r && f & F.RHOTIC) cls.push('f-r');
    } else if (cur < 0) {
      const w = resultFor(t.i);
      if (w) cls.push(w.status === 'good' ? 'g' : w.status === 'fair' ? 'y' : 'r');
      else if (live.has(t.i)) cls.push('heard');
    }
    return (
      <Fragment key={t.i}>
        {t.pre}<span className={cls.join(' ')} onClick={() => { touch(); setWordSheet(t.i); }}>{t.d}</span>{t.post}
        {study && feat.tune && last && s.tune !== 'none' && <span className="into" aria-label={s.tune === 'rise' ? 'rising intonation' : 'falling intonation'}>{s.tune === 'rise' ? '↗' : '↘'}</span>}
        {study && feat.link && f & F.LINK ? <span className="lk" aria-hidden="true">‿</span> : ' '}
      </Fragment>
    );
  };

  const done = Object.keys(best).length;
  const textScore = done === nP ? Math.round(story.paragraphs.reduce((a, p, k) => a + best[k] * p.sents.reduce((n, x) => n + x.toks.length, 0), 0) / toks.length) : null;
  const recorded = !!result;
  const startRec = () => { stopAudio(); setCur(-1); if (result) setResults(o => { const n = { ...o }; delete n[pi]; return n; }); rec.start(text, keys, 'passage'); };
  const last = pi === nP - 1;

  return (
    <div className="screen reader">
      <div className="topbar">
        <button className="icon-btn" onClick={() => back('/reading')} aria-label="Back to the library"><Icon name="back" /></button>
        <div className="title-sm">{story.title}</div>
      </div>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{story.level || 'C1'} · {story.topic} · {story.minutes} min · {story.words} words</div>

      <div className="para-dots" role="group" aria-label="Paragraphs">
        {story.paragraphs.map((_, k) => (
          <button key={k} aria-current={k === pi ? 'step' : undefined} aria-label={`Paragraph ${k + 1}${best[k] !== undefined ? `, best score ${best[k]}` : ''}`} onClick={() => setPi(k)}
            className={best[k] === undefined ? '' : best[k] >= 90 ? 'good' : best[k] >= 70 ? 'warn' : 'bad'}>{k + 1}</button>
        ))}
        <button aria-current={pi === nP ? 'step' : undefined} aria-label="Summary" onClick={() => setPi(nP)} className="sum"><Icon name="check" /></button>
      </div>

      {para ? (<>
        <div className="row para-head">
          <div className="grow"><b>Paragraph {pi + 1}</b> <span className="muted">of {nP}</span></div>
          <button className="chip" aria-pressed={study} onClick={() => setStudy(v => !v)}>Study marks</button>
        </div>
        {study && (
          <div className="feature-toggles">
            {FEATURES.map(x => <button key={x.k} className="ft" aria-pressed={!!feat[x.k]} onClick={() => setFeat(o => ({ ...o, [x.k]: !o[x.k] }))}><i style={{ background: x.c }} />{x.label}</button>)}
          </div>
        )}

        <article className={`passage${study ? ' study' : ''}`} lang="en-US">
          <p>
            {para.sents.map(s => {
              const si = sents.indexOf(s);
              return (
                <Fragment key={si}>
                  {study && <button className="pill accent" style={{ marginRight: 4, verticalAlign: 2 }} onClick={() => setSentSheet(si)} aria-label={`Notes for sentence ${si + 1}`}>¶</button>}
                  {s.toks.map((t, k) => renderTok(t, s, k === s.toks.length - 1))}
                </Fragment>
              );
            })}
          </p>
        </article>

        {result && (
          <div className="card stack" style={{ marginBottom: 10 }}>
            <ReadingResults key={pi} story={story} toks={toks} result={result} onWord={i => setWordSheet(i)} onSentence={si => setSentSheet(si)} onAgain={() => { setResults(o => { const n = { ...o }; delete n[pi]; return n; }); rec.reset(); }} />
          </div>
        )}

        <div className="read-dock" role="group" aria-label="Listen and record">
          <RecordButton part="status" mode="passage" rec={rec} onStart={startRec}
            labelIdle={result ? `Saved · score ${result.r.overall}. Details below the text` : playing ? 'Listening to the model…' : 'Listen first, then tap the mic and read'} />
          <div className="row dock-row">
            <button className="icon-btn" disabled={pi === 0} onClick={() => setPi(pi - 1)} aria-label="Previous paragraph"><Icon name="back" /></button>
            <button className="dock-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play the model'}><Icon name={playing ? 'pause' : 'play'} /></button>
            <button className="dock-spd" disabled={!story.slowAudio} onClick={switchSpeed} aria-label={slow ? 'Switch to natural speed' : 'Switch to the slow recording'}>{slow ? 'Slow' : '1×'}</button>
            <RecordButton part="button" mode="passage" rec={rec} onStart={startRec} />
            <button className={`btn grow dock-next${recorded ? ' primary' : ''}`} onClick={() => setPi(pi + 1)} aria-label={last ? 'Finish the text' : 'Next paragraph'}>{last ? 'Finish' : 'Next'} <Icon name="next" /></button>
          </div>
        </div>
      </>) : (
        <div className="card stack">
          <div className="row">
            <ScoreRing value={textScore} label="text" />
            <div className="grow">
              <div style={{ fontWeight: 800, fontSize: 19 }}>{textScore === null ? `${done} of ${nP} paragraphs read` : 'Whole text read.'}</div>
              <div className="small muted">{textScore === null ? 'Read every paragraph to get a score for the whole text.' : 'Your best score of each paragraph, weighted by length.'}</div>
            </div>
          </div>
          {story.paragraphs.map((_, k) => (
            <button key={k} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setPi(k)}>
              <span className={`pill ${best[k] === undefined ? '' : best[k] >= 90 ? 'good' : best[k] >= 70 ? 'warn' : 'bad'}`}>{best[k] ?? '–'}</span>
              <span className="grow">Paragraph {k + 1}<br /><span className="small muted">{story.paragraphs[k].sents[0].toks.slice(0, 7).map(t => (t.pre || '') + t.d + (t.post || '')).join(' ').replace(/[,;:]$/, '')}…</span></span>
              <Icon name="next" size={18} />
            </button>
          ))}
          <div className="row">
            <button className="btn grow" onClick={() => setPi(0)}>Start again</button>
            <button className="btn primary grow" onClick={() => back('/reading')}>Library</button>
          </div>
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

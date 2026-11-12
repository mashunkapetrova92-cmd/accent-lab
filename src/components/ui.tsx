import { useEffect, useRef, useState, type ReactNode } from 'react';
import { clearAudioError, useAudioError } from '../lib/audio';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { playClip, stop as stopAudio, usePlaying } from '../lib/audio';
import type { Clip, WordItem } from '../data/types';
import type { Metric } from '../assess/types';

export function PlayButton({ clip, slow, label, onPlay }: { clip: Clip | null; slow?: boolean; label?: string; onPlay?: () => void }) {
  const hasSlow = !!clip && clip.length >= 6;
  const id = clip ? `${clip[0]}:${clip[1]}:${slow && hasSlow ? 's' : 'n'}` : 'none';
  const on = usePlaying(id);
  const off = !clip || (!!slow && !hasSlow);
  return (
    <button className={`play${slow ? ' slow' : ''}${on ? ' playing' : ''}`} disabled={off}
      aria-label={label || (slow ? 'Play slowly' : 'Play')}
      onClick={() => { onPlay?.(); if (on) { stopAudio(); return; } playClip(clip, !!slow, id).catch(() => {}); }}>
      <Icon name={on ? 'pause' : slow ? 'slow' : 'play'} />
    </button>
  );
}

/** Word with the target letters highlighted */
export function HlWord({ w }: { w: WordItem }) {
  return <span className="w">{w.parts.map((p, i) => p.hl ? <mark key={i}>{p.t}</mark> : <span key={i}>{p.t}</span>)}</span>;
}

const UNITS = ['tʃ', 'dʒ', 'eɪ', 'oʊ', 'aɪ', 'aʊ', 'ɔɪ', 'n̩', 'l̩', 'ɫ̩'];
const VOWEL = /[ɑæʌɔaeɛɪiouʊəɚɝ]/;
/** Split an IPA string into phoneme units (r-colored vowels joined when r ends the syllable). */
export function ipaUnits(ipa: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < ipa.length;) {
    const two = ipa.slice(i, i + 2);
    if (UNITS.includes(two)) { out.push(two); i += 2; continue; }
    const c = ipa[i];
    if ('ɑɔɪɛʊ'.includes(c) && ipa[i + 1] === 'r' && !VOWEL.test(ipa[i + 2] || '')) { out.push(c + 'r'); i += 2; continue; }
    out.push(c); i++;
  }
  return out;
}
export function IpaMark({ ipa, marks, className = '' }: { ipa: string; marks?: string[]; className?: string }) {
  if (!marks?.length) return <span className={`ipa ${className}`}>{ipa}</span>;
  const u = ipaUnits(ipa);
  return <span className={`ipa ${className}`}>{u.map((x, i) => marks.includes(x) ? <mark key={i}>{x}</mark> : x)}</span>;
}

export function ScoreRing({ value, size = 'lg', label, color }: { value: number | null; size?: 'lg' | 'sm'; label?: string; color?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (value === null) return;
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 900); setShown(Math.round(value * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const c = color || (value === null ? 'var(--muted)' : value >= 90 ? 'var(--good)' : value >= 70 ? 'var(--warn)' : 'var(--bad)');
  const R = 46, L = 2 * Math.PI * R;
  return (
    <div className={`score-ring ${size === 'sm' ? 'sm' : ''}`}>
      <svg viewBox="0 0 108 108"><circle cx="54" cy="54" r={R} fill="none" stroke="var(--line)" strokeWidth="9" />
        <circle cx="54" cy="54" r={R} fill="none" stroke={c} strokeWidth="9" strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - shown / 100)} /></svg>
      <div className="v"><div>{value === null ? '–' : shown}{label && size === 'lg' && <small>{label}</small>}</div></div>
    </div>
  );
}

export function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="metrics">
      {metrics.map(m => (
        <div key={m.key} className={`metric${m.value === null ? ' na' : ''}`} title={m.note}>
          <div className="row" style={{ gap: 6, justifyContent: 'space-between' }}>
            <span className="k">{m.label}</span>
            <span className={`tag ${m.kind === 'measured' ? 'm' : m.kind === 'estimated' ? 'e' : 'n'}`}>{m.kind === 'measured' ? 'Measured' : m.kind === 'estimated' ? 'Estimated' : 'Not measured'}</span>
          </div>
          {m.value !== null ? (
            <>
              <div className="val">{m.value}{m.unit ? <small> {m.unit}</small> : <small>/100</small>}</div>
              {!m.unit && <div className="meter"><i style={{ width: `${m.value}%`, background: m.value >= 85 ? 'var(--good)' : m.value >= 65 ? 'var(--warn)' : 'var(--bad)' }} /></div>}
            </>
          ) : <div className="val">{m.note}</div>}
        </div>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
        <div className="grab" />
        {children}
      </div>
    </>, document.body,
  );
}

const COLORS = ['#0E7C86', '#D4952A', '#5B5BD6', '#23935F', '#CF3F4F', '#33A9A6'];
export function Celebrate({ title, text, onDone }: { title: string; text: string; onDone: () => void }) {
  const [pieces] = useState(() => Array.from({ length: 36 }, (_, i) => ({
    dx: `${Math.round((Math.random() - .5) * 520)}px`, dy: `${Math.round(-60 - Math.random() * 380)}px`, rot: `${Math.round(Math.random() * 720 - 360)}deg`,
    c: COLORS[i % COLORS.length], delay: Math.random() * 0.15,
  })));
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [onDone]);
  return createPortal(
    <div className="celebrate" onClick={onDone}>
      {pieces.map((p, i) => <i key={i} className="burst" style={{ background: p.c, animationDelay: `${p.delay}s`, ['--dx' as string]: p.dx, ['--dy' as string]: p.dy, ['--rot' as string]: p.rot }} />)}
      <div className="msg"><b>{title}</b><span className="muted">{text}</span></div>
    </div>, document.body,
  );
}

export function Level({ v }: { v: number }) {
  return <div className="level" aria-hidden="true">{[0.5, 0.8, 1, 0.8, 0.5, 0.7, 0.9].map((k, i) => <i key={i} style={{ height: `${4 + Math.min(20, v * 26 * k)}px` }} />)}</div>;
}

export function Loading({ lines = 3 }: { lines?: number }) {
  return <div className="stack" aria-busy="true">{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ height: i ? 64 : 120 }} />)}</div>;
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return <div className="notice bad" role="alert">{text}{onRetry && <div style={{ marginTop: 8 }}><button className="btn small" onClick={onRetry}>Try again</button></div>}</div>;
}

/** Shows playback problems (no connection, file missing) instead of failing silently. */
export function AudioToast() {
  const msg = useAudioError();
  useEffect(() => { if (!msg) return; const t = setTimeout(clearAudioError, 6000); return () => clearTimeout(t); }, [msg]);
  if (!msg) return null;
  return createPortal(<div className="toast" role="alert" onClick={clearAudioError}>{msg}</div>, document.body);
}

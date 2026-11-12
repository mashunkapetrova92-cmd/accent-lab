import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { Level } from './ui';
import { canRecord, engineLabel, markNativeBroken, pickEngine, type Assessment, type Session, type StartOptions } from '../assess';
import { BROKEN_CODES } from '../assess/browser';
import { MODEL_MB, useModel } from '../assess/asr';
import { stop as stopAudio } from '../lib/audio';
import { learnFrom, touch } from '../lib/store';

export type RecState = 'idle' | 'starting' | 'listening' | 'analyzing' | 'done' | 'error';
type Mode = StartOptions['mode'];

export function useRecorder() {
  const [state, setState] = useState<RecState>('idle');
  const [level, setLevel] = useState(0);
  const [partial, setPartial] = useState('');
  const [result, setResult] = useState<Assessment | null>(null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [engineId, setEngineId] = useState('');
  const session = useRef<Session | null>(null);
  const stopping = useRef(false);
  const stopAsked = useRef(false);
  const alive = useRef(true);

  const fail = (e: unknown) => {
    const code = (e as { code?: string }).code || '';
    if (BROKEN_CODES.has(code)) markNativeBroken();
    setError((e as Error).message || String(e)); setErrorCode(code); setState('error');
  };

  const stop = useCallback(async () => {
    if (!session.current) { stopAsked.current = true; return; }
    if (stopping.current) return;
    stopping.current = true;
    setState('analyzing'); setLevel(0);
    try {
      const r = await session.current.stop();
      if (!alive.current) return;
      if (r.checked !== false) learnFrom(r);
      (window as unknown as { __lastResult?: Assessment }).__lastResult = r; // read by the automated tests
      setResult(r); setState('done');
    } catch (e) {
      if (alive.current) fail(e);
    } finally { session.current = null; stopping.current = false; }
  }, []);

  const start = useCallback(async (reference: string, refKeys: string[], mode: Mode, word?: { alt?: string[]; check?: 'p' | 'o' | 'n'; ref?: number }) => {
    touch(); stopAudio();
    const can = canRecord(mode);
    if (!can.ok) { setError(can.reason!); setErrorCode('unsupported'); setState('error'); return; }
    setResult(null); setError(''); setErrorCode(''); setPartial(''); setState('starting');
    stopAsked.current = false;
    const engine = pickEngine(mode);
    setEngineId(engine.id);
    try {
      session.current = await engine.start({
        reference, refKeys, mode, alternatives: word?.alt, check: mode === 'word' ? word?.check : undefined, ref: word?.ref,
        onPartial: t => setPartial(t),
        onLevel: v => setLevel(v),
        onEnded: () => { stop(); },
      });
      if (!alive.current) { session.current.cancel(); return; }
      setState('listening');
      if (stopAsked.current) stop();
    } catch (e) {
      session.current = null;
      if (alive.current) fail(e);
    }
  }, [stop]);

  const reset = useCallback(() => { session.current?.cancel(); session.current = null; setState('idle'); setResult(null); setError(''); setPartial(''); }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; session.current?.cancel(); }; }, []);
  return { state, level, partial, result, error, errorCode, engineId, start, stop, reset };
}

export function RecordButton({ rec, onStart, big, labelIdle = 'Tap to record', mode = 'sentence' }: { rec: ReturnType<typeof useRecorder>; onStart: () => void; big?: boolean; labelIdle?: string; mode?: Mode }) {
  const on = rec.state === 'listening' || rec.state === 'starting';
  const busy = rec.state === 'analyzing';
  const model = useModel();
  const usesModel = rec.engineId === 'local' || (rec.state === 'idle' && pickEngine(mode).id === 'local');
  const downloading = usesModel && model.status === 'loading' && (on || busy);
  return (
    <div className="rec-wrap">
      <button className={`rec${on ? ' on' : ''}${big ? ' big' : ''}`} disabled={busy} aria-label={on ? 'Stop recording' : 'Start recording'}
        onClick={() => (on ? rec.stop() : onStart())}>
        {busy ? <svg className="spin" viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="40 20" /></svg> : <Icon name={on ? 'stop' : 'mic'} />}
      </button>
      {on ? <Level v={rec.level} /> : null}
      <div className="rec-label">{busy ? (downloading ? 'Preparing the speech checker…' : 'Checking…') : rec.state === 'starting' ? 'Starting the microphone…' : on ? (mode === 'word' ? 'Listening — say the word' : 'Listening — tap to finish') : labelIdle}</div>
      {on && rec.engineId === 'browser' && <div className="live-text">{rec.partial ? `“${rec.partial.split(' ').slice(-10).join(' ')}”` : 'Start speaking'}</div>}
      {on && rec.engineId !== 'browser' && mode === 'passage' && rec.partial && <div className="live-text">“{rec.partial.split(' ').slice(-10).join(' ')}”</div>}
      {downloading && (
        <div className="model-dl" role="status">
          <div className="bar"><i style={{ width: `${Math.round(model.progress * 100)}%` }} /></div>
          <span className="small muted">One-time download of the speech checker (about {MODEL_MB} MB): {Math.round(model.progress * 100)}%</span>
        </div>
      )}
      {rec.state === 'error' && <div className="notice bad" role="alert" style={{ maxWidth: 440 }}>{rec.error}</div>}
      {(rec.state === 'idle' || rec.state === 'done') && <div className="small muted">Checked by {engineLabel(mode)}</div>}
    </div>
  );
}

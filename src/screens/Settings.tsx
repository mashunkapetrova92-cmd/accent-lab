import { useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { resetAll, setSettings, useStore, type EnginePref } from '../lib/store';
import { testAzure } from '../assess/azure';
import { browserSupported, IOS_STANDALONE } from '../assess/browser';
import { loadModel, MODEL_MB, useModel } from '../assess/asr';
import { engineLabel } from '../assess';
import { url } from '../data/load';
import { back } from '../router';

type Files = { files: [string, number][] };
type Dl = { done: number; total: number; bytes: number; err?: string; group?: string };

const ENGINES: { id: EnginePref; title: string; tag: string; text: string }[] = [
  { id: 'auto', title: 'Automatic', tag: 'Recommended', text: 'Uses Azure when it is connected. Otherwise single words are checked on this device against the words they are confused with (“sheep” or “ship”), and sentences by the browser’s recognizer where it works well, or on this device.' },
  { id: 'local', title: 'On-device recognition', tag: 'Works in every browser', text: `A speech model runs inside the app, also offline and in apps opened from the Home Screen. Downloads once (about ${MODEL_MB} MB). Checks which words were understood; it cannot score individual sounds.` },
  { id: 'browser', title: 'Browser speech recognition', tag: 'Shows words live', text: 'The recognizer built into Chrome, Edge or Safari. Needs the internet. Some browsers (Firefox, Brave, Opera, apps opened from the iPhone Home Screen) do not provide it.' },
  { id: 'azure', title: 'Azure pronunciation assessment', tag: 'Sound by sound', text: 'Microsoft Azure AI Speech scores every sound, says which sound you produced instead, and measures fluency and prosody. Needs your own free Azure key behind a small token server (see the setup guide).' },
];

export default function Settings() {
  const s = useStore(x => x.settings);
  const [endpoint, setEndpoint] = useState(s.azureEndpoint);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [dl, setDl] = useState<Dl | null>(null);
  const [files, setFiles] = useState<Files | null>(null);
  const model = useModel();
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;

  useEffect(() => { fetch(url('data/files.json')).then(r => r.json()).then(setFiles).catch(() => {}); }, []);
  useEffect(() => {
    const h = (e: MessageEvent) => { if (e.data?.type === 'cache-progress') setDl(d => ({ ...e.data, group: d?.group })); };
    navigator.serviceWorker?.addEventListener('message', h);
    return () => navigator.serviceWorker?.removeEventListener('message', h);
  }, []);
  // the sound course: its recordings and data; the texts: their recordings, the word recordings and the text data
  const isText = (f: string) => f.startsWith('audio/p/') || f.startsWith('audio/w/') || f.startsWith('data/stories/') || f === 'data/words.json' || f === 'data/checks.json';
  const group = (g: 'sounds' | 'texts') => (files?.files || []).filter(f => g === 'texts' ? isText(f[0]) : !isText(f[0]));
  const mb = (g: 'sounds' | 'texts') => Math.max(1, Math.round(group(g).reduce((a, f) => a + f[1], 0) / 1e6));

  const download = async (g: 'sounds' | 'texts') => {
    const reg = await navigator.serviceWorker?.ready.catch(() => null);
    if (!reg?.active || !files) { setDl({ done: 0, total: 0, bytes: 0, err: 'Saving for offline use works when the app is opened from its https address.', group: g }); return; }
    const list = group(g);
    setDl({ done: 0, total: list.length, bytes: 0, group: g });
    reg.active.postMessage({ type: 'cache-all', urls: list.map(f => url(f[0])) });
  };

  return (
    <div className="screen">
      <div className="topbar"><button className="icon-btn" onClick={() => back('/sounds')} aria-label="Back"><Icon name="back" /></button><div className="title-sm">Settings</div></div>

      <h2 className="section-title" style={{ marginTop: 6 }}>Speech checking</h2>
      <div className="stack" role="radiogroup" aria-label="Speech checking">
        {ENGINES.map(e => (
          <button key={e.id} className="radio" role="radio" aria-checked={s.engine === e.id} onClick={() => setSettings({ engine: e.id })}>
            <span className="dot" />
            <span><b>{e.title}</b> <span className={`pill${e.id === 'auto' || e.id === 'azure' ? ' accent' : ''}`}>{e.tag}</span><br />
              <span className="small muted">{e.text}{e.id === 'browser' && !browserSupported() ? ' Not available in this browser.' : ''}{e.id === 'browser' && IOS_STANDALONE ? ' Not available in this Home Screen app.' : ''}</span></span>
          </button>
        ))}
        <div className="small muted">Now in use: single words — {engineLabel('word')}; sentences and texts — {engineLabel('passage')}.</div>
        {(s.engine === 'auto' || s.engine === 'local') && (
          <div className="card stack">
            <div className="row"><b className="grow">On-device speech model</b><span className="pill">{model.status === 'ready' ? 'Ready' : model.status === 'loading' ? `${Math.round(model.progress * 100)}%` : `${MODEL_MB} MB`}</span></div>
            {model.status === 'loading' && <div className="bar"><i style={{ width: `${Math.round(model.progress * 100)}%` }} /></div>}
            {model.status === 'error' && <div className="notice bad">{model.error.includes('fetch') || !navigator.onLine ? 'The download needs an internet connection. Connect and try again.' : model.error}</div>}
            <p className="small muted">It downloads automatically the first time you record. Download it now to practise offline or on a slow connection later.</p>
            <button className="btn" disabled={model.status === 'loading' || model.status === 'ready'} onClick={() => { loadModel().catch(() => {}); }}><Icon name="download" /> {model.status === 'ready' ? 'Downloaded' : 'Download now'}</button>
          </div>
        )}
        {(s.engine === 'azure' || s.engine === 'auto') && (
          <div className="card stack">
            <div className="field">
              <label htmlFor="ep">Azure token server address {s.engine === 'auto' && <span className="small muted">(optional)</span>}</label>
              <input id="ep" className="input" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://accent-lab-token.your-name.workers.dev" value={endpoint} onChange={e => setEndpoint(e.target.value.trim())} />
              <span className="small muted">The server returns a temporary token. Your Azure key stays on the server and never reaches this app.</span>
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn primary" disabled={!endpoint || busy} onClick={async () => {
                setBusy(true); setTest(null);
                try { const t = await testAzure(endpoint); setSettings({ azureEndpoint: endpoint }); setTest({ ok: true, text: t }); }
                catch (e) { setTest({ ok: false, text: (e as Error).message }); }
                finally { setBusy(false); }
              }}>{busy ? 'Testing…' : 'Save and test'}</button>
              {s.azureEndpoint && <button className="btn" onClick={() => { setSettings({ azureEndpoint: '' }); setEndpoint(''); setTest(null); }}>Disconnect</button>}
            </div>
            {test && <div className={`notice ${test.ok ? 'info' : 'bad'}`}>{test.text}</div>}
            {s.engine === 'azure' && !s.azureEndpoint && <div className="notice">Until a working address is saved, recordings are checked on this device.</div>}
          </div>
        )}
      </div>

      <h2 className="section-title">Listening</h2>
      <div className="card stack">
        <label className="row" style={{ cursor: 'pointer' }}>
          <span className="grow"><b>Several voices in listening drills</b><br /><span className="small muted">High-variability training: drills use three American voices so you learn the sound, not one speaker.</span></span>
          <input type="checkbox" checked={s.hvpt} onChange={e => setSettings({ hvpt: e.target.checked })} style={{ width: 24, height: 24, accentColor: 'var(--accent)' }} />
        </label>
        <label className="row" style={{ cursor: 'pointer' }}>
          <span className="grow"><b>Read texts slowly</b><br /><span className="small muted">Texts play from a slower recording by the same voice (natural, not sped down).</span></span>
          <input type="checkbox" checked={s.slowReading} onChange={e => setSettings({ slowReading: e.target.checked })} style={{ width: 24, height: 24, accentColor: 'var(--accent)' }} />
        </label>
      </div>

      <h2 className="section-title">Offline use</h2>
      <div className="card stack">
        <p className="small">Lessons you open are saved automatically. You can also save recordings in advance.</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => download('sounds')} disabled={!!dl && !dl.err && dl.done < dl.total}><Icon name="download" /> Sounds course{files ? ` · ${mb('sounds')} MB` : ''}</button>
          <button className="btn" onClick={() => download('texts')} disabled={!!dl && !dl.err && dl.done < dl.total}><Icon name="download" /> All 100 texts{files ? ` · ${mb('texts')} MB` : ''}</button>
        </div>
        {dl && (dl.err ? <div className="notice bad">{dl.err}</div> : <div><div className="bar"><i style={{ width: `${dl.total ? dl.done / dl.total * 100 : 0}%` }} /></div><div className="small muted" style={{ marginTop: 6 }}>{dl.done} of {dl.total} files{dl.done >= dl.total ? ' — saved' : ''}</div></div>)}
      </div>

      <h2 className="section-title">Install on your phone</h2>
      <div className="card small stack">
        {standalone ? <p>The app is installed and running from your Home Screen. Recording works here with automatic or on-device checking.</p> : (
          <>
            <p><b>iPhone (Safari):</b> tap <b>Share</b> → <b>Add to Home Screen</b> → <b>Add</b>.</p>
            <p><b>Android (Chrome):</b> tap <b>⋮</b> → <b>Add to Home screen</b> or <b>Install app</b>.</p>
            <p>Open the app from its icon and allow the microphone when asked.</p>
          </>
        )}
      </div>

      <h2 className="section-title">Data</h2>
      <div className="card stack">
        <p className="small muted">Progress, scores and settings are stored only on this device.</p>
        <button className="btn" style={confirm ? { background: 'var(--bad)', color: '#fff', boxShadow: 'none' } : undefined}
          onClick={async () => { if (!confirm) { setConfirm(true); setTimeout(() => setConfirm(false), 4000); return; } await resetAll(); setConfirm(false); }}>
          {confirm ? 'Tap again to erase all progress' : 'Reset all progress'}
        </button>
      </div>

      <h2 className="section-title">About</h2>
      <div className="card small muted stack">
        <p>Target accent: General American. Model audio is synthesized with Microsoft neural voices: Ava for texts and sentences, the English-only Ava voice for single words, with Andrew and Aria in listening drills. Every model word was checked automatically for clarity. Transcriptions come from the CMU Pronouncing Dictionary with flapping and weak forms applied, and were checked by hand where the dictionary is missing or ambiguous.</p>
        <p>The on-device checker is Whisper base.en (OpenAI, MIT license), run with Transformers.js and ONNX Runtime.</p>
        <p>Scores labeled “Measured” come directly from the checker. “Estimated” values are derived from other measurements. “Not measured” means the current checker cannot assess that feature reliably.</p>
        <p>Version {__BUILD__}</p>
      </div>
    </div>
  );
}

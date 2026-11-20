// Which checker runs a recording.
// Azure when the learner has connected it; otherwise the on-device model for single words (a forced choice
// between the word and its confusable neighbours is far more reliable than free recognition), and for
// sentences and texts the browser's own recognizer where it works well, or the on-device model.
import { getState } from '../lib/store';
import { browserEngine, browserSupported, IS_IOS, IOS_STANDALONE, nativeBroken } from './browser';
export { markNativeBroken } from './browser';
import { localEngine } from './local';
import { localSupported } from './asr';
import { azureEngine } from './azure';
import type { Engine, StartOptions } from './types';

type Mode = StartOptions['mode'];

export function pickEngine(mode: Mode): Engine {
  // automated tests (development server only) can inject a scripted engine
  if (import.meta.env.DEV && (window as unknown as { __testEngine?: Engine }).__testEngine) return (window as unknown as { __testEngine: Engine }).__testEngine;
  const s = getState().settings;
  // Azure needs the internet; without it the recording is checked on this device instead
  if ((s.engine === 'azure' || s.engine === 'auto') && s.azureEndpoint && navigator.onLine !== false) return azureEngine(s.azureEndpoint);
  if (s.engine === 'local') return localSupported() ? localEngine : browserEngine;
  const offline = navigator.onLine === false; // the browsers' own recognizers need the internet too
  if (s.engine === 'browser') return browserSupported() && !(offline && localSupported()) ? browserEngine : localEngine;
  if (!localSupported()) return browserEngine;
  if (mode === 'word') return localEngine;
  if (IS_IOS || IOS_STANDALONE || nativeBroken() || !browserSupported() || offline) return localEngine;
  return browserEngine;
}

export function engineLabel(mode: Mode = 'sentence'): string {
  const e = pickEngine(mode);
  return e.id === 'azure' ? 'Azure pronunciation assessment' : e.id === 'local' ? 'on-device speech recognition' : 'the browser’s speech recognition';
}

export function canRecord(mode: Mode = 'sentence'): { ok: boolean; reason?: string } {
  if (import.meta.env.DEV && (window as unknown as { __testEngine?: Engine }).__testEngine) return { ok: true };
  const e = pickEngine(mode);
  if (e.id === 'browser' && !browserSupported()) return { ok: false, reason: 'This browser cannot record speech. Update it, or use Safari, Chrome, Edge or Firefox.' };
  if (!window.isSecureContext) return { ok: false, reason: 'The microphone only works when the app is opened over HTTPS. Open the published https link.' };
  return { ok: true };
}

export * from './types';

// Azure AI Speech pronunciation assessment: phoneme, word, fluency and prosody scores.
// The key never reaches the browser: a small server you control exchanges it for a 10-minute token.
import { align, key as keyOf, shownWord } from '../lib/text';
import { PcmRecorder } from './pcm';
import { AssessError, statusOf, type Assessment, type Engine, type Metric, type PhonemeResult, type Session, type StartOptions, type WordResult } from './types';

let tokenCache: { token: string; region: string; until: number; endpoint: string } | null = null;

export async function getToken(endpoint: string): Promise<{ token: string; region: string }> {
  if (tokenCache && tokenCache.endpoint === endpoint && Date.now() < tokenCache.until) return tokenCache;
  let r: Response;
  try { r = await fetch(endpoint, { method: 'GET', cache: 'no-store' }); }
  catch {
    throw new AssessError('network', navigator.onLine === false
      ? 'No internet connection: Azure checking needs the internet.'
      : 'Could not reach your token server. Check the address in Settings, that ALLOWED_ORIGINS on the server is exactly this app’s address (' + location.origin + '), and your internet connection.');
  }
  if (!r.ok) {
    const why = await r.json().then((j: { error?: string }) => j?.error || '', () => '');
    throw new AssessError('token', `Your token server answered with an error (${r.status}${why ? `: ${why}` : ''}). Check AZURE_SPEECH_KEY and AZURE_REGION on the server.`);
  }
  const j = await r.json().catch(() => null) as { token?: string; region?: string } | null;
  if (!j?.token || !j.region) throw new AssessError('token', 'The token server response is missing "token" or "region".');
  tokenCache = { token: j.token, region: j.region, until: Date.now() + 8.5 * 60_000, endpoint };
  return tokenCache;
}

const AZ: Record<string, string> = { 'g': 'ɡ', 'ɹ': 'r', 'ɑɹ': 'ɑr', 'ɔɹ': 'ɔr', 'ɪɹ': 'ɪr', 'ɛɹ': 'ɛr', 'ʊɹ': 'ʊr', 'aɪɹ': 'aɪr', 'aʊɹ': 'aʊr', 'ju': 'u' };
/** Azure IPA symbols → the symbols used in this app's transcriptions */
export const normPh = (p: string) => AZ[p] ?? p;
const VOWELS = new Set(['i', 'ɪ', 'eɪ', 'ɛ', 'æ', 'ɑ', 'ɔ', 'ʊ', 'oʊ', 'u', 'ʌ', 'aɪ', 'aʊ', 'ɔɪ', 'ə', 'ɝ', 'ɚ', 'ɑr', 'ɔr', 'ɪr', 'ɛr', 'ʊr', 'aɪr', 'aʊr']);
export const isVowel = (p: string) => VOWELS.has(p);

interface AzWord {
  Word: string; Offset: number; Duration: number;
  PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string; Feedback?: { Prosody?: { Break?: { ErrorTypes?: string[] }; Intonation?: { ErrorTypes?: string[] } } } };
  Phonemes?: { Phoneme: string; PronunciationAssessment?: { AccuracyScore?: number; NBestPhonemes?: { Phoneme: string; Score: number }[] } }[];
}
interface AzSeg { DisplayText?: string; NBest?: { PronunciationAssessment?: { AccuracyScore?: number; FluencyScore?: number; CompletenessScore?: number; ProsodyScore?: number; PronScore?: number }; Words?: AzWord[] }[] }

export const azureEngine = (endpoint: string): Engine => ({
  id: 'azure',
  name: 'Azure pronunciation assessment',
  async start(o: StartOptions): Promise<Session> {
    if (!endpoint) throw new AssessError('config', 'Add your token server address in Settings to use Azure.');
    const cap = PcmRecorder.prepare(); // before any await: Safari needs the user gesture
    let tokenInfo: { token: string; region: string }, sdk: typeof import('microsoft-cognitiveservices-speech-sdk');
    try { [tokenInfo, sdk] = await Promise.all([getToken(endpoint), import('microsoft-cognitiveservices-speech-sdk')]); }
    catch (e) { cap.cancel(); throw e; }
    const { token, region } = tokenInfo;
    // our recorder streams 16 kHz, 16-bit mono PCM to Azure: the same format in every browser
    const push = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1));
    let stopFired = false;
    await cap.start({
      onLevel: o.onLevel,
      onChunk: x => {
        const b = new Int16Array(x.length);
        for (let i = 0; i < x.length; i++) { const v = Math.max(-1, Math.min(1, x[i])); b[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
        push.write(b.buffer);
      },
      endSilence: o.mode === 'word' ? 0.9 : 0,
      maxSeconds: o.mode === 'word' ? 8 : o.mode === 'sentence' ? 60 : 900,
      onAutoStop: () => { if (!stopFired) { stopFired = true; o.onEnded?.(); } },
    });
    const speech = sdk.SpeechConfig.fromAuthorizationToken(token, region);
    speech.speechRecognitionLanguage = 'en-US';
    if (o.mode === 'passage') speech.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, '1200');
    const audioCfg = sdk.AudioConfig.fromStreamInput(push);
    const rec = new sdk.SpeechRecognizer(speech, audioCfg);
    const pa = new sdk.PronunciationAssessmentConfig(o.reference, sdk.PronunciationAssessmentGradingSystem.HundredMark, sdk.PronunciationAssessmentGranularity.Phoneme, true);
    pa.phonemeAlphabet = 'IPA';
    pa.nbestPhonemeCount = 5;
    try { pa.enableProsodyAssessment = true; } catch { /* older service */ }
    pa.applyTo(rec);

    const segs: AzSeg[] = [];
    let partial = '', fatal: AssessError | null = null;
    rec.recognizing = (_s, e) => { o.onPartial?.((segs.map(s => s.DisplayText || '').join(' ') + ' ' + e.result.text).trim()); };
    rec.recognized = (_s, e) => {
      if (e.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
      try {
        const j = JSON.parse(e.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)) as AzSeg;
        segs.push(j); partial = segs.map(s => s.DisplayText || '').join(' ');
        o.onPartial?.(partial);
      } catch { /* ignore malformed */ }
    };
    let ended: (() => void) | null = null;
    const endedP = new Promise<void>(res => { ended = res; });
    rec.canceled = (_s, e) => {
      if (e.reason === sdk.CancellationReason.Error) fatal = new AssessError('azure', e.errorCode === sdk.CancellationErrorCode.AuthenticationFailure ? 'Azure rejected the token. Check the key and region on your token server.' : `Azure stopped: ${e.errorDetails || 'unknown error'}`);
      ended?.();
    };
    rec.sessionStopped = () => { ended?.(); };
    const t0 = performance.now();
    try { await new Promise<void>((res, rej) => rec.startContinuousRecognitionAsync(res, err => rej(new AssessError('azure', 'Azure could not start: ' + err)))); }
    catch (e) { cap.cancel(); rec.close(); throw e; }

    const finish = async (): Promise<Assessment> => {
      const { wav: audio } = await cap.stop();
      push.close(); // end of audio: Azure finishes the last phrase and stops the session
      await Promise.race([endedP, new Promise(r => setTimeout(r, 10000))]);
      await new Promise<void>(res => rec.stopContinuousRecognitionAsync(() => res(), () => res()));
      rec.close();
      if (fatal) throw fatal;
      const dur = (performance.now() - t0) / 1000;
      const azWords = segs.flatMap(s => s.NBest?.[0]?.Words || []).filter(w => w.PronunciationAssessment?.ErrorType !== 'Insertion');
      if (!azWords.length) throw new AssessError('nothing', 'Nothing was heard. Check the microphone and try again.');
      const recognized = azWords.filter(w => w.PronunciationAssessment?.ErrorType !== 'Omission');
      const res = align(o.refKeys, recognized.map(w => keyOf(w.Word.toLowerCase().replace(/[^a-z']/g, ''))));
      const words: WordResult[] = res.map((r, i) => {
        if (r.st === 'miss') return { idx: i, ref: o.refKeys[i], score: 0, status: 'omitted', error: 'Omission' };
        const w = recognized[r.h];
        const acc = Math.round(w.PronunciationAssessment?.AccuracyScore ?? 0);
        const phonemes: PhonemeResult[] = (w.Phonemes || []).map(p => {
          const exp = normPh(p.Phoneme);
          const top = p.PronunciationAssessment?.NBestPhonemes?.[0]?.Phoneme;
          const heardAs = top ? normPh(top) : undefined;
          return { p: exp, score: Math.round(p.PronunciationAssessment?.AccuracyScore ?? 0), heardAs: heardAs && heardAs !== exp ? heardAs : undefined };
        });
        const pros = w.PronunciationAssessment?.Feedback?.Prosody;
        const proErr = [...(pros?.Break?.ErrorTypes || []), ...(pros?.Intonation?.ErrorTypes || [])].filter(x => x && x !== 'None');
        const score = r.st === 'sub' ? Math.min(acc, 40) : acc;
        return {
          idx: i, ref: o.refKeys[i], score, status: statusOf(score), heard: r.st === 'sub' ? shownWord(w.Word) : undefined,
          error: r.st === 'sub' ? 'Heard as another word' : (w.PronunciationAssessment?.ErrorType && w.PronunciationAssessment.ErrorType !== 'None' ? w.PronunciationAssessment.ErrorType : proErr[0] || null),
          phonemes, offset: w.Offset / 1e7, duration: w.Duration / 1e7,
        };
      });
      // segment scores weighted by the number of words in each segment
      const wavg = (k: 'FluencyScore' | 'ProsodyScore' | 'CompletenessScore') => {
        let s = 0, n = 0;
        for (const g of segs) { const v = g.NBest?.[0]?.PronunciationAssessment?.[k]; const c = g.NBest?.[0]?.Words?.length || 0; if (typeof v === 'number' && c) { s += v * c; n += c; } }
        return n ? Math.round(s / n) : null;
      };
      const allPh = words.flatMap(w => w.phonemes || []);
      const avg = (a: number[]) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
      const vowel = avg(allPh.filter(p => isVowel(p.p)).map(p => p.score));
      const cons = avg(allPh.filter(p => !isVowel(p.p)).map(p => p.score));
      const accuracy = Math.round(words.reduce((s, w) => s + (w.score || 0), 0) / Math.max(1, words.length));
      const completeness = Math.round(words.filter(w => w.status !== 'omitted').length / Math.max(1, words.length) * 100);
      const fluency = wavg('FluencyScore');
      const prosody = wavg('ProsodyScore');
      const breaks = words.filter(w => /Break/.test(w.error || '')).length;
      const monotone = words.some(w => /Monotone/.test(w.error || ''));
      const long = o.mode !== 'word';
      const metrics: Metric[] = [
        { key: 'phoneme', label: 'Phoneme accuracy', value: avg(allPh.map(p => p.score)), kind: 'measured', note: 'Average accuracy of every individual sound.' },
        { key: 'words', label: 'Word pronunciation', value: accuracy, kind: 'measured', note: 'Average word accuracy; skipped words count as zero.' },
        { key: 'vowel', label: 'Vowel accuracy', value: vowel, kind: 'measured', note: 'Average of all vowel sounds.' },
        { key: 'consonant', label: 'Consonant accuracy', value: cons, kind: 'measured', note: 'Average of all consonant sounds.' },
        ...(long ? [
          { key: 'fluency', label: 'Fluency', value: fluency, kind: 'measured' as const, note: 'Smoothness and pausing, measured separately from accuracy.' },
          { key: 'prosody', label: 'Prosody', value: prosody, kind: (prosody === null ? 'unavailable' : 'measured') as Metric['kind'], note: 'Azure’s combined score for stress, intonation, speed and rhythm.' },
          { key: 'rhythm', label: 'Rhythm', value: prosody === null ? null : Math.max(0, 100 - breaks * 12), kind: (prosody === null ? 'unavailable' : 'estimated') as Metric['kind'], note: 'Estimated from unexpected or missing pauses flagged by Azure.' },
          { key: 'intonation', label: 'Intonation', value: prosody === null ? null : monotone ? Math.min(prosody, 60) : prosody, kind: (prosody === null ? 'unavailable' : 'estimated') as Metric['kind'], note: 'Estimated from the prosody score and monotone detection.' },
          { key: 'completeness', label: 'Completeness', value: completeness, kind: 'measured' as const, note: 'Share of the text that was read.' },
          { key: 'wordstress', label: 'Word stress', value: null, kind: 'unavailable' as const, note: 'Azure does not report word stress separately; it is part of the prosody score.' },
          { key: 'sentstress', label: 'Sentence stress', value: null, kind: 'unavailable' as const, note: 'Not reported separately; included in the prosody score.' },
          { key: 'connected', label: 'Connected speech', value: null, kind: 'unavailable' as const, note: 'No current engine measures linking and reductions reliably.' },
        ] : []),
      ];
      return { engine: 'azure', overall: accuracy, words, metrics, transcript: partial, durationSec: dur, audio };
    };
    return { stop: finish, cancel() { cap.cancel(); try { push.close(); rec.stopContinuousRecognitionAsync(() => rec.close(), () => rec.close()); } catch { /* ignore */ } } };
  },
});

/** Check the token server and the Azure key without using the microphone. */
export async function testAzure(endpoint: string): Promise<string> {
  tokenCache = null;
  const { region } = await getToken(endpoint);
  return `Connected. Region: ${region}.`;
}

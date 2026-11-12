// Common contract for pronunciation assessment engines.
// Every engine reports what it actually measured; anything else is marked as not measured.

export type EngineId = 'browser' | 'local' | 'azure';

export interface PhonemeResult {
  /** expected phoneme (IPA) */
  p: string;
  score: number;
  /** the phoneme the engine thinks was produced instead, when it differs */
  heardAs?: string;
}

export interface WordResult {
  idx: number;
  ref: string;
  /** 0–100, or null if this engine cannot score words */
  score: number | null;
  status: 'good' | 'fair' | 'poor' | 'omitted';
  heard?: string;
  error?: string | null;
  phonemes?: PhonemeResult[];
  /** position of the word in the learner's recording, seconds */
  offset?: number;
  duration?: number;
}

export type MetricKind = 'measured' | 'estimated' | 'unavailable';
export interface Metric { key: string; label: string; value: number | null; unit?: string; kind: MetricKind; note?: string }

export interface Assessment {
  engine: EngineId;
  /** headline score 0–100 */
  overall: number;
  words: WordResult[];
  metrics: Metric[];
  transcript: string;
  durationSec: number;
  audio?: Blob;
  /** false when the recording was kept for comparison but could not be scored automatically */
  checked?: boolean;
  /** raw values behind the score (for diagnostics) */
  detail?: Record<string, unknown>;
}

export interface StartOptions {
  reference: string;
  refKeys: string[];
  mode: 'word' | 'sentence' | 'passage';
  /** single words: the words this one is most often confused with ("ship" for "sheep") */
  alternatives?: string[];
  /** single words: how the word can be checked and the model recording's own result (see WordCheck) */
  check?: 'p' | 'o' | 'n';
  ref?: number;
  onPartial?: (text: string) => void;
  onLevel?: (level: number) => void;
  /** called when the engine stops listening on its own (end of a single word) */
  onEnded?: () => void;
}

export interface Session {
  stop(): Promise<Assessment>;
  cancel(): void;
}

export interface Engine {
  id: EngineId;
  name: string;
  start(opts: StartOptions): Promise<Session>;
}

export class AssessError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export const statusOf = (s: number | null): WordResult['status'] => s === null ? 'good' : s >= 80 ? 'good' : s >= 60 ? 'fair' : 'poor';

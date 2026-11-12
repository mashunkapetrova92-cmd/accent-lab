// Shapes of the generated content files in /data.

/** [sprite file, start, end] or, with a natural slow recording, [file, start, end, slowFile, slowStart, slowEnd] (seconds) */
export type Clip = [string, number, number] | [string, number, number, string, number, number];

export interface VowelPos { height: number; back: number; round?: boolean }
export interface Diagram {
  kind: 'vowel' | 'diphthong' | 'rhotic' | 'consonant';
  height?: number; back?: number; round?: boolean;
  start?: VowelPos; end?: VowelPos;
  place?: 'bilabial' | 'labiodental' | 'dental' | 'alveolar' | 'postalveolar' | 'palatal' | 'velar' | 'glottal' | 'labiovelar';
  manner?: 'stop' | 'fricative' | 'affricate' | 'nasal' | 'approximant' | 'lateral' | 'rhotic' | 'tap';
  voiced?: boolean; puff?: boolean; velarized?: boolean;
}

/** How a single word is checked: p = against its confusable words, o = also against what the recognizer hears freely,
 *  n = the recognizer cannot confirm even the model recording, so the learner compares by ear. ref = the model recording's result (0–100). */
export type WordCheck = 'p' | 'o' | 'n';
export interface WordItem { text: string; parts: { t: string; hl?: boolean }[]; ipa: string; clip: Clip | null; alt?: string[]; check?: WordCheck; ref?: number }
export interface Drill { say: string; options: string[]; answer: string; clips: Clip[]; optIpa?: Record<string, string>; optClips?: Record<string, Clip> }
export interface IdQuestion { options: string[]; answer: string }
export interface SentenceItem { text: string; ipa: string; clip: Clip | null; hl: number[]; tokens: string[]; tokIpa: string[] }

export interface SoundNode {
  id: string; symbol: string; name: string; key: string; keyIpa: string; keyClip: Clip | null;
  section: string; category: string; targets: string[]; diagram: Diagram;
  tongue: string; lips: string; jaw: string; voicing: string; airflow: string; feel: string; note: string; contrast: string;
  words: WordItem[]; drills: Drill[]; sentences: SentenceItem[]; labels?: string[];
  /** IPA units highlighted as the target */
  marks: string[]; idq: IdQuestion[]; color: string;
}
export interface Section { id: string; title: string; blurb: string; color: string; nodes: string[] }
export interface SoundsData { sections: Section[]; nodes: SoundNode[]; voices: string[] }

/** Token flags used by Study mode. */
export const F = { FLAP: 1, LINK: 2, WEAK: 4, CONTENT: 8, RHOTIC: 16, HOMOGRAPH: 32, SCHWA: 64 } as const;

export interface Tok { d: string; pre?: string; post?: string; n: string[]; i: number; f?: number }
export interface Sent { toks: Tok[]; tune: 'fall' | 'rise' | 'none'; a: number; b: number; ipa: string }
export interface Para { sents: Sent[] }
export interface Story {
  id: string; title: string; topic: string; words: number; minutes: number;
  paragraphs: Para[]; keys: string[]; ipa: Record<string, string>; audio: string; times: [number, number][];
  /** the same text recorded at a slower, natural pace */
  slowAudio?: string; slowTimes?: [number, number][];
}
export interface StoryMeta { id: string; title: string; topic: string; words: number; minutes: number; excerpt: string }
/** word -> [sprite file, start, end] */
export type WordMap = Record<string, Clip>;

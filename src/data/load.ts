import type { SoundsData, Story, StoryMeta, WordMap } from './types';
import { key } from '../lib/text';

const base = import.meta.env.BASE_URL;
export const url = (p: string) => base + p.replace(/^\//, '');

const cache = new Map<string, Promise<unknown>>();
function getJSON<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(url(path)).then(r => {
      if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}

export const loadSounds = () => getJSON<SoundsData>('data/sounds.json');
export const loadLibrary = () => getJSON<StoryMeta[]>('data/stories/index.json');
export const loadStory = (id: string) => getJSON<Story>(`data/stories/${id}.json`).then(s => {
  if (!s.keys) s.keys = s.paragraphs.flatMap(p => p.sents.flatMap(x => x.toks.flatMap(t => t.n.map(key))));
  return s;
});
export const loadWordMap = () => getJSON<WordMap>('data/words.json');
/** words of the texts: [check, ref, ...confusable words] (see WordCheck) */
export const loadCheckMap = () => getJSON<Record<string, (string | number)[]>>('data/checks.json');
export const loadDurations = () => getJSON<Record<string, number>>('data/audio.json');

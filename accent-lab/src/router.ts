import { useSyncExternalStore } from 'react';

const subs = new Set<() => void>();
let depth = 0;
window.addEventListener('hashchange', () => subs.forEach(f => f()));
const read = () => (location.hash.replace(/^#/, '') || '/sounds');

export function useRoute(): string[] {
  const h = useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb); }, read);
  return h.split('?')[0].split('/').filter(Boolean);
}
export function go(path: string) {
  depth++;
  location.hash = path;
  window.scrollTo(0, 0);
}
/** Go back inside the app, or to a sensible parent when the page was opened directly. */
export function back(fallback: string) {
  if (depth > 0) { depth--; history.back(); } else { location.replace('#' + fallback); }
}

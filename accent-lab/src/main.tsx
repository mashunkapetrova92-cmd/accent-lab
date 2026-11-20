import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/source-sans-3/wght.css';
import './styles.css';
import App from './App';
import { audioBusy } from './lib/audio';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller;
  let shownAt = performance.now();
  let updated = false;
  const apply = () => { if (updated && !audioBusy()) { updated = false; location.reload(); } };
  // a main list screen: nothing is lost when the page reloads there
  const calm = () => { const r = (location.hash.replace(/^#/, '') || '/sounds').split('?')[0].split('/').filter(Boolean); return r.length < 2 && r[0] !== 'settings'; };
  sw.addEventListener('controllerchange', () => {
    if (!hadController) return; // first visit: this page already is the current version
    updated = true;
    // a new version took over: switch to it at once if the app was just opened, otherwise at a calm moment
    if (document.hidden || performance.now() - shownAt < 12000 || calm()) apply();
  });
  window.addEventListener('hashchange', () => { if (calm()) apply(); });
  // apps opened from the Home Screen are usually resumed rather than restarted: look for a new version then
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    shownAt = performance.now();
    if (updated) { apply(); return; }
    sw.getRegistration().then(r => r?.update()).catch(() => {});
  });
  window.addEventListener('load', () => { sw.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}); });
}

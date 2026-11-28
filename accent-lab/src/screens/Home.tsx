import { useMemo } from 'react';
import Icon from '../components/Icon';
import { loadLibrary, loadSounds } from '../data/load';
import { useAsync, useStore } from '../lib/store';
import { go } from '../router';
import { nodeState } from './SoundMap';

// The hub after the welcome screen: the four sections of the app.
// Section marks are set in type (letters of the font), not drawn.

interface Section {
  id: string; title: string; glyph: string; tone: string; text: string;
  meta?: string; href?: string;
}

export default function Home() {
  const sounds = useStore(s => s.sounds);
  const reading = useStore(s => s.reading);
  const points = useStore(s => s.points);
  const sd = useAsync(loadSounds, []).data;
  const lib = useAsync(loadLibrary, []).data;

  const nodes = sd?.nodes || [];
  const mastered = nodes.filter(n => sounds[n.id]?.mastered).length;
  const read = useMemo(() => new Set(reading.map(a => a.story)).size, [reading]);

  // "pick up where you left off": the most recent thing practiced
  const resume = useMemo(() => {
    const last = points[points.length - 1];
    if (last?.kind === 'reading' && lib) {
      const s = lib.find(x => x.id === last.ref);
      if (s) return { label: 'Continue reading', name: s.title, sub: `${s.level || 'C1'} · ${s.topic}`, href: `/reading/${s.id}` };
    }
    const i = nodes.findIndex((_, k) => nodeState(nodes, sounds, k) === 'open');
    if (last && i >= 0) return { label: 'Continue phonetics', name: `/${nodes[i].symbol}/ as in ${nodes[i].key}`, sub: 'Next sound on your map', href: `/sounds/${nodes[i].id}` };
    return null;
  }, [points, lib, nodes, sounds]);

  const sections: Section[] = [
    { id: 'phonetics', title: 'Phonetics', glyph: 'æ', tone: 'teal', text: 'Every sound of American English, step by step.',
      meta: nodes.length ? `${mastered} of ${nodes.length} sounds` : undefined, href: '/sounds' },
    { id: 'reading', title: 'Reading', glyph: 'Aa', tone: 'violet', text: 'Listen, read aloud, get feedback.',
      meta: lib ? `${read} of ${lib.length} texts · A1–C2` : undefined, href: '/reading' },
    { id: 'words', title: 'New words', glyph: 'abc', tone: 'gold', text: 'Vocabulary by level, with sound.' },
    { id: 'grammar', title: 'Grammar', glyph: 'a/an', tone: 'green', text: 'Short, clear rules and practice.' },
  ];

  return (
    <div className="screen home">
      <div className="topbar">
        <div className="home-brand"><span className="home-dot" aria-hidden="true">æ</span>Accent Lab</div>
        <button className="icon-btn" aria-label="Settings" onClick={() => go('/settings')}><Icon name="gear" /></button>
      </div>
      <h1 className="home-title">What would you like<br />to practice today?</h1>

      {resume && (
        <button className="home-resume" onClick={() => go(resume.href)}>
          <span className="grow">
            <span className="home-resume-label">{resume.label}</span>
            <span className="home-resume-name">{resume.name}</span>
            <span className="home-resume-sub">{resume.sub}</span>
          </span>
          <span className="home-resume-go" aria-hidden="true"><Icon name="play" /></span>
        </button>
      )}

      <div className="home-grid">
        {sections.map(s => {
          const soon = !s.href;
          return (
            <button key={s.id} className={`home-card tone-${s.tone}${soon ? ' soon' : ''}`} data-section={s.id}
              aria-disabled={soon || undefined} onClick={() => { if (s.href) go(s.href); }}>
              <span className="home-glyph" aria-hidden="true">{s.glyph}</span>
              <span className="home-card-body">
                <span className="home-card-title">{s.title}</span>
                <span className="home-card-text">{s.text}</span>
                <span className="home-card-meta">{soon ? <span className="home-soon">Coming soon</span> : (s.meta || ' ')}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

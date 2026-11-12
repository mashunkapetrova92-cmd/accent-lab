import { useEffect } from 'react';
import Icon from './components/Icon';
import { useRoute } from './router';
import { init, useActivityClock, useStore } from './lib/store';
import SoundMap from './screens/SoundMap';
import SoundPage from './screens/SoundPage';
import Library from './screens/Library';
import Reader from './screens/Reader';
import Progress from './screens/Progress';
import Settings from './screens/Settings';
import { setDurations, stop } from './lib/audio';
import { loadDurations } from './data/load';
import { AudioToast } from './components/ui';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const route = useRoute();
  const ready = useStore(s => s.ready);
  useEffect(() => { init(); loadDurations().then(setDurations).catch(() => {}); }, []);
  useEffect(() => { stop(); }, [route.join('/')]);
  useActivityClock();
  const [top, id] = route;
  let screen;
  if (!ready) screen = <div className="screen" />;
  else if (top === 'sounds' && id) screen = <SoundPage key={id} id={id} />;
  else if (top === 'reading' && id) screen = <Reader key={id} id={id} />;
  else if (top === 'reading') screen = <Library />;
  else if (top === 'progress') screen = <Progress />;
  else if (top === 'settings') screen = <Settings />;
  else screen = <SoundMap />;
  const tab = top === 'reading' ? 'reading' : top === 'progress' ? 'progress' : 'sounds';
  return (
    <div className="app">
      <main><ErrorBoundary resetKey={route.join('/')}>{screen}</ErrorBoundary></main>
      <AudioToast />
      <nav className="nav" aria-label="Main">
        <div className="nav-inner">
          <a href="#/sounds" aria-current={tab === 'sounds' ? 'page' : undefined}><Icon name="map" />Sounds</a>
          <a href="#/reading" aria-current={tab === 'reading' ? 'page' : undefined}><Icon name="book" />Reading</a>
          <a href="#/progress" aria-current={tab === 'progress' ? 'page' : undefined}><Icon name="chart" />My progress</a>
        </div>
      </nav>
    </div>
  );
}

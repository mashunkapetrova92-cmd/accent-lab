import { useMemo } from 'react';
import { PlayButton } from '../../components/ui';
import { RecordButton, useRecorder } from '../../components/Recorder';
import { SentenceResultView, SentenceText } from '../stages/SentenceStage';
import { F, type Clip, type Sent, type SentenceItem, type Story, type Tok } from '../../data/types';

/** Phonetic notes generated from the features marked in a sentence. */
export function sentenceNotes(s: Sent, story: Story): { k: string; title: string; text: string }[] {
  const notes: { k: string; title: string; text: string }[] = [];
  const w = (t: Tok) => t.d.replace(/^['’]|['’]$/g, '');
  const links: string[] = [];
  s.toks.forEach((t, i) => { if ((t.f || 0) & F.LINK && s.toks[i + 1]) links.push(`${w(t)} ${w(s.toks[i + 1])}`); });
  if (links.length) notes.push({ k: 'link', title: 'Linking', text: `Join a final consonant to the vowel that starts the next word, with no pause: ${links.slice(0, 5).map(x => `“${x}”`).join(', ')}. For example, “${links[0]}” is said as one smooth unit.` });
  const flaps = s.toks.map((t, i) => ({ t, i })).filter(({ t }) => (t.f || 0) & F.FLAP).map(({ t, i }) => {
    const ipa = story.ipa[t.n[0]] || '';
    return ipa.includes('ɾ') ? `${w(t)} ${ipa}` : `“${w(t)} ${s.toks[i + 1] ? w(s.toks[i + 1]) : ''}” (the final t links into the next vowel)`;
  });
  if (flaps.length) notes.push({ k: 'flap', title: 'Flap T', text: `Between vowels, before an unstressed syllable, t and d become a quick tap [ɾ], like a very fast d: ${flaps.slice(0, 4).join(', ')}.` });
  const weak = s.toks.filter(t => (t.f || 0) & F.WEAK).map(w);
  if (weak.length) notes.push({ k: 'weak', title: 'Weak forms', text: `Grammar words are reduced and unstressed, usually with schwa /ə/: ${Array.from(new Set(weak.map(x => x.toLowerCase()))).slice(0, 8).join(', ')}. Keep them short so the content words stand out.` });
  const content = s.toks.filter(t => (t.f || 0) & F.CONTENT).map(w);
  if (content.length) notes.push({ k: 'stress', title: 'Sentence stress', text: `Content words carry the beats: ${content.slice(0, 8).join(', ')}. The last important word usually gets the strongest stress.` });
  const rh = s.toks.filter(t => (t.f || 0) & F.RHOTIC).map(w);
  if (rh.length) notes.push({ k: 'r', title: 'American R', text: `Pronounce every r after a vowel: ${rh.slice(0, 6).join(', ')}. Bunch the tongue back without touching the roof of the mouth.` });
  const hg = s.toks.filter(t => (t.f || 0) & F.HOMOGRAPH).map(t => `${w(t)} ${story.ipa[t.n[0]] || ''}`);
  if (hg.length) notes.push({ k: 'homo', title: 'Spelling trap', text: `These spellings have more than one pronunciation; use “In context” to hear the one used here: ${hg.join('; ')}.` });
  if (s.tune !== 'none') notes.push({ k: 'tune', title: 'Intonation', text: s.tune === 'rise' ? 'This is a yes-or-no question, so the pitch rises at the end ↗.' : 'Statements and wh-questions end with a fall ↘ on the last stressed word. A rise would sound unfinished.' });
  return notes;
}

export function sentenceItem(story: Story, s: Sent): SentenceItem {
  const toks = s.toks;
  const n0 = story.times[s.a][0], n1 = story.times[s.b - 1][1];
  const clip: Clip = story.slowAudio && story.slowTimes
    ? [story.audio, n0, n1, story.slowAudio, story.slowTimes[s.a][0], story.slowTimes[s.b - 1][1]]
    : [story.audio, n0, n1];
  const tokens: string[] = [], tokIpa: string[] = [];
  for (const t of toks) for (let k = 0; k < t.n.length; k++) { tokens.push(k === 0 ? (t.pre || '') + t.d + (t.post || '') : ''); tokIpa.push(story.ipa[t.n[k]] || ''); }
  return { text: toks.map(t => (t.pre || '') + t.d + (t.post || '')).join(' '), ipa: s.ipa, clip, hl: [], tokens, tokIpa };
}

export default function SentenceSheet({ story, si, sent }: { story: Story; si: number; sent: Sent; toks: Tok[] }) {
  const item = useMemo(() => sentenceItem(story, sent), [story, sent]);
  const notes = useMemo(() => sentenceNotes(sent, story), [sent, story]);
  const rec = useRecorder();
  return (
    <div className="stack">
      <div className="eyebrow">Sentence {si + 1}</div>
      <SentenceText s={item} r={rec.state === 'done' ? rec.result : null} />
      <div className="ipa muted" style={{ fontSize: 17 }}>{sent.ipa}</div>
      <div className="row">
        <PlayButton clip={item.clip} label="Play the sentence" /><span className="small">Natural</span>
        <PlayButton clip={item.clip} slow label="Play the sentence slowly" /><span className="small">Slow</span>
      </div>
      {notes.length > 0 && (
        <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)', padding: 14 }}>
          {notes.map(n => <div key={n.k} className="list-row" style={{ display: 'block' }}><b>{n.title}. </b><span className="small">{n.text}</span></div>)}
        </div>
      )}
      <RecordButton mode="sentence" rec={rec} onStart={() => rec.start(item.text, story.keys.slice(sent.a, sent.b), 'sentence')} labelIdle="Tap and read the sentence" />
      {rec.state === 'done' && rec.result && <SentenceResultView s={item} r={rec.result} marks={[]} />}
    </div>
  );
}

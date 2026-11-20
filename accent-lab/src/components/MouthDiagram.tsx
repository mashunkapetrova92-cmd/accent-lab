// Mid-sagittal diagram of the vocal tract (the face looks left), drawn from articulation parameters.
import type { Diagram, VowelPos } from '../data/types';

type Shape = { tip: [number, number]; blade: [number, number]; dorsum: [number, number]; jaw: number; round: number; lipsClosed?: boolean; lipTeeth?: boolean; nasal?: boolean; contact?: [number, number] | null; gap?: [number, number] | null };

const neutral: Shape = { tip: [74, 138], blade: [96, 124], dorsum: [140, 116], jaw: 6, round: 0 };

function vowelShape(v: VowelPos): Shape {
  const h = v.height, b = v.back;
  const dx = 112 + b * 70, dy = 150 - h * 52;
  const jaw = (1 - h) * 16;
  const tx = 72 + b * 6, ty = 136 + jaw * 0.6;
  return {
    tip: [tx, ty], blade: [tx + (dx - tx) * 0.45, ty + (dy - ty) * 0.62 - 3], dorsum: [dx, dy], jaw, round: v.round ? 1 : 0,
  };
}

function consonantShape(d: Diagram): Shape {
  const s: Shape = { ...neutral, contact: null, gap: null };
  const closed = d.manner === 'stop' || d.manner === 'nasal' || d.manner === 'affricate' || d.manner === 'tap';
  switch (d.place) {
    case 'bilabial': s.lipsClosed = d.manner !== 'fricative'; s.jaw = 2; s.contact = [42, 121]; break;
    case 'labiodental': s.lipTeeth = true; s.jaw = 3; s.gap = [60, 124]; break;
    case 'dental': s.tip = [62, 121]; s.blade = [84, 116]; s.dorsum = [136, 112]; s.jaw = 6; s.gap = [60, 120]; break;
    case 'alveolar': s.tip = [76, closed || d.manner === 'lateral' ? 104 : 107]; s.blade = [96, 110]; s.dorsum = [140, 112]; s.jaw = 3;
      if (closed || d.manner === 'lateral') s.contact = [76, 103]; else s.gap = [77, 104]; break;
    case 'postalveolar':
      if (d.manner === 'rhotic') { s.tip = [94, 110]; s.blade = [112, 104]; s.dorsum = [146, 100]; s.jaw = 5; s.round = 0.6; s.gap = [100, 98]; break; }
      s.tip = [82, 108]; s.blade = [94, 100]; s.dorsum = [138, 108]; s.jaw = 3; s.round = d.round ? 0.8 : 0;
      if (closed) s.contact = [92, 97]; else s.gap = [93, 98]; break;
    case 'palatal': s.tip = [74, 132]; s.blade = [96, 104]; s.dorsum = [124, 94]; s.jaw = 3; s.gap = [120, 90]; break;
    case 'velar': s.tip = [74, 136]; s.blade = [100, 126]; s.dorsum = [176, 96]; s.jaw = 5; if (closed) s.contact = [178, 94]; else s.gap = [178, 95]; break;
    case 'labiovelar': s.tip = [74, 136]; s.blade = [100, 124]; s.dorsum = [174, 102]; s.jaw = 4; s.round = 1; s.gap = [178, 97]; break;
    case 'glottal': s.jaw = 10; break;
  }
  if (d.manner === 'nasal') s.nasal = true;
  if (d.velarized) { s.dorsum = [166, 104]; }
  return s;
}

function tonguePath(s: Shape): string {
  const j = s.jaw;
  const [tx, ty] = s.tip, [bx, by] = s.blade, [dx, dy] = s.dorsum;
  const kx = Math.min(206, dx + 30), ky = Math.max(dy + 34, 140);
  const fy = 160 + j;
  return [
    `M ${tx} ${ty}`,
    `C ${tx + 6} ${ty - 8}, ${bx - 12} ${by + 4}, ${bx} ${by}`,
    `C ${bx + 14} ${by - 4}, ${dx - 22} ${dy}, ${dx} ${dy}`,
    `C ${dx + 18} ${dy}, ${kx} ${dy + 8}, ${kx} ${ky}`,
    `C ${kx + 2} ${ky + 26}, 204 192, 200 206`,
    `C 170 202, 120 ${fy + 12}, 92 ${fy}`,
    `C 80 ${fy - 2}, ${tx - 4} ${ty + 12}, ${tx} ${ty} Z`,
  ].join(' ');
}

function lips(s: Shape) {
  const r = s.round, j = s.jaw;
  const px = 34 - r * 8;
  const upperY = s.lipsClosed ? 121 : 116 + r * 3;
  const lowerY = s.lipsClosed ? 121 : s.lipTeeth ? 122 : 126 + j * 0.9 - r * 3;
  return { upper: `M 50 92 C 42 96, ${px} 104, ${px} ${upperY - 6} C ${px + 2} ${upperY}, ${px + 12} ${upperY + 1}, 58 ${upperY - 2} L 58 104 Z`,
    lower: `M 58 ${lowerY + 2} C ${px + 14} ${lowerY - 1}, ${px + 1} ${lowerY}, ${s.lipTeeth ? px + 18 : px} ${lowerY + 7} C ${px + 2} ${lowerY + 18}, 44 ${lowerY + 26}, 54 ${lowerY + 30} L 66 ${lowerY + 22} Z`, lowerY };
}

export default function MouthDiagram({ d, color = '#0E7C86' }: { d: Diagram; color?: string }) {
  let a: Shape, b: Shape | null = null;
  if (d.kind === 'vowel') a = vowelShape({ height: d.height!, back: d.back!, round: d.round });
  else if (d.kind === 'diphthong') { a = vowelShape(d.start!); b = vowelShape(d.end!); }
  else if (d.kind === 'rhotic') {
    const r = consonantShape({ kind: 'consonant', place: 'postalveolar', manner: 'rhotic' });
    if (d.start) { a = vowelShape(d.start); b = r; } else { a = { ...r, jaw: 4 }; }
  }
  else a = consonantShape(d);
  if (d.manner === 'tap') b = { ...a, tip: [78, 124], blade: [98, 118], contact: null };

  const voiced = d.kind !== 'consonant' || d.voiced;
  const nasal = !!a.nasal;
  const la = lips(a), lb = b ? lips(b) : null;
  const dur = d.manner === 'tap' ? '0.9s' : '2.6s';
  const anim = (x: string, y: string) => <animate attributeName="d" values={`${x};${y};${y};${x};${x}`} keyTimes="0;0.35;0.55;0.9;1" dur={dur} repeatCount="indefinite" />;
  const velum = nasal ? 'M 168 86 C 186 90, 196 104, 194 128 C 191 132, 186 130, 186 124 C 186 108, 178 98, 166 96 Z' : 'M 168 86 C 186 86, 204 92, 212 104 C 214 110, 208 112, 204 108 C 196 100, 184 96, 166 96 Z';

  return (
    <svg viewBox="0 0 260 236" role="img" aria-label="Side view of the mouth showing tongue, lips and airflow for this sound">
      <defs>
        <marker id="arw" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#5B5BD6" /></marker>
      </defs>
      {/* head outline: nose, nasal cavity, palate, pharynx */}
      <path d="M 50 92 C 46 74, 36 62, 30 48 C 26 38, 34 30, 44 34 C 70 40, 120 46, 214 58 C 228 62, 232 72, 230 90 L 228 228" fill="none" stroke="#C4CCD8" strokeWidth="2" />
      <path d="M 58 92 C 90 72, 160 70, 214 80" fill="none" stroke="#DCE2EA" strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="120" y="68" fontSize="9" fill="#9AA4B8" fontFamily="inherit">nasal cavity</text>
      {/* hard palate and alveolar ridge */}
      <path d="M 58 104 C 64 100, 70 94, 78 96 C 86 98, 92 92, 104 88 C 128 82, 150 82, 168 86 L 166 96 C 148 92, 126 92, 106 98 C 94 102, 86 106, 76 104 C 70 104, 64 108, 60 112 Z" fill="#E8D7CF" stroke="#C9AFA3" strokeWidth="1" />
      <path d={velum} fill="#E8C9BF" stroke="#C9AFA3" strokeWidth="1" />
      {/* upper teeth */}
      <path d="M 56 104 L 66 104 L 66 112 C 66 118, 62 124, 59 126 C 56 122, 56 114, 56 104 Z" fill="#fff" stroke="#B8C0CC" strokeWidth="1.2" />
      {/* pharynx back wall */}
      <path d="M 214 80 C 222 110, 224 160, 222 228" fill="none" stroke="#C4CCD8" strokeWidth="2" />
      {/* jaw and lower teeth */}
      <path d={`M 60 ${150 + a.jaw} C 70 ${176 + a.jaw}, 130 ${206 + a.jaw * 0.6}, 196 214`} fill="none" stroke="#C4CCD8" strokeWidth="2">
        {b && <animate attributeName="d" values={`M 60 ${150 + a.jaw} C 70 ${176 + a.jaw}, 130 ${206 + a.jaw * .6}, 196 214;M 60 ${150 + b.jaw} C 70 ${176 + b.jaw}, 130 ${206 + b.jaw * .6}, 196 214;M 60 ${150 + b.jaw} C 70 ${176 + b.jaw}, 130 ${206 + b.jaw * .6}, 196 214;M 60 ${150 + a.jaw} C 70 ${176 + a.jaw}, 130 ${206 + a.jaw * .6}, 196 214;M 60 ${150 + a.jaw} C 70 ${176 + a.jaw}, 130 ${206 + a.jaw * .6}, 196 214`} keyTimes="0;0.35;0.55;0.9;1" dur={dur} repeatCount="indefinite" />}
      </path>
      <path d={`M 60 ${134 + a.jaw} L 69 ${134 + a.jaw} L 68 ${146 + a.jaw} L 61 ${146 + a.jaw} C 59 ${142 + a.jaw}, 59 ${138 + a.jaw}, 60 ${134 + a.jaw} Z`} fill="#fff" stroke="#B8C0CC" strokeWidth="1.2" />
      {/* tongue */}
      <path d={tonguePath(a)} fill={color} fillOpacity=".85" stroke={color} strokeWidth="1.5" strokeLinejoin="round">
        {b && anim(tonguePath(a), tonguePath(b))}
      </path>
      {/* lips */}
      <path d={la.upper} fill="#E7A3A3" stroke="#C97C7C" strokeWidth="1">{lb && anim(la.upper, lb.upper)}</path>
      <path d={la.lower} fill="#E7A3A3" stroke="#C97C7C" strokeWidth="1">{lb && anim(la.lower, lb.lower)}</path>
      {/* larynx and voicing */}
      <rect x="200" y="214" width="34" height="14" rx="4" fill="#F0F2F6" stroke="#C4CCD8" />
      {voiced
        ? <path d="M 204 221 q 3 -5 6 0 t 6 0 t 6 0 t 6 0" fill="none" stroke="#D4952A" strokeWidth="2"><animate attributeName="stroke-dashoffset" values="0;12" dur=".4s" repeatCount="indefinite" /></path>
        : <path d="M 205 221 h 24" stroke="#9AA4B8" strokeWidth="2" strokeDasharray="3 3" />}
      {/* airflow */}
      {nasal
        ? <path d="M 216 196 C 214 140, 204 96, 170 78 C 130 60, 80 58, 44 52" fill="none" stroke="#5B5BD6" strokeWidth="2.2" strokeDasharray="5 4" markerEnd="url(#arw)" />
        : d.place === 'glottal'
          ? <path d="M 216 200 C 214 160, 200 150, 150 146 C 110 144, 70 140, 28 132" fill="none" stroke="#5B5BD6" strokeWidth="2.2" strokeDasharray="5 4" markerEnd="url(#arw)" />
          : <path d={`M 216 200 C 212 160, 196 ${a.dorsum[1] - 12}, 150 ${Math.min(a.dorsum[1] - 10, 104)} C 110 ${Math.min(a.blade[1] - 8, 100)}, 70 112, 24 ${d.place === 'bilabial' && a.lipsClosed ? 121 : 120}`} fill="none" stroke="#5B5BD6" strokeWidth="2.2" strokeDasharray="5 4" markerEnd="url(#arw)" opacity={a.lipsClosed && !nasal ? 0.5 : 1} />}
      {d.puff && <g fill="#5B5BD6" opacity=".7"><circle cx="16" cy="114" r="3" /><circle cx="10" cy="120" r="2.5" /><circle cx="16" cy="127" r="3" /></g>}
      {a.contact && <circle cx={a.contact[0]} cy={a.contact[1]} r="5" fill="#CF3F4F" stroke="#fff" strokeWidth="1.5" />}
      {a.gap && <circle cx={a.gap[0]} cy={a.gap[1]} r="5" fill="none" stroke="#CF3F4F" strokeWidth="2" strokeDasharray="2 2" />}
      <text x="198" y="210" fontSize="9" fill="#9AA4B8" fontFamily="inherit">vocal folds</text>
      <text x="170" y="78" fontSize="9" fill="#9AA4B8" fontFamily="inherit">soft palate</text>
      <text x="84" y="80" fontSize="9" fill="#9AA4B8" fontFamily="inherit">hard palate</text>
    </svg>
  );
}

const CHART: Record<string, [number, number]> = {
  'i': [0.95, 0.05], 'ɪ': [0.8, 0.18], 'ɛ': [0.55, 0.12], 'æ': [0.2, 0.15], 'ʌ': [0.4, 0.6], 'ə': [0.5, 0.48], 'ɑ': [0.05, 0.88],
  'ɔ': [0.3, 0.95], 'ʊ': [0.78, 0.7], 'u': [0.92, 0.8],
};
export function VowelChart({ d, symbol, color = '#0E7C86' }: { d: Diagram; symbol: string; color?: string }) {
  const P = (h: number, b: number): [number, number] => { const fx = 30 + (1 - h) * 54; return [fx + b * (226 - fx), 22 + (1 - h) * 128]; };
  const cur = d.kind === 'vowel' ? P(d.height!, d.back!) : null;
  const s = d.kind === 'diphthong' || (d.kind === 'rhotic' && d.start) ? P(d.start!.height, d.start!.back) : null;
  const e = d.kind === 'diphthong' ? P(d.end!.height, d.end!.back) : d.kind === 'rhotic' ? P(d.height ?? 0.5, d.back ?? 0.55) : null;
  return (
    <svg viewBox="0 0 250 182" role="img" aria-label={`Vowel chart showing the position of ${symbol}`}>
      <defs><marker id="arw2" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill={color} /></marker></defs>
      <path d="M 30 22 L 226 22 L 226 150 L 84 150 Z" fill="#fff" stroke="#D3D9E3" strokeWidth="1.5" />
      <path d="M 48 65 L 226 65 M 66 108 L 226 108 M 128 22 L 155 150" stroke="#E9EDF3" strokeWidth="1" />
      <text x="30" y="14" fontSize="10" fill="#9AA4B8">front</text><text x="200" y="14" fontSize="10" fill="#9AA4B8">back</text>
      <text x="2" y="26" fontSize="10" fill="#9AA4B8">high</text><text x="40" y="160" fontSize="10" fill="#9AA4B8">low</text>
      {Object.entries(CHART).map(([k, [h, b]]) => { const [x, y] = P(h, b); return <text key={k} x={x} y={y + 5} fontSize="15" textAnchor="middle" fill="#A3ACBD" fontWeight={600}>{k}</text>; })}
      {cur && <><circle cx={cur[0]} cy={cur[1]} r="15" fill={color} /><text x={cur[0]} y={cur[1] + 6} fontSize="17" textAnchor="middle" fill="#fff" fontWeight={700}>{symbol}</text></>}
      {s && e && <><circle cx={s[0]} cy={s[1]} r="7" fill={color} /><path d={`M ${s[0]} ${s[1]} L ${e[0]} ${e[1]}`} stroke={color} strokeWidth="3" markerEnd="url(#arw2)" strokeDasharray="120" strokeDashoffset="120"><animate attributeName="stroke-dashoffset" values="120;0;0" keyTimes="0;0.6;1" dur="2.4s" repeatCount="indefinite" /></path></>}
    </svg>
  );
}

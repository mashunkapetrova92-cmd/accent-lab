// Writes dist/sw.js with the list of built files to precache, and removes a duplicate of the speech runtime.
import { readdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const dist = process.env.DIST ? process.env.DIST.replace(/\/?$/, '/') : new URL('../dist/', import.meta.url).pathname;
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

// Vite copies the ONNX Runtime WebAssembly file into assets/, but the worker loads it from ort/ (wasmPaths)
for (const f of readdirSync(join(dist, 'assets'))) if (/^ort-wasm.*\.wasm$/.test(f)) { unlinkSync(join(dist, 'assets', f)); console.log('removed duplicate', f); }

const big = p => p.startsWith('audio/') || p.startsWith('models/') || p.startsWith('ort/') || (p.startsWith('data/stories/') && !p.endsWith('index.json'));
const shell = walk(dist).map(p => relative(dist, p)).filter(p => !big(p) && p !== 'sw.js' && !p.endsWith('.map'));
const hash = createHash('sha1');
for (const f of shell.sort()) hash.update(f + statSync(join(dist, f)).size);
hash.update(readFileSync(join(dist, 'data/files.json')));
const tpl = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8');
writeFileSync(join(dist, 'sw.js'), tpl.replace('__VERSION__', hash.digest('hex').slice(0, 10)).replace('__PRECACHE__', JSON.stringify(shell.map(f => './' + f))));
console.log('sw.js precache', shell.length, 'files');

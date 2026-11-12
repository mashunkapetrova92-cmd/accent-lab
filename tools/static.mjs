// Minimal static server with Range support (behaves like GitHub Pages for media). Usage: node static.mjs <dir> <port> [/prefix]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [dir, port, prefix = ''] = process.argv.slice(2);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.txt': 'text/plain', '.md': 'text/markdown' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (prefix && p.startsWith(prefix)) p = p.slice(prefix.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(dir, p);
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const type = types[path.extname(f)] || 'application/octet-stream';
    const range = req.headers.range;
    const h = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range); let a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : st.size - 1;
      if (!m[1] && m[2]) { a = st.size - +m[2]; b = st.size - 1; }
      b = Math.min(b, st.size - 1);
      res.writeHead(206, { ...h, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 });
      fs.createReadStream(f, { start: a, end: b }).pipe(res);
    } else { res.writeHead(200, { ...h, 'Content-Length': st.size }); fs.createReadStream(f).pipe(res); }
  });
}).listen(+port, () => console.log('serving', dir, 'on', port, prefix));

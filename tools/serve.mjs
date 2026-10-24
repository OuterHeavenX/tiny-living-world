#!/usr/bin/env node
// Play Tiny Living World locally, with AI residents powered by a model on this computer.
//   node tools/serve.mjs                 → http://localhost:8080  (AI requests go to Ollama on :11434)
//   LLM_URL=http://127.0.0.1:1234 node tools/serve.mjs   → use LM Studio instead
//   PORT=3000 node tools/serve.mjs
// Serves the game files and proxies /ai/* to the model server, so the browser never needs CORS
// changes — and phones on the same Wi-Fi can play at http://<this computer's IP>:8080 with AI too.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 8080;
const LLM = new URL(process.env.LLM_URL || 'http://127.0.0.1:11434');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/ai/')) { // proxy to the local model server: /ai/v1/... → LLM_URL/v1/...
    const target = { hostname: LLM.hostname, port: LLM.port || 80, path: url.pathname.slice(3) + url.search, method: req.method, headers: { ...req.headers, host: LLM.host } };
    delete target.headers.origin; delete target.headers.referer;
    const up = http.request(target, r => { res.writeHead(r.statusCode, { 'content-type': r.headers['content-type'] || 'application/json' }); r.pipe(res); });
    up.on('error', e => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: `Model server not reachable at ${LLM.origin} (${e.code}). Start Ollama or LM Studio, or set LLM_URL.` })); });
    req.pipe(up); return;
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || path.relative(ROOT, file).split(path.sep).some(seg => seg.startsWith('.'))) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
});
server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:${PORT}`);
  console.log(`Tiny Living World → http://localhost:${PORT}${lan.length ? '\n  on your network: ' + lan.join('  ') : ''}`);
  console.log(`AI residents: in Settings use the endpoint  /ai/v1  (proxied to ${LLM.origin})`);
});

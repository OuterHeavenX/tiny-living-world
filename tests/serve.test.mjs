// tools/serve.mjs serves the game and proxies /ai/* to a local model server.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('serve.mjs serves the game and proxies /ai to an OpenAI-compatible model server', async () => {
  const fake = http.createServer((req, res) => { // a stand-in for Ollama / LM Studio
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'tiny-test' }] }));
      if (req.url === '/v1/chat/completions') return res.end(JSON.stringify({ choices: [{ message: { content: '{"choice": 1, "reason": "seen ' + JSON.parse(body).model + '"}' } }] }));
      res.statusCode = 404; res.end('{}');
    });
  }).listen(0);
  const llm = `http://127.0.0.1:${fake.address().port}`, port = 18000 + Math.floor(Math.random() * 1000);
  const srv = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(port), LLM_URL: llm }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((ok, bad) => { srv.stdout.on('data', d => String(d).includes('localhost') && ok()); setTimeout(() => bad(new Error('server did not start')), 5000); });
    const page = await fetch(`http://127.0.0.1:${port}/`); assert.equal(page.status, 200); assert.match(await page.text(), /Tiny Living World/);
    const js = await fetch(`http://127.0.0.1:${port}/src/sim/society.js`); assert.match(js.headers.get('content-type'), /javascript/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/.git/config`)).status, 404, 'hidden files are not served');
    const models = await (await fetch(`http://127.0.0.1:${port}/ai/v1/models`)).json(); assert.equal(models.data[0].id, 'tiny-test');
    const chat = await (await fetch(`http://127.0.0.1:${port}/ai/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'tiny-test', messages: [] }) })).json();
    assert.match(chat.choices[0].message.content, /seen tiny-test/);
  } finally { srv.kill(); fake.close(); }
});

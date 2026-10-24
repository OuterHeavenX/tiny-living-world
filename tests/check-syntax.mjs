// Static checks: the inline game module parses, and the version is consistent.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import vm from 'vm';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) throw new Error('module script not found');
new vm.SourceTextModule(m[1], { identifier: 'index.html#module' }); // throws on syntax errors
const v = html.match(/const GAME_VERSION = '([^']+)'/)?.[1];
if (v !== pkg.version) throw new Error(`GAME_VERSION ${v} != package.json ${pkg.version}`);
for (const id of ['btnContinue', 'btnNew', 'btnSettings', 'resetCam', 'sheet', 'settings']) if (!html.includes(`id="${id}"`)) throw new Error('missing #' + id);
for (const f of ['src/world.js', 'src/residents.js', 'src/sim/society.js', 'src/sim/defs.js', 'src/sim/minds.js', 'src/ai/mind.js']) {
  new vm.SourceTextModule(fs.readFileSync(path.join(root, f), 'utf8'), { identifier: f }); // throws on syntax errors
  if (!f.includes('defs') && !f.includes('minds') && !html.includes(`from './${f}'`)) throw new Error('index.html does not import ' + f);
}
for (const id of ['town', 'place', 'townBtn', 'summary', 'setExport', 'setImport', 'optOffline']) if (!html.includes(`id="${id}"`)) throw new Error('missing #' + id);
console.log(`  ✓ index.html, src/world.js, src/residents.js and src/sim parse; version ${v}`);

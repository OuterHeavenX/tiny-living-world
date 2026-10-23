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
const worldSrc = fs.readFileSync(path.join(root, 'src/world.js'), 'utf8');
new vm.SourceTextModule(worldSrc, { identifier: 'src/world.js' });
if (!html.includes("from './src/world.js'")) throw new Error('index.html does not import src/world.js');
console.log(`  ✓ index.html and src/world.js parse; version ${v}`);

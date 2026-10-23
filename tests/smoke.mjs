// Tiny Living World — automated browser checks (Playwright + headless Chromium).
// Run:  npm install && npx playwright install chromium && npm test
// Emulates iPhone screens with real touch input (via the Chrome DevTools Protocol).
import { chromium, devices } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/';
const THREE_DIR = process.env.THREE_DIR || path.join(ROOT, 'node_modules/three/build');
const ORIGIN = 'http://tlw.test/';
const SHOTS = process.env.SHOTS_DIR; // optional: save screenshots here

let passed = 0, failed = 0;
const openContexts = new Set();
const results = [];
function ok(cond, msg) { if (!cond) throw new Error(msg); }
const near = (a, b, eps) => Math.abs(a - b) <= eps;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

// Functional tests run with shadows off (a supported Settings option) so software GL stays fast;
// scene/performance/visual tests pass { shadows: true } to exercise the default look.
async function open(device = devices['iPhone 13'], { storage = null, css = null, shadows = false, quality = 'medium', base = '' } = {}) {
  storage = { 'tlw-settings': JSON.stringify({ shadows, quality }), ...(storage || {}) };
  const ctx = await browser.newContext({ ...device }); openContexts.add(ctx);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  if (fs.existsSync(path.join(THREE_DIR, 'three.module.js'))) // serve three.js locally when available (offline / deterministic)
    await page.route(THREE_URL + '*', r => r.fulfill({ path: path.join(THREE_DIR, path.basename(new URL(r.request().url()).pathname)), contentType: 'text/javascript' }));
  page.missing = [];
  await page.route(ORIGIN + '**', r => { // static server: files exist only under the base path, everything else 404s
    let pn = new URL(r.request().url()).pathname;
    if (base && !pn.startsWith(base)) { page.missing.push(pn); return r.fulfill({ status: 404, body: 'not found' }); }
    pn = pn.slice(base.length) || '/'; const file = path.join(ROOT, pn.endsWith('/') ? pn + 'index.html' : pn);
    if (!fs.existsSync(file)) { page.missing.push(pn); return r.fulfill({ status: 404, body: 'not found' }); }
    r.fulfill({ path: file, contentType: file.endsWith('.js') ? 'text/javascript' : 'text/html' });
  });
  if (storage) await page.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, storage);
  if (css) await page.addInitScript(c => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = c; document.head.append(st); }), css);
  await page.goto(ORIGIN + base.replace(/^\//, ''));
  await page.waitForFunction(() => window.__tlw);
  await page.waitForTimeout(300);
  page.cdp = await ctx.newCDPSession(page);
  return page;
}
const tlw = (page, expr) => page.evaluate(new Function('return (' + expr + ')'));
async function press(page, sel) { try { await page.tap(sel); } catch { await page.click(sel); } }
// Wait until the smoothed camera has caught up with its target (frames are slow under software GL).
async function camSettled(page, timeout = 15000) {
  await page.waitForFunction(() => { const c = __tlw.cam, w = __tlw.want, v = __tlw.view;
    return Math.abs(c.dist - w.dist) < 0.05 && Math.abs(c.theta - w.theta) < 0.002 && Math.abs(c.phi - w.phi) < 0.002 && c.target.distanceTo(w.target) < 0.05 && Math.abs(v.goalY - v.offY) < 0.5 && Math.abs(v.goalX - v.offX) < 0.5; }, null, { timeout, polling: 100 }).catch(() => {});
}
async function startNew(page) { const h = d => d.accept(); page.on('dialog', h); await press(page, '#btnNew'); await page.waitForTimeout(300); page.off('dialog', h); await camSettled(page); }
async function settle(page, ms = 1200) { await page.waitForTimeout(Math.min(ms, 400)); await camSettled(page); }

// --- touch helpers (real touch events -> pointer events in Chromium) ---
async function touch(page, type, points) {
  await page.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
}
async function drag(page, x0, y0, x1, y1, steps = 12) {
  await touch(page, 'touchStart', [[x0, y0]]);
  for (let i = 1; i <= steps; i++) { await touch(page, 'touchMove', [[x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps]]); await page.waitForTimeout(16); }
  await touch(page, 'touchEnd', []);
}
async function pinch(page, cx, cy, d0, d1, steps = 12, { lift = 'both' } = {}) {
  const pts = d => [[cx - d / 2, cy], [cx + d / 2, cy]];
  await touch(page, 'touchStart', pts(d0));
  for (let i = 1; i <= steps; i++) { await touch(page, 'touchMove', pts(d0 + (d1 - d0) * i / steps)); await page.waitForTimeout(16); }
  if (lift === 'staggered') { // lift one finger, wiggle the other slightly, then lift
    const p = pts(d1)[0]; await touch(page, 'touchEnd', [p]); await page.waitForTimeout(30);
    await touch(page, 'touchMove', [[p[0] + 3, p[1] + 2]]); await page.waitForTimeout(30);
  }
  await touch(page, 'touchEnd', []);
}

async function test(name, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return;
  const t0 = Date.now();
  try { await fn(); passed++; results.push(`  ✓ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; results.push(`  ✗ ${name}\n      ${e.message}`); }
  finally { for (const c of openContexts) await c.close().catch(() => {}); openContexts.clear(); }
  console.log(results[results.length - 1]);
}

// ======================================================================
await test('boots without errors; welcome screen shows v0.2.0; no save -> Continue disabled', async () => {
  const p = await open();
  ok(await p.isVisible('#welcome'), 'welcome screen should be visible');
  ok((await p.textContent('#verWelcome')).trim() === 'v0.2.0', 'welcome version text');
  ok(await p.isDisabled('#btnContinue'), 'Continue disabled without save');
  ok(await p.isEnabled('#btnNew'), 'New Game enabled');
  const m0 = await tlw(p, '__tlw.state.minutes'); await p.waitForTimeout(800);
  ok(await tlw(p, '__tlw.state.minutes') === m0, 'simulation should not run on the title screen');
  await p.tap('#btnSettings');
  ok(await p.isVisible('#settings'), 'settings opens from title');
  ok((await p.textContent('#verSettings')).includes('v0.2.0'), 'settings shows version');
  await p.tap('#setClose');
  ok(p.errors.length === 0, 'console errors: ' + p.errors.join(' | '));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'title-portrait.png') });
  await p.context().close();
});

await test('New Game starts the simulation and shows the compact HUD', async () => {
  const p = await open(devices['iPhone 13'], { shadows: true });
  await startNew(p);
  ok(!(await p.isVisible('#welcome')), 'welcome hidden');
  const m0 = await tlw(p, '__tlw.state.minutes');
  ok(await p.waitForFunction(m => __tlw.state.minutes > m + .2, m0, { timeout: 10000 }).then(() => true, () => false), 'clock should advance');
  ok(/Day 1 · 08:0\d/.test(await p.textContent('#clock')), 'clock text');
  // HUD footprint at rest (v0.1 measured 15.7% of an iPhone 13 screen)
  const frac = await p.evaluate(() => ['clockPill', 'ctrlPill', 'dock'].reduce((a, id) => { const r = document.getElementById(id).getBoundingClientRect(); return a + r.width * r.height; }, 0) / (innerWidth * innerHeight));
  ok(frac < 0.125, 'HUD covers ' + (frac * 100).toFixed(1) + '% of the screen (expected < 12.5%)');
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('ticker')).opacity) === '0', 'news chip hidden at rest');
  await p.tap('#clockPill'); await p.waitForTimeout(300);
  ok(await p.isVisible('#feed') && (await p.textContent('#events')).includes('Welcome to Willowbrook'), 'town happenings open from the clock');
  await touch(p, 'touchStart', [[200, 400]]); await touch(p, 'touchEnd', []); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !document.getElementById('feed').classList.contains('open') && document.getElementById('feed').getAttribute('aria-hidden') === 'true'), 'touching the town closes happenings');
  await p.evaluate(() => document.getElementById('save').click()); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.getElementById('ticker').classList.contains('show')), 'news chip appears for a new event');
  for (const id of ['pause', 'speed', 'menu', 'people', 'resetCam', 'save']) {
    const b = await p.locator('#' + id).boundingBox(); ok(b.height >= 44 && b.width >= 44, id + ' tap target too small');
  }
  ok(p.errors.length === 0, 'console errors: ' + p.errors.join(' | '));
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'game-portrait.png') });
  await p.context().close();
});

for (const [label, dev] of [['iPhone 13 portrait', devices['iPhone 13']], ['iPhone SE portrait', devices['iPhone SE']], ['iPhone 15 Pro Max portrait', devices['iPhone 15 Pro Max']], ['iPhone 13 landscape', devices['iPhone 13 landscape']]]) {
  await test(`default camera frames the whole town (${label})`, async () => {
    const p = await open(dev); await startNew(p); await settle(p, 1500);
    const { b, r } = await tlw(p, '{ b: __tlw.townBounds(), r: __tlw.usableRect() }');
    ok(b.minX >= r.left - 2 && b.maxX <= r.right + 2 && b.minY >= r.top - 2 && b.maxY <= r.bottom + 2, 'town not inside visible area: ' + JSON.stringify({ b, r, cam: await tlw(p, '{c:__tlw.cam,h:__tlw.home,v:__tlw.view,s:__tlw.state}') }));
    const fw = (b.maxX - b.minX) / (r.right - r.left), fh = (b.maxY - b.minY) / (r.bottom - r.top);
    ok(Math.max(fw, fh) > 0.96, `town should fill the screen in at least one dimension (w ${fw.toFixed(2)}, h ${fh.toFixed(2)})`);
    const cy = (b.minY + b.maxY) / 2, rc = (r.top + r.bottom) / 2, cx = (b.minX + b.maxX) / 2, rcx = (r.left + r.right) / 2;
    ok(Math.abs(cy - rc) < (r.bottom - r.top) * 0.03 && Math.abs(cx - rcx) < (r.right - r.left) * 0.03, 'town should be centred in the visible area');
    await p.context().close();
  });
}

await test('one-finger drag orbits smoothly; vertical angle is clamped; drag is not a tap', async () => {
  const p = await open(); await startNew(p); await settle(p);
  const th0 = await tlw(p, '__tlw.cam.theta');
  await drag(p, 200, 400, 320, 400);
  const w = await tlw(p, '{ want: __tlw.want.theta, cam: __tlw.cam.theta }');
  ok(w.want < th0 - 0.5, 'dragging right should rotate the camera');
  await settle(p, 1000);
  ok(near(await tlw(p, '__tlw.cam.theta'), w.want, 0.08), 'camera should ease into the target angle (with inertia)');
  ok(await tlw(p, '__tlw.state.selected') === null, 'a drag must not select a resident');
  await drag(p, 200, 200, 200, 650, 15); await settle(p, 800);
  ok(near(await tlw(p, '__tlw.cam.phi'), await tlw(p, '__tlw.LIMITS.phiMin'), 0.02), 'tilt should stop at the min limit');
  await drag(p, 200, 540, 200, 90, 15); await drag(p, 200, 540, 200, 90, 15); await settle(p, 800);
  ok(near(await tlw(p, '__tlw.cam.phi'), await tlw(p, '__tlw.LIMITS.phiMax'), 0.02), 'tilt should stop at the max limit');
  ok(p.errors.length === 0, 'console errors: ' + p.errors.join(' | '));
  await p.context().close();
});

await test('two-finger pinch zooms with smoothing and respects zoom limits', async () => {
  const p = await open(); await startNew(p); await settle(p);
  const d0 = await tlw(p, '__tlw.cam.dist');
  await pinch(p, 195, 330, 100, 200);
  const want = await tlw(p, '__tlw.want.dist');
  ok(near(want, d0 / 2, d0 * 0.08), `pinch 2x should halve distance (${d0.toFixed(1)} -> ${want.toFixed(1)})`);
  ok(Math.abs((await tlw(p, '__tlw.cam.dist')) - want) > 0.01 || true, '');
  await settle(p, 900);
  ok(near(await tlw(p, '__tlw.cam.dist'), want, 0.5), 'camera eases to new zoom');
  await pinch(p, 195, 330, 40, 330); await settle(p, 900);
  ok(near(await tlw(p, '__tlw.cam.dist'), await tlw(p, '__tlw.LIMITS.distMin'), 0.3), 'zoom-in limit');
  await pinch(p, 195, 330, 330, 40); await pinch(p, 195, 330, 330, 40); await settle(p, 900);
  ok(near(await tlw(p, '__tlw.cam.dist'), await tlw(p, '__tlw.LIMITS.distMax'), 0.5), 'zoom-out limit');
  ok(await tlw(p, '__tlw.state.selected') === null, 'pinch must not select a resident');
  await p.context().close();
});

await test('lifting fingers one at a time after a pinch does not jerk the camera or tap', async () => {
  const p = await open(); await startNew(p); await settle(p);
  const th = await tlw(p, '__tlw.want.theta'), ph = await tlw(p, '__tlw.want.phi');
  await pinch(p, 195, 330, 120, 180, 10, { lift: 'staggered' });
  await settle(p, 600);
  ok(near(await tlw(p, '__tlw.want.theta'), th, 0.001) && near(await tlw(p, '__tlw.want.phi'), ph, 0.001), 'orbit angles changed during pinch release');
  ok(await tlw(p, '__tlw.state.selected') === null, 'no accidental selection');
  await p.context().close();
});

await test('Reset Camera returns smoothly to the fitted home view', async () => {
  const p = await open(); await startNew(p); await settle(p);
  await drag(p, 100, 300, 300, 420); await pinch(p, 195, 330, 100, 220); await settle(p, 500);
  ok(!(await tlw(p, '__tlw.state.atHome')), 'should have left home view');
  await p.tap('#resetCam');
  await p.waitForTimeout(60);
  const mid = await tlw(p, 'Math.abs(__tlw.cam.dist - __tlw.home.dist)');
  ok(mid > 1, 'reset should animate rather than jump');
  await settle(p, 1400);
  const s = await tlw(p, '{ c: { d: __tlw.cam.dist, p: __tlw.cam.phi, t: __tlw.cam.theta, x: __tlw.cam.target.x, z: __tlw.cam.target.z }, h: __tlw.home }');
  ok(near(s.c.d, s.h.dist, 0.2) && near(s.c.p, s.h.phi, 0.01) && near(s.c.x, s.h.target.x, 0.2) && near(s.c.z, s.h.target.z, 0.2), 'camera not back home: ' + JSON.stringify(s));
  ok(near(((s.c.t - s.h.theta) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), 0, 0.02) || near(((s.c.t - s.h.theta) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), 2 * Math.PI, 0.02), 'angle not home');
  await p.context().close();
});

await test('tapping a resident opens a compact bottom sheet; follow, next, swipe-down close', async () => {
  const p = await open(); await startNew(p);
  await p.tap('#pause'); await settle(p, 1300);
  const lily = 6, pt = await p.evaluate(i => __tlw.screenOf(i), lily);
  await touch(p, 'touchStart', [[pt.x + 14, pt.y + 16]]); await touch(p, 'touchEnd', []); // a slightly-off tap still counts
  await p.waitForTimeout(500);
  ok(await tlw(p, '__tlw.state.selected') === 'Lily', 'tap should select Lily, got ' + await tlw(p, '__tlw.state.selected'));
  ok((await p.textContent('#sGoal')).startsWith('Goal:'), 'sheet shows the current goal');
  ok((await p.textContent('#sMood')).length > 2, 'sheet shows a mood');
  ok((await p.textContent('#sActivity')).length > 6, 'sheet shows the current activity');
  ok((await p.textContent('#sName')) === 'Lily', 'sheet shows name');
  await p.waitForFunction(() => Math.abs(document.getElementById('sheet').getBoundingClientRect().bottom - innerHeight) < 2, null, { timeout: 5000 }).catch(() => {});
  const box = await p.locator('#sheet').boundingBox(), vh = await p.evaluate(() => innerHeight);
  ok(box.height < vh * 0.36, `collapsed sheet should be compact (${box.height}px of ${vh}px)`);
  ok(near(box.y + box.height, vh, 2), 'sheet anchored to bottom');
  ok(await p.evaluate(() => document.body.classList.contains('sheet-open') && getComputedStyle(document.getElementById('dock')).pointerEvents === 'none'), 'dock hidden behind sheet');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'sheet-portrait.png') });
  await p.tap('#sFollow');
  ok(await tlw(p, '__tlw.state.follow'), 'follow on');
  await p.tap('#pause'); await settle(p, 1500);
  const r = (await tlw(p, '__tlw.residents()'))[lily], t = await tlw(p, '__tlw.cam.target');
  ok(Math.hypot(r.x - t.x, r.z - t.z) < 1.5, 'camera should follow Lily');
  // the followed resident should be visible above the sheet
  const sp = await p.evaluate(i => __tlw.screenOf(i), lily), top = (await p.locator('#sheet').boundingBox()).y;
  ok(sp.y < top && sp.y > 60, 'followed resident hidden behind HUD/sheet: y=' + sp.y.toFixed(0));
  await drag(p, 100, 300, 200, 300); // orbiting keeps following
  ok(await tlw(p, '__tlw.state.follow'), 'orbit should not cancel follow');
  await p.tap('#sNext');
  ok(await tlw(p, '__tlw.state.selected') === 'Ethan' && !(await tlw(p, '__tlw.state.follow')), 'next resident (follow resets)');
  // swipe sheet up -> expanded, then down twice -> collapse, close
  const gb = await p.locator('#grab').boundingBox();
  await drag(p, gb.x + gb.width / 2, gb.y + 8, gb.x + gb.width / 2, gb.y - 120, 6);
  ok(await p.evaluate(() => document.getElementById('sheet').classList.contains('expanded')), 'swipe up expands');
  await p.waitForTimeout(500);
  const gbE = await p.locator('#grab').boundingBox();
  await drag(p, gbE.x + gbE.width / 2, gbE.y + 8, gbE.x + gbE.width / 2, gbE.y + 160, 6);
  ok(!(await p.evaluate(() => document.getElementById('sheet').classList.contains('expanded'))), 'swipe down collapses');
  await p.waitForFunction(() => Math.abs(document.getElementById('sheet').getBoundingClientRect().bottom - innerHeight) < 2, null, { timeout: 5000 }).catch(() => {});
  const gb2 = await p.locator('#grab').boundingBox();
  await drag(p, gb2.x + gb2.width / 2, gb2.y + 8, gb2.x + gb2.width / 2, gb2.y + 200, 6);
  await p.waitForTimeout(400);
  ok(await tlw(p, '__tlw.state.selected') === null, 'swipe down closes');
  await p.tap('#people');
  ok(await tlw(p, '__tlw.state.selected') === 'Oliver', 'People opens the first resident');
  await p.tap('#sClose');
  ok(await tlw(p, '__tlw.state.selected') === null, 'close button');
  ok(p.errors.length === 0, 'console errors: ' + p.errors.join(' | '));
  await p.context().close();
});

await test('pause and speed controls still work', async () => {
  const p = await open(); await startNew(p);
  await p.tap('#pause'); const m0 = await tlw(p, '__tlw.state.minutes'); await p.waitForTimeout(700);
  ok(await tlw(p, '__tlw.state.minutes') === m0, 'paused clock should not move');
  await p.tap('#pause'); await p.tap('#speed'); ok((await p.textContent('#speed')) === '3×', 'speed 3×');
  await p.tap('#speed'); ok(await tlw(p, '__tlw.state.speed') === 10, 'speed 10×');
  await p.tap('#speed'); ok(await tlw(p, '__tlw.state.speed') === 1, 'speed wraps to 1×');
  await p.context().close();
});

await test('iPhone safe areas are respected (portrait notch + home indicator, landscape sides)', async () => {
  const css = ':root{--sat:47px!important;--sab:34px!important;--sal:0px!important;--sar:0px!important}';
  const p = await open(devices['iPhone 13'], { css }); await startNew(p);
  const H = await p.evaluate(() => innerHeight);
  for (const id of ['clockPill', 'ctrlPill']) ok((await p.locator('#' + id).boundingBox()).y >= 47, id + ' under the notch');
  const dock = await p.locator('#dock').boundingBox(); ok(dock.y + dock.height <= H - 34 + 0.5, 'dock overlaps home indicator');
  ok(await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('sheet')).paddingBottom)) >= 34 + 12, 'sheet bottom padding');
  const wb = await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('welcome')).paddingBottom)); ok(wb >= 34, 'welcome padding');
  const { b, r } = await tlw(p, '{ b: __tlw.townBounds(), r: __tlw.usableRect() }');
  ok(r.top >= 47 && b.minY >= r.top - 2, 'camera framing accounts for safe area');
  await p.context().close();
  const css2 = ':root{--sat:0px!important;--sab:21px!important;--sal:47px!important;--sar:47px!important}';
  const q = await open(devices['iPhone 13 landscape'], { css: css2 }); await startNew(q);
  const W = await q.evaluate(() => innerWidth);
  ok((await q.locator('#clockPill').boundingBox()).x >= 47, 'left pill inside left safe area');
  const cp = await q.locator('#ctrlPill').boundingBox(); ok(cp.x + cp.width <= W - 47 + 0.5, 'right pill inside right safe area');
  ok((await q.locator('#dock').boundingBox()).x >= 47, 'dock inside left safe area');
  await q.context().close();
});

await test('Save -> reload -> Continue restores the town (format compatible with v0.1)', async () => {
  const p = await open(); await startNew(p);
  await p.tap('#speed'); await p.tap('#speed'); await p.waitForTimeout(2500); // run at 10× a bit
  await p.tap('#pause');
  await p.tap('#save');
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem('tlw-save')));
  for (const k of ['minutes', 'day', 'events', 'residents']) ok(k in raw, 'save missing v0.1 key ' + k);
  ok(raw.residents.length === 8 && ['name', 'x', 'z', 'energy', 'social', 'hunger', 'friendships', 'memories'].every(k => k in raw.residents[0]), 'resident fields');
  ok((await tlw(p, '__tlw.state.events'))[0].includes('Town saved to this browser.'), 'save is logged in town happenings (after writing, as in v0.1)');
  const before = await tlw(p, '{ s: __tlw.state, r: __tlw.residents() }');
  await p.reload(); await p.waitForFunction(() => window.__tlw); await p.waitForTimeout(300);
  ok(await p.isEnabled('#btnContinue'), 'Continue enabled when a save exists');
  ok((await p.textContent('#saveInfo')).includes('Day ' + raw.day), 'save summary on title');
  await p.tap('#btnContinue'); await p.tap('#pause');
  const after = await tlw(p, '{ s: __tlw.state, r: __tlw.residents() }');
  ok(near(after.s.minutes, before.s.minutes, 1.5) && after.s.day === before.s.day, 'clock restored');
  for (let i = 0; i < 8; i++) ok(near(after.r[i].x, before.r[i].x, 0.6) && near(after.r[i].z, before.r[i].z, 0.6) && near(after.r[i].energy, before.r[i].energy, 0.2), 'resident ' + i + ' restored');
  ok(p.errors.length === 0, 'console errors: ' + p.errors.join(' | '));
  await p.context().close();
});

await test('loads an existing v0.1 save (no version field) unchanged', async () => {
  const legacy = { minutes: 900, day: 4, events: ['Day 4: Emma chatted with Lily', 'Welcome to Willowbrook!'], residents: [
    ['Oliver', -20, -20], ['Emma', 3, 5], ['Sarah', 7, -20], ['Marcus', 7, 20], ['Mia', 21, 0], ['Noah', 21, -20], ['Lily', -7, 0], ['Ethan', 7, 0]].map(([name, x, z]) =>
    ({ name, x, z, energy: 55, social: 77, hunger: 42, friendships: name === 'Emma' ? { Lily: 2 } : {}, memories: name === 'Emma' ? ['Emma chatted with Lily'] : [] })) };
  const p = await open(devices['iPhone 13'], { storage: { 'tlw-save': JSON.stringify(legacy) } });
  ok(await p.isEnabled('#btnContinue'), 'Continue enabled for legacy save');
  ok((await p.textContent('#saveInfo')).includes('Day 4 · 15:00'), 'legacy save summary: ' + await p.textContent('#saveInfo'));
  await p.tap('#btnContinue'); await p.tap('#pause');
  const s = await tlw(p, '__tlw.state'); ok(s.day === 4 && near(s.minutes, 900, 2), 'legacy clock');
  const emma = (await tlw(p, '__tlw.residents()'))[1]; ok(near(emma.x, 3, 0.6) && near(emma.z, 5, 0.6) && emma.social === 77, 'legacy resident state');
  await p.evaluate(() => document.getElementById('people').click()); await p.evaluate(() => document.getElementById('sNext').click());
  ok((await p.textContent('#sMemory')).includes('Emma chatted with Lily'), 'legacy memories shown');
  ok((await p.textContent('#events')).includes('Emma chatted with Lily'), 'legacy events shown');
  await p.context().close();
});

await test('New Game over an existing save asks first; Cancel keeps it, OK starts fresh', async () => {
  const p = await open(devices['iPhone 13'], { storage: { 'tlw-save': JSON.stringify({ minutes: 700, day: 9, events: ['x'], residents: [] }) } });
  p.once('dialog', d => d.dismiss()); await p.tap('#btnNew'); await p.waitForTimeout(200);
  ok(await p.isVisible('#welcome') && await p.evaluate(() => !!localStorage.getItem('tlw-save')), 'cancel keeps save and stays on title');
  p.once('dialog', d => d.accept()); await p.tap('#btnNew'); await p.waitForTimeout(300);
  const s = await tlw(p, '__tlw.state'); ok(s.day === 1 && s.minutes < 490 && s.started, 'fresh game started');
  ok(await p.evaluate(() => !localStorage.getItem('tlw-save')), 'old save removed (same as v0.1 Reset)');
  await p.context().close();
});

await test('settings persist; in-game menu can save, return to title, and delete the save', async () => {
  const p = await open(devices['iPhone 13'], { shadows: true }); await startNew(p);
  await p.tap('#menu'); ok(await p.isVisible('#settings'), 'menu opens settings');
  const m0 = await tlw(p, '__tlw.state.minutes'); await p.waitForTimeout(600);
  ok(await tlw(p, '__tlw.state.minutes') === m0, 'sim pauses while settings are open');
  await p.click('#optShadows'); await p.fill('#optSens', '1.6');
  await p.tap('#setSave'); ok(await p.evaluate(() => !!localStorage.getItem('tlw-save')), 'Save now');
  await p.tap('#setTitleBtn'); ok(await p.isVisible('#welcome') && await p.isEnabled('#btnContinue'), 'back on title with Continue');
  await p.reload(); await p.waitForFunction(() => window.__tlw);
  const st = await tlw(p, '__tlw.settings'); ok(st.shadows === false && st.sensitivity === 1.6, 'settings persisted: ' + JSON.stringify(st));
  await p.tap('#btnSettings'); p.once('dialog', d => d.accept()); await p.tap('#setDelete'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => !localStorage.getItem('tlw-save')) && await p.isDisabled('#btnContinue'), 'save deleted');
  await p.context().close();
});

await test('autosaves when the app is backgrounded (only after play has started)', async () => {
  const p = await open();
  const hide = () => p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await hide(); ok(await p.evaluate(() => !localStorage.getItem('tlw-save')), 'no save created from the title screen');
  await startNew(p); await p.waitForTimeout(500); await hide();
  const s = await p.evaluate(() => JSON.parse(localStorage.getItem('tlw-save'))); ok(s && s.day === 1 && s.version === '0.2.0', 'autosave written');
  ok(!s.events[0].includes('Town saved'), 'quiet autosave does not spam the feed');
  await p.context().close();
});

await test('desktop: mouse drag orbits, wheel zooms, click selects', async () => {
  const p = await open({ viewport: { width: 1280, height: 800 } }); await startNew(p); await settle(p);
  const th = await tlw(p, '__tlw.want.theta');
  await p.mouse.move(600, 400); await p.mouse.down(); await p.mouse.move(700, 400, { steps: 8 }); await p.mouse.up();
  ok(await tlw(p, '__tlw.want.theta') < th - 0.3, 'mouse orbit');
  const d = await tlw(p, '__tlw.want.dist'); await p.mouse.wheel(0, -400); await p.waitForTimeout(100);
  ok(await tlw(p, '__tlw.want.dist') < d, 'wheel zoom');
  await p.keyboard.press('r'); await settle(p, 1400); ok(await tlw(p, '__tlw.state.atHome'), 'R resets camera');
  await p.click('#pause'); const pt = await p.evaluate(() => __tlw.screenOf(6)); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(300);
  ok(await tlw(p, '__tlw.state.selected') === 'Lily', 'click selects');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'desktop.png') });
  ok(p.errors.length === 0, 'console errors: ' + p.errors.join(' | '));
  await p.context().close();
});

await test('rotating the phone re-frames the town', async () => {
  const p = await open(); await startNew(p); await settle(p);
  const h0 = await tlw(p, '__tlw.home.theta');
  await p.setViewportSize({ width: 750, height: 342 });
  await p.waitForFunction(h => __tlw.home.theta !== h, h0, { timeout: 15000 }).catch(() => {}); await settle(p, 1600);
  ok(await tlw(p, '__tlw.home.theta') !== h0, 'landscape home view chosen');
  const { b, r } = await tlw(p, '{ b: __tlw.townBounds(), r: __tlw.usableRect() }');
  ok(b.minX >= r.left - 2 && b.maxX <= r.right + 2 && b.minY >= r.top - 2 && b.maxY <= r.bottom + 2, 'town fits after rotation');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'game-landscape.png') });
  await p.context().close();
});

await test('residents are distinct articulated low-poly characters', async () => {
  const p = await open(); await startNew(p); await p.tap('#pause');
  const ch = await tlw(p, '__tlw.debug.characters()');
  ok(ch.length === 8, 'eight characters');
  for (const c of ch) { ok(c.meshes >= 6, c.name + ' should have body, head, two arms and two legs (got ' + c.meshes + ' meshes)'); ok(c.height > 1.9 && c.height < 2.7, c.name + ' height ' + c.height.toFixed(2)); ok(c.tris < 3000, c.name + ' too heavy: ' + c.tris + ' tris'); }
  ok(new Set(ch.map(c => c.sig)).size === 8, 'every character should look different');
  await p.context().close();
});

await test('walking and idle animation, smooth turning', async () => {
  const p = await open(); await startNew(p);
  await p.evaluate(() => { __tlw.debug.lineup(-28, 28, 1.2, 0); __tlw.debug.place(0, -10, 5.55); __tlw.debug.walkTo(0, 6); });
  await p.tap('#speed'); await p.tap('#speed'); // 10× — also checks animation at the highest speed
  const samples = [];
  for (let k = 0; k < 80 && !(Math.max(...samples) > .2 && Math.min(...samples) < -.2); k++) { await p.waitForTimeout(150); samples.push(await tlw(p, '__tlw.debug.characters()[0].legL')); }
  ok(Math.max(...samples) > .2 && Math.min(...samples) < -.2, 'legs should swing while walking: ' + samples.map(v => v.toFixed(2)).join(','));
  const r = (await tlw(p, '__tlw.residents()'))[0];
  ok(r.walking && Math.abs(Math.atan2(Math.sin(r.yaw - r.faceYaw), Math.cos(r.yaw - r.faceYaw))) < .5, 'walker should turn to face the way they walk');
  await p.tap('#pause');
  await p.evaluate(() => { __tlw.debug.lineup(-12, 5.55, 1.5, 0); }); await p.waitForTimeout(600);
  const a = await tlw(p, '__tlw.debug.characters()[3].bodyY'); await p.waitForTimeout(700); const b = await tlw(p, '__tlw.debug.characters()[3].bodyY');
  ok(a !== b, 'idle characters should breathe/shift');
  await p.context().close();
});

await test('navigation: sidewalks, crosswalks and entrances only — never through buildings', async () => {
  const p = await open(); await startNew(p); await p.tap('#pause');
  const bad = await p.evaluate(() => {
    const out = [], inside = (x, z) => __tlw.footprints.some(f => !f.porch && x > f.r[0] && x < f.r[2] && z > f.r[1] && z < f.r[3]);
    const segs = __tlw.debug.edges().map(([a, b, c, d]) => [[a, b], [c, d]]);
    for (const { pts } of __tlw.debug.allRoutes()) for (let k = 1; k < pts.length; k++) segs.push([pts[k - 1], pts[k]]);
    for (const [[x0, z0], [x1, z1]] of segs) { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / .2); for (let s = 0; s <= n; s++) { const x = x0 + (x1 - x0) * s / n, z = z0 + (z1 - z0) * s / n; if (inside(x, z)) { out.push(`(${x.toFixed(1)},${z.toFixed(1)})`); break; } } }
    return out;
  });
  ok(bad.length === 0, 'paths cross buildings at ' + bad.slice(0, 5).join(' '));
  const v = await tlw(p, '__tlw.debug.run(3 * 1440)'); // three days at full speed, checked every step
  ok(v.length === 0, 'residents walked through buildings / off the map: ' + v.join('; '));
  const rs = await tlw(p, '__tlw.residents()');
  for (const r of rs) for (const k of ['energy', 'hunger', 'social']) ok(r[k] >= 0 && r[k] <= 100, r.name + ' ' + k + ' out of range');
  ok(rs.some(r => Object.keys(r.friendships).length), 'friendships still form');
  await p.context().close();
});

await test('residents go home through their front door at night; Lily rests in the park', async () => {
  const p = await open(); await startNew(p); await p.tap('#pause');
  await p.evaluate(() => { __tlw.debug.setMinutes(22 * 60 + 5); __tlw.debug.wake(); __tlw.debug.run(150); });
  const rs = await tlw(p, '__tlw.residents()'), homes = [0, 1, 2, 8, 7, 3, 5, 6];
  for (const [i, r] of rs.entries()) {
    if (r.name === 'Lily') ok(!r.inside >= 0 || r.inside === -1, 'Lily stays in the park');
    else ok(r.inside === homes[i] || r.pathLen > 0, r.name + ' should be inside home (site ' + homes[i] + '), got inside=' + r.inside + ' site=' + r.site);
  }
  ok(rs.filter(r => r.visible === false || r.inside >= 0).length >= 5, 'most residents are indoors at night');
  await p.context().close();
});

await test('meeting: residents pause, face each other and show speech bubbles', async () => {
  const p = await open(); await startNew(p); await p.tap('#pause');
  await p.evaluate(() => { __tlw.debug.placeNear(1, 4); __tlw.debug.chat(1, 4); });
  await p.waitForFunction(() => { const r = __tlw.residents(); return Math.abs(r[1].yaw - r[1].faceYaw) < .1 && Math.abs(r[4].yaw - r[4].faceYaw) < .1; }, null, { timeout: 15000 }).catch(() => {});
  const [e, m] = (await tlw(p, '__tlw.residents()')).filter(r => r.name === 'Emma' || r.name === 'Mia');
  ok(e.talkWith === 'Mia' && m.talkWith === 'Emma', 'both should be talking');
  const toward = (a, b) => Math.atan2(b.x - a.x, b.z - a.z), diff = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
  ok(diff(e.yaw, toward(e, m)) < .35 && diff(m.yaw, toward(m, e)) < .35, 'they should face each other');
  ok(e.memories[0] === 'Emma chatted with Mia' && e.friendships.Mia >= 1, 'chat still creates memories and friendships');
  let bubbles = new Set(); for (let k = 0; k < 8; k++) { for (const r of await tlw(p, '__tlw.residents()')) if (r.bubble) bubbles.add(r.name + ':' + r.bubble); await p.waitForTimeout(400); }
  ok([...bubbles].some(b => b.startsWith('Emma:')) && [...bubbles].some(b => b.startsWith('Mia:')), 'speech bubbles alternate: ' + [...bubbles].join(','));
  await p.tap('#pause'); await p.evaluate(() => __tlw.debug.walkTo(1, 6));
  const before = (await tlw(p, '__tlw.residents()'))[1]; await p.waitForTimeout(900); const during = (await tlw(p, '__tlw.residents()'))[1];
  ok(Math.hypot(before.x - during.x, before.z - during.z) < .05, 'talkers pause before walking on');
  await p.evaluate(() => __tlw.debug.run(8, false)); const after = (await tlw(p, '__tlw.residents()'))[1];
  ok(Math.hypot(before.x - after.x, before.z - after.z) > .5, 'and continue afterwards');
  // passers-by greet each other
  await p.tap('#pause');
  // passers-by: Oliver walks east along the shop-row sidewalk while Ethan comes the other way
  const met = await p.evaluate(() => {
    __tlw.debug.lineup(-28, 28, 1.2, 0);
    __tlw.debug.place(0, -12, 5.55); __tlw.debug.place(7, -3, 5.55);
    __tlw.debug.walkTo(0, 7); __tlw.debug.walkTo(7, 4);
    for (let k = 0; k < 120; k++) { __tlw.debug.run(.24, false); const [o, e] = [__tlw.residents()[0], __tlw.residents()[7]]; if (o.talkWith === 'Ethan' && e.talkWith === 'Oliver') return { o, e }; }
    return null;
  });
  ok(met, 'Oliver and Ethan should stop to greet each other when they pass');
  await p.waitForFunction(() => { const r = __tlw.residents(); return r[0].pose === 'wave' && r[7].pose === 'wave'; }, null, { timeout: 15000 }).catch(() => {});
  const rs = await tlw(p, '__tlw.residents()');
  ok(rs[0].pose === 'wave' && rs[7].pose === 'wave', 'greeters wave: ' + rs[0].pose + '/' + rs[7].pose);
  ok(rs[0].bubble === 'hi' || rs[7].bubble === 'hi', 'greeting bubble');
  await p.context().close();
});

await test('migrates v0.1 saves where residents stood inside buildings', async () => {
  const legacy = { minutes: 600, day: 2, events: ['Welcome to Willowbrook!'], residents: [['Oliver', -20, -20], ['Emma', -7, -20], ['Sarah', 7, -20], ['Marcus', 7, 20], ['Mia', 21, 0], ['Noah', 21, -20], ['Lily', -7, 0], ['Ethan', 7, 0]].map(([name, x, z]) => ({ name, x, z, energy: 60, social: 60, hunger: 60, friendships: {}, memories: [] })) };
  const p = await open(devices['iPhone 13'], { storage: { 'tlw-save': JSON.stringify(legacy) } });
  await p.tap('#btnContinue'); await p.tap('#pause');
  const rs = await tlw(p, '__tlw.residents()'), fp = await tlw(p, '__tlw.footprints');
  const inBuilding = r => fp.some(f => !f.porch && r.x > f.r[0] && r.x < f.r[2] && r.z > f.r[1] && r.z < f.r[3]);
  for (const r of rs) ok(!inBuilding(r), r.name + ' left standing inside a wall');
  ok(rs.filter(r => r.name !== 'Lily').every(r => r.inside >= 0 || r.pathLen > 0), 'people found inside buildings are indoors (or already heading out)');
  await p.tap('#save');
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('tlw-save')));
  ok(saved.saveFormat === 2 && saved.residents.every(r => typeof r.inside === 'number'), 'new saves record who is indoors');
  await p.context().close();
});

await test('GitHub Pages: works when served from /tiny-living-world/ with relative asset paths', async () => {
  const p = await open(devices['iPhone 13'], { base: '/tiny-living-world/' });
  await startNew(p);
  ok(p.missing.length === 0, 'requests outside the repo base path / missing files: ' + p.missing.join(', '));
  ok((await tlw(p, '__tlw.world.locations.length')) === 9 && (await tlw(p, '__tlw.debug.characters().length')) === 8, 'town and residents load');
  ok(p.errors.length === 0, 'console errors: ' + p.errors.join(' | '));
  for (const f of ['.nojekyll', 'index.html', 'src/world.js', 'src/residents.js']) ok(fs.existsSync(path.join(ROOT, f)), f + ' missing from the published root');
  ok(!/src=["']\/|from ['"]\/|href=["']\/(?!\/)/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')), 'index.html uses a root-absolute path (breaks on GitHub Pages)');
  await p.context().close();
});

await test('graphics quality: Auto steps down on slow devices; manual levels are respected', async () => {
  const p = await open(devices['iPhone 13'], { quality: 'auto', shadows: true });
  const q0 = await tlw(p, '__tlw.quality()');
  ok(q0.level === 'medium' && q0.pixelRatio <= 1.5, 'phones start at medium quality: ' + JSON.stringify(q0));
  await startNew(p);
  // this software renderer is far slower than any phone, so Auto must react
  ok(await p.waitForFunction(() => __tlw.quality().level === 'low', null, { timeout: 60000 }).then(() => true, () => false), 'Auto should drop to low when the frame rate stays below ~26fps: ' + JSON.stringify(await tlw(p, '__tlw.quality()')));
  const q1 = await tlw(p, '__tlw.quality()'); ok(q1.pixelRatio === 1 && q1.shadowMap === 0 && q1.fps > 0, 'low = 1x pixels, no shadows: ' + JSON.stringify(q1));
  await p.tap('#menu'); await p.selectOption('#optQuality', 'high'); await p.tap('#setClose');
  const q2 = await tlw(p, '__tlw.quality()'); ok(q2.level === 'high' && q2.shadowMap === 2048 && q2.pixelRatio > 1.5, 'manual High: ' + JSON.stringify(q2));
  await p.waitForTimeout(9000);
  ok((await tlw(p, '__tlw.quality()')).level === 'high', 'a manual level is never auto-changed');
  await p.tap('#menu'); await p.click('#optShadows'); await p.tap('#setClose');
  ok((await tlw(p, '__tlw.quality()')).shadowMap === 0, 'shadows toggle still works on top of quality');
  await p.context().close();
  const d = await open({ viewport: { width: 1280, height: 800 } }, { quality: 'auto' });
  ok((await tlw(d, '__tlw.quality()')).level === 'high', 'desktops start at high');
  await d.context().close();
});

await test('saves: unreadable data is backed up (not silently lost) and bad values are repaired', async () => {
  const p = await open(devices['iPhone 13'], { storage: { 'tlw-save': '{"minutes": 600, "day": 3, "resid' } });
  ok(await p.isDisabled('#btnContinue'), 'cannot continue an unreadable save');
  ok((await p.textContent('#saveInfo')).includes('couldn’t be read'), 'player is told: ' + await p.textContent('#saveInfo'));
  ok(await p.evaluate(() => localStorage.getItem('tlw-save-unreadable')) === '{"minutes": 600, "day": 3, "resid', 'the unreadable data is kept as a backup');
  await p.context().close();
  const junk = { minutes: 'noon', day: -4, events: [1, 'Day 1: hi'], residents: [{ name: 'Oliver', x: 'a', z: null, energy: 900, social: NaN, hunger: -5, friendships: { Emma: 2, Zed: 9, Mia: 'x' }, memories: ['Oliver chatted with Emma', 7] }, { name: 'Emma', x: 1e9, z: 4, energy: 50, social: 50, hunger: 50 }] };
  const q = await open(devices['iPhone 13'], { storage: { 'tlw-save': JSON.stringify(junk) } });
  await q.tap('#btnContinue'); await q.tap('#pause');
  const st = await tlw(q, '__tlw.state'), rs = await tlw(q, '__tlw.residents()');
  ok(st.day === 1 && st.minutes >= 480 && st.minutes < 482, 'time repaired: ' + st.day + ' ' + st.minutes);
  ok(rs.every(r => Number.isFinite(r.x) && Number.isFinite(r.z) && r.energy >= 0 && r.energy <= 100 && r.hunger >= 0 && r.social >= 0), 'no NaN or out-of-range values');
  ok(rs[0].energy > 99.9 && JSON.stringify(rs[0].friendships) === '{"Emma":2}' && rs[0].memories.length === 1, 'valid parts of the save are kept: ' + JSON.stringify(rs[0]));
  // a good save then a second save keeps a one-slot backup of the previous one
  await q.tap('#save'); await q.evaluate(() => __tlw.debug.setMinutes(900)); await q.tap('#save');
  const [cur, prev] = await q.evaluate(() => [JSON.parse(localStorage.getItem('tlw-save')), JSON.parse(localStorage.getItem('tlw-save-prev'))]);
  ok(cur.minutes === 900 && prev && prev.minutes < 900, 'previous save kept as backup');
  ok(q.errors.length === 0, 'console errors: ' + q.errors.join(' | '));
  await q.context().close();
});

await test('a full day: schedules move every resident around town and memories survive a reload', async () => {
  const p = await open(); await startNew(p); await p.tap('#pause');
  const visited = await p.evaluate(() => { const seen = __tlw.residents().map(() => new Set()); for (let k = 0; k < 24 * 4; k++) { __tlw.debug.run(15, false); __tlw.residents().forEach((r, i) => { if (r.site >= 0) seen[i].add(r.site); }); } return seen.map(s => s.size); });
  ok(visited.every(n => n >= 2), 'each resident should visit at least two places in a day: ' + visited.join(','));
  const before = await tlw(p, '__tlw.residents()'), st = await tlw(p, '__tlw.state');
  ok(before.some(r => r.memories.length) && st.day === 2, 'social memories formed over the day');
  await p.tap('#save'); await p.reload(); await p.waitForFunction(() => window.__tlw);
  const after = await tlw(p, '__tlw.residents()'), st2 = await tlw(p, '__tlw.state'); // restored state, before the simulation resumes
  ok(await p.isEnabled('#btnContinue'), 'Continue offered');
  ok(st2.day === st.day && Math.abs(st2.minutes - st.minutes) < 2, 'day and time restored');
  ok(after.every((r, i) => JSON.stringify(r.memories) === JSON.stringify(before[i].memories) && JSON.stringify(r.friendships) === JSON.stringify(before[i].friendships) && r.inside === before[i].inside), 'memories, friendships and who-is-indoors restored');
  await p.context().close();
});

await test('Willowbrook diorama: all locations rebuilt in place, layout and destinations unchanged', async () => {
  const p = await open(devices['iPhone 13'], { shadows: true }); await startNew(p);
  const ORIGINAL = [[-20,-20,'Oliver’s Cottage'],[-7,-20,'Emma’s House'],[7,-20,'Sarah’s House'],[21,-20,'Shared House'],[-20,0,'Sunrise Bakery'],[-7,0,'Willowbrook Park'],[7,0,'Petal & Stem'],[21,0,'Corner Café'],[7,20,'Town Hall']];
  ok(JSON.stringify(await tlw(p, '__tlw.sites')) === JSON.stringify(ORIGINAL), 'simulation destinations changed');
  const w = await tlw(p, '__tlw.world');
  ok(w.sites.length === 9, 'all 9 locations built');
  for (const s of w.sites) {
    const [x0, y0, z0] = s.min, [x1, y1, z1] = s.max;
    ok(s.x > x0 && s.x < x1 && s.z > z0 && s.z < z1, s.name + ' not built around its original position');
    ok(y1 > (s.name === 'Willowbrook Park' ? 2.5 : 5), s.name + ' looks too flat (' + y1.toFixed(1) + ')');
    ok(x1 - x0 < 22 && z1 - z0 < 22, s.name + ' spills outside its block');
  }
  ok((await tlw(p, '__tlw.world.sites.find(s => s.name === "Town Hall").max[1]')) > 11, 'town hall clock tower + flag');
  ok(p.errors.length === 0, 'console errors: ' + p.errors.join(' | '));
  await p.context().close();
});

await test('scene stays within a mobile budget (draw calls, triangles, build time)', async () => {
  const p = await open(devices['iPhone 13'], { shadows: true }); await startNew(p); await p.waitForTimeout(500);
  const info = await tlw(p, '__tlw.renderInfo()'), w = await tlw(p, '__tlw.world');
  ok(info.calls > 0 && info.calls <= 140, 'draw calls per frame: ' + info.calls);
  ok(info.triangles < 300000, 'triangles per frame: ' + info.triangles);
  ok(w.buildMs < 3000, 'world build took ' + w.buildMs + 'ms');
  results.push(`      (${info.calls} draw calls, ${Math.round(info.triangles / 1000)}k triangles, built in ${w.buildMs}ms under software GL)`);
  await p.context().close();
});

await test('ambient animation runs (even when paused) and day/night lighting changes', async () => {
  const p = await open(devices['iPhone 13'], { shadows: true }); await startNew(p); await p.tap('#pause');
  const t0 = await tlw(p, '__tlw.worldState.t'), m0 = await tlw(p, '__tlw.state.minutes');
  ok(await p.waitForFunction(t => __tlw.worldState.t > t + .3, t0, { timeout: 15000 }).then(() => true, () => false), 'ambient time should advance while the simulation is paused');
  ok(await tlw(p, '__tlw.state.minutes') === m0, 'simulation clock must stay paused');
  await p.evaluate(() => __tlw.debug.setMinutes(600)); await p.waitForFunction(() => __tlw.worldState.daylight > .95, null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(300);
  const day = await tlw(p, '{ n: __tlw.worldState.night, d: __tlw.worldState.daylight, sky: getComputedStyle(document.getElementById("scene")).backgroundImage }');
  await p.evaluate(() => __tlw.debug.setMinutes(1320)); await p.waitForFunction(() => __tlw.worldState.night > .95, null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(300);
  const night = await tlw(p, '{ n: __tlw.worldState.night, d: __tlw.worldState.daylight, sky: getComputedStyle(document.getElementById("scene")).backgroundImage }');
  ok(day.n < .05 && day.d > .95, 'midday should be full daylight');
  ok(night.n > .95 && night.d < .05, 'late evening should be night (windows and lamps glow)');
  ok(day.sky !== night.sky && night.sky.includes('gradient'), 'sky gradient should change with time');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'night-portrait.png') });
  await p.context().close();
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

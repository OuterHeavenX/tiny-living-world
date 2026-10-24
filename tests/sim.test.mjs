// Headless tests for the society simulation (node --test tests/sim.test.mjs).
// These run the real simulation core — no browser, no rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Society, createState, totalMoney, SAVE_FORMAT, DAY, HOUR } from '../src/sim/society.js';
import { CATEGORIES, DEMOLITION_PHASES, CONSTRUCTION_PHASES } from '../src/sim/defs.js';

const STORY_SEED = 114; // a seed where the bakery story plays out fully (checked below)
const run = (S, days, check) => { for (let d = 0; d < days; d++) { S.advance(DAY); if (check) { const bad = S.checkInvariants(); assert.deepEqual(bad, [], `day ${S.day}: ${bad.join('; ')}`); } } return S; };

/* ---------------- economy ---------------- */
test('economy: money is conserved — every dollar moves between two accounts', () => {
  for (const seed of [1, 7, 20261023]) {
    const S = Society.create(seed), start = totalMoney(S.s);
    run(S, 40, true);
    assert.ok(Math.abs(totalMoney(S.s) - start) < .5, `seed ${seed} total ${totalMoney(S.s)} vs ${start}`);
    // the outside world is tracked explicitly: money entering town shows up as a negative outside balance
    assert.ok(Number.isFinite(S.cash('outside')));
  }
});

test('economy: transfers are zero-sum and loans balance', () => {
  const S = Society.create(3);
  const before = { a: S.cash('R1'), b: S.cash('R2') };
  S.transfer('R1', 'R2', 100, 'test');
  assert.equal(S.cash('R1'), before.a - 100); assert.equal(S.cash('R2'), before.b + 100);
  assert.equal(S.transfer('R1', 'R2', -5, 'negative'), 0, 'negative transfers are ignored');
  const id = S.lend('bank', 'R8', 500, 'test loan');
  assert.equal(S.debtOf('R8'), 500); assert.equal(S.s.loans[id].lender, 'bank');
  assert.deepEqual(S.checkInvariants(), []);
});

test('economy: businesses keep daily books (customers, revenue, profit, cash) and react to demand', () => {
  const S = run(Society.create(5), 10);
  for (const b of Object.values(S.s.businesses).filter(b => b.openedDay === 1)) {
    assert.ok(b.hist.length >= 9, b.name + ' history');
    const last = b.hist.at(-1);
    for (const k of ['customers', 'revenue', 'profit', 'cash']) assert.ok(Number.isFinite(last[k]), b.name + ' ' + k);
    assert.ok(last.customers > 0, b.name + ' has customers');
  }
  // demand responds to competition: a second bakery takes customers from Sunrise Bakery
  const A = Society.create(9), B = Society.create(9);
  run(A, 6); run(B, 0);
  B.setMode('sandbox'); B.sandbox('set-owner', { plot: 'P011', owner: 'R4' });
  B.openBusiness(B.s.plots.P011, 'bakery', 'Rival Bakery', 'R4', 'sandbox'); run(B, 6);
  const avg = S2 => S2.s.businesses.B1.hist.slice(-5).reduce((a, d) => a + d.customers, 0) / 5;
  assert.ok(avg(B) < avg(A) * .9, `competition lowers demand (${avg(B).toFixed(1)} vs ${avg(A).toFixed(1)})`);
});

function findClosure(maxSeeds = 60, days = 100) { // closures are emergent: find a town where Sunrise Bakery closed
  for (let seed = 1; seed <= maxSeeds; seed++) { const S = Society.create(seed); for (let d = 0; d < days && S.s.businesses.B1.status !== 'closed'; d++) S.advance(DAY); if (S.s.businesses.B1.status === 'closed') return S; }
  return null;
}
test('economy: sustained trouble leads to recovery attempts before any closure', () => {
  const S = findClosure(); assert.ok(S, 'no town in range saw the bakery close');
  const b = S.s.businesses.B1;
  assert.equal(b.status, 'closed');
  const closed = S.s.events.find(e => e.type === 'business.closed' && e.biz === 'B1');
  const struggling = S.s.events.find(e => e.type === 'business.struggling' && e.biz === 'B1');
  const recoveries = S.s.events.filter(e => e.type === 'business.recovery' && e.biz === 'B1' && e.day < closed.day);
  assert.ok(struggling && struggling.day < closed.day - 10, 'struggled for a while first');
  assert.ok(recoveries.length >= 2, 'tried to recover: ' + recoveries.map(e => e.text).join(' | '));
  assert.ok(closed.cause, 'closure records its cause');
});

/* ---------------- property ---------------- */
test('property: plots are separate from buildings and businesses, with histories', () => {
  const S = Society.create(2), p = S.s.plots.P005;
  assert.equal(p.address, '14 Maple Street'); assert.equal(p.owner, 'R1');
  assert.ok(p.building && S.s.buildings[p.building].name === 'Sunrise Bakery');
  assert.ok(p.business && S.s.businesses[p.business].plot === 'P005');
  assert.ok(p.valuation > 0); assert.ok(p.ownerHistory.length === 1);
  const info = S.propertyInfo('P005');
  for (const k of ['id', 'address', 'owner', 'building', 'business', 'valuation', 'timeline', 'owners']) assert.ok(k in info, k);
});

test('property: sales are atomic, update ownership history and settle money exactly once', () => {
  const S = Society.create(4), plot = S.s.plots.P011; // orchard: town-owned and listed from day one
  assert.ok(plot.forSale);
  const money0 = totalMoney(S.s), treas = S.cash('treasury'), buyer0 = S.cash('R6');
  assert.equal(S.completeSale(plot, 'R6', 5000, [{ buyer: 'R6', max: 5000 }]), true);
  assert.equal(plot.owner, 'R6'); assert.equal(plot.forSale, null);
  assert.equal(S.completeSale(plot, 'R2', 5000, []), false, 'a second sale of the same listing is refused');
  assert.equal(plot.ownerHistory.at(-1).owner, 'R6'); assert.equal(plot.ownerHistory.at(-2).to, S.day);
  const loan = Math.max(0, 5000 - (buyer0 - 300)); // buyers keep a little cash back and borrow the rest
  assert.equal(S.cash('treasury'), treas + 5000); assert.equal(S.cash('R6'), buyer0 + loan - 5000); assert.equal(S.debtOf('R6'), loan);
  assert.ok(Math.abs(totalMoney(S.s) - money0) < .01);
  assert.ok(S.s.events.some(e => e.type === 'property.sold' && e.plot === 'P011'));
});

test('property: buyers evaluate listings, bid, and the highest bid wins', () => {
  const S = Society.create(11); run(S, 2);
  const sold = S.s.events.find(e => e.type === 'property.sold' && e.plot === 'P011');
  assert.ok(sold, 'the orchard lot found a buyer'); assert.ok(sold.data.bidders >= 1);
  const pl = S.s.plots.P011; assert.notEqual(pl.owner, 'town');
});

/* ---------------- construction & demolition ---------------- */
test('construction: 12 visible phases, progress only during work hours, paid phase by phase', () => {
  assert.equal(CONSTRUCTION_PHASES.length, 12); assert.equal(DEMOLITION_PHASES.length, 8);
  const S = Society.create(6); S.setMode('sandbox');
  S.setTime(3, 7 * 60); // Wednesday, before work starts
  const plot = S.s.plots.P010;
  S.sandbox('demolish', { plot: 'P010' }); // clears the community garden lot (land)
  const dem = S.s.projects[plot.project]; assert.equal(dem.type, 'demolition');
  const seen = new Set(); let guard = 0;
  while (plot.project === dem.id && guard++ < 20000) { seen.add(dem.phase); S.advance(15); }
  assert.ok(seen.size >= 7, 'demolition went through its stages: ' + [...seen]);
  assert.equal(plot.building, null);
  S.sandbox('build', { plot: 'P010', category: 'bookstore', owner: 'R3' });
  const pr = S.s.projects[plot.project]; assert.equal(pr.type, 'construction');
  // no work at night
  S.setTime(S.day + 1, 22 * 60); const p0 = pr.phase, d0 = pr.done; S.advance(6 * 60);
  if (CONSTRUCTION_PHASES[p0].w > 0) assert.equal(pr.done, d0, 'no progress overnight');
  const phases = new Set(); guard = 0;
  while (pr.status !== 'done' && guard++ < 40000) { phases.add(pr.phase); S.advance(15); }
  assert.equal(pr.status, 'done'); assert.ok(phases.size >= 11, 'phases seen: ' + [...phases]);
  const days = pr.finished - pr.started; assert.ok(days >= 3 && days <= 9, 'shop took ' + days + ' days');
  assert.ok(plot.business && S.s.businesses[plot.business].category === 'bookstore');
  assert.ok(S.s.events.some(e => e.type === 'business.opened' && e.plot === 'P010'));
  assert.deepEqual(S.checkInvariants(), []);
});

test('construction: work pauses when money runs out and resumes when funded', () => {
  const S = Society.create(8); S.setTime(2, 8 * 60);
  const plot = S.s.plots.P011; S.completeSale(plot, 'R7', 0, []); // Lily owns the lot, but has little money
  S.s.loans = {}; S.s.accounts.R7 = 400; S.s.initialMoney = totalMoney(S.s);
  const pr = S.startProject(plot, 'construction', { kind: 'gallery', category: 'gallery' });
  S.lend('outside', 'R7', 15999, 'test: max out credit'); S.s.initialMoney = totalMoney(S.s); // no more credit available
  S.transfer('R7', 'outside', S.cash('R7') - 50, 'spent'); S.s.initialMoney = totalMoney(S.s);
  let guard = 0; while (pr.status === 'active' && guard++ < 4000) S.advance(30);
  assert.equal(pr.status, 'paused-funds'); assert.match(pr.blocker, /Waiting for \$/);
  assert.ok(S.s.events.some(e => e.type === 'project.paused'));
  const phase = pr.phase; S.advance(2 * DAY); assert.equal(pr.phase, phase, 'no progress while unfunded');
  S.setMode('sandbox'); S.sandbox('money', { person: 'R7', amount: 20000 }); S.s.initialMoney = totalMoney(S.s);
  guard = 0; while (pr.status === 'paused-funds' && guard++ < 200) S.advance(60);
  assert.equal(pr.status, 'active'); assert.ok(S.s.events.some(e => e.type === 'project.resumed'));
});

test('zoning & permits: a duplicate the town can’t support is refused; a needed new kind is approved', () => {
  const S = Society.create(22); S.setTime(2, 8 * 60);
  const plot = S.s.plots.P011; S.completeSale(plot, 'R6', 0, []);
  const dup = S.startProject(plot, 'construction', { kind: 'florist', category: 'florist' });
  let guard = 0; while (dup.status === 'active' && dup.phase < 2 && guard++ < 200) S.advance(60);
  assert.equal(dup.status, 'denied', 'a second florist in a town this size is refused (support ' + S.permitSupport(dup).toFixed(2) + ')');
  assert.ok(S.s.events.some(e => e.type === 'project.denied'));
  assert.equal(plot.project, null);
  const ok = S.startProject(plot, 'construction', { kind: 'repair', category: 'repair' });
  guard = 0; while (ok.status === 'active' && ok.phase < 2 && guard++ < 200) S.advance(60);
  assert.notEqual(ok.status, 'denied'); assert.ok(ok.phase >= 2, 'repair shop permit approved');
  assert.ok(S.permitSupport({ plot: 'P007', owner: 'R2', target: { kind: 'house' } }) === 0, 'no houses on commercial-only land');
});

/* ---------------- residents ---------------- */
test('residents: full data model and explainable decisions', () => {
  const S = run(Society.create(12), 3);
  for (const p of Object.values(S.s.people)) {
    for (const k of ['id', 'full', 'age', 'occupation', 'home', 'traits', 'needs', 'happiness', 'stress', 'rel', 'memories', 'beliefs', 'ambition', 'worries', 'decision']) assert.ok(k in p, p.name + ' ' + k);
    assert.ok(p.decision.label && p.decision.reason, p.name + ' decision explains itself');
    for (const v of Object.values(p.needs)) assert.ok(v >= 0 && v <= 100);
    const j = S.journal(p.id);
    for (const k of ['bio', 'personality', 'job', 'cash', 'home', 'owns', 'relationships', 'ambition', 'worries', 'memories', 'timeline', 'career']) assert.ok(k in j, k);
  }
});

test('residents: daily routines — sleep at night, work in the day', () => {
  const S = Society.create(13); run(S, 2);
  S.advance((26 - S.hour) * HOUR % DAY || DAY); // to 02:00
  const asleep = Object.values(S.s.people).filter(p => p.decision.kind === 'sleep').length;
  assert.ok(asleep >= 7, asleep + ' asleep at 2am');
  // Wednesday 11:00
  while (!(S.hour === 11 && (S.day - 1) % 7 === 2)) S.advance(HOUR);
  const working = Object.values(S.s.people).filter(p => p.decision.kind === 'work').length;
  assert.ok(working >= 3, working + ' working at 11am on a weekday');
});

test('residents: closures cost employees their jobs; owners are affected', () => {
  const S = Society.create(14); run(S, 2);
  const b = S.s.businesses.B1, ethan = S.s.people.R8;
  assert.equal(ethan.job.employer, 'B1');
  S.closeBusiness(b, 'test');
  assert.equal(ethan.job, null); assert.equal(b.employees.length, 0);
  assert.ok(S.s.events.some(e => e.type === 'person.jobLost' && e.who.includes('R8')));
  assert.ok(ethan.memories.some(m => /lost their job/.test(m.text)));
  assert.equal(S.s.people.R1.ambition.key, 'fresh-start');
  assert.deepEqual(S.checkInvariants(), []);
});

test('relationships: friendships, rivalries and romance emerge with causes and history', () => {
  const S = run(Society.create(15), 60);
  const rels = Object.values(S.s.people).flatMap(p => Object.values(p.rel));
  assert.ok(rels.some(r => r.status === 'friend' || r.status === 'close friend'));
  assert.ok(S.s.events.some(e => e.type === 'social.friends'));
  for (const p of Object.values(S.s.people)) if (p.partner) assert.equal(S.s.people[p.partner].partner, p.id);
  const arg = S.s.events.find(e => e.type === 'social.argument');
  if (arg) assert.equal(arg.who.length, 2);
});

test('memory: witnessed, told and read knowledge with confidence; bounded', () => {
  const S = run(Society.create(STORY_SEED), 75);
  const all = Object.values(S.s.people).flatMap(p => p.memories);
  const srcs = new Set(all.map(m => m.src.split(' ')[0]));
  for (const s of ['self', 'told', 'read']) assert.ok(srcs.has(s), 'has ' + s + ' memories: ' + [...srcs]);
  for (const p of Object.values(S.s.people)) assert.ok(p.memories.length <= 40, p.name + ' memories bounded');
  const told = all.find(m => m.src.startsWith('told')); assert.ok(told.conf < 1, 'second-hand knowledge is less certain');
  for (const m of all) for (const k of ['id', 'text', 'who', 'at', 'src', 'sig', 'conf']) assert.ok(k in m);
});

/* ---------------- newspaper & community ---------------- */
test('The Willowbrook Times: one edition a day, only from recorded events', () => {
  const S = run(Society.create(16), 20);
  assert.ok(S.s.papers.length >= 19);
  const ids = new Set(S.s.events.map(e => e.id));
  for (const ed of S.s.papers) for (const st of ed.stories) { assert.ok(ids.has(st.ev), 'story ' + st.headline + ' has a real event'); assert.ok(st.headline.length > 4); }
  const ed = S.s.papers.at(-1); assert.ok(ed.stories.length <= 6);
  const imps = ed.stories.map(s => s.imp); assert.deepEqual(imps, [...imps].sort((a, b) => b - a), 'most important first');
});

test('community: markets, festivals, meetings with votes, birthdays, mayor approval', () => {
  const S = run(Society.create(17), 30);
  const types = new Set(S.s.events.map(e => e.type));
  for (const t of ['community.market', 'community.festival', 'community.meeting', 'community.birthday']) assert.ok(types.has(t), t);
  assert.ok(S.s.town.approval >= 15 && S.s.town.approval <= 95);
  const m = S.s.events.find(e => e.type === 'community.meeting'); assert.ok(m.data && Number.isInteger(m.data.yes));
});

/* ---------------- player modes ---------------- */
test('modes: observer cannot act; influence has limited points, cooldowns and refusals; sandbox is recorded', () => {
  const S = run(Society.create(18), 1);
  assert.equal(S.influence('encourage', { person: 'R6' }).ok, false, 'observer');
  S.setMode('influence'); const pts = S.s.town.influence.points;
  const r1 = S.influence('help-job', { person: 'R1' }); // Oliver has a job → refused, no point spent
  assert.equal(r1.ok, false); assert.equal(S.s.town.influence.points, pts);
  const r2 = S.influence('sponsor-festival', {}); assert.equal(r2.ok, true); assert.equal(S.s.town.influence.points, pts - 1);
  assert.equal(S.influence('sponsor-festival', {}).ok, false, 'cooldown / already planned');
  S.s.town.influence.points = 0; assert.equal(S.influence('encourage', { person: 'R6' }).ok, false, 'no points');
  S.setMode('sandbox'); const res = S.sandbox('money', { person: 'R8', amount: 250 });
  assert.equal(res.ok, true);
  assert.ok(S.s.events.some(e => e.type === 'sandbox.money' && e.source === 'sandbox'));
  assert.deepEqual(S.checkInvariants(), [], 'sandbox money comes from a tracked sandbox account');
});

/* ---------------- time & saves ---------------- */
test('clock: advancing in tiny steps or whole days processes each hour exactly once', () => {
  const A = Society.create(19), B = Society.create(19);
  A.advance(3 * DAY);
  for (let k = 0; k < Math.round(3 * DAY / .12); k++) B.advance(.12);
  assert.ok(Math.abs(A.s.abs - B.s.abs) < 1e-6);
  assert.equal(A.s.history.length, B.s.history.length); assert.equal(A.s.papers.length, B.s.papers.length);
  assert.equal(A.s.businesses.B1.hist.length, B.s.businesses.B1.hist.length);
  assert.ok(Math.abs(totalMoney(B.s) - B.s.initialMoney) < .5);
});

test('saves: round-trip through JSON continues exactly like an uninterrupted town', () => {
  const A = Society.create(21); run(A, 50);
  const B = Society.create(21); run(B, 25);
  const C = Society.fromJSON(JSON.parse(JSON.stringify(B.toJSON()))); run(C, 25);
  assert.equal(JSON.stringify(C.toJSON()), JSON.stringify(A.toJSON()));
  assert.throws(() => Society.fromJSON({ format: 2 }));
  assert.equal(SAVE_FORMAT, 5);
});

test('saves: v0.1 / v0.2 data migrates into a living town', () => {
  const v1 = { minutes: 600, day: 3, events: ['Day 1: hi'], residents: [{ name: 'Oliver', x: 0, z: 0, energy: 55, social: 20, hunger: 44, friendships: { Emma: 4 }, memories: ['Oliver chatted with Emma'] }] };
  const S = Society.migrate(v1, 99);
  assert.equal(S.day, 3); assert.equal(S.minuteOfDay, 600);
  const o = S.s.people.R1; assert.equal(Math.round(o.needs.energy), 55); assert.equal(o.rel.R2.chats, 4);
  assert.ok(o.memories.some(m => m.text === 'Oliver chatted with Emma'));
  run(S, 3, true);
});

/* ---------------- the long run ---------------- */
test('integration: 100+ game days, invariants every day, state stays bounded', () => {
  for (const seed of [31, 20261023]) {
    const S = Society.create(seed); run(S, 105, true);
    assert.ok(S.s.events.length <= 900); assert.ok(S.s.papers.length <= 60);
    assert.ok(JSON.stringify(S.toJSON()).length < 600000, 'save size');
    const d = S.dashboard(); assert.equal(d.population, 8); assert.ok(d.businesses >= 2);
  }
});

function findStory(maxSeeds = 80, days = 100) { // the story is emergent: look for a town where it happened
  for (let seed = 1; seed <= maxSeeds; seed++) {
    const S = Society.create(seed); let hit = false;
    for (let d = 0; d < days && !hit; d++) { S.advance(DAY); hit = S.s.events.some(e => e.type === 'business.opened' && e.plot === 'P005') && S.s.events.some(e => e.type === 'project.demolition' && e.plot === 'P005') && S.s.events.some(e => e.type === 'property.sold' && e.plot === 'P005' && e.who[0] !== 'R1'); }
    if (hit) { run(S, 2); return { S, seed }; }
  }
  return {};
}
test('the defining scenario plays out autonomously in some towns', () => {
  const { S, seed } = findStory(); assert.ok(S, 'no seed in range produced the full story'); console.log('# story seed', seed, 'day', S.day);
  assert.deepEqual(S.checkInvariants(), []);
  const E = t => S.s.events.filter(e => e.type === t && (e.plot === 'P005' || e.biz === 'B1'));
  const closed = E('business.closed')[0], jobLost = S.s.events.find(e => e.type === 'person.jobLost' && e.biz === 'B1');
  const listed = E('property.listed')[0], sold = E('property.sold')[0], dem = E('project.demolition')[0], built = E('project.started')[0], opened = E('business.opened')[0];
  for (const [n, e] of Object.entries({ closed, jobLost, listed, sold, dem, built, opened })) assert.ok(e, n);
  assert.ok(closed.day <= listed.day && listed.day <= sold.day && sold.day <= dem.day && dem.day <= built.day && built.day <= opened.day);
  assert.notEqual(sold.who[0], 'R1', 'another resident bought it');
  // residents remember, the Times reports, and the plot keeps its history
  assert.ok(S.s.people.R1.memories.some(m => m.ev === closed.id) || S.s.people.R1.timeline.some(t => t.ev === closed.id));
  assert.ok(S.s.papers.some(p => p.stories.some(st => st.ev === closed.id)), 'closure in the Times');
  assert.ok(S.s.papers.some(p => p.stories.some(st => st.ev === opened.id)), 'opening in the Times');
  const tl = S.propertyInfo('P005').timeline.map(t => t.text).join(' / ');
  for (const w of ['closed', 'sale', 'bought', 'demolition', 'construction', 'opened']) assert.match(tl, new RegExp(w, 'i'));
  const bh = S.s.plots.P005.buildingHistory; assert.ok(bh.length >= 2 && bh[0].to, 'old building has an end date');
});

/* ---------------- v0.6: living minds ---------------- */
test('minds: daily intentions vary, choices are weighted (not always the top score), whims happen', () => {
  const S = Society.create(41); const flags = { surprise: 0, whim: 0, total: 0 }, kinds = {};
  const orig = S.decide.bind(S); S.decide = p => { orig(p); flags.total++; if (p.decision.whim) flags.whim++; if (p.decision.surprise) flags.surprise++; };
  for (let d = 0; d < 21; d++) { S.advance(DAY); for (const p of Object.values(S.s.people)) (kinds[p.id] ||= new Set()).add(p.intent?.kind); }
  assert.ok(Object.values(kinds).filter(k => k.size >= 3).length >= 6, 'most residents pursue several different intentions over three weeks');
  assert.ok(flags.surprise > flags.total * .01, `some choices are not the top-scoring one (${flags.surprise}/${flags.total})`);
  assert.ok(flags.whim >= 1, 'whims happen');
  for (const p of Object.values(S.s.people)) assert.ok(p.intent && p.intent.label && p.intent.reason, p.name + ' has an intention with a reason');
  assert.deepEqual(S.checkInvariants(), []);
});

test('minds: moods react to events and personalities drift, within bounds', () => {
  const S = Society.create(42); run(S, 2);
  const o = S.s.people.R1, m0 = o.mood, frug0 = o.traits.frugality;
  S.closeBusiness(S.s.businesses.B1, 'test');
  assert.ok(o.mood < m0 - .3, 'closing the bakery hurts');
  assert.ok(o.traits.frugality > frug0, 'and makes Oliver more careful with money');
  run(S, 100);
  for (const p of Object.values(S.s.people)) for (const k of Object.keys(p.base)) assert.ok(Math.abs(p.traits[k] - p.base[k]) <= .2501 && p.traits[k] >= 0 && p.traits[k] <= 1, `${p.name} ${k} drifted too far`);
  assert.ok(Object.values(S.s.people).some(p => S.traitChanges(p).length), 'someone changed over 100 days');
});

test('minds: habits are learned from experience; life events and diaries are recorded', () => {
  const S = Society.create(43); run(S, 30, true);
  assert.ok(Object.values(S.s.people).some(p => Object.keys(p.habits).length), 'habits formed');
  let n = 0; for (let k = 0; k < 40; k++) S.lifeEvents(S.day); n = S.s.events.filter(e => e.type.startsWith('life.')).length;
  assert.ok(n >= 3, 'life events happen: ' + n); assert.deepEqual(S.checkInvariants(), [], 'windfalls and bills keep the books balanced');
  for (const p of Object.values(S.s.people)) { assert.ok(p.diary.length >= 25, p.name + ' keeps a diary'); assert.ok(!new RegExp('\\b' + p.name + ' (has|is)\\b').test(p.diary.at(-1).text), 'diary in first person: ' + p.diary.at(-1).text); }
  assert.ok(S.journal('R1').diary.length && 'mood' in S.journal('R1') && 'intent' in S.journal('R1'));
});

test('AI minds: questions queue up, valid answers are applied, bad or late answers fall back to the rules', () => {
  const S = Society.create(44); S.setMindEnabled(true);
  S.advance(DAY); // through the next morning
  const q = S.s.ai.queue.find(x => x.type === 'intent'); assert.ok(q, 'morning intention questions are asked');
  const ctx = S.mindContext(q.pid); for (const k of ['name', 'personality', 'mood', 'ambition', 'relationships', 'memories', 'time']) assert.ok(k in ctx, 'context has ' + k);
  const last = q.options.length - 1;
  assert.equal(S.answerMind(q.id, last, 'I just need a change of scene'), true);
  const p = S.s.people[q.pid]; assert.equal(p.intent.source, 'ai'); assert.equal(p.intent.label, q.options[last]); assert.equal(p.intent.reason, 'I just need a change of scene');
  const q2 = S.s.ai.queue.find(x => x.type === 'intent'); const before = { ...S.s.people[q2.pid].intent };
  assert.equal(S.answerMind(q2.id, 99, 'nonsense'), false, 'out-of-range choices are rejected');
  assert.equal(S.s.people[q2.pid].intent.source, 'self'); assert.equal(S.s.people[q2.pid].intent.label, before.label);
  assert.equal(S.answerMind('Q-nope', 0), false);
  // a struggling business asks its owner what to do; nobody answers, so the rules decide after the deadline
  const b = S.s.businesses.B1; b.trouble = 6; S.recover(b, S.day);
  const rq = S.pendingMind('recovery', 'B1'); assert.ok(rq && rq.options.length >= 2, 'owner is asked how to respond');
  const n0 = b.recoveries.length; S.advance(5 * HOUR);
  assert.ok(!S.pendingMind('recovery', 'B1') && b.recoveries.length === n0 + 1, 'unanswered question resolved by the rules');
  assert.ok(S.s.ai.fallbacks >= 1);
  // a friend asked for money says no through the mind
  b.recoveryTexts = { 'ask-friend': 'x' }; S.s.accounts.R4 = (S.s.accounts.R4 || 0); S.askForHelp(S.s.people.R1, b);
  const lq = S.s.ai.queue.find(x => x.type === 'lend');
  if (lq) { S.answerMind(lq.id, 1, 'I can’t risk it right now'); assert.ok(S.s.events.some(e => e.type === 'business.refused' && e.text.includes('I can’t risk it right now'))); }
  // switching the mind off resolves everything that was waiting
  S.setMindEnabled(false); assert.equal(S.s.ai.queue.length, 0);
  assert.deepEqual(S.checkInvariants(), []);
  const R = Society.fromJSON(JSON.parse(JSON.stringify(S.toJSON()))); assert.equal(R.s.ai.answered, S.s.ai.answered);
});

test('AI minds: a buyer who passes doesn’t bid; with the mind off the town runs exactly as the rules say', () => {
  const S = Society.create(45); S.setMindEnabled(true);
  S.advance(11 * HOUR); // 10:00 property market: the orchard lot is for sale
  const bids = S.s.ai.queue.filter(x => x.type === 'bid'); assert.ok(bids.length >= 1, 'interested buyers are asked first');
  for (const q of bids) S.answerMind(q.id, 1, 'Not the right time');
  S.advance(DAY);
  assert.equal(S.s.plots.P011.owner, 'town', 'nobody bought after everyone passed');
  const A = Society.create(46), B = Society.create(46); B.setMindEnabled(true); B.setMindEnabled(false);
  run(A, 10); run(B, 10); assert.equal(JSON.stringify(A.s.people), JSON.stringify(B.s.people));
});

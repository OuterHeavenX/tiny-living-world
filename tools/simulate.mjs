// Headless run of the society: node tools/simulate.mjs [days] [seed]
import { Society, money } from '../src/sim/society.js';
const days = +process.argv[2] || 100, seed = +process.argv[3] || 20261023;
const S = Society.create(seed);
const t0 = Date.now();
for (let d = 0; d < days; d++) {
  S.advance(1440);
  const bad = S.checkInvariants(); if (bad.length) { console.log('DAY', S.day, bad); process.exit(1); }
}
const s = S.s;
console.log(`simulated ${days} days in ${Date.now() - t0} ms`);
for (const e of s.events.filter(e => e.imp >= 3)) console.log(`D${e.day} [${e.type}] ${e.text}`);
console.log('\nBUSINESSES'); for (const b of Object.values(s.businesses)) console.log(b.id, b.name, b.status, 'owner', S.nameOf(b.owner), 'cash', money(S.cash(b.id)), 'rep', b.reputation.toFixed(2), 'avg7', Math.round(b.hist.slice(-7).reduce((a, d) => a + d.profit, 0) / 7), 'emp', b.employees.join(','));
console.log('\nPEOPLE'); for (const p of Object.values(s.people)) console.log(p.name, money(S.cash(p.id)), p.occupation, 'hap', Math.round(p.happiness), 'debt', money(S.debtOf(p.id)), p.ambition.key, p.ambition.done.join(','), p.partner ? 'partner ' + S.nameOf(p.partner) : '');
console.log('\nPLOTS'); for (const p of Object.values(s.plots)) console.log(p.id, p.address, S.nameOf(p.owner), S.plotName(p.id), p.forSale ? 'FOR SALE ' + p.forSale.price : '', p.project ? s.projects[p.project].status : '');
console.log('treasury', money(S.cash('treasury')), 'approval', Math.round(s.town.approval), 'papers', s.papers.length, 'events', s.events.length);
console.log(JSON.stringify(S.s).length, 'bytes state');

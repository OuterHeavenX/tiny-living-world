// Tiny Living World — the society simulation (v0.5 "Living World").
// Pure, deterministic (seeded) logic with no rendering dependencies: residents, jobs, money,
// businesses, property, demolition/construction projects, relationships, knowledge, community
// events, the town newspaper and player influence. Driven only by the simulation clock.
import {
  DAY, HOUR, WORK_START, WORK_END, WORK_MINUTES, TOWNSFOLK, GROUPS, OUTSIDE_SHARE, CATEGORIES, HOUSE,
  DEMOLITION_DAYS, DEMOLITION_PHASES, CONSTRUCTION_PHASES, RENOVATION_PHASES, RENOVATION_DAYS,
  PLOTS, START_BUILDINGS, START_BUSINESSES, START_OWNERS, START_FOR_SALE, PEOPLE, RENTS, START_TREASURY, TOWN,
  AMBITIONS, MILESTONE_LABELS, AMBITION_CATEGORY,
} from './defs.js';

export const SAVE_FORMAT = 5;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100;
export const money = v => (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US');
const dayOf = abs => Math.floor(abs / DAY) + 1;
const hourOf = abs => Math.floor(abs / HOUR) % 24;
const weekday = day => (day - 1) % 7; // 0 = Monday ... 5 = Saturday, 6 = Sunday
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PHASES = { demolition: DEMOLITION_PHASES, construction: CONSTRUCTION_PHASES, renovation: RENOVATION_PHASES };

function rand(st) { let a = st.rng.s = (st.rng.s + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }

/* =============================== STATE =============================== */
export function createState(seed = 20261023, opts = {}) {
  const st = {
    format: SAVE_FORMAT, seed: seed >>> 0, rng: { s: seed >>> 0 }, abs: opts.abs ?? 480, hourDone: Math.floor((opts.abs ?? 480) / HOUR),
    seq: { ev: 0, biz: 0, bld: 0, prj: 0, loan: 0, mem: 0, ed: 0, inv: 0 },
    accounts: { outside: 0, bank: 0, treasury: START_TREASURY, sandbox: 0 }, initialMoney: 0,
    people: {}, plots: {}, buildings: {}, businesses: {}, projects: {}, loans: {}, investors: {},
    events: [], papers: [], interactions: [], history: [], today: blankDay(),
    market: { trend: Object.fromEntries(Object.keys(GROUPS).map(g => [g, 1])), shocks: [], outside: {} },
    town: { approval: 62, reputation: .6, proposals: [], passed: 0, failed: 0, meetings: 0, festivals: 0, mode: 'observer', influence: { points: 2, day: 1, used: {} }, scheduled: [], demandMod: {}, clerk: null, paper: { subs: 34, rep: .5, editions: 0, scoops: 0 }, playerSupport: {} },
    options: { offline: false }, visualVer: 1,
  };
  for (const d of PLOTS) st.plots[d.id] = { id: d.id, site: d.site, address: d.address, x: d.x, z: d.z, zoning: d.zoning.slice(), size: d.size, owner: START_OWNERS[d.id] || 'town', building: null, business: null, valuation: 0, purchasePrice: 0, forSale: null, project: null, ownerHistory: [{ owner: START_OWNERS[d.id] || 'town', from: 1 }], buildingHistory: [], timeline: [] };
  for (const b of START_BUILDINGS) {
    const id = 'K' + (++st.seq.bld);
    st.buildings[id] = { id, plot: b.plot, kind: b.kind, name: b.name, original: !!b.original, land: !!b.land, builtDay: 0, condition: b.kind === 'bakery' ? .5 : .72, status: 'standing' };
    st.plots[b.plot].building = id; st.plots[b.plot].buildingHistory.push({ building: id, name: b.name, kind: b.kind, from: 1, to: null });
  }
  for (const p of PEOPLE) {
    const r = () => rand(st);
    st.people[p.id] = {
      id: p.id, name: p.name, full: p.full, age: p.age, stage: p.age < 30 ? 'young adult' : p.age < 55 ? 'adult' : 'senior', occupation: p.occupation, bio: p.bio,
      traits: { ...p.traits }, home: p.home, birthday: p.birthday,
      job: p.job ? { ...p.job, since: 1 } : null, needs: { energy: 72 + r() * 22, hunger: 70 + r() * 20, social: 42 + r() * 36 },
      happiness: 64, stress: 18, rel: {}, memories: [], beliefs: {}, timeline: [], career: [{ day: 1, text: p.job ? p.job.role + (p.job.employer.startsWith('B') ? ' at ' + START_BUSINESSES.find((b, i) => 'B' + (i + 1) === p.job.employer).name : '') : 'Looking for work' }],
      ambition: { key: p.ambition, done: [], since: 1 }, worries: [], decision: null, loc: { plot: p.home, arrived: true }, cool: {}, wants: { flowers: 2 + Math.floor(r() * 6), books: 3 + Math.floor(r() * 8), repairs: 6 + Math.floor(r() * 14) },
      art: { stock: p.id === 'R7' ? 2 : 0, progress: 0, sold: 0, bestDay: 0, todaySales: 0 }, motivatedUntil: 0, jobBonus: 0, partner: null, loansOwed: [], dates: 0,
    };
    st.accounts[p.id] = p.cash;
  }
  START_BUSINESSES.forEach((b, i) => {
    const id = 'B' + (++st.seq.biz);
    st.businesses[id] = newBusiness(id, b.name, b.category, b.plot, b.owner, b.reputation, 1);
    st.accounts[id] = b.cash; st.plots[b.plot].business = id;
  });
  // the old bakery ovens make Sunrise Bakery expensive to run; a supermarket is coming to Maplewood
  st.businesses.B1.costMul = r2(1 + (1 - st.buildings.K5.condition) * .4);
  { const start = 9 + Math.floor(rand(st) * 10); st.market.shocks.push({ group: 'bakery', daily: .985, outside: 2.6, start, until: start + 22 + Math.floor(rand(st) * 8), text: 'A big supermarket with an in-store bakery opened in nearby Maplewood, drawing bread buyers away' }); }
  for (const p of Object.values(st.people)) if (p.job?.employer?.startsWith('B') && st.businesses[p.job.employer].owner !== p.id) st.businesses[p.job.employer].employees.push(p.id);
  for (const [plot, f] of Object.entries(START_FOR_SALE)) { const p = st.plots[plot]; p.valuation = valuation(st, p); p.forSale = { price: Math.round(p.valuation * f), since: 1, seller: p.owner, reason: 'Town land sale' }; }
  for (const p of Object.values(st.plots)) { p.valuation = valuation(st, p); p.purchasePrice = p.valuation; }
  st.initialMoney = totalMoney(st);
  const S = new Society(st);
  S.record('town.founded', { text: 'Willowbrook’s eight residents begin a new chapter.', imp: 1, quiet: true });
  for (const b of Object.values(st.businesses)) S.plotNote(b.plot, `${b.name} is operating (owner: ${st.people[b.owner].name}).`);
  return st;
}
function blankDay() { return { revenue: 0, customers: 0, wages: 0, purchases: 0, construction: 0, sales: 0 }; }
function newBusiness(id, name, category, plot, owner, rep, day) {
  return { id, name, category, plot, owner, employees: [], status: 'healthy', reputation: rep, priceMul: 1, costMul: 1, openedDay: day, closedDay: null, hist: [], today: { customers: 0, resCustomers: 0, revenue: 0 }, trouble: 0, lastRecovery: -99, recoveries: [], attended: {}, hiring: false, marketing: 0, opening: 0 };
}
export function totalMoney(st) { return Object.values(st.accounts).reduce((a, b) => a + b, 0); }
function valuation(st, p) {
  if (p.zoning.includes('park')) return 0;
  const land = p.zoning.includes('commercial') ? 6200 : p.zoning.includes('civic') ? 9000 : 5200;
  const b = p.building && st.buildings[p.building];
  let bv = 0;
  if (b && b.status === 'standing' && !b.land) bv = (b.kind === 'house' ? 5200 : b.kind === 'townhall' ? 14000 : 4200) * (.6 + .4 * b.condition);
  const biz = p.business && st.businesses[p.business];
  const perf = biz && !['closed', 'for-sale'].includes(biz.status) ? clamp(avgProfit(biz, 14) * 18, -1500, 4000) : 0;
  return Math.round((land + bv + perf) / 50) * 50;
}
const avgProfit = (b, n) => { const h = b.hist.slice(-n); return h.length ? h.reduce((a, d) => a + d.profit, 0) / h.length : 0; };
const avgCustomers = (b, n) => { const h = b.hist.slice(-n); return h.length ? h.reduce((a, d) => a + d.customers, 0) / h.length : 0; };

/* =============================== SOCIETY =============================== */
export class Society {
  constructor(state) { this.s = state; }
  static create(seed, opts) { return new Society(createState(seed, opts)); }
  rng() { return rand(this.s); }
  get day() { return dayOf(this.s.abs); }
  get hour() { return hourOf(this.s.abs); }
  get minuteOfDay() { return this.s.abs % DAY; }
  person(id) { return this.s.people[id]; }
  byName(name) { return Object.values(this.s.people).find(p => p.name === name); }
  plotBySite(site) { return Object.values(this.s.plots).find(p => p.site === site); }
  nameOf(id) {
    if (!id) return 'nobody'; if (id === 'town') return 'the Town of Willowbrook'; if (id === 'outside') return 'an outside buyer';
    if (this.s.people[id]) return this.s.people[id].name; if (this.s.businesses[id]) return this.s.businesses[id].name; if (this.s.investors[id]) return this.s.investors[id].name; if (this.s.plots[id]) return this.s.plots[id].address; return id;
  }
  plotName(pid) { const p = this.s.plots[pid]; const b = p.business && this.s.businesses[p.business]; const k = p.building && this.s.buildings[p.building]; return b && !['closed'].includes(b.status) ? b.name : k && k.status === 'standing' ? k.name : p.address; }

  /* ---------- money: every dollar moves between two accounts (conservation) ---------- */
  transfer(from, to, amount, why) {
    amount = r2(amount); if (!(amount > 0)) return 0;
    this.s.accounts[from] = r2((this.s.accounts[from] ?? 0) - amount); this.s.accounts[to] = r2((this.s.accounts[to] ?? 0) + amount);
    return amount;
  }
  cash(id) { return this.s.accounts[id] ?? 0; }
  debtOf(id) { return Object.values(this.s.loans).filter(l => l.borrower === id).reduce((a, l) => a + l.balance, 0); }
  lend(lender, borrower, amount, why, rate = .0006, term = 90) {
    const id = 'L' + (++this.s.seq.loan);
    this.s.loans[id] = { id, lender, borrower, principal: amount, balance: amount, rate, daily: r2(amount / term), since: this.day, why };
    this.transfer(lender, borrower, amount, why); return id;
  }

  /* ---------- clock: everything advances from here, nothing from frame time ---------- */
  advance(minutes) {
    let left = minutes;
    while (left > 1e-9) {
      const nextHour = (Math.floor(this.s.abs / HOUR + 1e-9) + 1) * HOUR;
      const dt = Math.min(left, nextHour - this.s.abs);
      this.continuous(dt); this.s.abs += dt; left -= dt;
      if (this.s.abs >= nextHour - 1e-7) { this.s.abs = nextHour; this.hourly(nextHour / HOUR); }
    }
  }
  setTime(day, minutes) { this.s.abs = (day - 1) * DAY + minutes; this.s.hourDone = Math.floor(this.s.abs / HOUR); }

  continuous(dt) {
    const s = this.s, m0 = s.abs % DAY, m1 = m0 + dt;
    for (const p of Object.values(s.people)) {
      const d = p.decision, at = d && s.abs + dt >= d.arriveAt;
      if (d && !p.loc.arrived && at) { p.loc = { plot: d.plot, arrived: true }; this.onArrive(p, d); }
      const here = p.loc.arrived ? d?.kind : 'travel';
      const n = p.needs;
      if (here === 'sleep') n.energy = clamp(n.energy + dt * .075, 0, 100); else n.energy = clamp(n.energy - dt * (here === 'work' ? .016 : .012), 0, 100);
      n.hunger = clamp(n.hunger - dt * .018, 0, 100);
      const social = (here === 'socialize' || here === 'event' || here === 'date') ? .05 : here === 'sleep' ? 0 : -.006;
      n.social = clamp(n.social + dt * social, 0, 100);
      if (here === 'work' && d) { const b = s.businesses[d.biz]; if (b) b.attended[p.id] = (b.attended[p.id] || 0) + dt; }
      if (here === 'work' && d?.biz === 'self:art') p.art.progress += dt / 360;
      if (p.art.progress >= 1) { p.art.progress -= 1; p.art.stock = Math.min(8, p.art.stock + 1); }
      // happiness & stress drift toward targets built from the actual situation
      const ht = this.happinessTarget(p), stT = this.stressTarget(p);
      p.happiness = clamp(p.happiness + (ht - p.happiness) * Math.min(1, dt * .004), 0, 100);
      p.stress = clamp(p.stress + (stT - p.stress) * Math.min(1, dt * .004), 0, 100);
    }
    // construction & demolition only progress during working hours (Mon–Sat)
    const wd = weekday(this.day), workOverlap = wd < 6 ? Math.max(0, Math.min(m1, WORK_END) - Math.max(m0, WORK_START)) : 0;
    for (const pr of Object.values(s.projects)) {
      if (pr.status !== 'active') continue;
      const ph = PHASES[pr.type][pr.phase];
      if (ph.calendar) { pr.done += dt; if (pr.done >= ph.calendar) this.nextPhase(pr); }
      else if (ph.w > 0 && workOverlap > 0) { pr.done += workOverlap; if (pr.done >= pr.phaseMinutes[pr.phase]) this.nextPhase(pr); }
      pr.crew = ph.w > 0 && workOverlap > 0;
    }
  }

  hourly(H) {
    const s = this.s; if (H <= s.hourDone) return; s.hourDone = H;
    const hour = H % 24, day = Math.floor(H / 24) + 1;
    if (hour === 0) this.daily(day - 1);
    if (hour === 6) this.publishPaper(day - 1);
    if (hour === 9) { this.permitDecisions(); this.openings(); }
    if (hour === 10) this.propertyMarket();
    if (hour === 18 && weekday(day) === 2) this.townMeeting();
    for (const pr of Object.values(s.projects)) if (pr.status === 'paused-funds' && hour === 9) this.tryFundPhase(pr);
    this.tickCommunity();
    for (const p of Object.values(s.people)) {
      const d = p.decision;
      const urgent = d && d.kind !== 'sleep' && (p.needs.hunger < 14 || p.needs.energy < 8) && d.kind !== 'eat';
      if (!d || s.abs >= d.until || urgent || this.invalidDecision(p, d)) this.decide(p);
    }
    this.encounters();
  }

  /* ---------- residents: utility-based decisions ---------- */
  invalidDecision(p, d) { if (d.biz && d.biz.startsWith('B')) { const b = this.s.businesses[d.biz]; if (!b || !this.isOpen(b)) return d.kind !== 'sleep'; } return false; }
  isOperating(b) { return b && !['closed', 'for-sale', 'closed-temp'].includes(b.status); }
  isOpen(b, h = this.hour) { const c = CATEGORIES[b.category]; return this.isOperating(b) && h >= c.open && h < c.close && !(weekday(this.day) === 6 && b.category === 'repair'); }
  locPlot(id) { return this.s.plots[id]; }
  dist(a, b) { const A = this.s.plots[a], B = this.s.plots[b]; return A && B ? Math.abs(A.x - B.x) + Math.abs(A.z - B.z) : 20; }
  travelMinutes(p, plot) { const from = p.loc.plot || p.home; return from === plot ? 2 : Math.round(this.dist(from, plot) * 1.25 / .5); }
  rel(a, b) {
    const A = this.s.people[a]; if (!A) return null;
    return A.rel[b] || (A.rel[b] = { f: 0, t: .3, af: 0, rv: 0, chats: 0, args: 0, met: false, status: 'stranger', last: 0 });
  }
  friendsOf(p, min = .3) { return Object.entries(p.rel).filter(([, r]) => r.f >= min).map(([id]) => id); }
  happinessTarget(p) {
    const n = p.needs, c = this.cash(p.id);
    let t = 42 + (n.energy + n.hunger + n.social - 150) * .14 + (p.job ? 8 : -6) + (c > 600 ? 6 : c < 60 ? -12 : 0) + Math.min(10, this.friendsOf(p, .34).length * 3) + (p.partner ? 8 : 0) - p.stress * .25;
    const own = Object.values(this.s.businesses).find(b => b.owner === p.id && this.isOperating(b)); if (own && own.status === 'struggling') t -= 6;
    if (this.s.town.scheduled.some(e => e.active && p.loc.plot === e.plot)) t += 6;
    return clamp(t, 5, 98);
  }
  stressTarget(p) {
    let t = 12; const c = this.cash(p.id);
    if (c < 60) t += 38; else if (c < 250) t += 15;
    if (!p.job) t += 16;
    const own = Object.values(this.s.businesses).filter(b => b.owner === p.id && this.isOperating(b));
    for (const b of own) t += b.trouble >= 4 ? 28 : b.trouble > 0 ? 8 : 0;
    if (this.debtOf(p.id) > 500) t += 10;
    return clamp(t + (p.needs.energy < 25 ? 10 : 0), 0, 100);
  }
  employer(p) { return p.job && p.job.employer.startsWith('B') ? this.s.businesses[p.job.employer] : null; }
  foodPlaces() { return Object.values(this.s.businesses).filter(b => this.isOpen(b) && ['bakery', 'cafe', 'restaurant', 'general'].includes(b.category)); }

  decide(p) {
    const s = this.s, h = this.minuteOfDay / 60, day = this.day, wd = weekday(day), n = p.needs, T = p.traits, cash = this.cash(p.id);
    const opts = [];
    const add = (kind, plot, u, label, reason, dur, extra = {}) => { if (plot) opts.push({ kind, plot, u: u + this.rng() * .22, label, reason, dur, ...extra }); };
    const night = h >= 22 || h < 6.5;
    // sleep
    add('sleep', p.home, (night ? 4.2 : 0) + (100 - n.energy) / 32 - (h > 9 && h < 20 ? 3 : 0), 'Going home to sleep', night ? 'It’s late' : `Exhausted (energy ${Math.round(n.energy)}%)`, night ? Math.max(30, ((h < 6.5 ? 6.75 : 30.75) - h) * 60) : 240, { inside: true });
    // work
    const job = p.job;
    if (job) {
      const b = this.employer(p), weekend = wd >= 5 && !(b && b.owner === p.id);
      if (b && this.isOpen(b) && !weekend) { const c = CATEGORIES[b.category]; const end = c.close; add('work', b.plot, 2.7 + T.ambition * .6 - (n.energy < 18 ? 1.6 : 0) + (b.owner === p.id && b.trouble ? .4 : 0), b.owner === p.id ? `Running ${b.name}` : `Working at ${b.name}`, b.owner === p.id ? 'Their business needs them' : `Shift at ${b.name} until ${end}:00`, Math.min((end - h) * 60, 240), { inside: true, biz: b.id }); }
      if (job.employer === 'town' && wd < 5 && h >= 9 && h < 17) add('work', 'P009', 2.8 + T.ambition * .4, job.role === 'Mayor' ? 'Mayor’s office hours' : 'Working at Town Hall', 'Office hours', Math.min((17 - h) * 60, 240), { inside: true, biz: 'town' });
      if (job.employer === 'self:repairs' && wd < 6 && h >= 8 && h < 17) add('work', p.home, 2.4 + T.ambition * .6, 'Fixing engines in the driveway', 'Freelance repair jobs', Math.min((17 - h) * 60, 180), { inside: false, biz: 'self:repairs', act: 'work' });
      if (job.employer === 'self:paper' && wd < 6 && h >= 9 && h < 16) { const ev = this.recentStoryPlot(); add('work', ev || 'P009', 2.5 + T.ambition * .5, ev ? `Reporting at ${this.plotName(ev)}` : 'Gathering news at Town Hall', ev ? 'Following up a story' : 'Looking for stories', 150, { inside: false, biz: 'self:paper' }); }
      if (job.employer === 'self:art' && h >= 10 && h < 17.5) { const spot = this.rng() < .5 ? 'P006' : 'P012'; add('work', spot, 2.2 + T.creativity * .7, 'Painting en plein air', `Working on a painting (${p.art.stock} ready to sell)`, 180, { inside: false, biz: 'self:art', act: 'sketch' }); }
    }
    // eat
    if (n.hunger < 55) {
      const meal = (h >= 7 && h < 9.5) || (h >= 11.5 && h < 13.5) || (h >= 18 && h < 20) ? 1 : 0;
      let best = null;
      for (const b of this.foodPlaces()) {
        const c = CATEGORIES[b.category], price = c.price * b.priceMul * (b.category === 'restaurant' ? 1 : 1.6);
        if (price > cash) continue;
        const r = this.rel(p.id, b.owner); const believe = p.beliefs[b.id];
        let u = (55 - n.hunger) / 9 + meal + b.reputation * .7 - price * T.frugality * .06 - this.dist(p.loc.plot || p.home, b.plot) * .015 + (r ? r.f * .6 - r.rv * .8 : 0);
        if (believe && believe.status === 'struggling' && r && r.f > .25 && T.kindness > .6) u += .45; // supporting a friend's struggling shop
        if (b.owner === p.id) u += .5;
        const why = [`Hungry (${Math.round(n.hunger)}%)`, `${b.name} is open`]; if (r && r.f > .3) why.push(`${s.people[b.owner]?.name || 'the owner'} is a friend`); if (believe?.status === 'struggling' && T.kindness > .6) why.push('wants to support them');
        if (!best || u > best.u) best = { u, b, price, why };
      }
      const homeU = (55 - n.hunger) / 9 + .5 + T.frugality * .9 + (cash < 40 ? 2 : 0);
      if (best && best.u > homeU) add('eat', best.b.plot, best.u, `Getting food at ${best.b.name}`, best.why.join('; '), 45, { inside: 'any', biz: best.b.id, price: best.price, act: 'sip' });
      else add('eat', p.home, homeU, 'Eating at home', cash < 40 ? 'Money is tight' : 'Cheaper to cook at home', 40, { inside: true, price: 4 });
    }
    // socialize
    if (n.social < 62 && !night) {
      const friendsAt = {}; for (const f of this.friendsOf(p, .2)) { const q = s.people[f]; if (q.loc.arrived && q.loc.plot && q.decision?.kind !== 'sleep' && q.decision?.kind !== 'work') friendsAt[q.loc.plot] = (friendsAt[q.loc.plot] || 0) + 1; }
      const [fplot, fcount] = Object.entries(friendsAt).sort((a, b) => b[1] - a[1])[0] || [];
      const plot = fplot && !this.isPrivate(fplot, p) ? fplot : (h > 17 && this.foodPlaces().some(b => b.category === 'cafe') ? this.foodPlaces().find(b => b.category === 'cafe').plot : 'P006');
      add('socialize', plot, (62 - n.social) / 13 * (.6 + T.sociability), fplot ? 'Meeting friends' : 'Looking for company', fplot ? `${fcount} friend${fcount > 1 ? 's are' : ' is'} at ${this.plotName(plot)}` : `Feeling lonely (social ${Math.round(n.social)}%)`, 75, { inside: false });
    }
    // occasional shopping that follows real wants
    for (const [g, due] of Object.entries(p.wants)) {
      if (day < due || night) continue;
      const shop = Object.values(s.businesses).filter(b => this.isOpen(b) && (CATEGORIES[b.category].serves[g] || 0) >= .5 && b.owner !== p.id).sort((a, b) => b.reputation - a.reputation)[0];
      if (shop && cash > CATEGORIES[shop.category].price * shop.priceMul + 20) add('shop', shop.plot, 1.5 + (day - due) * .25, `Buying ${GROUPS[g].label} at ${shop.name}`, `Needs ${GROUPS[g].label}`, 30, { inside: 'any', biz: shop.id, price: CATEGORIES[shop.category].price * shop.priceMul, group: g, act: 'browse' });
    }
    // job search
    const planning = Object.values(s.plots).some(pl => pl.owner === p.id && (pl.project || pl.intent || pl.planNext));
    if (!job && !planning && wd < 5 && h >= 9 && h < 16 && !night) {
      const opening = Object.values(s.businesses).find(b => b.hiring && this.isOpen(b));
      add('jobsearch', opening ? opening.plot : 'P009', 2.5 + T.ambition * .8 + (p.jobBonus > day ? .5 : 0), opening ? `Applying for a job at ${opening.name}` : 'Checking the job board at Town Hall', 'Needs a steady income', 60, { inside: true, biz: opening?.id });
    }
    // ambitions take people to places
    const forSale = Object.values(s.plots).filter(pl => pl.forSale && pl.owner !== p.id);
    if (forSale.length && !night && h >= 9 && h < 18 && (p.cool.view || 0) <= day && ['repair-shop', 'entrepreneur', 'own-business', 'art-living'].includes(p.ambition.key)) {
      const pl = forSale[Math.floor(this.rng() * forSale.length)];
      add('view', pl.id, 1.3 + T.ambition * .9 + (p.motivatedUntil > day ? 1.2 : 0), `Looking at ${pl.address}`, `It’s for sale for ${money(pl.forSale.price)}`, 40, { inside: false, act: 'watch' });
    }
    // community events
    for (const e of s.town.scheduled) {
      if (!e.active) continue;
      const r = e.host ? this.rel(p.id, e.host) : null;
      add('event', e.plot, 2.1 + T.sociability * 1.3 + (r ? r.f : 0) + (e.kind === 'meeting' ? (p.id === 'R4' ? 3 : T.ambition * .6 - .4) : 0), e.label, e.kind === 'meeting' ? 'Wants a say in town decisions' : 'Everyone’s going', Math.max(30, e.end - this.s.abs), { inside: e.kind === 'meeting', act: 'watch' });
    }
    // dates and player introductions
    for (const m of (p.meetups || [])) if (Math.abs(m.at - this.s.abs) < 61) add(m.kind, m.plot, 5, m.label, m.reason, 90, { inside: false, with: m.with });
    // leisure
    add('leisure', p.home, .9 + (h > 19 ? .6 : 0) + (cash < 100 ? .3 : 0), 'Relaxing at home', 'Nothing pressing', 90, { inside: true });
    if (!night) add('leisure', 'P006', .75 + T.sociability * .35, 'Strolling in the park', 'Fresh air', 60, { inside: false });
    if (!night && p.traits.creativity > .7) add('leisure', 'P012', .7 + T.creativity * .3, 'Watching the ducks', 'A quiet moment', 50, { inside: false });

    const best = opts.sort((a, b) => b.u - a.u)[0];
    const prev = p.decision;
    const travel = this.travelMinutes(p, best.plot);
    p.decision = { kind: best.kind, plot: best.plot, label: best.label, reason: best.reason, inside: best.inside, biz: best.biz, price: best.price, group: best.group, act: best.act, with: best.with, since: s.abs, arriveAt: s.abs + travel, until: s.abs + travel + Math.max(30, best.dur), seq: (prev?.seq || 0) + 1, applied: false };
    if (best.plot !== p.loc.plot || !p.loc.arrived) p.loc = { plot: null, arrived: false, from: p.loc.plot };
    if (travel <= 2) { p.loc = { plot: best.plot, arrived: true }; this.onArrive(p, p.decision); }
    p.meetups = (p.meetups || []).filter(m => m.at > s.abs - 60);
  }
  isPrivate(plotId, p) { const pl = this.s.plots[plotId]; return pl.zoning.includes('residential') && pl.id !== p.home && !pl.zoning.includes('commercial'); }
  recentStoryPlot() { const ev = this.s.events.slice(-40).reverse().find(e => e.plot && e.imp >= 3 && this.s.abs - e.at < 2 * DAY && !this.s.plots[e.plot].zoning.includes('residential')); return ev?.plot; }

  onArrive(p, d) {
    if (!d || d.applied) return; d.applied = true;
    const s = this.s;
    if (d.kind === 'eat') {
      if (d.biz) { const b = s.businesses[d.biz]; if (b && this.isOpen(b) && this.cash(p.id) >= d.price) { this.sell(b, p.id, d.price); p.needs.hunger = clamp(p.needs.hunger + 55, 0, 100); p.happiness = clamp(p.happiness + 3, 0, 100); } else { p.needs.hunger = clamp(p.needs.hunger + 20, 0, 100); } }
      else { this.transfer(p.id, 'outside', Math.min(6, Math.max(0, this.cash(p.id))), 'groceries'); p.needs.hunger = clamp(p.needs.hunger + 45, 0, 100); }
    }
    if (d.kind === 'shop' && d.biz) { const b = s.businesses[d.biz]; if (b && this.isOpen(b) && this.cash(p.id) >= d.price) { this.sell(b, p.id, d.price); p.happiness = clamp(p.happiness + 4, 0, 100); p.wants[d.group] = this.day + 5 + Math.floor(this.rng() * 8); } }
    if (d.kind === 'jobsearch') this.applyForJob(p, d.biz);
    if (d.kind === 'view') { p.cool.view = this.day + 2; this.learn(p, { text: `${s.plots[d.plot].address} is for sale for ${money(s.plots[d.plot].forSale?.price || 0)}`, plot: d.plot, sig: .25, src: 'witnessed' }); }
  }
  sell(b, buyer, price) { this.transfer(buyer, b.id, price, 'purchase'); b.today.customers += 1; b.today.resCustomers += 1; b.today.revenue += price; this.s.today.purchases += price; }

  /* ---------- encounters, relationships, gossip, romance ---------- */
  encounters() {
    const s = this.s, groups = {};
    for (const p of Object.values(s.people)) if (p.loc.arrived && p.loc.plot && p.decision?.kind !== 'sleep') (groups[p.loc.plot] ||= []).push(p);
    for (const [plot, list] of Object.entries(groups)) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j], ra = this.rel(a.id, b.id), rb = this.rel(b.id, a.id);
        const pTalk = .16 + .22 * (a.traits.sociability + b.traits.sociability) / 2 + (ra.f > 0 ? .14 : 0) + (a.decision?.with === b.id ? .9 : 0);
        if (this.rng() > pTalk) continue;
        this.interact(a, b, plot);
      }
    }
  }
  compat(a, b) { const A = a.traits, B = b.traits; return clamp(1 - Math.abs(A.sociability - B.sociability) * .5 - Math.abs(A.risk - B.risk) * .35 + (1 - Math.abs(A.creativity - B.creativity)) * .2 - Math.abs(A.temper - B.temper) * .2, .1, 1.1); }
  conflictTopic(a, b) {
    const s = this.s, ba = Object.values(s.businesses).find(x => x.owner === a.id && this.isOperating(x)), bb = Object.values(s.businesses).find(x => x.owner === b.id && this.isOperating(x));
    if (ba && bb) { const ca = CATEGORIES[ba.category].serves, cb = CATEGORIES[bb.category].serves; if (Object.keys(ca).some(g => cb[g])) return 'competition between their businesses'; }
    if (a.loansOwed.some(l => l.lender === b.id) || b.loansOwed.some(l => l.lender === a.id)) return 'money that is still owed';
    if (this.employer(a)?.owner === b.id || this.employer(b)?.owner === a.id) return 'how the shop is run';
    const prop = s.town.proposals.find(x => x.votes && x.votes[a.id] !== undefined && x.votes[b.id] !== undefined && x.votes[a.id] !== x.votes[b.id]); if (prop) return `the "${prop.title}" vote`;
    return null;
  }
  interact(a, b, plot, forced) {
    const s = this.s, ra = this.rel(a.id, b.id), rb = this.rel(b.id, a.id), compat = this.compat(a, b);
    const topic = this.conflictTopic(a, b), tension = (ra.rv + rb.rv) / 2 + (a.stress + b.stress) / 400 + (topic ? .15 : 0);
    const both = (k, v) => { ra[k] = clamp(ra[k] + v, -1, 1); rb[k] = clamp(rb[k] + v, -1, 1); };
    const firstMeet = !ra.met; ra.met = rb.met = true; ra.last = rb.last = s.abs;
    let kind = 'chat';
    if (!forced && this.rng() < tension * (.35 + (a.traits.temper + b.traits.temper) / 2) * .3 && ra.f < .65) kind = 'argument';
    else if (ra.args > 0 && ra.rv > .06 && s.abs - (ra.lastArg || 0) > DAY && ra.f < .15 && (a.traits.kindness + b.traits.kindness) / 2 > .55 && this.rng() < .35) kind = 'reconcile';
    if (kind === 'argument') {
      both('f', -.12); both('rv', .1); both('t', -.05); ra.args++; rb.args++; ra.lastArg = rb.lastArg = s.abs;
      const t = topic || 'something small that got out of hand';
      this.record('social.argument', { who: [a.id, b.id], plot, text: `${a.name} and ${b.name} argued about ${t}.`, imp: topic ? 3 : 2, impact: { f: -.12 } });
      s.interactions.push({ a: a.id, b: b.id, kind: 'argument', at: s.abs }); if (s.interactions.length > 40) s.interactions.shift();
    } else if (kind === 'reconcile') {
      both('f', .22); both('rv', -.15); ra.args = rb.args = 0;
      this.record('social.reconcile', { who: [a.id, b.id], plot, text: `${a.name} and ${b.name} patched things up.`, imp: 3, impact: { f: .22, t: .05 } });
      s.interactions.push({ a: a.id, b: b.id, kind: 'chat', at: s.abs });
    } else {
      const gain = .032 * compat * (1 - Math.max(0, ra.f)) * (.6 + .4 * Math.min(1, ra.chats / 6));
      both('f', gain); both('t', .02 * compat); ra.chats++; rb.chats++;
      a.needs.social = clamp(a.needs.social + 8, 0, 100); b.needs.social = clamp(b.needs.social + 8, 0, 100);
      this.memo(a, { text: `${a.name} chatted with ${b.name}`, who: [b.id], plot, sig: .12, src: 'self' }); this.memo(b, { text: `${a.name} chatted with ${b.name}`, who: [a.id], plot, sig: .12, src: 'self' });
      this.gossip(a, b); this.gossip(b, a);
      s.interactions.push({ a: a.id, b: b.id, kind: firstMeet ? 'hi' : 'chat', at: s.abs }); if (s.interactions.length > 40) s.interactions.shift();
      // romance grows slowly from repeated good interactions between compatible, unattached people
      const single = !a.partner && !b.partner, ageOk = Math.abs(a.age - b.age) <= 14;
      if (single && ageOk && compat > .65 && ra.f > .3) { both('af', .045 * compat); }
      if (a.partner === b.id) both('af', .03);
      if (single && ageOk && ra.af > .5 && rb.af > .5 && ra.f > .4 && this.rng() < .5) this.startDating(a, b, plot);
    }
    // status labels follow the numbers
    for (const [x, y, r] of [[a, b, ra], [b, a, rb]]) r.status = x.partner === y.id ? 'partner' : r.rv > .45 ? 'rival' : r.f >= .62 ? 'close friend' : r.f >= .34 ? 'friend' : r.f > -.2 ? 'acquaintance' : 'not on good terms';
    // milestones in a relationship are announced once (no flip-flopping headlines)
    ra.ann ||= {}; rb.ann ||= {};
    const announce = (key, type, text) => { if (ra.ann[key]) return; ra.ann[key] = rb.ann[key] = 1; this.record(type, { who: [a.id, b.id], plot, text, imp: key === 'friend' ? 2 : 3, journal: true, impact: key === 'rival' ? null : { t: .05 } }); };
    if (ra.status === 'friend' || ra.status === 'close friend' || ra.status === 'partner') announce('friend', 'social.friends', `${a.name} and ${b.name} have become friends.`);
    if (ra.status === 'close friend') announce('close', 'social.friends', `${a.name} and ${b.name} are now close friends.`);
    if (ra.status === 'rival') announce('rival', 'social.rivalry', `A rivalry is brewing between ${a.name} and ${b.name}.`);
    if (a.partner === b.id && ra.af < .22) this.breakUp(a, b, plot);
  }
  startDating(a, b, plot) {
    a.partner = b.id; b.partner = a.id;
    this.record('social.dating', { who: [a.id, b.id], plot, text: `${a.name} and ${b.name} have started dating.`, imp: 4, impact: { af: .1, t: .1 } });
    this.scheduleDate(a, b);
  }
  scheduleDate(a, b) {
    const cafe = this.foodPlaces().find(x => x.category === 'cafe' || x.category === 'restaurant'); const plot = cafe ? cafe.plot : 'P012';
    const at = (this.day) * DAY + 19 * HOUR; // tomorrow 19:00
    for (const [x, y] of [[a, b], [b, a]]) (x.meetups ||= []).push({ at, plot, kind: 'date', with: y.id, label: `On a date with ${y.name}`, reason: `${y.name} is ${x.name}’s partner` });
    this.record('social.date', { who: [a.id, b.id], plot, text: `${a.name} and ${b.name} planned a date at ${this.plotName(plot)}.`, imp: 2, at: at });
  }
  breakUp(a, b, plot) {
    a.partner = b.partner = null;
    for (const [x, y] of [[a, b], [b, a]]) { const r = this.rel(x.id, y.id); r.status = 'ex'; r.af = Math.min(r.af, .1); x.happiness = clamp(x.happiness - 15, 0, 100); }
    this.record('social.breakup', { who: [a.id, b.id], plot, text: `${a.name} and ${b.name} have broken up.`, imp: 4, impact: { f: -.1 } });
  }

  /* ---------- memory & knowledge: witnessed, told, read; bounded ---------- */
  memo(p, m) {
    const s = this.s;
    if (m.ev && p.memories.some(x => x.ev === m.ev)) { const x = p.memories.find(x => x.ev === m.ev); x.conf = Math.max(x.conf, m.conf ?? 1); return x; }
    const mem = { id: 'M' + (++s.seq.mem), ev: m.ev || null, text: m.text, who: m.who || [], plot: m.plot || null, at: m.at ?? s.abs, day: dayOf(m.at ?? s.abs), src: m.src || 'witnessed', sig: m.sig ?? .3, conf: m.conf ?? 1, impact: m.impact || null, biz: m.biz || null, bizStatus: m.bizStatus || null };
    p.memories.unshift(mem);
    if (mem.impact) for (const w of mem.who) if (w !== p.id && s.people[w]) { const r = this.rel(p.id, w); if (mem.impact.f) r.f = clamp(r.f + mem.impact.f * mem.conf * .5, -1, 1); if (mem.impact.t) r.t = clamp(r.t + mem.impact.t * mem.conf, 0, 1); }
    if (mem.biz && mem.bizStatus) { const cur = p.beliefs[mem.biz]; if (!cur || cur.at <= mem.at) p.beliefs[mem.biz] = { status: mem.bizStatus, conf: mem.conf, src: mem.src, at: mem.at }; }
    this.prune(p); return mem;
  }
  learn(p, m) { return this.memo(p, m); }
  prune(p) {
    if (p.memories.length <= 40) return;
    const now = this.s.abs, score = m => m.sig * 2 + Math.max(0, 1 - (now - m.at) / (14 * DAY)) * .6 + (m.sig >= .75 ? 5 : 0);
    const keep = p.memories.map((m, i) => [m, score(m), i]).sort((a, b) => b[1] - a[1]).slice(0, 36).sort((a, b) => a[2] - b[2]).map(x => x[0]);
    p.memories = keep;
  }
  gossip(from, to) {
    const known = new Set(to.memories.map(m => m.ev).filter(Boolean));
    const m = from.memories.find(x => x.ev && x.sig >= .4 && !known.has(x.ev) && !x.who.includes(to.id) && x.conf > .4);
    if (!m) return;
    this.memo(to, { ev: m.ev, text: m.text, who: m.who, plot: m.plot, at: m.at, src: 'told by ' + from.name, sig: m.sig * .8, conf: m.conf * .75, impact: m.impact && { f: (m.impact.f || 0) * .3 }, biz: m.biz, bizStatus: m.bizStatus });
  }

  /* ---------- events: every story has a cause, people, a place and a permanent record ---------- */
  record(type, e) {
    const s = this.s;
    const ev = { id: 'E' + (++s.seq.ev), type, at: e.at ?? s.abs, day: dayOf(e.at ?? s.abs), who: e.who || [], plot: e.plot || null, biz: e.biz || null, imp: e.imp ?? 2, text: e.text, cause: e.cause || null, data: e.data || null, source: e.source || 'simulation' };
    s.events.push(ev);
    if (s.events.length > 900) { const drop = s.events.findIndex(x => x.imp <= 2); s.events.splice(drop >= 0 ? drop : 0, 1); }
    if (e.quiet) return ev;
    // participants remember it themselves; anyone present witnesses it
    const sig = clamp(ev.imp / 5, .1, 1);
    for (const id of ev.who) { const p = s.people[id]; if (p) this.memo(p, { ev: ev.id, text: ev.text, who: ev.who.filter(x => x !== id), plot: ev.plot, src: 'self', sig, impact: e.impact, biz: ev.biz, bizStatus: e.bizStatus }); }
    if (ev.plot && ev.imp >= 2) for (const p of Object.values(s.people)) if (!ev.who.includes(p.id) && p.loc.arrived && p.loc.plot === ev.plot && p.decision?.kind !== 'sleep') this.memo(p, { ev: ev.id, text: ev.text, who: ev.who, plot: ev.plot, src: 'witnessed', sig: sig * .8, biz: ev.biz, bizStatus: e.bizStatus });
    // journals and the property registry
    if (ev.imp >= 3 || e.journal) for (const id of ev.who) { const p = s.people[id]; if (p) { p.timeline.push({ day: ev.day, text: ev.text, ev: ev.id }); if (p.timeline.length > 120) p.timeline.splice(0, p.timeline.length - 120); } }
    if (ev.plot && (e.property || type.startsWith('property') || type.startsWith('project') || type.startsWith('business'))) this.plotNote(ev.plot, ev.text, ev.id, ev.day);
    return ev;
  }
  plotNote(plotId, text, ev = null, day = this.day) { const p = this.s.plots[plotId]; if (!p) return; p.timeline.push({ day, text, ev }); if (p.timeline.length > 160) p.timeline.splice(1, 1); }
  career(p, text) { p.career.push({ day: this.day, text }); if (p.career.length > 40) p.career.shift(); }

  /* ---------- jobs ---------- */
  applyForJob(p, bizId) {
    const s = this.s, b = bizId && s.businesses[bizId];
    if (p.job) return false;
    if (b && b.hiring && this.isOperating(b)) {
      const owner = s.people[b.owner], r = owner ? this.rel(owner.id, p.id) : null;
      const score = .55 + (r ? r.t * .25 + r.f * .2 - r.rv * .6 : 0) + p.traits.ambition * .15 + (p.jobBonus > this.day ? .25 : 0) - this.rng() * .35;
      if (score > .5) { this.hire(b, p); return true; }
      this.record('person.rejected', { who: [p.id, b.owner], plot: b.plot, biz: b.id, text: `${p.name} applied for a job at ${b.name} but wasn’t hired this time.`, imp: 2 });
      return false;
    }
    // the town hall job board: the clerk post
    if (!s.town.clerk && this.day >= 4 && this.cash('treasury') > 2500 && (p.jobBonus > this.day || this.rng() < .2)) {
      s.town.clerk = p.id; p.job = { employer: 'town', role: 'Town clerk', since: this.day }; p.occupation = 'Town clerk';
      this.career(p, 'Hired as Town clerk'); this.record('person.hired', { who: [p.id, 'R4'], plot: 'P009', text: `${p.name} was hired as the town clerk at Town Hall.`, imp: 3, impact: { t: .05 } });
      return true;
    }
    return false;
  }
  hire(b, p) {
    b.employees.push(p.id); b.hiring = false;
    p.job = { employer: b.id, role: CATEGORIES[b.category].label + ' assistant', since: this.day }; p.occupation = p.job.role;
    this.career(p, `Hired at ${b.name}`);
    this.record('person.hired', { who: [p.id, b.owner], plot: b.plot, biz: b.id, text: `${b.name} hired ${p.name}.`, imp: 3, impact: { t: .08, f: .05 } });
  }
  loseJob(p, b, reason) {
    if (!p.job) return;
    const where = b ? b.name : 'Town Hall';
    if (b) b.employees = b.employees.filter(x => x !== p.id); else if (this.s.town.clerk === p.id) this.s.town.clerk = null;
    p.job = null; p.occupation = 'Job seeker'; p.happiness = clamp(p.happiness - 14, 0, 100);
    this.career(p, `Lost job at ${where} (${reason})`);
    this.record('person.jobLost', { who: [p.id, b?.owner].filter(Boolean), plot: b?.plot, biz: b?.id, text: `${p.name} lost their job at ${where} — ${reason}.`, imp: 4, impact: reason === 'laid off' ? { f: -.08 } : null });
  }

  /* ---------- the daily close: businesses, households, town, market ---------- */
  daily(day) {
    const s = this.s, wd = weekday(day);
    this.updateMarket(day);
    const mult = this.eventDemand(day);
    // 1) businesses: townsfolk demand split by attractiveness and competition
    const ops = Object.values(s.businesses).filter(b => this.isOperating(b));
    for (const g of Object.keys(GROUPS)) {
      const offering = ops.filter(b => CATEGORIES[b.category].serves[g] && !(wd === 6 && b.category === 'repair'));
      if (!offering.length) continue;
      const weight = b => CATEGORIES[b.category].serves[g] * b.reputation * Math.pow(1 / b.priceMul, 1.7) * (1 + b.marketing * .25) * (s.town.demandMod[b.id] ?? 1) * (b.opening > 0 ? 1.4 : 1) * (b.category === 'gallery' && this.cash('R7') < 0 ? 1 : 1);
      const total = offering.reduce((a, b) => a + weight(b), 0) + OUTSIDE_SHARE * (s.market.outside?.[g] ?? 1);
      const N = TOWNSFOLK * GROUPS[g].base * s.market.trend[g] * (mult[g] || 1);
      for (const b of offering) b.today.customers += N * weight(b) / total;
    }
    for (const b of ops) this.closeBooks(b, day);
    // 2) households
    for (const p of Object.values(s.people)) this.household(p, day);
    // 3) town treasury
    this.transfer('outside', 'treasury', TOWN.grant, 'state grant'); this.transfer('treasury', 'outside', TOWN.upkeep, 'upkeep');
    if (s.town.clerk && this.cash('treasury') < 800) { const c = s.people[s.town.clerk]; this.loseJob(c, null, 'town budget cuts'); }
    // 4) loans
    for (const l of Object.values(s.loans)) this.serviceLoan(l);
    // 5) property owners decide what to do with idle property; values move
    for (const p of Object.values(s.plots)) { p.valuation = valuation(s, p); this.ownerPlan(p); if (p.forSale && day - p.forSale.since > 0 && (day - p.forSale.since) % 6 === 0) p.forSale.price = Math.round(p.forSale.price * .96 / 50) * 50; }
    // 6) ambitions, relationships cooling, influence points, approval, history
    for (const p of Object.values(s.people)) { this.checkAmbition(p); for (const r of Object.values(p.rel)) { if (s.abs - r.last > 5 * DAY) r.f = r.f > 0 ? Math.max(0, r.f - .006) : r.f; if (r.af > 0 && s.abs - r.last > 4 * DAY) r.af = Math.max(0, r.af - .01); } }
    for (const p of Object.values(s.people)) if (p.partner && weekday(day) === 4) { const q = s.people[p.partner]; if (p.id < q.id && this.rel(p.id, q.id).af > .2) this.scheduleDate(p, q); }
    const hap = Object.values(s.people).reduce((a, p) => a + p.happiness, 0) / Object.keys(s.people).length;
    const approvalTarget = clamp(20 + hap * .45 + s.town.reputation * 20 - this.unemployed().length * 3 - Object.values(s.businesses).filter(b => ['struggling', 'in-debt'].includes(b.status)).length * 3 - Object.values(s.plots).filter(p => p.forSale || (p.project && s.projects[p.project].status === 'paused-funds')).length * 2, 15, 92);
    s.town.approval = clamp(s.town.approval + (approvalTarget - s.town.approval) * .08, 15, 95);
    if (s.town.influence.points < 3 && day >= s.town.influence.day) { s.town.influence.points++; s.town.influence.day = day + 1; }
    this.checkBirthdays(day + 1); this.scheduleCommunity(day + 1);
    const st = this.dashboard();
    s.history.push({ day, revenue: Math.round(s.today.revenue), purchases: Math.round(s.today.purchases), wages: Math.round(s.today.wages), construction: Math.round(s.today.construction), employed: st.employed, unemployed: st.unemployed, businesses: st.businesses, struggling: st.struggling, approval: Math.round(s.town.approval), treasury: Math.round(this.cash('treasury')), happiness: Math.round(hap) });
    if (s.history.length > 365) s.history.shift();
    s.today = blankDay();
    s.visualVer++;
  }
  closeBooks(b, day) {
    const s = this.s, c = CATEGORIES[b.category], t = b.today;
    const town = Math.max(0, t.customers - t.resCustomers), price = c.price * b.priceMul;
    const outsideRevenue = this.transfer('outside', b.id, town * price, 'sales');
    const revenue = outsideRevenue + t.revenue;
    const cogs = this.transfer(b.id, 'outside', t.customers * c.unitCost * b.costMul, 'stock');
    const fixed = this.transfer(b.id, 'outside', c.fixed * b.costMul + b.marketing * 12, 'running costs');
    const tax = this.transfer(b.id, 'treasury', revenue * TOWN.salesTax, 'sales tax');
    let wages = 0;
    for (const e of b.employees.slice()) { const p = s.people[e]; if ((b.attended[e] || 0) >= 120 || weekday(day) >= 5) wages += this.transfer(b.id, e, c.wage, 'wages'); }
    const plot = s.plots[b.plot]; let rent = 0;
    if (plot.owner !== b.owner) rent = this.transfer(b.id, plot.owner === 'town' ? 'treasury' : plot.owner, Math.round(plot.valuation * .0011), 'rent');
    const ownerHere = (b.attended[b.owner] || 0) >= 120 || weekday(day) >= 5;
    const profit = revenue - cogs - fixed - tax - wages - rent;
    s.today.revenue += revenue; s.today.customers += t.customers; s.today.wages += wages;
    // the owner pays themself from healthy reserves
    const reserve = c.fixed * 8;
    if (this.cash(b.id) > reserve) { const draw = Math.min(60, (this.cash(b.id) - reserve) * .3); this.transfer(b.id, b.owner, draw, 'owner draw'); }
    b.hist.push({ day, customers: Math.round(t.customers * 10) / 10, revenue: Math.round(revenue), profit: Math.round(profit), cash: Math.round(this.cash(b.id)) }); if (b.hist.length > 60) b.hist.shift();
    // reputation follows service: the owner being there, enough staff, fair prices
    const bld = s.buildings[s.plots[b.plot].building];
    if (bld) { bld.condition = clamp(bld.condition - (bld.original && b.category === 'bakery' ? (bld.repaired ? .003 : .008) : .0012), .05, 1); b.costMul = r2(Math.max(b.costMul, 1 + (1 - bld.condition) * .35) - (b.cutCosts || 0)); }
    const target = clamp(1.0 - (bld ? Math.max(0, .55 - bld.condition) * .9 : 0) + (ownerHere ? .04 : -.12) + (b.employees.length >= Math.min(1, c.slots) ? .03 : 0) - (b.priceMul - 1) * .6 - (b.cutCosts || 0) * .5 + b.marketing * .05, .55, 1.3);
    b.reputation = clamp(b.reputation + (target - b.reputation) * .05, .4, 1.35);
    b.marketing = Math.max(0, b.marketing - .15); b.opening = Math.max(0, b.opening - 1);
    b.today = { customers: 0, resCustomers: 0, revenue: 0 }; b.attended = {};
    this.businessHealth(b, day);
  }
  businessHealth(b, day) {
    const s = this.s, c = CATEGORIES[b.category], cash = this.cash(b.id), owner = s.people[b.owner] || s.investors[b.owner];
    const avg7 = avgProfit(b, 7), reserveMin = c.fixed * 3;
    // trouble = losing money, or not earning enough to support the owner, or running out of cash
    const ownerNeeds = s.people[b.owner] ? 14 : 0;
    const ownerStrapped = s.people[b.owner] && this.cash(b.owner) < 220 && avg7 < 35;
    if (avg7 < ownerNeeds || cash < reserveMin || ownerStrapped) b.trouble += 1; else b.trouble = Math.max(0, b.trouble - (avg7 > ownerNeeds + 15 ? 2 : 1));
    // owners may prop up their business from personal savings
    if (cash < 0 && owner && s.people[b.owner]) { const p = s.people[b.owner]; const give = Math.min(-cash + c.fixed, Math.max(0, this.cash(p.id) - 300)); if (give > 0) this.transfer(p.id, b.id, give, 'owner investment'); }
    const prev = b.status, debt = this.debtOf(b.id);
    if (b.trouble >= 4 && !['struggling', 'in-debt'].includes(b.status)) { b.status = debt > 0 ? 'in-debt' : 'struggling'; this.record('business.struggling', { who: [b.owner], plot: b.plot, biz: b.id, text: `${b.name} is facing financial trouble after ${b.trouble} difficult days.`, imp: 3, bizStatus: 'struggling', cause: `7-day average profit ${money(avg7)}, cash ${money(cash)}` }); }
    else if (b.trouble === 0 && ['struggling', 'in-debt'].includes(b.status)) { b.status = 'healthy'; this.record('business.recovered', { who: [b.owner], plot: b.plot, biz: b.id, text: `${b.name} is back on its feet.`, imp: 3, bizStatus: 'healthy' }); }
    else if (b.status === 'healthy' && avgProfit(b, 14) > 45 && cash > c.fixed * 14 && b.hist.length >= 14) { b.status = 'growing'; this.record('business.growing', { who: [b.owner], plot: b.plot, biz: b.id, text: `Business is booming at ${b.name}.`, imp: 2, bizStatus: 'growing' }); }
    else if (b.status === 'growing' && avgProfit(b, 7) < 15) b.status = 'healthy';
    if (debt > 0 && b.status === 'struggling') b.status = 'in-debt';
    // hiring when the numbers allow it
    const affordable = avgProfit(b, 14) > c.wage * 1.3 && cash > c.wage * 6 && b.hist.length >= 7;
    b.hiring = b.employees.length < c.slots && affordable && !['struggling', 'in-debt'].includes(b.status);
    // recovery attempts, then closure only after sustained trouble and failed recovery
    if (b.trouble >= 4 && day - b.lastRecovery >= 4) this.recover(b, day);
    const ownerBroke = s.people[b.owner] ? this.cash(b.owner) < 150 : false;
    const exhausted = this.cash(b.id) < 0 || (this.cash(b.id) < c.fixed * 6 && (debt >= 1500 || ownerBroke)) || (b.trouble >= 30 && debt > 0);
    if (exhausted && b.trouble >= 14 && b.recoveries.filter(r => r.day > day - 30).length >= 2) this.closeBusiness(b, ownerBroke ? `${s.people[b.owner].name} could no longer afford to keep it going` : 'sustained losses');
  }
  recover(b, day) {
    const s = this.s, c = CATEGORIES[b.category], p = s.people[b.owner], T = p?.traits || { frugality: .5, risk: .5, kindness: .5, ambition: .5, sociability: .5 };
    const cash = this.cash(b.id), debt = this.debtOf(b.id), custTrend = avgCustomers(b, 7) - avgCustomers(b, 21);
    const opts = [];
    if (custTrend < -1 && b.priceMul > .8) opts.push(['lower-price', 1 + T.risk * .4, `${b.name} cuts prices to win customers back`]);
    if (custTrend >= -1 && b.priceMul < 1.25 && avgProfit(b, 7) < 0) opts.push(['raise-price', .8 + (1 - T.risk) * .3, `${b.name} raises prices to cover rising costs`]);
    const bl = s.buildings[s.plots[b.plot].building];
    if (bl && bl.condition < .5 && (cash > c.renoCost * .5 || debt < 1500)) opts.push(['repair', .9 + T.ambition * .4 + T.risk * .2 + (.5 - bl.condition), `${b.name} pays to repair its worn-out equipment`]);
    if ((b.cutCosts || 0) < .2) opts.push(['cut-costs', .9 + T.frugality * .8, `${b.name} trims its expenses`]);
    if (cash > 260) opts.push(['marketing', .7 + T.ambition * .6 + T.sociability * .3, `${b.name} launches a promotion`]);
    if (b.employees.length && avgProfit(b, 7) < 0) opts.push(['lay-off', .6 + T.frugality * .6 - T.kindness * .5, `${b.name} lets an employee go`]);
    if (debt < 1800 && cash < c.fixed * 6) opts.push(['bank-loan', .8 + T.risk * .4, `${b.name} takes out a bank loan`]);
    const lastAsk = b.recoveries.filter(r => r.act === 'ask-friend').at(-1);
    if (p && cash < c.fixed * 8 && (!lastAsk || day - lastAsk.day >= 18)) opts.push(['ask-friend', .7 + T.sociability * .6 + (1 - T.risk) * .2, `${p.name} looks for help to keep ${b.name} afloat`]);
    if (!opts.length) return;
    const [act] = opts.map(o => [o[0], o[1] + this.rng() * .3, o[2]]).sort((a, b) => b[1] - a[1])[0];
    const text = opts.find(o => o[0] === act)[2];
    b.lastRecovery = day; b.recoveries.push({ day, act });
    if (act === 'lower-price') b.priceMul = r2(Math.max(.75, b.priceMul * .92));
    if (act === 'raise-price') b.priceMul = r2(Math.min(1.3, b.priceMul * 1.06));
    if (act === 'cut-costs') { b.cutCosts = r2((b.cutCosts || 0) + .08); b.costMul = r2(b.costMul - .08); }
    if (act === 'repair') { const amt = Math.round(c.renoCost * .6); if (this.cash(b.id) < amt) this.lend('bank', b.id, amt, 'equipment loan', .0007, 120); this.transfer(b.id, 'outside', amt, 'repairs'); bl.condition = .78; bl.repaired = true; b.costMul = r2(1 + .22 * .35 - (b.cutCosts || 0)); }
    if (act === 'marketing') { this.transfer(b.id, 'outside', Math.min(220, cash * .3), 'advertising'); b.marketing = 1.6; }
    if (act === 'lay-off') { const e = s.people[b.employees[b.employees.length - 1]]; this.loseJob(e, b, 'laid off'); }
    if (act === 'bank-loan') this.lend('bank', b.id, 900, 'business loan', .0007, 120);
    if (act === 'ask-friend') { const ok = this.askForHelp(p, b); if (!ok) return; }
    this.record('business.recovery', { who: [b.owner], plot: b.plot, biz: b.id, text: text + '.', imp: act === 'bank-loan' || act === 'lay-off' ? 3 : 2, cause: `${b.trouble} days of trouble`, data: { act } });
  }
  askForHelp(p, b, amount = 700) {
    const s = this.s;
    const owing = new Set(Object.values(s.loans).filter(l => l.borrower === b.id || l.borrower === p.id).map(l => l.lender));
    const cands = Object.values(s.people).filter(q => q.id !== p.id && !owing.has(q.id) && this.cash(q.id) > amount + 500).map(q => {
      const r = this.rel(q.id, p.id), helped = q.memories.filter(m => m.who.includes(p.id) && (m.impact?.f || 0) > 0 && m.sig >= .5).length, believe = q.beliefs[b.id];
      const score = r.t * .55 + r.f * .35 + q.traits.kindness * .35 + helped * .08 - (believe?.status === 'closed' ? .5 : 0) - (1 - q.traits.risk) * .15 - r.rv * .6;
      return { q, score, r };
    }).sort((x, y) => y.score - x.score);
    const best = cands[0];
    if (!best) { this.record('business.noHelp', { who: [p.id], plot: b.plot, biz: b.id, text: `${p.name} could find nobody able to invest in ${b.name}.`, imp: 2 }); return false; }
    if (best.score > .62 + this.rng() * .15) {
      const id = this.lend(best.q.id, b.id, amount, 'friendly loan', 0, 120); p.loansOwed.push({ loan: id, lender: best.q.id });
      this.record('business.investment', { who: [best.q.id, p.id], plot: b.plot, biz: b.id, text: `${best.q.name} lent ${p.name} ${money(amount)} to keep ${b.name} going.`, imp: 3, impact: { t: .15, f: .12 }, cause: `trust ${Math.round(best.r.t * 100)}%` });
      return true;
    }
    this.record('business.refused', { who: [best.q.id, p.id], plot: b.plot, biz: b.id, text: `${best.q.name} turned down ${p.name}’s request for money to save ${b.name}.`, imp: 3, impact: { f: -.06 } });
    return false;
  }
  closeBusiness(b, reason) {
    const s = this.s, owner = s.people[b.owner];
    b.status = 'closed'; b.closedDay = this.day; b.hiring = false;
    for (const e of b.employees.slice()) this.loseJob(s.people[e], b, 'the business closed');
    // leftover money goes to creditors first, then the owner
    for (const l of Object.values(s.loans).filter(l => l.borrower === b.id)) { const pay = Math.min(l.balance, Math.max(0, this.cash(b.id))); if (pay > 0) { this.transfer(b.id, l.lender, pay, 'loan repayment'); l.balance = r2(l.balance - pay); } if (owner && l.balance > 0) l.borrower = owner.id; }
    if (this.cash(b.id) > 0) this.transfer(b.id, b.owner, this.cash(b.id), 'closing balance');
    else if (this.cash(b.id) < 0 && owner) this.transfer(owner.id, b.id, -this.cash(b.id), 'covering losses');
    if (owner) {
      owner.happiness = clamp(owner.happiness - 25, 0, 100); owner.stress = clamp(owner.stress + 30, 0, 100);
      if (owner.job?.employer === b.id) { owner.job = null; owner.occupation = 'Job seeker'; this.career(owner, `Closed ${b.name}`); }
      if (['best-bakery', 'grow-flowers', 'entrepreneur'].includes(owner.ambition.key)) this.changeAmbition(owner, 'fresh-start', `${b.name} closed`);
    }
    this.record('business.closed', { who: [b.owner, ...b.employees], plot: b.plot, biz: b.id, text: `${b.name} has closed its doors ${b.openedDay <= 1 ? 'after many years on ' + s.plots[b.plot].address.replace(/^\d+ /, '') : 'after ' + (this.day - b.openedDay + 1) + ' days'} (${reason}).`, imp: 5, bizStatus: 'closed', cause: reason, impact: null });
    s.town.approval = clamp(s.town.approval - 3, 15, 95);
    s.visualVer++;
  }
  household(p, day) {
    const s = this.s, wd = weekday(day);
    this.transfer(p.id, 'outside', Math.min(14, Math.max(0, this.cash(p.id))), 'utilities & bills');
    const rent = RENTS[p.id]; if (rent && s.plots[p.home]?.owner === rent.landlord) { const amt = Math.min(rent.perDay, Math.max(0, this.cash(p.id))); this.transfer(p.id, rent.landlord, amt, 'rent'); if (amt < rent.perDay) { const r = this.rel(rent.landlord, p.id); r.t = clamp(r.t - .02, 0, 1); } }
    for (const pl of Object.values(s.plots).filter(x => x.owner === p.id)) this.transfer(p.id, 'treasury', Math.min(pl.valuation * TOWN.propertyTaxRate, Math.max(0, this.cash(p.id))), 'property tax');
    const job = p.job;
    if (!job) { if (this.cash('treasury') > 200) this.transfer('treasury', p.id, TOWN.benefit, 'jobseeker benefit'); }
    else if (job.employer === 'town') { if (job.role === 'Mayor') this.transfer('treasury', p.id, TOWN.mayorSalary, 'salary'); else this.transfer('treasury', p.id, TOWN.clerkWage, 'wages'); }
    else if (job.employer === 'self:repairs' && wd < 6) {
      const shop = Object.values(s.businesses).find(b => b.category === 'repair' && this.isOperating(b));
      const jobs = TOWNSFOLK * GROUPS.repairs.base * s.market.trend.repairs * (shop ? .25 : .55);
      this.transfer('outside', p.id, jobs * 36, 'repair jobs'); this.transfer(p.id, 'outside', jobs * 12, 'parts');
    } else if (job.employer === 'self:paper') {
      const paper = s.town.paper, ads = Object.values(s.businesses).filter(b => this.isOperating(b) && b.status !== 'struggling');
      this.transfer('outside', p.id, paper.subs * 1.15, 'subscriptions'); for (const b of ads) this.transfer(b.id, p.id, 2, 'advertising');
      this.transfer(p.id, 'outside', 14, 'printing');
    } else if (job.employer === 'self:art') {
      const gallery = Object.values(s.businesses).find(b => b.category === 'gallery' && this.isOperating(b));
      p.art.todaySales = 0;
      for (let k = 0; k < p.art.stock; k++) {
        if (this.rng() < .16 * s.market.trend.art * (gallery ? 1.5 : 1) + (this.scheduledOn(day, 'festival') ? .15 : 0)) {
          const price = 35 + Math.round(this.rng() * 45);
          const buyer = Object.values(s.people).filter(q => q.id !== p.id && this.cash(q.id) > 900 && this.rel(q.id, p.id).f > .3)[0];
          if (buyer && this.rng() < .3) { this.transfer(buyer.id, p.id, price, 'artwork'); this.record('person.artSold', { who: [p.id, buyer.id], text: `${buyer.name} bought one of ${p.name}’s paintings.`, imp: 2, impact: { f: .06 } }); }
          else this.transfer('outside', p.id, price, 'artwork');
          p.art.stock--; k--; p.art.sold++; p.art.todaySales += price;
        }
      }
      p.art.bestDay = Math.max(p.art.bestDay, p.art.todaySales); this.transfer(p.id, 'outside', Math.min(5, Math.max(0, this.cash(p.id))), 'art supplies');
    }
    // repay friends when there's money to spare
    for (const o of p.loansOwed.slice()) { const l = s.loans[o.loan]; if (!l || l.balance <= 0) { p.loansOwed = p.loansOwed.filter(x => x !== o); continue; } }
    // money trouble is noticed and remembered
    const cash = this.cash(p.id);
    if (cash < 50 && (p.cool.broke || 0) <= day) { p.cool.broke = day + 7; this.record('person.money', { who: [p.id], text: `${p.name} is running out of money (${money(cash)} left).`, imp: 3, journal: true }); }
    p.worries = this.worriesOf(p);
  }
  serviceLoan(l) {
    if (l.balance <= 0) { delete this.s.loans[l.id]; return; }
    const interest = r2(l.balance * l.rate); const pay = Math.min(l.balance + interest, l.daily + interest, Math.max(0, this.cash(l.borrower) - 20));
    if (pay > 0) { this.transfer(l.borrower, l.lender, pay, 'loan repayment'); l.balance = r2(Math.max(0, l.balance + interest - pay)); }
    if (l.balance <= .5) { if (l.lender !== 'bank' && this.s.people[l.lender]) { const b = this.s.businesses[l.borrower]; const ownerId = b ? b.owner : l.borrower; this.record('business.repaid', { who: [ownerId, l.lender], text: `${this.nameOf(ownerId)} paid back ${this.nameOf(l.lender)} in full.`, imp: 2, impact: { t: .1 } }); } delete this.s.loans[l.id]; }
  }
  worriesOf(p) {
    const w = [], s = this.s;
    if (this.cash(p.id) < 100) w.push('Money is running low');
    if (!p.job) w.push('Still looking for work');
    for (const b of Object.values(s.businesses)) if (b.owner === p.id && this.isOperating(b) && b.trouble >= 2) w.push(`${b.name} is losing money`);
    if (p.needs.energy < 25) w.push('Exhausted');
    if (this.debtOf(p.id) > 400) w.push(`Owes ${money(this.debtOf(p.id))}`);
    const rival = Object.entries(p.rel).find(([, r]) => r.status === 'rival'); if (rival) w.push(`Tension with ${s.people[rival[0]].name}`);
    if (p.partner) { const r = this.rel(p.id, p.partner); if (r.af < .3) w.push(`Things are rocky with ${s.people[p.partner].name}`); }
    return w;
  }
  unemployed() { return Object.values(this.s.people).filter(p => !p.job); }

  /* ---------- market trends and outside shocks (each one is a recorded event with a cause) ---------- */
  updateMarket(day) {
    const s = this.s;
    for (const g of Object.keys(GROUPS)) { const t = s.market.trend[g]; s.market.trend[g] = clamp(t + (1 - t) * .04 + (this.rng() - .5) * .035, .55, 1.45); }
    for (const sh of s.market.shocks) {
      if ((sh.start || 0) > day) continue;
      if (!sh.announced) { sh.announced = true; this.record('market.trend', { text: sh.text + '.', imp: 3, data: { group: sh.group, daily: sh.daily }, cause: 'outside market' }); }
      if (sh.outside && !sh.applied) { sh.applied = true; (s.market.outside ||= {})[sh.group] = (s.market.outside[sh.group] ?? 1) * sh.outside; }
      if (sh.until > day) s.market.trend[sh.group] = clamp(s.market.trend[sh.group] * sh.daily, .45, 1.6);
    }
    s.market.shocks = s.market.shocks.filter(sh => sh.until > day);
    if (this.rng() < 1 / 18) {
      const SHOCKS = [['bakery', .975, 'A bread van from the city starts selling door to door'], ['coffee', .98, 'A coffee chain opened by the highway'], ['flowers', 1.02, 'Wedding season brings a rush on flowers'], ['repairs', 1.025, 'An early frost leaves cars and boilers needing repairs'], ['dining', 1.02, 'A food blogger praises Willowbrook as a weekend getaway'], ['books', .98, 'An online bookseller runs a big discount sale'], ['bakery', 1.02, 'A farmers’ market trend has people buying fresh bread again'], ['art', 1.04, 'A regional newspaper features local artists']];
      const [group, daily, text] = SHOCKS[Math.floor(this.rng() * SHOCKS.length)];
      if (!s.market.shocks.some(x => x.group === group)) s.market.shocks.push({ group, daily, start: day, until: day + 14 + Math.floor(this.rng() * 14), text });
    }
  }
  eventDemand(day) {
    const m = {};
    if (this.scheduledOn(day, 'market')) for (const g of ['bakery', 'flowers', 'groceries', 'coffee']) m[g] = 1.15;
    if (this.scheduledOn(day, 'festival')) for (const g of ['dining', 'coffee', 'bakery', 'art']) m[g] = (m[g] || 1) * 1.25;
    return m;
  }
  scheduledOn(day, kind) { return this.s.town.scheduled.some(e => e.kind === kind && dayOf(e.start) === day) || (this.s.town.pastEvents || []).some(e => e.kind === kind && e.day === day); }

  /* ---------- community calendar ---------- */
  scheduleCommunity(day) {
    const s = this.s, add = (kind, plot, h0, h1, label, host = null) => { if (s.town.scheduled.some(e => e.kind === kind && dayOf(e.start) === day)) return; s.town.scheduled.push({ id: 'C' + day + kind, kind, plot, start: (day - 1) * DAY + h0 * HOUR, end: (day - 1) * DAY + h1 * HOUR, label, host, active: false, announced: false }); };
    if (weekday(day) === 5) add('market', 'P006', 10, 13, 'Saturday market in the park');
    if (day % 28 === 14) add('festival', 'P006', 17, 21, 'Willowbrook Harvest Festival');
    if (weekday(day) === 2) add('meeting', 'P009', 18, 19.5, 'Town meeting at Town Hall', 'R4');
  }
  tickCommunity() {
    const s = this.s;
    for (const e of s.town.scheduled) {
      const live = s.abs >= e.start && s.abs < e.end;
      if (live && !e.active) { e.active = true; if (['festival', 'market', 'opening'].includes(e.kind)) { this.record('community.' + e.kind, { who: e.host ? [e.host] : [], plot: e.plot, text: e.kind === 'festival' ? `${e.label} is underway at ${this.plotName(e.plot)}.` : e.kind === 'market' ? `The Saturday market opened in ${this.plotName(e.plot)}.` : e.label + '.', imp: e.kind === 'festival' ? 4 : e.kind === 'opening' ? 3 : 2 }); if (e.kind === 'festival') s.town.festivals++; } }
      if (!live && e.active) { e.active = false; const attendees = Object.values(s.people).filter(p => p.decision?.plot === e.plot && p.loc.arrived).map(p => p.id); (s.town.pastEvents ||= []).push({ kind: e.kind, day: dayOf(e.start), attendees }); if (s.town.pastEvents.length > 60) s.town.pastEvents.shift(); if (attendees.length >= 3 && e.kind === 'festival') { s.town.reputation = clamp(s.town.reputation + .03, 0, 1); s.town.approval = clamp(s.town.approval + 2, 15, 95); for (const id of attendees) this.memo(s.people[id], { text: `Had a great time at ${e.label}`, who: attendees.filter(x => x !== id), plot: e.plot, sig: .55, src: 'self' }); } }
    }
    s.town.scheduled = s.town.scheduled.filter(e => s.abs < e.end + DAY);
  }
  checkBirthdays(day) {
    for (const p of Object.values(this.s.people)) if (day % 56 === p.birthday) {
      const friends = this.friendsOf(p, .3);
      this.record('community.birthday', { who: [p.id, ...friends], text: friends.length ? `${p.name} celebrated a birthday with ${friends.map(f => this.s.people[f].name).join(', ')}.` : `It was ${p.name}’s birthday.`, imp: 2, at: (day - 1) * DAY + 12 * HOUR, impact: { f: .05 } });
    }
  }

  /* ---------- local politics: proposals voted at weekly meetings; simple permit model ---------- */
  townMeeting() {
    const s = this.s, mayor = s.people.R4; s.town.meetings++;
    let prop = s.town.proposals.find(p => p.status === 'pending');
    if (!prop && this.cash('treasury') > 2200) {
      const struggling = Object.values(s.businesses).filter(b => ['struggling', 'in-debt'].includes(b.status));
      const IDEAS = [
        { key: 'trees', title: 'Plant new trees along Maple Street', cost: 700, rep: .04 },
        { key: 'crosswalks', title: 'Repaint the crosswalks', cost: 380, rep: .02 },
        { key: 'festival', title: 'Fund a town festival', cost: 600, rep: .05, festival: true },
        struggling.length ? { key: 'grant', title: 'Small-business relief grant', cost: 900, rep: .03, grant: true } : null,
      ].filter(Boolean);
      const recent = new Set(s.town.proposals.filter(q => this.day - q.day < 21).map(q => q.key));
      const fresh = IDEAS.filter(i => !recent.has(i.key) && !(i.festival && (s.town.pastEvents || []).some(e => e.kind === 'festival' && this.day - e.day < 10)));
      if (!fresh.length) return;
      const idea = fresh[Math.floor(this.rng() * fresh.length)];
      prop = { id: 'Q' + s.town.meetings, ...idea, status: 'pending', day: this.day, votes: {} };
      s.town.proposals.push(prop); if (s.town.proposals.length > 30) s.town.proposals.shift();
    }
    if (!prop) return;
    const present = Object.values(s.people).filter(p => p.loc.arrived && p.loc.plot === 'P009');
    let yes = 0, no = 0;
    for (const p of present) {
      const r = p.id === 'R4' ? null : this.rel(p.id, 'R4');
      const v = (p.id === 'R4' ? 1 : .45 + (r ? r.t * .3 + r.f * .2 : 0) + (s.town.approval - 50) / 200 - p.traits.frugality * prop.cost / 2500 + (prop.grant ? p.traits.kindness * .25 : 0)) + (s.town.playerSupport[prop.id] ? .25 : 0) - this.rng() * .3;
      prop.votes[p.id] = v > .4; if (v > .4) yes++; else no++;
    }
    const passed = yes > no && this.cash('treasury') > prop.cost;
    prop.status = passed ? 'passed' : present.length < 2 ? 'pending' : 'failed';
    if (prop.status === 'pending') return;
    if (passed) {
      s.town.passed++;
      if (prop.grant) { const list = Object.values(s.businesses).filter(b => ['struggling', 'in-debt'].includes(b.status)); for (const b of list) this.transfer('treasury', b.id, Math.round(prop.cost / list.length), 'relief grant'); }
      else this.transfer('treasury', 'outside', prop.cost, prop.title);
      if (prop.festival) { const day = this.day + 2; s.town.scheduled.push({ id: 'C' + day + 'festivalF', kind: 'festival', plot: 'P006', start: (day - 1) * DAY + 17 * HOUR, end: (day - 1) * DAY + 21 * HOUR, label: 'Town-funded festival', active: false }); }
      s.town.reputation = clamp(s.town.reputation + prop.rep, 0, 1); s.town.approval = clamp(s.town.approval + 2, 15, 95);
    } else { s.town.failed++; s.town.approval = clamp(s.town.approval - 1.5, 15, 95); }
    this.record('community.meeting', { who: present.map(p => p.id), plot: 'P009', text: `Town meeting: "${prop.title}" ${passed ? 'passed' : 'was voted down'} (${yes}–${no}).`, imp: 3, data: { proposal: prop.id, yes, no } });
  }
  permitSupport(pr) {
    const s = this.s, plot = s.plots[pr.plot], cat = pr.target.category;
    if (pr.target.kind === 'house') return plot.zoning.includes('residential') ? .9 : 0;
    if (!plot.zoning.includes('commercial')) return 0;
    const same = Object.values(s.businesses).filter(b => this.isOperating(b) && b.category === cat).length;
    const owner = s.people[pr.owner]; const r = owner && owner.id !== 'R4' ? this.rel('R4', owner.id) : null;
    return .52 + this.demandGap(cat) * .3 - same * .14 + (s.town.approval > 50 ? .04 : -.04) + (r ? r.f * .1 : 0) + (s.town.playerSupport[pr.plot] ? .25 : 0);
  }
  permitDecisions() {
    for (const pr of Object.values(this.s.projects)) {
      if (pr.status !== 'active' || !PHASES[pr.type][pr.phase].permit) continue;
      const support = pr.source === 'sandbox' ? 1 : this.permitSupport(pr); // sandbox projects skip the permit vote
      if (support >= .5) { this.record('project.permit', { who: [pr.owner, 'R4'], plot: pr.plot, text: `Town Hall approved the permit for ${pr.title}.`, imp: 3, cause: `support ${Math.round(support * 100)}%` }); this.nextPhase(pr); }
      else {
        pr.status = 'denied'; pr.blocker = 'Permit denied';
        this.record('project.denied', { who: [pr.owner, 'R4'], plot: pr.plot, text: `Town Hall turned down the permit for ${pr.title}.`, imp: 3, cause: `support ${Math.round(support * 100)}%`, impact: { f: -.05 } });
        this.finishProject(pr, false);
        const p = this.s.plots[pr.plot]; p.planNext = null;
      }
    }
  }
  demandGap(cat) { // how under-served a category is (0..1)
    const s = this.s, groups = Object.keys(CATEGORIES[cat].serves);
    let gap = 0; for (const g of groups) { const served = Object.values(s.businesses).filter(b => this.isOperating(b)).reduce((a, b) => a + (CATEGORIES[b.category].serves[g] || 0), 0); gap += GROUPS[g].base * s.market.trend[g] / (1 + served) * CATEGORIES[cat].serves[g]; }
    return clamp(gap * 2.2, 0, 1);
  }
  expectedProfit(cat, plotId) { // a simple forecast with the same demand model the town actually uses
    const s = this.s, c = CATEGORIES[cat]; let customers = 0;
    for (const [g, w] of Object.entries(c.serves)) {
      const others = Object.values(s.businesses).filter(b => this.isOperating(b) && b.plot !== plotId && CATEGORIES[b.category].serves[g]).reduce((a, b) => a + CATEGORIES[b.category].serves[g] * b.reputation, 0);
      customers += TOWNSFOLK * GROUPS[g].base * s.market.trend[g] * w / (others + w + OUTSIDE_SHARE * (s.market.outside?.[g] ?? 1));
    }
    return customers * (c.price - c.unitCost) * (1 - TOWN.salesTax) - c.fixed;
  }

  /* ---------- property: plans, listings, bids, atomic sales ---------- */
  ownerPlan(plot) {
    const s = this.s, day = this.day; if (plot.project || plot.forSale || plot.zoning.includes('park') || plot.zoning.includes('civic')) return;
    const b = plot.building && s.buildings[plot.building], biz = plot.business && s.businesses[plot.business], ownerP = s.people[plot.owner], inv = s.investors[plot.owner];
    const idle = !biz || biz.status === 'closed';
    if (!idle || plot.zoning.includes('residential') && !plot.zoning.includes('commercial') && b) return;
    if (plot.owner === 'town') return;
    if ((plot.planDay || 0) > day) return;
    plot.planDay = day + 2;
    const cash = this.cash(plot.owner);
    if (plot.planNext) { this.startPlanned(plot); return; }
    // what would this owner most like to run here?  (a buyer arrives with a plan: plot.intent)
    const prefer = plot.intent || (ownerP ? AMBITION_CATEGORY[ownerP.ambition.key] : null);
    const cats = Object.keys(CATEGORIES).filter(c => !(biz && biz.category === c && biz.closedDay > day - 30 && biz.owner === plot.owner));
    const scored = cats.map(c => ({ c, p: this.expectedProfit(c, plot.id) + (c === prefer ? 60 : 0) + this.rng() * 30 })).sort((x, y) => y.p - x.p);
    const target = scored[0];
    const isHome = Object.values(s.people).some(q => q.home === plot.id); // someone lives upstairs: reopen or renovate, never sell or knock down
    const justBought = plot.ownerHistory[plot.ownerHistory.length - 1].from > day - 25 && plot.ownerHistory.length > 1;
    const canRun = ownerP ? (justBought || !ownerP.job || ownerP.job.employer.startsWith('self') || ownerP.ambition.key === 'entrepreneur' || prefer === target.c) : true;
    const hasBuilding = b && b.status === 'standing' && !b.land;
    const C = CATEGORIES[target.c];
    const credit = ownerP ? Math.max(0, 16000 - this.debtOf(ownerP.id)) : 1e9;
    const rebuildCost = (hasBuilding ? 900 : 0) + C.buildCost, renoCost = C.renoCost;
    const wantsNew = hasBuilding && !isHome && (b.condition < .5 || b.kind !== C.building && (ownerP?.traits.creativity ?? .5) + (ownerP?.traits.ambition ?? .5) > 1.2);
    const cantCarry = ownerP && cash < 250 && this.debtOf(ownerP.id) > 2500;
    const heartbroken = ownerP && biz && biz.owner === ownerP.id && biz.closedDay > day - 30 && ownerP.happiness < 45;
    if (isHome && (!hasBuilding || !canRun || cantCarry)) return;
    if (!justBought && (!canRun || target.p < 5 || cantCarry || heartbroken)) {
      if (!plot.vacantSince) plot.vacantSince = day;
      if (day - plot.vacantSince < 2) return; // leave it vacant for a couple of days while they think
      return this.listForSale(plot, biz && biz.status === 'closed' ? `${biz.name} closed` : 'Owner has no use for it');
    }
    const affordable = cost => cash + credit >= cost + C.startCash * .5 && cash >= Math.min(cost * .05, 250);
    plot.vacantSince = null;
    if (!hasBuilding || (wantsNew && affordable(rebuildCost))) {
      if (!affordable(rebuildCost)) return justBought ? null : this.listForSale(plot, 'Can’t afford to redevelop');
      if (hasBuilding) { plot.planNext = { type: 'construction', category: target.c }; this.startProject(plot, 'demolition', { kind: null, name: b.name }); }
      else this.startProject(plot, 'construction', { kind: C.building, category: target.c });
    } else {
      if (!affordable(renoCost)) return justBought ? null : this.listForSale(plot, 'Can’t afford to reopen');
      this.startProject(plot, 'renovation', { kind: C.building, category: target.c });
    }
    plot.intent = null;
  }
  startPlanned(plot) { const n = plot.planNext; plot.planNext = null; this.startProject(plot, n.type, { kind: CATEGORIES[n.category]?.building || 'house', category: n.category }); }
  listForSale(plot, reason) {
    const s = this.s; if (plot.forSale) return;
    plot.valuation = valuation(s, plot);
    const owner = s.people[plot.owner];
    const urgency = owner ? (this.cash(owner.id) < 300 ? .9 : 1) : 1;
    plot.forSale = { price: Math.round(plot.valuation * 1.04 * urgency / 50) * 50, since: this.day, seller: plot.owner, reason };
    this.record('property.listed', { who: owner ? [owner.id] : [], plot: plot.id, text: `${plot.address}${plot.building && s.buildings[plot.building]?.status === 'standing' ? ` (${s.buildings[plot.building].name})` : ''} is up for sale at ${money(plot.forSale.price)}.`, imp: 3, cause: reason, property: true });
    s.visualVer++;
  }
  buyerInterest(q, plot) { // returns { max, plan, why } or null
    const s = this.s, price = plot.forSale.price;
    if (q.id === plot.owner || !plot.zoning.includes('commercial')) return null;
    const cat = AMBITION_CATEGORY[q.ambition.key] ?? (q.ambition.key === 'entrepreneur' || q.ambition.key === 'own-business' ? Object.keys(CATEGORIES).sort((a, b) => this.expectedProfit(b, plot.id) - this.expectedProfit(a, plot.id))[0] : null);
    if (!cat) return null;
    if (q.ambition.key === 'art-living' && this.cash(q.id) < 4000) return null;
    const C = CATEGORIES[cat], b = plot.building && s.buildings[plot.building], hasBuilding = b && b.status === 'standing' && !b.land;
    const develop = hasBuilding ? C.renoCost : C.buildCost, motivated = q.motivatedUntil > this.day ? 1.12 : 1;
    const cash = this.cash(q.id), loanCap = (q.job ? 1 : .5) * 7000 - this.debtOf(q.id);
    const maxAfford = cash - 300 - develop * .3 - C.startCash * .5 + Math.max(0, loanCap);
    const worth = (plot.valuation + Math.max(0, this.expectedProfit(cat, plot.id)) * 25) * (.9 + q.traits.ambition * .2) * motivated;
    const max = Math.min(maxAfford, worth);
    return { max: Math.round(max), cat, cash, why: `${AMBITIONS[q.ambition.key].label.toLowerCase()}`, short: max < price * .92 };
  }
  propertyMarket() {
    const s = this.s, day = this.day;
    for (const plot of Object.values(s.plots).filter(p => p.forSale)) {
      const price = plot.forSale.price;
      const bids = [];
      for (const q of Object.values(s.people)) {
        const i = this.buyerInterest(q, plot); if (!i) continue;
        if (i.short) { if ((q.cool['short' + plot.id] || 0) <= day && i.max > price * .5) { q.cool['short' + plot.id] = day + 10; this.record('property.cantAfford', { who: [q.id], plot: plot.id, text: `${q.name} wanted to buy ${plot.address} but couldn’t raise ${money(price)}.`, imp: 2 }); } continue; }
        bids.push({ buyer: q.id, max: i.max, cat: i.cat });
      }
      // outside investors step in for properties nobody local wants
      if (!bids.length && day - plot.forSale.since >= 14 && price <= plot.valuation * 1.05) {
        const id = 'I' + (++s.seq.inv), NAMES = ['Maplewood Holdings', 'Riverside Ventures', 'Hillcrest Partners', 'Brookside Family Trust'];
        s.investors[id] = { id, name: NAMES[(s.seq.inv - 1) % NAMES.length] }; s.accounts[id] = 0;
        bids.push({ buyer: id, max: price, cat: Object.keys(CATEGORIES).sort((a, b) => this.expectedProfit(b, plot.id) - this.expectedProfit(a, plot.id))[0], outside: true });
      }
      if (!bids.length) continue;
      bids.sort((a, b) => b.max - a.max);
      const win = bids[0], second = bids[1];
      const pay = Math.round(Math.min(win.max, Math.max(price * .95, second ? second.max + 50 : price * .95)) / 10) * 10;
      this.completeSale(plot, win.buyer, pay, bids, win.cat);
    }
  }
  completeSale(plot, buyer, price, bids = [], plannedCategory = null) {
    const s = this.s, seller = plot.owner;
    if (!plot.forSale || plot.owner === buyer) return false; // atomic: one sale per listing
    const outsider = !!s.investors[buyer];
    if (outsider) this.transfer('outside', buyer, price + 12000, 'outside capital');
    const cash = this.cash(buyer), need = price - Math.max(0, cash - 300);
    let loan = null;
    if (need > 0) { if (s.people[buyer] && need <= 7000 - this.debtOf(buyer)) loan = this.lend('bank', buyer, need, 'mortgage', .0005, 300); else return false; }
    this.transfer(buyer, seller === 'town' ? 'treasury' : seller, price, 'property sale');
    // the seller's outstanding debts are settled from the proceeds
    if (s.people[seller]) for (const l of Object.values(s.loans).filter(l => l.borrower === seller && l.lender === 'bank')) { const pay = Math.min(l.balance, Math.max(0, this.cash(seller) - 100)); if (pay > 0) { this.transfer(seller, 'bank', pay, 'loan payoff'); l.balance = r2(l.balance - pay); } }
    const old = plot.ownerHistory[plot.ownerHistory.length - 1]; if (old) old.to = this.day;
    plot.ownerHistory.push({ owner: buyer, from: this.day, price });
    plot.owner = buyer; plot.purchasePrice = price; plot.forSale = null; plot.planDay = this.day + 1;
    if (plannedCategory) plot.intent = plannedCategory;
    if (plot.project) s.projects[plot.project].owner = buyer;
    const others = bids.filter(b => b.buyer !== buyer).map(b => b.buyer);
    this.record('property.sold', { who: [buyer, seller, ...others].filter(x => s.people[x]), plot: plot.id, text: `${this.nameOf(buyer)} bought ${plot.address} from ${this.nameOf(seller)} for ${money(price)}${others.length ? ` after outbidding ${others.map(o => this.nameOf(o)).join(' and ')}` : ''}.`, imp: 4, data: { price, loan: !!loan, bidders: bids.length }, property: true });
    const bp = s.people[buyer]; if (bp) this.checkAmbition(bp);
    s.visualVer++;
    return true;
  }

  /* ---------- demolition, construction and renovation projects ---------- */
  startProject(plot, type, target, opts = {}) {
    const s = this.s; if (plot.project) return null;
    const id = 'J' + (++s.seq.prj);
    const C = target.category ? CATEGORIES[target.category] : null;
    const phases = PHASES[type];
    const workDays = type === 'demolition' ? DEMOLITION_DAYS[plot.size === 'large' ? 'large' : s.buildings[plot.building]?.kind === 'house' ? 'house' : 'small'] : type === 'renovation' ? RENOVATION_DAYS : (C ? C.buildDays : HOUSE.buildDays);
    const budget = opts.budget ?? (type === 'demolition' ? 900 * (plot.size === 'large' ? 2 : 1) : type === 'renovation' ? C.renoCost : (C ? C.buildCost : HOUSE.buildCost));
    const wsum = phases.reduce((a, p) => a + p.w, 0);
    const name = target.name || (C ? this.pickName(target.category) : 'New house');
    const title = type === 'demolition' ? `demolition of ${target.name || this.plotName(plot.id)}` : `${type === 'renovation' ? 'renovation for' : 'construction of'} ${name}`;
    const pr = { id, type, plot: plot.id, owner: plot.owner, target: { ...target, name }, title, phase: 0, done: 0, phaseMinutes: phases.map(p => p.w / wsum * workDays * WORK_MINUTES), budget, spent: 0, paidPhase: -1, status: 'active', blocker: null, started: this.day, startedAt: s.abs, finished: null, crew: false, pausedSince: null, source: opts.source || 'simulation', expectedDays: workDays };
    s.projects[id] = pr; plot.project = id;
    if (type === 'demolition') { const b = s.buildings[plot.building]; if (b) b.status = 'demolishing'; }
    if (type === 'construction') { const b = s.buildings[plot.building]; if (b && b.land) { b.status = 'demolished'; const h = plot.buildingHistory.find(x => x.building === b.id && x.to == null); if (h) h.to = this.day; plot.building = null; } } // open land is cleared for the new building
    this.record(type === 'demolition' ? 'project.demolition' : 'project.started', { who: [plot.owner].filter(x => s.people[x]), plot: plot.id, text: `${this.nameOf(plot.owner)} began the ${title} at ${plot.address}.`, imp: 4, source: pr.source, data: { project: id, budget }, property: true });
    this.tryFundPhase(pr);
    s.visualVer++;
    return pr;
  }
  pickName(cat) { const used = new Set(Object.values(this.s.businesses).map(b => b.name)); return CATEGORIES[cat].names.find(n => !used.has(n)) || CATEGORIES[cat].names[0] + ' ' + (this.s.seq.biz + 1); }
  tryFundPhase(pr) {
    const s = this.s, ph = PHASES[pr.type][pr.phase];
    if (pr.paidPhase >= pr.phase) { if (pr.status === 'paused-funds') { pr.status = 'active'; pr.blocker = null; } return true; }
    const cost = Math.round(pr.budget * ph.cost), payer = pr.source === 'sandbox' ? 'sandbox' : pr.owner;
    if (payer === 'sandbox' || this.cash(payer) >= cost) { this.transfer(payer, 'outside', cost, 'construction'); pr.spent += cost; pr.paidPhase = pr.phase; s.today.construction += cost; if (pr.status === 'paused-funds') { pr.status = 'active'; pr.blocker = null; pr.pausedSince = null; this.record('project.resumed', { who: [pr.owner].filter(x => s.people[x]), plot: pr.plot, text: `Work resumed on the ${pr.title}.`, imp: 2 }); } return true; }
    // try a construction loan before stopping work
    if (s.people[payer] && this.debtOf(payer) + cost <= 16000) { this.lend('bank', payer, cost, 'construction loan', .0005, 200); return this.tryFundPhase(pr); }
    if (s.investors[payer]) { this.transfer('outside', payer, cost, 'outside capital'); return this.tryFundPhase(pr); }
    if (pr.status !== 'paused-funds') { pr.status = 'paused-funds'; pr.pausedSince = this.day; pr.blocker = `Waiting for ${money(cost)} to pay for “${ph.label}”`; this.record('project.paused', { who: [pr.owner].filter(x => s.people[x]), plot: pr.plot, text: `Work stopped on the ${pr.title}: the owner ran out of money.`, imp: 3, cause: pr.blocker, property: true }); }
    else if (this.day - pr.pausedSince >= 12) { // recovery path: sell the unfinished project rather than leave it stuck
      pr.blocker = 'Owner is selling the unfinished project'; this.listForSale(s.plots[pr.plot], 'unfinished construction');
    }
    return false;
  }
  nextPhase(pr) {
    const s = this.s, phases = PHASES[pr.type], plot = s.plots[pr.plot];
    const finished = phases[pr.phase];
    pr.phase++; pr.done = 0;
    if (pr.type === 'demolition' && phases[pr.phase]?.key === 'demolished') { const b = s.buildings[plot.building]; if (b) { b.status = 'demolished'; b.demolishedDay = this.day; const h = plot.buildingHistory.find(x => x.building === b.id && x.to == null); if (h) h.to = this.day; } }
    if (pr.phase >= phases.length - 1 && pr.type === 'demolition') { this.finishProject(pr, true); return; }
    if (phases[pr.phase]?.opening) { pr.status = 'awaiting-opening'; pr.readyDay = this.day; s.visualVer++; return; }
    if (pr.phase >= phases.length) { this.finishProject(pr, true); return; }
    if (finished.w > 0 || phases[pr.phase].w > 0) this.record('project.phase', { who: [pr.owner].filter(x => s.people[x]), plot: pr.plot, text: `${phases[pr.phase].label} began on the ${pr.title}.`, imp: phases[pr.phase].key === 'foundation' || phases[pr.phase].key === 'roof' ? 2 : 1, quiet: true, property: phases[pr.phase].key === 'foundation' });
    this.tryFundPhase(pr);
    s.visualVer++;
  }
  openings() { // grand openings happen at 9:00 on the day after completion
    for (const pr of Object.values(this.s.projects)) if (pr.status === 'awaiting-opening' && this.day > pr.readyDay) this.finishProject(pr, true);
  }
  finishProject(pr, ok) {
    const s = this.s, plot = s.plots[pr.plot];
    pr.finished = this.day; pr.status = ok ? 'done' : pr.status; plot.project = null;
    if (pr.type === 'demolition' && ok) {
      plot.building = null; if (plot.business) plot.business = null;
      this.record('project.demolished', { who: [pr.owner].filter(x => s.people[x]), plot: plot.id, text: `Demolition finished at ${plot.address}; the lot is cleared and ready for development.`, imp: 3, property: true });
      if (plot.planNext) this.startPlanned(plot);
    } else if (ok) {
      let bld = plot.building && s.buildings[plot.building];
      if (pr.type === 'construction' || !bld || bld.land) {
        if (bld) { bld.status = 'demolished'; const h = plot.buildingHistory.find(x => x.building === bld.id && x.to == null); if (h) h.to = this.day; }
        const id = 'K' + (++s.seq.bld); bld = s.buildings[id] = { id, plot: plot.id, kind: pr.target.kind || 'house', name: pr.target.name, original: false, land: false, builtDay: this.day, condition: 1, status: 'standing' };
        plot.building = id; plot.buildingHistory.push({ building: id, name: pr.target.name, kind: bld.kind, from: this.day, to: null });
      } else { bld.kind = pr.target.kind; bld.name = pr.target.name; bld.original = false; bld.condition = clamp(bld.condition + .35, 0, 1); plot.buildingHistory.push({ building: bld.id, name: pr.target.name, kind: bld.kind, from: this.day, to: null, renovated: true }); }
      if (pr.target.category) this.openBusiness(plot, pr.target.category, pr.target.name, pr.owner, pr.source);
      this.record('project.completed', { who: [pr.owner].filter(x => s.people[x]), plot: plot.id, text: `The ${pr.title} is complete after ${this.day - pr.started + 1} days (${money(pr.spent)} spent).`, imp: 3, property: true });
    }
    s.visualVer++;
  }
  openBusiness(plot, category, name, owner, source) {
    const s = this.s, C = CATEGORIES[category], id = 'B' + (++s.seq.biz);
    const b = s.businesses[id] = newBusiness(id, name, category, plot.id, owner, .95, this.day);
    s.accounts[id] = 0; b.opening = 3;
    const seed = Math.min(C.startCash, Math.max(0, this.cash(owner) - 150));
    this.transfer(owner, id, seed, 'starting capital');
    if (this.cash(id) < C.startCash * .5 && s.people[owner]) this.lend('bank', id, 600, 'start-up loan', .0006, 150);
    plot.business = id;
    const p = s.people[owner];
    if (p && (!p.job || p.job.employer.startsWith('self') || p.ambition.key === 'repair-shop' || p.ambition.key === 'fresh-start' || p.ambition.key === 'own-business')) {
      if (p.job?.employer === 'town' && s.town.clerk === p.id) s.town.clerk = null;
      if (p.job && p.job.employer.startsWith('B')) { const old = s.businesses[p.job.employer]; if (old && old.owner !== p.id) old.employees = old.employees.filter(x => x !== p.id); }
      p.job = { employer: id, role: 'Owner', since: this.day }; p.occupation = C.label + ' owner'; this.career(p, `Opened ${name}`);
    }
    const start = (this.day - 1) * DAY + 9 * HOUR;
    s.town.scheduled.push({ id: 'C' + this.day + 'open' + id, kind: 'opening', plot: plot.id, start, end: start + 3 * HOUR, label: `Grand opening of ${name}`, host: s.people[owner] ? owner : null, active: false });
    this.record('business.opened', { who: [owner].filter(x => s.people[x]), plot: plot.id, biz: id, text: `${name} (${C.label.toLowerCase()}) opened at ${plot.address}${s.people[owner] ? `, run by ${s.people[owner].name}` : ` under ${this.nameOf(owner)}`}.`, imp: 5, bizStatus: 'healthy', source, property: true });
    s.town.approval = clamp(s.town.approval + 2, 15, 95);
    for (const q of Object.values(s.people)) this.checkAmbition(q);
    return b;
  }

  /* ---------- ambitions: milestones checked against the real world ---------- */
  milestoneDone(p, key) {
    const s = this.s, own = Object.values(s.businesses).filter(b => b.owner === p.id && this.isOperating(b)), cash = this.cash(p.id);
    const ofCat = c => own.find(b => b.category === c), anyProfit = b => b && b.hist.length >= 7 && b.hist.slice(-7).every(d => d.profit > 0);
    switch (key) {
      case 'bakery-profitable-week': return anyProfit(ofCat('bakery'));
      case 'bakery-reputation': return (ofCat('bakery')?.reputation || 0) > 1.05;
      case 'bakery-hire': return (ofCat('bakery')?.employees.length || 0) > 0;
      case 'bakery-top': { const b = ofCat('bakery'); if (!b || b.hist.length < 7) return false; const top = Object.values(s.businesses).filter(x => this.isOperating(x) && x.hist.length >= 7).sort((x, y) => avgProfit(y, 7) - avgProfit(x, 7))[0]; return top === b; }
      case 'florist-savings': return this.cash(ofCat('florist')?.id) > 2500;
      case 'florist-reputation': return (ofCat('florist')?.reputation || 0) > 1.1;
      case 'close-friend': return Object.values(p.rel).some(r => r.f >= .6);
      case 'partner': return !!p.partner;
      case 'editions-10': return s.town.paper.editions >= 10 && p.job?.employer === 'self:paper';
      case 'editions-50': return s.town.paper.editions >= 50 && p.job?.employer === 'self:paper';
      case 'scoop': return s.town.paper.scoops > 0;
      case 'subscribers-60': return s.town.paper.subs >= 60;
      case 'approval-70': return s.town.approval >= 70;
      case 'proposals-3': return s.town.passed >= 3;
      case 'new-business': return Object.values(s.businesses).some(b => b.openedDay > 1);
      case 'festival': return s.town.festivals > 0;
      case 'cafe-savings': return this.cash(ofCat('cafe')?.id) > 3500;
      case 'hire-employee': return own.some(b => b.employees.length > 0);
      case 'second-business': return own.length >= 2;
      case 'two-profitable': return own.filter(anyProfit).length >= 2;
      case 'save-8000': return cash >= 8000 || p.ambition.done.includes('buy-property');
      case 'buy-property': return Object.values(s.plots).some(pl => pl.owner === p.id && pl.zoning.includes('commercial') && pl.ownerHistory.length > 1);
      case 'open-shop': return !!ofCat('repair');
      case 'shop-profitable': return anyProfit(ofCat('repair'));
      case 'sell-10': return p.art.sold >= 10;
      case 'art-good-day': return p.art.bestDay >= 120;
      case 'exhibition': return s.town.festivals > 0 && p.art.sold > 0 || own.some(b => b.category === 'gallery');
      case 'own-gallery': return !!ofCat('gallery');
      case 'get-job': return !!p.job;
      case 'keep-job-14': return !!p.job && this.day - p.job.since >= 14;
      case 'savings-1000': return cash >= 1000;
      case 'savings-3000': return cash >= 3000;
      case 'open-business': case 'own-business': return own.length > 0;
    }
    return false;
  }
  checkAmbition(p) {
    const A = AMBITIONS[p.ambition.key]; if (!A || p.ambition.achieved) return;
    for (const m of A.milestones) if (!p.ambition.done.includes(m) && this.milestoneDone(p, m)) {
      p.ambition.done.push(m);
      const all = A.milestones.every(x => p.ambition.done.includes(x));
      this.record(all ? 'person.ambitionAchieved' : 'person.milestone', { who: [p.id], text: all ? `${p.name} achieved a life goal: ${A.label.toLowerCase()}.` : `${p.name} reached a milestone: ${MILESTONE_LABELS[m].toLowerCase()}.`, imp: all ? 5 : 3, journal: true });
      p.happiness = clamp(p.happiness + (all ? 15 : 6), 0, 100);
      if (all) { const next = { 'stable-career': 'own-business', 'fresh-start': 'own-business', 'repair-shop': 'entrepreneur' }[p.ambition.key]; if (next) this.changeAmbition(p, next, 'goal achieved'); else p.ambition.achieved = this.day; break; }
    }
  }
  changeAmbition(p, key, why) {
    if (p.ambition.key === key) return;
    p.ambition = { key, done: [], since: this.day };
    this.record('person.ambitionChanged', { who: [p.id], text: `${p.name} has a new goal: ${AMBITIONS[key].label.toLowerCase()} (${why}).`, imp: 3, journal: true });
    this.checkAmbition(p);
  }

  /* ---------- the Willowbrook Times: only recorded events become stories ---------- */
  publishPaper(day) {
    const s = this.s; if (day < 1) return;
    const editor = s.people.R3, active = editor?.job?.employer === 'self:paper';
    const evs = s.events.filter(e => e.day === day && e.imp >= 2 && !e.type.startsWith('project.phase') && e.type !== 'social.date' && e.type !== 'town.founded');
    const seenTypes = {}, stories = [];
    for (const e of evs.sort((a, b) => b.imp - a.imp || a.at - b.at)) { const k = e.type + (e.biz || ''); if ((seenTypes[k] = (seenTypes[k] || 0) + 1) > 1 && e.imp < 4) continue; stories.push(this.story(e)); if (stories.length >= 6) break; }
    const best = Object.values(s.businesses).filter(b => this.isOperating(b) && b.hist.length && b.hist[b.hist.length - 1].day === day).sort((a, b) => b.hist[b.hist.length - 1].customers - a.hist[a.hist.length - 1].customers)[0];
    const facts = [];
    if (best) facts.push(`${best.name} served the most customers yesterday (${Math.round(best.hist[best.hist.length - 1].customers)}).`);
    facts.push(`Mayor ${s.people.R4.name}’s approval rating stands at ${Math.round(s.town.approval)}%.`);
    const h = s.history[s.history.length - 1]; if (h && h.day === day) facts.push(`${h.employed} residents working, ${h.unemployed} looking for work; ${h.businesses} businesses open.`);
    const ed = { no: ++s.seq.ed, day, published: (day) * DAY + 6 * HOUR, editor: active ? editor.id : null, stories, facts, quiet: !stories.length };
    s.papers.push(ed); if (s.papers.length > 60) s.papers.shift();
    if (active) { s.town.paper.editions++; const big = stories.filter(x => x.imp >= 4).length; s.town.paper.rep = clamp(s.town.paper.rep + big * .015 - .004, .2, 1); s.town.paper.subs = Math.round(s.town.paper.subs + ((28 + s.town.paper.rep * 50) - s.town.paper.subs) * .06); if (stories.some(x => x.imp >= 5) && s.events.some(e => stories[0] && e.id === stories[0].ev && this.s.people.R3.memories.some(m => m.ev === e.id && m.src === 'witnessed'))) s.town.paper.scoops++; this.checkAmbition(editor); }
    // readers learn the top stories (what they read, not what they saw)
    for (const p of Object.values(s.people)) { if (this.rng() > .35 + p.traits.sociability * .2) continue; for (const st of stories.slice(0, 2)) { const e = s.events.find(x => x.id === st.ev); if (e && !e.who.includes(p.id)) this.memo(p, { ev: e.id, text: e.text, who: e.who, plot: e.plot, at: e.at, src: 'read in the Times', sig: e.imp / 6, conf: .9, biz: e.biz, bizStatus: s.businesses[e.biz]?.status }); } }
  }
  story(e) {
    const s = this.s, n = id => this.nameOf(id), place = e.plot ? this.plotName(e.plot) : '';
    const T = {
      'business.opened': () => `Willowbrook Celebrates New Business: ${s.businesses[e.biz]?.name}`,
      'business.closed': () => `${s.businesses[e.biz]?.name} Closes Its Doors`,
      'business.struggling': () => `${s.businesses[e.biz]?.name} Faces Financial Trouble`,
      'business.recovered': () => `${s.businesses[e.biz]?.name} Bounces Back`,
      'business.recovery': () => `${s.businesses[e.biz]?.name} Tries to Turn Things Around`,
      'business.investment': () => `${n(e.who[0])} Steps In to Help ${s.businesses[e.biz]?.name}`,
      'business.refused': () => `No Lifeline for ${s.businesses[e.biz]?.name}`,
      'business.growing': () => `Business Booming at ${s.businesses[e.biz]?.name}`,
      'person.hired': () => `${n(e.who[0])} Lands a Job`,
      'person.jobLost': () => `${n(e.who[0])} Out of Work`,
      'property.listed': () => `For Sale: ${s.plots[e.plot]?.address}`,
      'property.sold': () => `${n(e.data?.buyer || e.who[0])} Purchases ${s.plots[e.plot]?.address}`,
      'property.cantAfford': () => `${n(e.who[0])} Priced Out of ${s.plots[e.plot]?.address}`,
      'project.demolition': () => `Demolition Planned at ${s.plots[e.plot]?.address}`,
      'project.demolished': () => `Lot Cleared on ${s.plots[e.plot]?.address.replace(/^\d+ /, '')}`,
      'project.started': () => `Construction Begins on ${s.plots[e.plot]?.address.replace(/^\d+ /, '')}`,
      'project.completed': () => `Work Complete at ${s.plots[e.plot]?.address}`,
      'project.paused': () => `Work Halts at ${s.plots[e.plot]?.address}`,
      'project.resumed': () => `Work Resumes at ${s.plots[e.plot]?.address}`,
      'project.permit': () => `Permit Approved for ${s.plots[e.plot]?.address}`,
      'project.denied': () => `Town Hall Rejects Plans for ${s.plots[e.plot]?.address}`,
      'social.dating': () => `${n(e.who[0])} and ${n(e.who[1])} Are an Item`,
      'social.breakup': () => `${n(e.who[0])} and ${n(e.who[1])} Part Ways`,
      'social.friends': () => `New Friendship: ${n(e.who[0])} and ${n(e.who[1])}`,
      'social.argument': () => `Words Exchanged at ${place || 'Town'}`,
      'social.reconcile': () => `${n(e.who[0])} and ${n(e.who[1])} Make Up`,
      'social.rivalry': () => `Rivalry Brewing Between ${n(e.who[0])} and ${n(e.who[1])}`,
      'community.festival': () => `Festival Fills ${place}`,
      'community.market': () => `Saturday Market Draws Shoppers`,
      'community.opening': () => `Grand Opening Today`,
      'community.meeting': () => `Town Meeting Decides on "${s.town.proposals.find(p => p.id === e.data?.proposal)?.title || 'Proposal'}"`,
      'community.birthday': () => `Happy Birthday, ${n(e.who[0])}!`,
      'market.trend': () => `Market Watch: Shifting Habits`,
      'person.milestone': () => `${n(e.who[0])} Reaches a Milestone`,
      'person.ambitionAchieved': () => `Dream Come True for ${n(e.who[0])}`,
      'person.ambitionChanged': () => `New Direction for ${n(e.who[0])}`,
      'person.money': () => `Hard Times for ${n(e.who[0])}`,
      'person.artSold': () => `${n(e.who[1])} Buys a ${n(e.who[0])} Original`,
      'person.rejected': () => `Job Hunt Continues for ${n(e.who[0])}`,
    };
    const head = (T[e.type] || (() => e.text.replace(/\.$/, '')))();
    return { ev: e.id, headline: head, body: e.text + (e.cause ? ` (${e.cause}.)` : ''), who: e.who.filter(x => s.people[x]), plot: e.plot, imp: e.imp, day: e.day, type: e.type };
  }

  /* ---------- player: observer / influence / sandbox ---------- */
  setMode(mode) { if (['observer', 'influence', 'sandbox'].includes(mode)) this.s.town.mode = mode; return this.s.town.mode; }
  influence(action, a = {}) {
    const s = this.s, inf = s.town.influence, day = this.day;
    if (s.town.mode !== 'influence') return { ok: false, message: 'Switch to Influence mode first.' };
    if (inf.points < 1) return { ok: false, message: 'No influence left today — it recovers by one point each day.' };
    const key = action + ':' + (a.person || a.plot || a.a || ''); if ((inf.used[key] || 0) > day) return { ok: false, message: 'You tried that recently. Give it a few days.' };
    const p = a.person && s.people[a.person];
    let ok = false, message = '';
    if (action === 'encourage' && p) {
      const accept = .4 + p.traits.ambition * .45 - p.stress / 220 + this.rng() * .2;
      if (accept > .6) { p.motivatedUntil = day + 5; ok = true; message = `${p.name} feels encouraged to pursue: ${AMBITIONS[p.ambition.key].label.toLowerCase()}.`; }
      else message = `${p.name} appreciates it but has too much on their mind right now.`;
    } else if (action === 'introduce' && a.a && a.b && a.a !== a.b) {
      const A = s.people[a.a], B = s.people[a.b], r = this.rel(A.id, B.id);
      if (r.rv > .4) message = `${A.name} and ${B.name} aren’t keen to meet — there’s bad blood.`;
      else { const at = (Math.floor(s.abs / HOUR) + 1) * HOUR; for (const [x, y] of [[A, B], [B, A]]) (x.meetups ||= []).push({ at, plot: 'P006', kind: 'socialize', with: y.id, label: `Meeting ${y.name} in the park`, reason: 'You introduced them' }); ok = true; message = `${A.name} and ${B.name} will meet in the park at ${hourOf(at)}:00.`; }
    } else if (action === 'sponsor-festival') {
      if (s.town.scheduled.some(e => e.kind === 'festival' && e.start - s.abs < 3 * DAY)) message = 'A festival is already coming up.';
      else if (this.cash('treasury') < 300) message = 'The town can’t afford a festival right now.';
      else { const d = day + 1; this.transfer('treasury', 'outside', 300, 'festival'); s.town.scheduled.push({ id: 'C' + d + 'festivalP', kind: 'festival', plot: 'P006', start: (d - 1) * DAY + 17 * HOUR, end: (d - 1) * DAY + 21 * HOUR, label: 'Sponsored evening festival', active: false }); ok = true; message = 'A festival will be held in the park tomorrow at 17:00.'; }
    } else if (action === 'encourage-investment' && p && a.plot) {
      const plot = s.plots[a.plot];
      if (!plot.forSale) message = 'That property isn’t for sale.';
      else { p.motivatedUntil = day + 5; const i = this.buyerInterest(p, plot); ok = true; message = !i ? `${p.name} has no use for ${plot.address}.` : i.short ? `${p.name} likes the idea but can’t afford ${money(plot.forSale.price)} yet.` : `${p.name} is seriously considering ${plot.address}.`; }
    } else if (action === 'support-proposal' && a.plot) { s.town.playerSupport[a.plot] = true; const q = s.town.proposals.find(x => x.status === 'pending'); if (q) s.town.playerSupport[q.id] = true; ok = true; message = 'Your support will count at Town Hall.'; }
    else if (action === 'help-job' && p) { if (p.job) message = `${p.name} already has a job.`; else { p.jobBonus = day + 3; ok = true; message = `${p.name}’s next job applications will go better.`; } }
    else return { ok: false, message: 'That isn’t possible here.' };
    if (ok) { inf.points--; inf.used[key] = day + 2; }
    this.record('player.influence', { who: [a.person, a.a, a.b].filter(x => x && s.people[x]), plot: a.plot || null, text: `Player influence (${action}): ${message}`, imp: 1, source: 'player', quiet: true });
    return { ok, message };
  }
  sandbox(action, a = {}) {
    const s = this.s; if (s.town.mode !== 'sandbox') return { ok: false, message: 'Sandbox mode is off.' };
    const plot = a.plot && s.plots[a.plot]; let message = '';
    const developable = pl => pl && !pl.zoning.includes('park') && !pl.zoning.includes('civic') && !(pl.zoning.includes('residential') && !pl.zoning.includes('commercial'));
    const isHome = pl => pl && Object.values(s.people).some(q => q.home === pl.id);
    if (action === 'demolish') {
      if (!developable(plot) || !plot.building || plot.project) return { ok: false, message: 'Only shops and empty land without an active project can be demolished.' };
      if (isHome(plot)) return { ok: false, message: 'Someone lives here — it can be renovated, but not knocked down.' };
      const biz = plot.business && s.businesses[plot.business]; if (biz && this.isOperating(biz)) this.closeBusiness(biz, 'demolition ordered in sandbox');
      this.startProject(plot, 'demolition', { name: s.buildings[plot.building].name }, { source: 'sandbox' }); message = 'Demolition started.';
    } else if (action === 'build') {
      if (!developable(plot) || plot.project) return { ok: false, message: 'That plot can’t be built on right now.' };
      if (!CATEGORIES[a.category]) return { ok: false, message: 'Unknown business type.' };
      if (a.owner && a.owner !== plot.owner) this.sandbox('set-owner', { plot: plot.id, owner: a.owner });
      const b = plot.building && s.buildings[plot.building];
      if (b && b.status === 'standing' && !b.land) { const biz = plot.business && s.businesses[plot.business]; if (biz && this.isOperating(biz)) this.closeBusiness(biz, 'converted in sandbox'); this.startProject(plot, 'renovation', { kind: CATEGORIES[a.category].building, category: a.category }, { source: 'sandbox' }); }
      else this.startProject(plot, 'construction', { kind: CATEGORIES[a.category].building, category: a.category }, { source: 'sandbox' });
      message = 'Project started (paid from the sandbox budget).';
    } else if (action === 'set-owner') {
      if (!plot || !(s.people[a.owner] || a.owner === 'town')) return { ok: false, message: 'Pick a resident or the town.' };
      const old = plot.ownerHistory[plot.ownerHistory.length - 1]; if (old) old.to = this.day;
      plot.ownerHistory.push({ owner: a.owner, from: this.day, price: 0, sandbox: true }); plot.owner = a.owner; plot.forSale = null; if (plot.project) s.projects[plot.project].owner = a.owner; message = `${this.nameOf(a.owner)} now owns ${plot.address}.`;
    } else if (action === 'list') { if (!plot || plot.forSale || !developable(plot)) return { ok: false, message: 'That property can’t be listed.' }; this.listForSale(plot, 'listed in sandbox'); message = 'Listed for sale.'; }
    else if (action === 'money') { const who = a.person || a.biz; const amt = Number(a.amount) || 0; if (!(who in s.accounts) || !amt) return { ok: false, message: 'Nothing changed.' }; if (amt > 0) this.transfer('sandbox', who, amt, 'sandbox grant'); else this.transfer(who, 'sandbox', -amt, 'sandbox withdrawal'); message = `${amt > 0 ? 'Gave' : 'Took'} ${money(Math.abs(amt))} ${amt > 0 ? 'to' : 'from'} ${this.nameOf(who)}.`; }
    else if (action === 'demand') { const b = s.businesses[a.biz]; if (!b) return { ok: false, message: 'Pick a business.' }; s.town.demandMod[b.id] = clamp(Number(a.mult) || 1, .1, 3); message = `${b.name} demand set to ${Math.round(s.town.demandMod[b.id] * 100)}%.`; }
    else if (action === 'trigger') {
      const d = this.day, h = this.hour + 1, start = (d - 1) * DAY + h * HOUR;
      if (a.event === 'festival') s.town.scheduled.push({ id: 'C' + d + 'festivalS', kind: 'festival', plot: 'P006', start, end: start + 3 * HOUR, label: 'Sandbox festival', active: false });
      else if (a.event === 'market') s.town.scheduled.push({ id: 'C' + d + 'marketS', kind: 'market', plot: 'P006', start, end: start + 3 * HOUR, label: 'Pop-up market', active: false });
      else return { ok: false, message: 'Unknown event.' };
      message = `${a.event === 'festival' ? 'Festival' : 'Market'} starts at ${h}:00.`;
    } else return { ok: false, message: 'Unknown sandbox action.' };
    this.record('sandbox.' + action, { who: [a.owner, a.person].filter(x => x && s.people[x]), plot: plot?.id || null, text: `Sandbox: ${message}`, imp: 1, source: 'sandbox', quiet: true });
    s.visualVer++;
    return { ok: true, message };
  }

  /* ---------- views for the UI ---------- */
  dashboard() {
    const s = this.s, people = Object.values(s.people), biz = Object.values(s.businesses);
    const employed = people.filter(p => p.job).length;
    const plots = Object.values(s.plots).filter(p => !p.zoning.includes('park'));
    return {
      day: this.day, population: people.length, employed, unemployed: people.length - employed,
      businesses: biz.filter(b => this.isOperating(b)).length, struggling: biz.filter(b => ['struggling', 'in-debt'].includes(b.status)).length,
      closed: biz.filter(b => b.status === 'closed').length,
      vacant: plots.filter(p => !p.building || s.buildings[p.building]?.status !== 'standing' || s.buildings[p.building]?.land || (p.business && s.businesses[p.business]?.status === 'closed')).length,
      forSale: plots.filter(p => p.forSale).length, projects: Object.values(s.projects).filter(p => !['done', 'denied'].includes(p.status)).length,
      approval: Math.round(s.town.approval), treasury: Math.round(this.cash('treasury')), history: s.history.slice(-30),
      recent: s.events.filter(e => e.imp >= 3).slice(-8).reverse(), mode: s.town.mode, influence: s.town.influence.points,
    };
  }
  businessCard(id) {
    const b = this.s.businesses[id]; if (!b) return null;
    const c = CATEGORIES[b.category], h = b.hist.slice(-7);
    return { id, name: b.name, category: c.label, status: b.status, owner: this.nameOf(b.owner), ownerId: b.owner, employees: b.employees.map(e => this.s.people[e].name), cash: Math.round(this.cash(id)), debt: Math.round(this.debtOf(id)), reputation: Math.round(b.reputation * 100), profit7: Math.round(h.reduce((a, d) => a + d.profit, 0)), revenue7: Math.round(h.reduce((a, d) => a + d.revenue, 0)), customers7: Math.round(h.reduce((a, d) => a + d.customers, 0)), hours: `${c.open}:00–${c.close}:00`, price: Math.round(b.priceMul * 100), hiring: b.hiring, opened: b.openedDay, closed: b.closedDay, hist: b.hist.slice(-30) };
  }
  propertyInfo(plotId) {
    const s = this.s, p = s.plots[plotId]; if (!p) return null;
    const bld = p.building && s.buildings[p.building], biz = p.business && s.businesses[p.business], pr = p.project && s.projects[p.project];
    let project = null;
    if (pr) {
      const phases = PHASES[pr.type], total = pr.phaseMinutes.reduce((a, b) => a + b, 0);
      const doneWork = pr.phaseMinutes.slice(0, pr.phase).reduce((a, b) => a + b, 0) + (phases[pr.phase]?.w > 0 ? pr.done : 0);
      const pct = pr.status === 'awaiting-opening' ? 100 : Math.round(100 * (pr.phase / (phases.length - 1)) * .25 + 75 * doneWork / total);
      const remainingWork = Math.max(0, total - doneWork);
      project = { id: pr.id, type: pr.type, title: pr.title, name: pr.target.name, owner: this.nameOf(pr.owner), phase: phases[Math.min(pr.phase, phases.length - 1)].label, phaseKey: phases[Math.min(pr.phase, phases.length - 1)].key, phaseIndex: pr.phase, phases: phases.length, percent: Math.min(100, pct), remainingDays: Math.round(remainingWork / WORK_MINUTES * 10) / 10, budget: Math.round(pr.budget), spent: Math.round(pr.spent), status: pr.status, blocker: pr.blocker, crew: pr.crew, started: pr.started };
    }
    return { id: p.id, address: p.address, name: this.plotName(p.id), zoning: p.zoning, owner: this.nameOf(p.owner), ownerId: p.owner, building: bld ? { name: bld.name, kind: bld.kind, status: bld.status, condition: Math.round(bld.condition * 100), built: bld.builtDay } : null, business: biz ? this.businessCard(biz.id) : null, valuation: Math.round(p.valuation), purchasePrice: Math.round(p.purchasePrice), forSale: p.forSale, project, timeline: p.timeline.slice(), owners: p.ownerHistory.map(o => ({ ...o, name: this.nameOf(o.owner) })), buildings: p.buildingHistory.slice() };
  }
  journal(personId) {
    const s = this.s, p = s.people[personId]; if (!p) return null;
    const A = AMBITIONS[p.ambition.key], job = p.job, emp = job && job.employer.startsWith('B') ? s.businesses[job.employer] : null;
    const rels = Object.entries(p.rel).filter(([, r]) => r.met).map(([id, r]) => ({ id, name: s.people[id].name, status: r.status, friendship: Math.round(r.f * 100), trust: Math.round(r.t * 100), affection: Math.round(r.af * 100), rivalry: Math.round(r.rv * 100) })).sort((a, b) => b.friendship - a.friendship);
    const important = p.memories.filter(m => m.sig >= .4).slice(0, 8);
    return { id: p.id, name: p.full, short: p.name, age: p.age, stage: p.stage, bio: p.bio, traits: p.traits, personality: this.personality(p), occupation: p.occupation, job: job ? { role: job.role, where: emp ? emp.name : job.employer === 'town' ? 'Town Hall' : 'self-employed', since: job.since } : null, cash: Math.round(this.cash(p.id)), debt: Math.round(this.debtOf(p.id)), home: s.plots[p.home].address, homeName: this.plotName(p.home), owns: Object.values(s.plots).filter(pl => pl.owner === p.id).map(pl => ({ id: pl.id, address: pl.address, name: this.plotName(pl.id) })), businesses: Object.values(s.businesses).filter(b => b.owner === p.id && this.isOperating(b)).map(b => b.name), relationships: rels, partner: p.partner ? s.people[p.partner].name : null, ambition: { label: A.label, milestones: A.milestones.map(m => ({ label: MILESTONE_LABELS[m], done: p.ambition.done.includes(m) })), progress: Math.round(100 * p.ambition.done.length / A.milestones.length) }, worries: p.worries.slice(), happiness: Math.round(p.happiness), stress: Math.round(p.stress), decision: p.decision ? { label: p.decision.label, reason: p.decision.reason } : null, memories: important, timeline: p.timeline.slice().reverse(), career: p.career.slice().reverse() };
  }
  personality(p) {
    const t = p.traits, words = [];
    if (t.ambition > .7) words.push('driven'); if (t.sociability > .7) words.push('outgoing'); else if (t.sociability < .5) words.push('reserved');
    if (t.kindness > .75) words.push('kind-hearted'); if (t.frugality > .7) words.push('thrifty'); else if (t.frugality < .4) words.push('free-spending');
    if (t.creativity > .8) words.push('creative'); if (t.risk > .6) words.push('bold'); else if (t.risk < .4) words.push('cautious'); if (t.temper > .45) words.push('quick-tempered');
    return words.length ? words : ['easy-going'];
  }
  // what the 3D world should show on each plot
  plotVisual(plotId) {
    const s = this.s, p = s.plots[plotId], bld = p.building && s.buildings[p.building], biz = p.business && s.businesses[p.business], pr = p.project && s.projects[p.project];
    const base = { closed: !!biz && biz.status === 'closed', forSale: !!p.forSale, sign: biz && this.isOperating(biz) ? biz.name : null };
    if (pr) {
      const ph = PHASES[pr.type][Math.min(pr.phase, PHASES[pr.type].length - 1)], need = pr.phaseMinutes[pr.phase] || 1;
      const prog = ph.w > 0 ? clamp(pr.done / need, 0, 1) : ph.calendar ? clamp(pr.done / ph.calendar, 0, 1) : 1;
      return { ...base, mode: pr.type, kind: pr.target.kind || (bld?.kind), name: pr.target.name, phase: ph.key, progress: prog, crew: pr.crew, paused: pr.status !== 'active' && pr.status !== 'awaiting-opening', original: bld?.original && bld.status !== 'demolished', sign: pr.type === 'demolition' ? null : pr.target.name, building: bld && bld.status !== 'demolished' ? { kind: bld.kind, original: bld.original } : null };
    }
    if (!bld || bld.status !== 'standing') return { ...base, mode: 'vacant' };
    if (bld.land) return { ...base, mode: 'original' };
    return { ...base, mode: bld.original ? 'original' : 'structure', kind: bld.kind, name: bld.name };
  }
  consumeInteractions() { const out = this.s.interactions; this.s.interactions = []; return out; }

  /* ---------- integrity checks (used by tests and save validation) ---------- */
  checkInvariants() {
    const s = this.s, issues = [];
    const total = totalMoney(s); if (Math.abs(total - s.initialMoney) > .5) issues.push(`money not conserved: ${r2(total)} vs ${r2(s.initialMoney)}`);
    for (const [id, v] of Object.entries(s.accounts)) if (!Number.isFinite(v)) issues.push(`account ${id} is not a number`);
    const ownerOk = o => o === 'town' || s.people[o] || s.investors[o];
    for (const p of Object.values(s.plots)) {
      if (!ownerOk(p.owner)) issues.push(`plot ${p.id} has unknown owner ${p.owner}`);
      if (p.building && !s.buildings[p.building]) issues.push(`plot ${p.id} points to missing building`);
      if (p.business && !s.businesses[p.business]) issues.push(`plot ${p.id} points to missing business`);
      if (p.project && !s.projects[p.project]) issues.push(`plot ${p.id} points to missing project`);
      if (p.ownerHistory[p.ownerHistory.length - 1]?.owner !== p.owner) issues.push(`plot ${p.id} owner history out of sync`);
    }
    const bplots = {}; for (const b of Object.values(s.buildings)) if (b.status !== 'demolished') { if (bplots[b.plot]) issues.push(`two buildings on ${b.plot}`); bplots[b.plot] = b.id; if (s.plots[b.plot].building !== b.id) issues.push(`building ${b.id} not linked to its plot`); }
    const opPlots = {}; for (const b of Object.values(s.businesses)) { if (!ownerOk(b.owner)) issues.push(`business ${b.id} has unknown owner`); if (this.isOperating(b)) { if (opPlots[b.plot]) issues.push(`two businesses operating on ${b.plot}`); opPlots[b.plot] = b.id; } for (const e of b.employees) { const p = s.people[e]; if (!p || p.job?.employer !== b.id) issues.push(`employee ${e} of ${b.id} has another job`); } if (b.employees.includes(b.owner)) issues.push(`${b.id} employs its owner`); }
    for (const p of Object.values(s.people)) { if (!s.plots[p.home]) issues.push(`${p.name} has an invalid home`); if (p.job?.employer?.startsWith('B')) { const b = s.businesses[p.job.employer]; if (!b || (!b.employees.includes(p.id) && b.owner !== p.id) || !this.isOperating(b)) issues.push(`${p.name} works for a business that doesn't employ them`); } for (const k of ['energy', 'hunger', 'social']) if (!(p.needs[k] >= 0 && p.needs[k] <= 100)) issues.push(`${p.name} ${k} out of range`); if (p.partner && s.people[p.partner]?.partner !== p.id) issues.push(`${p.name}'s partner link is one-sided`); }
    for (const pr of Object.values(s.projects)) { if (pr.phase > PHASES[pr.type].length) issues.push(`project ${pr.id} phase overflow`); if (pr.status === 'paused-funds' && !pr.blocker) issues.push(`project ${pr.id} paused without a reason`); }
    for (const l of Object.values(s.loans)) if (!(l.balance >= 0) || !(l.lender in s.accounts) || !(l.borrower in s.accounts)) issues.push(`bad loan ${l.id}`);
    return issues;
  }

  /* ---------- persistence ---------- */
  toJSON() { return this.s; }
  static fromJSON(obj) {
    if (!obj || typeof obj !== 'object' || obj.format !== SAVE_FORMAT || !obj.people || !obj.plots || !obj.accounts) throw new Error('not a v5 society state');
    return new Society(obj);
  }
  // Older saves (v0.1/v0.2) had needs, friendships and memories only: build a fresh society around them.
  static migrate(old, seed) {
    const day = Math.max(1, Math.floor(Number(old?.day) || 1)), minutes = Number(old?.minutes) || 480;
    const S = new Society(createState(seed ?? (Number(old?.savedAt) || 7) % 2147483647, { abs: (day - 1) * DAY + Math.floor(minutes / 60) * 60 }));
    S.s.abs = (day - 1) * DAY + minutes; S.s.hourDone = Math.floor(S.s.abs / HOUR);
    for (const v of old?.residents || []) {
      const p = S.byName(v?.name); if (!p) continue;
      for (const k of ['energy', 'hunger', 'social']) if (Number.isFinite(v[k])) p.needs[k] = clamp(v[k], 0, 100);
      for (const [n, c] of Object.entries(v.friendships || {})) { const q = S.byName(n); if (q && Number.isFinite(c)) { const r = S.rel(p.id, q.id); r.chats = c; r.f = clamp(c * .1, 0, .7); r.met = true; r.status = r.f >= .3 ? 'friend' : 'acquaintance'; } }
      for (const m of (v.memories || []).slice().reverse()) if (typeof m === 'string') S.memo(p, { text: m, sig: .3, src: 'self', who: Object.values(S.s.people).filter(q => q.id !== p.id && m.includes(q.name)).map(q => q.id) });
    }
    S.record('town.migrated', { text: `Willowbrook’s records were carried over from an older save (day ${day}).`, imp: 1, quiet: true });
    return S;
  }
}
export { CATEGORIES, PLOTS, PEOPLE, AMBITIONS, MILESTONE_LABELS, DAY, HOUR, WEEKDAYS, weekday, dayOf, hourOf };

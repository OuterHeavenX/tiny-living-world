// Tiny Living World — inner lives for residents (v0.6 "Living Minds").
// Adds unpredictability that still makes sense: moods, slowly drifting personalities, habits learned
// from experience, a daily intention, rare life events, a diary, and weighted (not always "best") choices.
// Optionally, an outside "mind" (a local language model) can answer questions in the AI queue: it picks
// residents' intentions and makes their big decisions. Every question has a deadline; if no valid answer
// arrives in time the normal rules decide, so the town never waits on the model.
import { DAY, HOUR, AMBITIONS, CATEGORIES } from './defs.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100;
const TRAITS = ['ambition', 'sociability', 'frugality', 'kindness', 'risk', 'creativity', 'temper'];
// Retell an event about someone in their own words ("Emma bought one of Lily’s paintings" → "…one of my paintings").
export function firstPerson(text, n) {
  return text.replace(new RegExp(n + '’s\\b', 'g'), 'my').replace(new RegExp('^' + n + ' and (\\S+)'), '$1 and I').replace(new RegExp('^' + n + '\\b'), 'I')
    .replace(new RegExp('^(\\S+) and ' + n + '\\b'), '$1 and I').replace(new RegExp('\\b' + n + '\\b', 'g'), 'me')
    .replace(/\bI has\b/g, 'I have').replace(/\bI is\b/g, 'I am').replace(/\bI’s\b/g, 'my');
}
const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* ---------- state ---------- */
export function ensureMinds(st) {
  st.ai ||= { enabled: false, queue: [], seq: 0, answered: 0, fallbacks: 0, rejected: 0, recent: [] };
  for (const p of Object.values(st.people)) {
    p.base ||= { ...p.traits };
    p.mood ??= 0; p.habits ||= {}; p.diary ||= []; p.intent ??= null; p.sickUntil ??= 0; p.visitorUntil ??= 0; p.aiBids ||= {}; p.lastWhim ??= 0;
  }
  return st;
}

/* ---------- moods and personality drift ---------- */
const MOOD_HIT = { // how events feel to the people in them
  'social.friends': .25, 'social.dating': .45, 'social.reconcile': .25, 'person.hired': .4, 'person.milestone': .3, 'person.ambitionAchieved': .6,
  'business.opened': .45, 'business.recovered': .35, 'business.investment': .2, 'property.sold': .15, 'community.birthday': .2, 'life.windfall': .4, 'life.visitor': .25, 'life.hobby': .2,
  'social.argument': -.3, 'social.breakup': -.55, 'person.jobLost': -.5, 'business.closed': -.65, 'business.struggling': -.25, 'business.refused': -.2, 'person.money': -.3,
  'property.cantAfford': -.15, 'person.rejected': -.15, 'project.paused': -.3, 'project.denied': -.25, 'life.expense': -.25, 'life.sick': -.3, 'social.rivalry': -.15,
};
const DRIFT = { // lived experience nudges personality, a little at a time
  'person.jobLost': { frugality: .03, risk: -.03 }, 'business.closed': { frugality: .03, risk: -.04, ambition: -.02 }, 'person.money': { frugality: .02 },
  'person.milestone': { risk: .015, ambition: .01 }, 'business.opened': { risk: .02, ambition: .015 }, 'person.ambitionAchieved': { risk: .02 },
  'social.friends': { sociability: .015 }, 'social.dating': { sociability: .02, kindness: .01 }, 'social.argument': { temper: .015, kindness: -.005 },
  'social.reconcile': { kindness: .015, temper: -.015 }, 'social.breakup': { sociability: -.02 }, 'business.refused': { kindness: -.01 }, 'business.investment': { kindness: .01 },
  'life.hobby': { creativity: .04 }, 'life.windfall': { risk: .02 },
};

export const MindMixin = {
  mindOnEvent(ev) {
    const hit = MOOD_HIT[ev.type], drift = DRIFT[ev.type];
    if (!hit && !drift) return;
    ev.who.forEach((id, i) => {
      const p = this.s.people[id]; if (!p) return;
      let h = hit || 0;
      if (ev.type === 'business.refused' && i === 0) h = 0; // the one who said no isn't hurt by it
      if (ev.type === 'property.sold' && i > 0) h = -.1; // sellers and outbid buyers
      p.mood = clamp(p.mood + h, -1, 1);
      if (drift && !(ev.type === 'business.refused' && i === 0)) for (const [k, v] of Object.entries(drift)) p.traits[k] = r2(clamp(p.traits[k] + v, Math.max(0, p.base[k] - .25), Math.min(1, p.base[k] + .25)));
    });
  },
  moodWord(p) { const m = p.mood; return m > .5 ? 'elated' : m > .2 ? 'upbeat' : m > -.2 ? 'steady' : m > -.5 ? 'low' : 'miserable'; },
  traitChanges(p) { return TRAITS.map(k => [k, r2(p.traits[k] - p.base[k])]).filter(([, d]) => Math.abs(d) >= .03); },

  /* ---------- habits: what went well before, they do again ---------- */
  learnHabit(p, d) {
    if (!d || !['eat', 'socialize', 'leisure', 'shop', 'event'].includes(d.kind)) return;
    const s = this.s, here = Object.values(s.people).filter(q => q.id !== p.id && q.loc.arrived && q.loc.plot === d.plot);
    const friends = here.filter(q => this.rel(p.id, q.id).f > .25).length, rivals = here.filter(q => this.rel(p.id, q.id).rv > .35).length;
    const b = d.biz && s.businesses[d.biz];
    const joy = .1 * Math.min(2, friends) - .25 * rivals + (b ? (b.reputation - 1) * .6 - (b.priceMul - 1) * .4 : 0) + (this.rng() - .5) * .12;
    const key = d.plot + ':' + d.kind;
    p.habits[key] = r2(clamp((p.habits[key] || 0) * .85 + joy, -.6, .6));
  },
  habitBonus(p, o) { return (p.habits[o.plot + ':' + o.kind] || 0) * .8; },

  /* ---------- the daily intention ---------- */
  intentionOptions(p) {
    const s = this.s, A = AMBITIONS[p.ambition.key], out = [], friends = Object.entries(p.rel).filter(([, r]) => r.f > .2).sort((a, b) => b[1].f - a[1].f).map(([id]) => id);
    const stranger = Object.keys(s.people).find(id => id !== p.id && (!p.rel[id] || p.rel[id].f < .1) && id !== p.partner);
    const rival = Object.entries(p.rel).find(([, r]) => r.rv > .4)?.[0];
    if (p.job) out.push({ kind: 'work', label: 'Focus on work today' });
    out.push({ kind: 'goal', label: 'Push toward my goal: ' + A.label.toLowerCase() });
    for (const f of friends.slice(0, 2)) out.push({ kind: 'friend', target: f, label: 'Spend time with ' + s.people[f].name });
    if (p.partner) out.push({ kind: 'partner', target: p.partner, label: 'Plan something special with ' + s.people[p.partner].name });
    if (stranger) out.push({ kind: 'meet', target: stranger, label: 'Get to know ' + s.people[stranger].name + ' better' });
    if (rival) { out.push({ kind: 'reconcile', target: rival, label: 'Clear the air with ' + s.people[rival].name }); out.push({ kind: 'avoid', target: rival, label: 'Keep away from ' + s.people[rival].name }); }
    if (this.cash(p.id) > 80) out.push({ kind: 'treat', label: 'Treat myself — eat out, buy something nice' });
    out.push({ kind: 'rest', label: 'Take it easy and rest' });
    out.push({ kind: 'explore', label: 'Go somewhere different for a change' });
    if (!p.job || Object.values(s.plots).some(pl => pl.forSale)) out.push({ kind: 'opportunity', label: p.job ? 'Look into opportunities around town' : 'Look hard for a job' });
    return out;
  },
  // Without the AI, residents still pick an intention — weighted by personality, mood and situation, with a dash of chance.
  pickIntention(p, opts) {
    const T = p.traits, n = p.needs, cash = this.cash(p.id), sick = p.sickUntil > this.s.abs;
    const w = o => {
      switch (o.kind) {
        case 'work': return .8 + T.ambition * 1.2 + (p.stress > 50 ? .3 : 0);
        case 'goal': return .5 + T.ambition * 1.3 + (p.motivatedUntil > this.day ? 1 : 0);
        case 'friend': return .4 + T.sociability * 1.1 + (n.social < 45 ? .6 : 0);
        case 'partner': return 1.2 + T.kindness * .6;
        case 'meet': return .2 + T.sociability * .7 + T.risk * .3;
        case 'reconcile': return .2 + T.kindness * 1.0 - T.temper * .5;
        case 'avoid': return .2 + T.temper * .8;
        case 'treat': return .3 + (1 - T.frugality) * 1.0 + (p.mood < -.2 ? .5 : 0) + (cash > 800 ? .3 : 0);
        case 'rest': return .3 + (sick ? 3 : 0) + (n.energy < 40 ? .8 : 0) + (p.stress > 60 ? .5 : 0);
        case 'explore': return .25 + T.creativity * .7 + T.risk * .4;
        case 'opportunity': return .3 + T.ambition * .6 + (p.job ? 0 : 1.5);
      } return .3;
    };
    const ws = opts.map(o => Math.max(.02, w(o)) * (.6 + this.rng() * .8));
    let k = this.rng() * ws.reduce((a, b) => a + b, 0), i = 0; while (i < ws.length - 1 && (k -= ws[i]) > 0) i++;
    return opts[i];
  },
  setIntent(p, o, reason, source = 'self') {
    const until = (this.day - 1) * DAY + 23 * HOUR;
    p.intent = { kind: o.kind, target: o.target || null, label: o.label, reason: reason || this.intentReason(p, o), source, day: this.day, until };
    if (o.kind === 'goal') p.motivatedUntil = Math.max(p.motivatedUntil || 0, this.day + 1);
    if ((o.kind === 'friend' || o.kind === 'partner' || o.kind === 'meet' || o.kind === 'reconcile') && o.target) this.planMeetup(p, this.s.people[o.target], o.kind);
  },
  intentReason(p, o) {
    const n = this.s.people[o.target]?.name;
    return { work: 'There’s a lot to get done', goal: 'I want to make progress', friend: `I miss ${n}`, partner: `I want to make ${n} smile`, meet: `I hardly know ${n}`, reconcile: `Things with ${n} have gone on too long`,
      avoid: `I’m not in the mood for ${n}`, treat: p.mood < 0 ? 'I need cheering up' : 'I deserve it', rest: p.sickUntil > this.s.abs ? 'I’m not feeling well' : 'I’m worn out', explore: 'Same old routine is getting dull', opportunity: 'Something better might be out there' }[o.kind] || 'Why not';
  },
  planMeetup(p, q, kind) {
    if (!q || q.sickUntil > this.s.abs) return;
    const accept = kind === 'partner' ? .9 : kind === 'reconcile' ? .35 + q.traits.kindness * .4 - this.rel(q.id, p.id).rv * .5 : .45 + q.traits.sociability * .4 + this.rel(q.id, p.id).f * .3;
    if (this.rng() > accept) return; // they were busy — the plan quietly falls through
    const cafe = this.foodPlaces().find(b => b.category === 'cafe' || b.category === 'restaurant') || Object.values(this.s.businesses).find(b => this.isOperating(b) && ['cafe', 'restaurant'].includes(b.category));
    const spots = ['P006', 'P012', cafe?.plot].filter(Boolean), plot = spots[Math.floor(this.rng() * spots.length)];
    const at = (this.day - 1) * DAY + (17.5 + Math.floor(this.rng() * 3)) * HOUR;
    const what = kind === 'partner' ? 'date' : 'socialize';
    for (const [x, y] of [[p, q], [q, p]]) (x.meetups ||= []).push({ at, plot, kind: what, with: y.id, label: kind === 'partner' ? `Evening out with ${y.name}` : `Meeting ${y.name} at ${this.plotName(plot)}`, reason: x === p ? p.intent?.reason || 'Made plans' : `${p.name} asked to meet` });
  },
  morningIntentions() {
    for (const p of Object.values(this.s.people)) {
      const opts = this.intentionOptions(p), pick = this.pickIntention(p, opts);
      this.setIntent(p, pick, null, 'self');
      this.askMind('intent', p.id, opts.map(o => o.label), { opts }, (this.day - 1) * DAY + 11 * HOUR);
    }
  },
  // How today's intention, mood, habits and health colour each option.
  mindAdjust(p, opts) {
    const it = p.intent && p.intent.until > this.s.abs ? p.intent : null, sick = p.sickUntil > this.s.abs, m = p.mood;
    for (const o of opts) {
      let b = this.habitBonus(p, o);
      if (o.kind === 'socialize' || o.kind === 'event') b += m * .5;
      if (o.kind === 'leisure' && o.inside === true && m < -.3) b += .6;
      if (sick) { if (o.kind === 'work') b -= 1.6; if (o.kind === 'leisure' && o.inside) b += 1.4; if (o.kind === 'socialize' || o.kind === 'event') b -= .8; }
      if (p.visitorUntil > this.s.abs && (o.kind === 'eat' && o.biz || o.kind === 'leisure' && o.plot !== p.home)) b += .5;
      if (it) {
        const t = it.kind;
        if (t === 'work' && o.kind === 'work') b += .9;
        if (t === 'goal' && ['work', 'view', 'jobsearch'].includes(o.kind)) b += .7;
        if (t === 'treat' && (o.kind === 'shop' || (o.kind === 'eat' && o.biz))) b += 1.0;
        if (t === 'rest' && (o.kind === 'sleep' || (o.kind === 'leisure' && o.inside))) b += .9;
        if (t === 'rest' && o.kind === 'work') b -= .5;
        if (t === 'explore' && o.kind === 'leisure' && o.plot !== p.home) b += 1.0;
        if (t === 'opportunity' && ['view', 'jobsearch'].includes(o.kind)) b += 1.2;
        if (['friend', 'partner', 'meet', 'reconcile'].includes(t) && o.with === it.target) b += 1.0;
        if (t === 'avoid' && this.s.people[it.target]?.loc.plot === o.plot && o.plot !== p.home) b -= 1.2;
        if (b > .4) o.byIntent = true;
      }
      o.u += b;
    }
    // intention-specific outings that the routine wouldn't suggest on its own
    const h = this.minuteOfDay / 60, day = h >= 8 && h < 20;
    if (it && day) {
      if (it.kind === 'explore') { const pl = ['P012', 'P011', 'P010', 'P006'][Math.floor(this.rng() * 4)]; if (this.s.plots[pl] && !this.s.plots[pl].project) opts.push({ kind: 'leisure', plot: pl, u: 1.6 + this.rng() * .4, label: `Exploring ${this.plotName(pl)}`, reason: it.reason, dur: 60, inside: false, act: 'watch', byIntent: true }); }
      if (it.kind === 'opportunity' && !p.job) opts.push({ kind: 'jobsearch', plot: 'P009', u: 2.2, label: 'Asking around Town Hall about work', reason: it.reason, dur: 60, inside: true, byIntent: true });
    }
    // a whim now and then: something not quite in character
    if (day && this.rng() < .015 + p.traits.risk * .02 && this.s.abs - p.lastWhim > DAY / 2) {
      const WHIMS = [['P012', 'Feeding the ducks on a whim'], ['P006', 'Sitting by the fountain for no reason at all'], ['P011', 'Wandering down Orchard Road'], ['P010', 'Peeking at the community garden']];
      const [pl, label] = WHIMS[Math.floor(this.rng() * WHIMS.length)];
      if (this.s.plots[pl] && !this.s.plots[pl].project) { opts.push({ kind: 'leisure', plot: pl, u: 9, label, reason: 'Felt like it', dur: 40, inside: false, act: 'watch', whim: true }); p.lastWhim = this.s.abs; }
    }
  },
  // Pick among options by weighted chance: close calls can go either way, clear winners usually win.
  chooseOption(p, opts) {
    const tau = .16 + .22 * (p.traits.risk + p.traits.creativity) / 2 + .08 * Math.abs(p.mood);
    const top = Math.max(...opts.map(o => o.u)), ws = opts.map(o => Math.exp((o.u - top) / tau));
    let k = this.rng() * ws.reduce((a, b) => a + b, 0), i = 0; while (i < ws.length - 1 && (k -= ws[i]) > 0) i++;
    const pick = opts[i]; pick.surprise = pick.u < top - .3;
    return pick;
  },

  /* ---------- rare life events (each one recorded, money always accounted for) ---------- */
  lifeEvents(day) {
    const s = this.s;
    for (const p of Object.values(s.people)) {
      if (this.rng() > .03) continue;
      const roll = this.rng();
      if (roll < .18) { const amt = 150 + Math.round(this.rng() * 650); this.transfer('outside', p.id, amt, 'windfall'); this.record('life.windfall', { who: [p.id], text: `${p.name} received an unexpected ${this.moneyText(amt)} — ${['an old aunt’s inheritance', 'a forgotten savings bond', 'a prize in a regional raffle'][Math.floor(this.rng() * 3)]}.`, imp: 3, journal: true }); }
      else if (roll < .42) { const amt = Math.min(Math.max(0, this.cash(p.id) - 20), 60 + Math.round(this.rng() * 240)); if (amt < 30) continue; this.transfer(p.id, 'outside', amt, 'unexpected bill'); this.record('life.expense', { who: [p.id], text: `${p.name} was hit with a ${this.moneyText(amt)} bill — ${['a broken water heater', 'a dental appointment', 'a leaking roof', 'a parking fine'][Math.floor(this.rng() * 4)]}.`, imp: 2, journal: true }); }
      else if (roll < .6) { p.sickUntil = s.abs + (1 + Math.floor(this.rng() * 2)) * DAY; this.record('life.sick', { who: [p.id], text: `${p.name} came down with a cold and is taking it easy.`, imp: 2, journal: true }); }
      else if (roll < .75) { p.visitorUntil = s.abs + 2 * DAY; this.record('life.visitor', { who: [p.id], text: `${p.name}’s ${['sister', 'cousin', 'old college friend', 'father'][Math.floor(this.rng() * 4)]} is visiting for a couple of days.`, imp: 2, journal: true }); }
      else if (roll < .9) { const hobby = ['birdwatching', 'pottery', 'chess', 'gardening', 'the ukulele', 'baking sourdough'][Math.floor(this.rng() * 6)]; this.record('life.hobby', { who: [p.id], text: `${p.name} has taken up ${hobby}.`, imp: 2, journal: true }); }
      else { // second thoughts about a stalled life goal
        const A = AMBITIONS[p.ambition.key]; if (p.ambition.achieved || day - p.ambition.since < 30 || p.ambition.done.length >= A.milestones.length / 2) continue;
        const next = p.job ? 'own-business' : 'stable-career'; if (next === p.ambition.key) continue;
        this.changeAmbition(p, next, 'after some soul-searching');
      }
    }
  },
  moneyText(v) { return '$' + Math.round(v).toLocaleString('en-US'); },

  /* ---------- diaries ---------- */
  writeDiaries(day) {
    for (const p of Object.values(this.s.people)) {
      const evs = this.s.events.filter(e => e.day === day && e.who.includes(p.id) && e.imp >= 2 && !/^project\.phase|^player|^sandbox/.test(e.type)).slice(-3);
      const it = p.intent && p.intent.day === day ? p.intent : null;
      const bits = [];
      bits.push(`${WEEK[(day - 1) % 7]}. I felt ${this.moodWord(p)} today.`);
      if (it) bits.push(`I meant to ${it.label[0].toLowerCase() + it.label.slice(1)}${it.source === 'ai' ? '' : ''}.`);
      for (const e of evs) bits.push(firstPerson(e.text, p.name));
      if (!evs.length) bits.push(p.worries[0] ? `Mostly I kept thinking: ${p.worries[0].toLowerCase()}.` : 'A quiet, ordinary day.');
      this.addDiary(p, day, bits.join(' '), 'self');
      this.askMind('diary', p.id, null, { day, events: evs.map(e => e.text), intent: it?.label || null }, (day - 1) * DAY + 30 * HOUR);
    }
  },
  addDiary(p, day, text, source) {
    const i = p.diary.findIndex(d => d.day === day);
    const entry = { day, text: String(text).slice(0, 600), source };
    if (i >= 0) { if (source === 'ai' || p.diary[i].source !== 'ai') p.diary[i] = entry; } else p.diary.push(entry);
    if (p.diary.length > 30) p.diary.splice(0, p.diary.length - 30);
  },

  /* ---------- the AI queue ---------- */
  // Questions wait here for an outside mind (a local language model). The simulation never blocks on them.
  askMind(type, pid, options, payload, deadline) {
    const ai = this.s.ai; if (!ai?.enabled) return null;
    if (ai.queue.some(q => q.type === type && q.pid === pid && q.key === payload?.key)) return null;
    if (ai.queue.length > 40) { const drop = ai.queue.findIndex(q => q.type === 'intent' || q.type === 'diary'); if (drop >= 0) ai.queue.splice(drop, 1); else return null; }
    const q = { id: 'Q' + (++ai.seq), type, pid, options, payload, key: payload?.key ?? null, created: this.s.abs, deadline };
    ai.queue.push(q); return q;
  },
  pendingMind(type, key) { return this.s.ai?.queue.find(q => q.type === type && q.key === key) || null; },
  // Context a mind needs to stay in character: who they are, how they feel, what they know.
  mindContext(pid) {
    const s = this.s, p = s.people[pid], A = AMBITIONS[p.ambition.key];
    const rels = Object.entries(p.rel).filter(([, r]) => r.met).sort((a, b) => b[1].f - a[1].f).slice(0, 5).map(([id, r]) => `${s.people[id].name} (${r.status}${r.rv > .3 ? ', rival' : ''}${p.partner === id ? ', partner' : ''})`);
    const mem = p.memories.filter(m => m.sig >= .3).slice(0, 6).map(m => `- day ${m.day}: ${m.text}${m.src === 'self' ? '' : ` (${m.src})`}`);
    return {
      name: p.full, short: p.name, age: p.age, occupation: p.occupation, bio: p.bio, personality: this.personality(p).join(', '),
      mood: this.moodWord(p), happiness: Math.round(p.happiness), stress: Math.round(p.stress), cash: Math.round(this.cash(p.id)), debt: Math.round(this.debtOf(p.id)),
      ambition: `${A.label} (${p.ambition.done.length}/${A.milestones.length} milestones)`, worries: p.worries.slice(0, 3), relationships: rels, memories: mem,
      time: `${WEEK[(this.day - 1) % 7]}, day ${this.day}, ${String(this.hour).padStart(2, '0')}:00`, sick: p.sickUntil > s.abs,
    };
  },
  // An answer from the mind. Invalid or late answers are rejected and the rules stand.
  answerMind(id, choice, reason, text) {
    const ai = this.s.ai, i = ai.queue.findIndex(q => q.id === id); if (i < 0) return false;
    const q = ai.queue[i]; ai.queue.splice(i, 1);
    const p = this.s.people[q.pid]; if (!p) return false;
    reason = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const valid = q.type === 'diary' ? typeof text === 'string' && text.trim().length > 10 : Number.isInteger(choice) && choice >= 0 && choice < (q.options?.length || 0);
    if (!valid) { ai.rejected++; this.resolveFallback(q); return false; }
    ai.answered++; ai.recent.unshift({ day: this.day, pid: q.pid, type: q.type, choice: q.options?.[choice] ?? null, reason }); if (ai.recent.length > 30) ai.recent.pop();
    switch (q.type) {
      case 'intent': { const o = q.payload.opts[choice]; if (p.intent?.day === this.day) this.setIntent(p, o, reason || this.intentReason(p, o), 'ai'); break; }
      case 'diary': this.addDiary(p, q.payload.day, text.trim(), 'ai'); break;
      case 'recovery': this.applyRecovery(this.s.businesses[q.key], q.payload.acts[choice], reason); break;
      case 'bid': p.aiBids[q.payload.plot] = { yes: choice === 0, day: this.day, reason }; if (choice !== 0) this.memo(p, { text: `Decided not to bid on ${this.s.plots[q.payload.plot].address}: ${reason || 'not the right time'}`, sig: .35, src: 'self', plot: q.payload.plot }); break;
      case 'lend': this.resolveLoanRequest(q.payload, choice === 0, reason); break;
      case 'romance': if (choice === 0) { const b = this.s.people[q.payload.with]; if (!p.partner && !b.partner && this.rel(b.id, p.id).af > .35) this.startDating(p, b, p.loc.plot, reason); else this.memo(p, { text: `Wanted to ask ${b.name} out, but the moment passed`, sig: .4, src: 'self', who: [b.id] }); } else p.cool['romance' + q.payload.with] = this.day + 10; break;
    }
    return true;
  },
  resolveFallback(q) {
    this.s.ai.fallbacks++;
    if (q.type === 'recovery') { const b = this.s.businesses[q.key]; if (b && this.isOperating(b)) this.applyRecovery(b, q.payload.ruleAct); }
    if (q.type === 'lend') this.resolveLoanRequest(q.payload, q.payload.ruleYes);
    if (q.type === 'romance') { const a = this.s.people[q.pid], b = this.s.people[q.payload.with]; if (q.payload.ruleYes && !a.partner && !b.partner) this.startDating(a, b, a.loc.plot); }
    if (q.type === 'bid') { const p = this.s.people[q.pid]; if (p) p.aiBids[q.payload.plot] = { yes: true, day: this.day, reason: 'rules' }; }
    // 'intent' and 'diary' simply keep what the rules already wrote
  },
  mindHourly() {
    const s = this.s;
    for (const p of Object.values(s.people)) p.mood = r2(p.mood + ((p.happiness - 55) / 120 - p.mood) * .06);
    const ai = s.ai; if (!ai) return;
    if (!ai.enabled && ai.queue.length) { for (const q of ai.queue.splice(0)) this.resolveFallback(q); return; }
    for (const q of ai.queue.filter(q => s.abs >= q.deadline)) { ai.queue.splice(ai.queue.indexOf(q), 1); this.resolveFallback(q); }
  },
  setMindEnabled(on) { this.s.ai.enabled = !!on; if (!on) this.mindHourly(); },
};
export { TRAITS };

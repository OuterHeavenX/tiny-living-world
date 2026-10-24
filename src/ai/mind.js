// Tiny Living World — optional AI minds for residents, powered by a language model running on your own machine.
// Works with any OpenAI-compatible server: Ollama (http://localhost:11434/v1), LM Studio (http://localhost:1234/v1),
// llama.cpp's server, or tools/serve.mjs, which proxies /ai/v1 to one of them. Nothing is sent anywhere else.
// The model only ever picks from options the simulation offers (or writes flavour text); the simulation validates
// every answer and falls back to its own rules if the model is slow, offline or answers nonsense.

const PRIORITY = { lend: 0, recovery: 0, romance: 1, bid: 1, intent: 2, diary: 3 };
const words = n => `${n} words or fewer`;

export function createMind({ getSociety, getConfig, onAnswer = () => {}, onStatus = () => {} }) {
  const st = { busy: false, ok: null, error: '', answered: 0, failed: 0, ms: 0, lastAt: 0, models: [], extra: [] };
  const status = (patch = {}) => { Object.assign(st, patch); onStatus({ ...st }); };

  async function call(messages, maxTokens = 180) {
    const cfg = getConfig(), url = cfg.endpoint.replace(/\/+$/, '') + '/chat/completions';
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), (cfg.timeout || 60) * 1000), t0 = performance.now();
    try {
      const res = await fetch(url, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {}) },
        body: JSON.stringify({ model: cfg.model, messages, temperature: cfg.temperature ?? .9, max_tokens: maxTokens, stream: false }) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
      const data = await res.json(), text = data.choices?.[0]?.message?.content ?? '';
      st.ms = Math.round(st.ms ? st.ms * .7 + (performance.now() - t0) * .3 : performance.now() - t0);
      return text;
    } finally { clearTimeout(timer); }
  }
  // Models wrap JSON in prose, code fences or <think> blocks; dig out the first JSON object.
  function parse(text) {
    const t = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(json)?/gi, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch { try { return JSON.parse(t.slice(a, b + 1).replace(/,\s*}/g, '}').replace(/[“”]/g, '"')); } catch { return null; } }
  }
  const persona = c => [
    `You are ${c.name}, ${c.age}, ${c.occupation} in the small town of Willowbrook. ${c.bio}`,
    `Personality: ${c.personality}. Right now you feel ${c.mood} (happiness ${c.happiness}/100, stress ${c.stress}/100)${c.sick ? ' and you have a cold' : ''}.`,
    `Money: $${c.cash}${c.debt ? `, debts $${c.debt}` : ''}. Life goal: ${c.ambition}.`,
    c.worries.length ? `Worries: ${c.worries.join('; ')}.` : '',
    c.relationships.length ? `People you know: ${c.relationships.join(', ')}.` : '',
    c.memories.length ? `Recent memories:\n${c.memories.join('\n')}` : '',
    `It is ${c.time}.`,
  ].filter(Boolean).join('\n');
  const SYSTEM = 'You are playing a resident of a cozy life-simulation town. Stay in character, be specific and human, never mention being an AI or a game. Reply with JSON only, no other text.';

  function situation(S, q) {
    const p = q.payload || {}, people = S.s.people, name = id => people[id]?.name;
    switch (q.type) {
      case 'intent': return 'A new day is starting. What do you mostly want to do with it?';
      case 'recovery': return `Your business ${p.biz} is in trouble: it has averaged $${p.profit7}/day profit this week, has $${p.cash} in the till${p.debt ? ` and $${p.debt} of debt` : ''}, after ${p.trouble} difficult days. How do you respond?`;
      case 'lend': { const r = S.s.people[q.pid].rel[p.borrower]; return `${name(p.borrower)} (${r?.status || 'acquaintance'}) asks to borrow $${p.amount} to keep ${S.s.businesses[p.biz]?.name} open. You have $${Math.round(S.cash(q.pid))}. Your trust in them is ${p.trust}/100.`; }
      case 'bid': return `${S.s.plots[p.plot].address} is for sale for $${p.price}. With a mortgage you could pay up to about $${p.max}${p.plan ? ` and you would open a ${p.plan.toLowerCase()} there` : ''}. Do you make an offer?`;
      case 'romance': return `You have grown close to ${name(p.with)} and feel something more. Do you ask them out?`;
    }
    return '';
  }
  function messagesFor(S, q) {
    const c = S.mindContext(q.pid);
    if (q.type === 'diary') {
      const p = q.payload;
      return [{ role: 'system', content: SYSTEM }, { role: 'user', content: `${persona(c)}\n\nWrite tonight's diary entry about today in 2–3 short sentences, first person, plain and honest, in your own voice.${p.intent ? ` This morning you meant to: ${p.intent}.` : ''}${p.events.length ? `\nWhat happened today:\n- ${p.events.join('\n- ')}` : '\nNothing much happened today.'}\nOnly mention things listed here or in your memories.\nReply as {"text": "..."}` }];
    }
    const opts = q.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
    return [{ role: 'system', content: SYSTEM }, { role: 'user', content: `${persona(c)}\n\n${situation(S, q)}\n\nChoose exactly one option:\n${opts}\n\nReply as {"choice": <option number>, "reason": "<${words(15)}, first person, in character>"}` }];
  }
  function pick(S) {
    const q = S.s.ai?.queue || []; if (!q.length) return null;
    return q.filter(x => S.s.abs < x.deadline).sort((a, b) => (PRIORITY[a.type] ?? 5) - (PRIORITY[b.type] ?? 5) || a.created - b.created)[0] || null;
  }

  async function pump() {
    const cfg = getConfig(), S = getSociety();
    if (!cfg.enabled || st.busy || !S?.s.ai?.enabled) return;
    if (st.ok === false && performance.now() - st.lastAt < 15000) return; // back off after an error
    const extra = st.extra.shift();
    const q = extra ? null : pick(S); if (!q && !extra) return;
    st.busy = true; st.lastAt = performance.now(); status();
    try {
      if (extra) { const out = parse(await call(extra.messages, extra.maxTokens)); extra.done(out); }
      else {
        const raw = await call(messagesFor(S, q), q.type === 'diary' ? 220 : 120), out = parse(raw);
        const S2 = getSociety(); if (S2 !== S) return; // a different town was loaded meanwhile
        let ok;
        if (q.type === 'diary') ok = S.answerMind(q.id, 0, '', out?.text);
        else { const n = parseInt(out?.choice, 10); ok = S.answerMind(q.id, Number.isFinite(n) ? n - 1 : -1, out?.reason); }
        if (ok) { st.answered++; onAnswer(q, out); } else st.failed++;
      }
      status({ ok: true, error: '' });
    } catch (e) {
      st.failed++; status({ ok: false, error: e.name === 'AbortError' ? 'The model took too long to answer' : String(e.message || e) });
      extra?.done(null);
    } finally { st.busy = false; status(); }
  }
  // Flavour text that isn't a decision: what two residents say to each other.
  function dialogue(S, a, b, place, done) {
    if (st.extra.length > 1 || st.ok === false) return false;
    const ca = S.mindContext(a), cb = S.mindContext(b);
    const relA = S.s.people[a].rel[b];
    st.extra.push({ maxTokens: 120, done, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content:
      `Two neighbours meet at ${place}.\nA: ${ca.name}, ${ca.occupation}, feeling ${ca.mood}. Worries: ${ca.worries.join('; ') || 'none'}. Recent: ${ca.memories.slice(0, 2).join(' ') || '—'}\nB: ${cb.name}, ${cb.occupation}, feeling ${cb.mood}. Worries: ${cb.worries.join('; ') || 'none'}. Recent: ${cb.memories.slice(0, 2).join(' ') || '—'}\nThey are ${relA?.status || 'acquaintances'}.\nWrite one short line each (${words(14)}), natural small talk about their lives.\nReply as {"a": "...", "b": "..."}` }] });
    return true;
  }
  async function test() {
    const cfg = getConfig(), base = cfg.endpoint.replace(/\/+$/, '');
    try {
      const res = await fetch(base + '/models', { headers: cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {} });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json(), models = (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean);
      const hasModel = !cfg.model || models.includes(cfg.model) || models.some(m => m.startsWith(cfg.model + ':'));
      const t = await call([{ role: 'user', content: 'Reply with JSON only: {"ok": true}' }], 20).catch(e => { throw new Error('Connected, but the model failed: ' + e.message); });
      status({ ok: true, error: '', models });
      return { ok: true, models, hasModel, reply: t.slice(0, 80) };
    } catch (e) {
      const msg = String(e.message || e);
      status({ ok: false, error: msg, models: [] });
      return { ok: false, error: /Failed to fetch|NetworkError|Load failed/i.test(msg) ? 'Can’t reach the model server — is it running, and does it allow this page’s origin? (see README → AI residents)' : msg };
    }
  }
  return { pump, test, dialogue, status: () => ({ ...st }) };
}

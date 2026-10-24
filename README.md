# Tiny Living World — Willowbrook

A **mobile-friendly, 3D low-poly life simulator** built with Three.js. Eight autonomous residents of Willowbrook have jobs, money, personalities, relationships and ambitions. Businesses earn and lose money, struggle, recover or close; property is bought and sold; buildings are demolished and new ones rise phase by phase; and *The Willowbrook Times* reports what really happened — all without the player doing anything.

Willowbrook is a cozy floating diorama: hand-shaped procedural buildings, gardens, a park with a fountain, a duck pond, an orchard and a community garden, with a full day/night cycle (glowing windows, streetlamp light pools, fireflies) and gentle ambient motion (swaying trees and flowers, fountain spray, bakery chimney smoke, butterflies, ducks, a waving flag, and a town-hall clock that tells game time).

## Play
Open the deployed `index.html` over HTTPS or a local web server. The Three.js module loads from jsDelivr, so an internet connection is required.

### GitHub Pages (recommended)
The game is plain static files — no build step. Everything is referenced with relative paths (`./src/world.js`, `./src/residents.js`), so it works from the repository sub-path `https://outerheavenx.github.io/tiny-living-world/`. A `.nojekyll` file makes Pages serve the files untouched.
1. Merge the release into **main**.
2. In this repository, open **Settings → Pages** and choose **Deploy from a branch**, branch **main**, folder **/(root)**.
3. Wait for the Pages deployment to finish (Actions tab), then open `https://outerheavenx.github.io/tiny-living-world/` and hard-refresh.

You can alternatively connect this repository to Cloudflare Pages or Workers Static Assets (output directory: repository root, no build command).

Current version: **v0.6.0 — Living Minds** (shown on the title screen and in Settings).

## Controls
- **Phone/tablet:** one-finger drag to orbit, two-finger pinch to zoom (moving both fingers also pans), tap a resident or a building.
- **Desktop:** drag to orbit, right-drag or Shift-drag to pan, scroll to zoom, click a resident or building, **R** to reset the camera, **Esc** to close panels.
- **Title screen:** Continue (resume your saved town), New Game, Settings.
- **HUD:** tap the clock for *Town happenings*; pause/resume; speed (1×/3×/10×); ☰ menu for Settings, Save now, title screen and deleting the save.
- **Bottom bar:** Town (dashboard, The Times, places, play modes), People (cycle residents), View (reset camera), Save.
- **Resident sheet:** what they're doing and *why*, job and money, goal progress, needs; Follow, next resident (›), close. Swipe up for their journal: life (bio, personality, work, money, home, property, ambition milestones, worries), people (relationships), memories (with day, source and confidence) and the journal timeline and career.
- **Property panel:** tap any building or lot — owner, operator, status, valuation, plot ID, business finances, construction phase/progress/budget and the property's history. Names are links.
- **Town panel:** *Overview* (population, employment, businesses, struggling, vacant, for sale, construction, approval, treasury, daily activity and small charts, recent events), *The Times* (today's edition and the archive), *Places* and *Play*.

## Play modes
- **Observer** (default) — the town runs itself.
- **Influence** — three influence points that recover one per day: encourage a resident's goal, introduce two residents, sponsor a festival, encourage an investment in a property for sale, support a proposal or permit, help a job application. Residents decide for themselves and can refuse; actions have cooldowns.
- **Sandbox** — build a business on a plot (or convert a building), demolish, change owners, list for sale, give or take money, change a business's demand, trigger a festival or market. Sandbox money comes from a separate tracked account and every action is recorded as a sandbox action in the town's history.

## Settings
Stored separately from the town save (`tlw-settings` in localStorage): graphics quality (Auto/High/Medium/Low), camera sensitivity, shadows, autosave (every 2 minutes and when the app is backgrounded), **offline progress** (off by default; while you're away the town lives on at 1× speed — one real second is one game minute — capped at three game days, with a summary when you return), and gesture hints. Settings also has *Export save file*, *Import save file* and *Delete saved town*.

**Graphics quality:** High = up to 2× pixel density and 2048px shadows (desktop default); Medium = 1.5× and 1024px shadows (phone default); Low = 1× and no shadows. In Auto, the game measures the real frame rate while you play and steps down if it stays below ~26 fps.

## Living minds (v0.6)
Residents are less predictable but still make sense, with or without AI:
- **Weighted choices.** Every hour each resident still scores their options, but they pick by weighted chance: clear winners usually win, close calls can go either way. Daring, creative people go off-script more often.
- **A daily intention.** Each morning everyone decides what they mostly want from the day: focus on work, push toward their goal, see a friend or partner, get to know someone, clear the air with a rival (or avoid them), treat themselves, rest, explore, or look for opportunities. Plans with other people can fall through.
- **Moods** rise and fall with what happens to them and colour their choices. **Personalities drift** with experience (losing a job makes you thriftier and more cautious; making friends makes you more outgoing), never more than ±0.25 from where they started.
- **Habits.** Places and activities that went well (good food, friends there, no rivals) are chosen again.
- **Whims and life events:** an impulsive trip to the duck pond, an unexpected windfall or bill, a cold, a visiting relative, a new hobby, second thoughts about a stalled life goal. Money is always accounted for.
- **Diaries.** At 22:00 everyone writes a diary entry, shown in the resident journal.

## AI residents (run locally)
You can let a language model **running on your own computer** make residents' choices. Nothing is sent to the internet. The model:
- picks each resident's intention for the day (with a reason in their own voice),
- makes their big decisions: how an owner responds when their business struggles, whether to lend a friend money, whether to bid on a property, whether to ask someone out,
- writes their diary entries, and the lines residents say to each other when you can see them chatting.

The simulation only ever offers the model a list of valid options, checks every answer, and gives each question a deadline. If the model is slow, offline or answers nonsense, the normal rules decide and the town never waits. The **Town → Overview** panel shows how many decisions the AI made and how many were left to the rules; AI-chosen plans and diary entries are marked **AI** in the journal.

**Quick start with Ollama** (Windows, macOS or Linux):
1. Install Ollama from https://ollama.com, then download a small model: `ollama pull llama3.2` (3B, fast on most machines). `qwen2.5:7b` or `llama3.1:8b` give richer answers if your GPU can handle them.
2. In this repository folder run `npm run serve` (or `node tools/serve.mjs`) and open http://localhost:8080. The server proxies `/ai/v1` to Ollama, so no extra configuration is needed. To play on your phone with AI, open the address it prints for your network (same Wi-Fi).
3. In **Settings → AI residents**, switch it on, check the model name, and tap **Test connection**.

**LM Studio** works too: load a model, start its local server, and run `LLM_URL=http://127.0.0.1:1234 npm run serve` (or put `http://localhost:1234/v1` in the *Model server* field). Any other OpenAI-compatible server (llama.cpp, vLLM…) works the same way.

**Playing from GitHub Pages instead:** the page can talk to Ollama on the same computer at `http://localhost:11434/v1`, but Ollama must allow the page's origin. Start it with `OLLAMA_ORIGINS=https://outerheavenx.github.io ollama serve` (on Windows: set `OLLAMA_ORIGINS` as a user environment variable, then restart Ollama). This only works on the computer running Ollama; for phones use `npm run serve` above.

Speed: each answer takes roughly 1–5 seconds on a typical GPU (longer on CPU). Questions are answered one at a time, most important first. At 10× speed some plans will be decided by the rules before the model replies; that's expected.

## The living world
**Residents.** Oliver Hart (baker, owns Sunrise Bakery), Emma Rose (florist, Petal & Stem), Sarah Quill (editor of The Willowbrook Times), Marcus Bell (mayor, lives above Town Hall), Mia Santos (owns Corner Café), Noah Brooks (freelance mechanic who owns the Shared House), Lily Park (painter, rents a room) and Ethan Cole (bakery assistant, rents a room). Each has traits (ambition, sociability, frugality, kindness, risk, creativity, temper), needs, happiness and stress, money and debts, relationships, beliefs, memories and an ambition with milestones. Every hour the simulation scores the options open to them and picks one — the resident sheet shows the reason (*"Hungry (42%); Corner Café is open; Mia is a friend"*).

**Economy.** Money only ever moves between two accounts (residents, businesses, treasury, bank, outside world, sandbox), and tests check that the total never changes. Shops serve residents and townsfolk from the wider area; demand is split by price, reputation and competition and shifts with outside trends (a supermarket opening in nearby Maplewood, wedding season, a food blogger…). Owners pay wages, rent, stock, running costs and sales tax, draw a salary from healthy profits, and respond to trouble in character — and businesses that keep losing money after their recovery attempts close.

**Property and building.** Plots (P001–P012) are permanent; buildings and businesses come and go. Idle property is reopened, converted, renovated, demolished and rebuilt, or listed for sale; buyers bid; sales are atomic. Demolition (8 stages) and construction (12 phases) are visible on the map with fences, signs, equipment, scaffolding, workers and a progress chip, last days of game time, happen during working hours, are paid phase by phase and pause if the money runs out.

**People and news.** Friendships, rivalries (with causes), reconciliations, dates and break-ups emerge from repeated encounters. Memories know whether someone did, saw, was told or read about something. Saturday markets, monthly festivals, birthdays, grand openings and weekly town meetings fill the calendar. Every morning at 6:00 *The Willowbrook Times* publishes the previous day's most important recorded events.

**The defining story.** In some towns Oliver's old bakery slowly loses customers to the new supermarket in Maplewood; he tries repairs, price cuts and asking friends for help; it closes and Ethan loses his job; the property goes up for sale; another resident buys it, demolishes the old building, builds something new and opens it — and the residents remember, the Times reports each step and the plot's history records it all. It isn't scripted: in other towns the bakery recovers, or Oliver reopens it as something else. The Node test suite finds a seed where the full chain happens and checks every link.

**Characters and navigation.** Stylized low-poly residents animate by the ground they actually cover, sit, sip, garden, sketch, read, watch, talk, argue and wave; they walk a sidewalk/crosswalk graph to real doors and outdoor spots (now including the community garden, orchard picnic corner and duck-pond bench) and never through buildings — including new buildings on the Orchard Road lots.

## Project layout
- `index.html` — UI, camera/touch controls, the bridge between the simulation and the 3D town, saves.
- `src/sim/society.js` — the society simulation: residents' decisions, economy, property, projects, relationships, memory, community events, the newspaper, play modes, invariants and save migration. No rendering code; runs in Node.
- `src/sim/defs.js` — data: business categories, plots, residents, ambitions, project phases and economic constants.
- `src/sim/minds.js` — inner lives: moods, drift, habits, daily intentions, whims, life events, diaries, and the queue of questions for an AI mind.
- `src/ai/mind.js` — the optional AI client for a local OpenAI-compatible model server (Ollama, LM Studio, llama.cpp).
- `tools/serve.mjs` — local web server for the game with an `/ai` proxy to your model server (`npm run serve`).
- `tools/simulate.mjs` — run a town headless: `node tools/simulate.mjs 100 [seed]`.
- `src/world.js` — the procedural Willowbrook scenery, lighting, sky and ambient animation, plus the redevelopable plots: generated buildings for each business type and every demolition/construction stage. Everything is generated in code (no downloaded models or AI-generated assets).
- `src/residents.js` — character models and animation, the sidewalk navigation graph, building footprints, speech bubbles and moods.
- `tests/` — automated checks.

### Scene performance notes
Static scenery is baked into a few merged, vertex-coloured, flat-shaded meshes (buildings/props, foliage with a GPU sway shader, glowing windows/lamps), so the whole town draws in roughly 35–40 draw calls and ~100k triangles. Each resident is 6 small merged meshes (body, head, arms, legs) under 3k triangles. Night lighting uses emissive windows and additive light pools rather than real point lights. Shadows can be turned off in Settings for battery life.

## State and limits
- Saves are stored in **localStorage on the current device** under the same `tlw-save` key (one-slot backup in `tlw-save-prev`). Save format 5 contains the whole society (~300 KB after 100 game days; histories are bounded). v0.1/v0.2 saves are migrated: needs, friendships and memories carry over into a new society. Use *Export save file* to move a town to another device; there is no cloud sync.
- Without offline progress the simulation pauses when the tab is closed.
- Residents use local procedural behaviour; the optional AI residents use a model on your own machine. No paid AI APIs.
- AI answers can't be tested in CI against a real model; automated tests use a stand-in server. Quality depends on the model you choose.
- Interiors aren't modelled (residents disappear indoors). Residents don't avoid each other on the sidewalk. Only the five commercial/open plots can be redeveloped; homes are never demolished.
- The economy is tuned for drama, not realism; outcomes vary from town to town (each New Game uses a new seed).
- Automated tests run in desktop Chromium (software WebGL) emulating iPhone screens and touch; they are not a substitute for testing on a real iPhone/Safari, which has not been done for this release.
- See [CHANGELOG.md](CHANGELOG.md) for everything in v0.6.0.

## Development checks
No build step is needed to play. For automated checks (Playwright + headless Chromium, emulating iPhone screens with real touch input):

```bash
npm install
npx playwright install chromium
npm run test:sim   # fast: the simulation core in Node (≈1 minute)
npm test           # syntax checks, simulation tests, then the browser tests (slow under software GL)
```

`npm test` parses the game modules, then runs browser tests covering the title screen, camera framing on several iPhone sizes and orientations, one-finger orbit, pinch zoom and limits, Reset Camera, the resident bottom sheet, safe-area layout, pause/speed, save → reload → Continue, legacy v0.1 save loading, New Game/delete flows, settings persistence and autosave, the diorama layout and draw-call budget, character models and animation, navigation (no walking through buildings), night routines, greetings and chats, save migration and corruption handling, adaptive graphics quality, serving from the GitHub Pages sub-path, and the v0.5 features (dashboard and Times, tapping buildings, visible construction with workers, play modes, the journal, v0.5 saves with export/import and offline progress). Set `SHOTS_DIR=some/folder` to also save screenshots. The same checks run on GitHub Actions (`.github/workflows/checks.yml`) for every push and pull request.

## License
All original prototype code. Third-party Three.js is loaded from its CDN under its own license.

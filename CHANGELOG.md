# Changelog

## v0.5.0 — The Living World Update
Willowbrook stops being a backdrop and becomes a small society that changes on its own. Everything below is simulated locally — no paid AI services, no network calls beyond loading Three.js.

### A society simulation (`src/sim/`)
- New pure-JavaScript simulation core (`society.js` + data in `defs.js`), deterministic from a seed, with no rendering dependencies, so it runs 100+ game days headless in Node for testing.
- One authoritative clock: everything (needs, decisions, business days, construction, events, the newspaper) advances from simulation time, so pause, 1×, 3× and 10× all behave identically and hours are never processed twice.

### Autonomous residents
- Each resident has a full name, age, occupation, employer, home, cash, debts, personality traits, happiness and stress, needs, relationships (friendship, trust, affection, rivalry), memories, beliefs, an ambition with real milestones, worries and a career history.
- A utility-based decision engine picks what to do every hour — sleep, work, eat (out or at home, depending on money and friendships), shop, socialise, look for work, view property, attend events, go on dates — and every decision carries a plain-language reason shown in the resident sheet.
- Ambitions: Oliver (best bakery), Emma (grow Petal & Stem and find someone special), Sarah (build the newspaper), Marcus (improve the town and keep approval), Mia (become an entrepreneur), Noah (open his own repair shop), Lily (earn a living from art) and Ethan (a stable career). Milestones are checked against the world; goals change after success or setbacks.

### A living economy
- A ledger where every dollar moves between two accounts — residents, businesses, the town treasury, the bank, the outside world (tracked explicitly) and a separate sandbox account — with a conservation check.
- Businesses keep daily books (customers, revenue, stock, running costs, wages, rent, sales tax, profit, cash, debt) and a reputation. Demand responds to population, prices, reputation, competition, events and outside-market trends.
- Statuses: healthy, growing, struggling, in debt, closed. Owners try recovery actions that suit their personality (price changes, cost cuts, promotions, repairs, lay-offs, bank loans, asking friends — who may refuse) before sustained trouble forces a closure. Closures cost employees their jobs and affect the owner.
- Eight extensible business categories: bakery, café, florist, repair shop, bookstore, general store, restaurant and art gallery.

### Property, demolition and construction
- Twelve permanent plots with addresses and plot IDs, separate from the buildings and businesses on them. Each keeps an owner history, building history, valuation and timeline.
- Listings, buyer evaluation, bidding (and outside investors for unwanted lots) and atomic sales.
- Owners decide what to do with idle property: reopen, start a different business, renovate, demolish and rebuild, or sell.
- Visible staged demolition (approved → fenced → workers and equipment → partially dismantled → demolished → rubble → debris removal → empty plot) and 12-phase construction (planning, permits, site preparation, foundation, framing, roof and exterior, windows and doors, interior, landscaping, inspection, completion, grand opening). Work happens 8:00–17:00, Monday–Saturday, is paid phase by phase, pauses when the money runs out and resumes when funded (or the project is sold).
- Construction workers arrive, work on site and leave; fences, warning signs, an excavator, a dumpster, rubble, slabs, timber frames, scaffolding, project boards, ribbons and balloons show each stage.
- Recognisable procedural buildings for every category, with signs that carry the business's name.

### Relationships, knowledge and community
- Friendships, rivalries, arguments with real causes (competing businesses, money owed, votes), reconciliations, dating and break-ups, each recorded with participants and consequences.
- Memories distinguish what someone did, saw, was told (with lower confidence) or read in the paper; gossip spreads news; memory is bounded and keeps what matters most.
- Saturday markets, monthly festivals, birthdays, grand openings, weekly town meetings that vote on proposals, construction permits, and a mayor approval rating.

### The Willowbrook Times
- A daily edition at 6:00 built only from recorded events, ordered by importance, with an archive and tappable residents and places.

### Interface
- New **Town** panel: overview dashboard (population, jobs, businesses, struggling, vacant, for sale, construction, approval, treasury, daily sales and small charts), The Times, a list of places, and Play modes.
- **Property panel** when you tap a building: owner, operator, status, valuation, plot ID, business finances, construction progress, budget and history; a progress chip floats over active building sites.
- Resident sheet: why they're doing what they're doing, money and job, and an expandable journal (life, ambition, worries, relationships, memories with sources, milestones and career).
- **Play modes:** Observer; Influence (limited points that recover daily — encourage a goal, introduce residents, sponsor a festival, encourage an investment, support a proposal, help a job application; residents can refuse); Sandbox (build, demolish, change owners, list for sale, adjust money and demand, trigger events — all recorded as sandbox actions).

### Saves
- Save format 5 stores the whole society; v0.1 and v0.2 saves migrate automatically (needs, friendships and memories are kept). Invariants are checked on load.
- Export and import save files from Settings.
- Optional offline progress (off by default): the town lives on at normal speed while you're away, capped at three days, with a summary on return.

### Tests
- `npm run test:sim` — Node tests for the economy, property, construction, residents, memory, newspaper, modes, clock, saves, migration, a 100+ day run with daily invariants, and the defining bakery story.
- New browser tests for the dashboard and Times, tapping buildings, visible construction with workers and the progress chip, play modes, the journal, and v0.5 saves with export/import and offline progress.

## v0.2.0 — Willowbrook
A complete overhaul of the v0.1 prototype into a mobile-first, low-poly 3D life simulator.

### Mobile experience
- Title screen with Continue, New Game and Settings; version shown on the title screen and in Settings.
- Camera fits the whole town on any screen (portrait and landscape) and re-frames on rotation; Reset view button (and **R** on desktop).
- Smooth one-finger orbit with fling, two-finger pinch zoom and pan, zoom/tilt/pan limits; robust to iOS gesture cancels.
- Compact HUD (~11% of an iPhone 13 screen, down from 15.7%), iPhone safe-area support, 44px touch targets.
- Resident details in a swipeable bottom sheet: mood, current activity, goal and destination, needs, important memories and friends.

### Graphics
- Procedural low-poly diorama: four distinct homes, Sunrise Bakery, Petal & Stem, Corner Café, Town Hall with a working clock tower, a park with fountain, plus a duck pond, community garden and orchard.
- Sidewalks, crosswalks, streetlamps, trees, flowers, rocks; day/night cycle with sky gradient, glowing windows, lamp light pools and fireflies; ambient motion (swaying foliage, fountain, chimney smoke, butterflies, ducks, clouds, flag).
- Eight stylized, animated residents with distinct faces, hair, outfits and props.
- Adaptive graphics quality (Auto/High/Medium/Low): phones start at Medium, and Auto steps down if play drops below ~26 fps.

### Simulation
- Residents walk a sidewalk/crosswalk navigation graph to real front doors and outdoor activity spots; they never walk through buildings.
- Greetings and chats pause residents face to face with speech bubbles; thought bubbles at activities.
- Needs, schedules, walking speed, friendships and memories follow the v0.1 rules.

### Saves
- Same `tlw-save` key; v0.1 saves load (residents saved inside buildings are moved indoors at the door).
- Saves are verified after writing, keep a one-slot backup (`tlw-save-prev`), and unreadable saves are kept as `tlw-save-unreadable` instead of being silently discarded. Damaged values are repaired on load.

### Tooling
- `npm test`: syntax checks plus Playwright browser tests on emulated iPhones; GitHub Actions workflow runs them on pushes and pull requests.

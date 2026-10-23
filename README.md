# Tiny Living World — Willowbrook

A **mobile-friendly, 3D low-poly living-town prototype** built with Three.js. Eight autonomous residents roam a small neighborhood, follow schedules, manage basic needs, encounter each other, and remember conversations.

Willowbrook is a cozy floating diorama: hand-shaped procedural buildings, gardens, a park with a fountain, a duck pond, an orchard and a community garden, with a full day/night cycle (glowing windows, streetlamp light pools, fireflies) and gentle ambient motion (swaying trees and flowers, fountain spray, bakery chimney smoke, butterflies, ducks, a waving flag, and a town-hall clock that tells game time).

## Play
Open the deployed `index.html` over HTTPS or a local web server. The Three.js module loads from jsDelivr, so an internet connection is required.

### GitHub Pages (recommended)
The game is plain static files — no build step. Everything is referenced with relative paths (`./src/world.js`, `./src/residents.js`), so it works from the repository sub-path `https://outerheavenx.github.io/tiny-living-world/`. A `.nojekyll` file makes Pages serve the files untouched.
1. Merge the release into **main**.
2. In this repository, open **Settings → Pages** and choose **Deploy from a branch**, branch **main**, folder **/(root)**.
3. Wait for the Pages deployment to finish (Actions tab), then open `https://outerheavenx.github.io/tiny-living-world/` and hard-refresh.

You can alternatively connect this repository to Cloudflare Pages or Workers Static Assets (output directory: repository root, no build command).

Current version: **v0.2.0** (shown on the title screen and in Settings).

## Controls
- **Phone/tablet:** one-finger drag to orbit, two-finger pinch to zoom (moving both fingers also pans), tap a resident.
- **Desktop:** drag to orbit, right-drag or Shift-drag to pan, scroll to zoom, click a resident, **R** to reset the camera, **Esc** to close panels.
- **Title screen:** Continue (resume your saved town), New Game, Settings.
- **HUD:** tap the clock for *Town happenings*; pause/resume; speed (1×/3×/10×); ☰ menu for Settings, Save now, title screen and deleting the save.
- **Bottom bar:** People (cycle residents), Reset view, Save.
- **Resident sheet:** Follow, next resident (›), close; swipe up for memories and friends, swipe down to dismiss.

## Settings
Stored separately from the town save (`tlw-settings` in localStorage): graphics quality (Auto/High/Medium/Low), camera sensitivity, shadows, autosave (every 2 minutes and when the app is backgrounded), and gesture hints. *Delete saved town* replaces the old HUD Reset button.

**Graphics quality:** High = up to 2× pixel density and 2048px shadows (desktop default); Medium = 1.5× and 1024px shadows (phone default); Low = 1× and no shadows. In Auto, the game measures the real frame rate while you play and steps down if it stays below ~26 fps.

## Residents
Eight stylized low-poly people, each with their own face, hairstyle, outfit and props: Oliver the baker (chef's toque, apron), Emma the florist (pastels, flower in her hair), Sarah the journalist (blazer, glasses, satchel, notepad), Marcus the mayor (suit and tie), Mia the café owner (bun, apron, coffee cup), Noah the mechanic (cap, overalls, wrench), Lily the artist (beret, paint-spattered smock, brush) and Ethan (hoodie, headphones, jeans).

- **Animation:** walk cycle driven by the ground actually covered (correct at 1×/3×/10×), breathing idle with look-arounds, smooth turning, and activity poses — sitting, sipping coffee, gardening, fixing things, browsing flowers, reading/taking notes, sketching, watching, talking and waving.
- **Navigation:** a lightweight graph along the sidewalks, crosswalks and garden paths. Residents walk to real front doors and go inside (they disappear indoors and reappear at the door), or to outdoor spots: café and bakery patio seats, park benches, flower stands, gardens, the fountain and the statue. Routes never pass through buildings.
- **Social life:** passers-by stop to say hi and wave; when two residents chat (the same v0.1 rule that builds friendships and memories) they pause, face each other and show alternating speech bubbles (a heart for close friends). Thought bubbles hint at what they're enjoying.
- **Unchanged rules:** needs, schedules (`goal()`), walking speed, relationships and memories work exactly as in v0.1; the new layer only decides *how* a resident reaches the destination their schedule chose.
- **Detail sheet:** mood, what they're doing now, their current goal and destination, needs, and important memories (those involving their closest friends first).

## Project layout
- `index.html` — UI, camera/touch controls, simulation, saves.
- `src/world.js` — the procedural Willowbrook scenery, lighting, sky and ambient animation. Everything is generated in code (no downloaded models or AI-generated assets).
- `src/residents.js` — character models and animation, the sidewalk navigation graph, building footprints, speech bubbles and moods.
- `tests/` — automated checks.

### Scene performance notes
Static scenery is baked into a few merged, vertex-coloured, flat-shaded meshes (buildings/props, foliage with a GPU sway shader, glowing windows/lamps), so the whole town draws in roughly 35–40 draw calls and ~100k triangles. Each resident is 6 small merged meshes (body, head, arms, legs) under 3k triangles. Night lighting uses emissive windows and additive light pools rather than real point lights. Shadows can be turned off in Settings for battery life.

## State and limits
- Saves are stored in **localStorage on the current device** under the same `tlw-save` key and format as v0.1 (v0.2 adds `version`, `savedAt`, `saveFormat: 2` and each resident's `inside`/`y`); there is no cloud sync. v0.1 saves still load: anyone saved standing inside a building is moved to that building's door and placed indoors.
- The simulation runs in the browser and pauses when the tab is closed.
- Residents use lightweight procedural behaviors rather than paid AI APIs.
- This is an early playable slice; interiors and complex relationships are not implemented. Residents don't avoid each other on the sidewalk (they can briefly overlap).
- Automated tests run in desktop Chromium emulating iPhone screens and touch; they are not a substitute for testing on a real iPhone/Safari.
- See [CHANGELOG.md](CHANGELOG.md) for everything in v0.2.0.

## Development checks
No build step is needed to play. For automated checks (Playwright + headless Chromium, emulating iPhone screens with real touch input):

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` parses the game modules, then runs browser tests covering the title screen, camera framing on several iPhone sizes and orientations, one-finger orbit, pinch zoom and limits, Reset Camera, the resident bottom sheet, safe-area layout, pause/speed, save → reload → Continue, legacy v0.1 save loading, New Game/delete flows, settings persistence and autosave, the diorama layout and draw-call budget, character models and animation, navigation (no walking through buildings), night routines, greetings and chats, save migration and corruption handling, adaptive graphics quality, and serving from the GitHub Pages sub-path. Set `SHOTS_DIR=some/folder` to also save screenshots. The same checks run on GitHub Actions (`.github/workflows/checks.yml`) for every push and pull request.

## License
All original prototype code. Third-party Three.js is loaded from its CDN under its own license.

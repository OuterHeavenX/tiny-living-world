# Tiny Living World — Willowbrook

A **mobile-friendly, 3D low-poly living-town prototype** built with Three.js. Eight autonomous residents roam a small neighborhood, follow schedules, manage basic needs, encounter each other, and remember conversations.

Willowbrook is a cozy floating diorama: hand-shaped procedural buildings, gardens, a park with a fountain, a duck pond, an orchard and a community garden, with a full day/night cycle (glowing windows, streetlamp light pools, fireflies) and gentle ambient motion (swaying trees and flowers, fountain spray, bakery chimney smoke, butterflies, ducks, a waving flag, and a town-hall clock that tells game time).

## Play
Open the deployed `index.html` over HTTPS or a local web server. The Three.js module loads from jsDelivr, so an internet connection is required.

### GitHub Pages
1. In this repository, open **Settings → Pages**.
2. Select **Deploy from a branch**, branch **main**, folder **/(root)**, then save.
3. After GitHub publishes, visit `https://outerheavenx.github.io/tiny-living-world/`.

You can alternatively connect this repository to Cloudflare Pages or Workers Static Assets. No build command is needed.

Current version: **v0.2.0** (shown on the title screen and in Settings).

## Controls
- **Phone/tablet:** one-finger drag to orbit, two-finger pinch to zoom (moving both fingers also pans), tap a resident.
- **Desktop:** drag to orbit, right-drag or Shift-drag to pan, scroll to zoom, click a resident, **R** to reset the camera, **Esc** to close panels.
- **Title screen:** Continue (resume your saved town), New Game, Settings.
- **HUD:** tap the clock for *Town happenings*; pause/resume; speed (1×/3×/10×); ☰ menu for Settings, Save now, title screen and deleting the save.
- **Bottom bar:** People (cycle residents), Reset view, Save.
- **Resident sheet:** Follow, next resident (›), close; swipe up for memories and friends, swipe down to dismiss.

## Settings
Stored separately from the town save (`tlw-settings` in localStorage): camera sensitivity, shadows, autosave (every 2 minutes and when the app is backgrounded), and gesture hints. *Delete saved town* replaces the old HUD Reset button.

## Project layout
- `index.html` — UI, camera/touch controls, simulation, saves.
- `src/world.js` — the procedural Willowbrook scenery, lighting, sky and ambient animation. Everything is generated in code (no downloaded models or AI-generated assets).
- `tests/` — automated checks.

### Scene performance notes
Static scenery is baked into a few merged, vertex-coloured, flat-shaded meshes (buildings/props, foliage with a GPU sway shader, glowing windows/lamps), so the whole town draws in roughly 35–40 draw calls and ~100k triangles. Night lighting uses emissive windows and additive light pools rather than real point lights. Shadows can be turned off in Settings for battery life.

## State and limits
- Saves are stored in **localStorage on the current device** under the same `tlw-save` key and format as v0.1 (v0.2 adds `version` and `savedAt` fields); there is no cloud sync. v0.1 saves load unchanged.
- The simulation runs in the browser and pauses when the tab is closed.
- Residents use lightweight procedural behaviors rather than paid AI APIs.
- This is an early playable slice; full navigation/pathfinding, interior spaces and complex relationships are not implemented. Residents still walk in straight lines (through fences and gardens) to the same destination points as v0.1.
- Mobile device QA and visual playtesting are still needed.

## Development checks
No build step is needed to play. For automated checks (Playwright + headless Chromium, emulating iPhone screens with real touch input):

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` parses the game module, then runs browser tests covering the title screen, camera framing on several iPhone sizes and orientations, one-finger orbit, pinch zoom and limits, Reset Camera, the resident bottom sheet, safe-area layout, pause/speed, save → reload → Continue, legacy v0.1 save loading, New Game/delete flows, settings persistence and autosave. Set `SHOTS_DIR=some/folder` to also save screenshots.

## License
All original prototype code. Third-party Three.js is loaded from its CDN under its own license.

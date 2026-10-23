# Tiny Living World — Willowbrook

A **mobile-friendly, 3D low-poly living-town prototype** built with Three.js. Eight autonomous residents roam a small neighborhood, follow schedules, manage basic needs, encounter each other, and remember conversations.

## Play
Open the deployed `index.html` over HTTPS or a local web server. The Three.js module loads from jsDelivr, so an internet connection is required.

### GitHub Pages
1. In this repository, open **Settings → Pages**.
2. Select **Deploy from a branch**, branch **main**, folder **/(root)**, then save.
3. After GitHub publishes, visit `https://outerheavenx.github.io/tiny-living-world/`.

You can alternatively connect this repository to Cloudflare Pages or Workers Static Assets. No build command is needed.

## Controls
- **Desktop:** drag the view to orbit, scroll to zoom, click a resident.
- **Phone/tablet:** drag to orbit, pinch to zoom, tap a resident.
- **UI:** pause/resume, change speed (1×/3×/10×), cycle residents, save and reset.
- Tap **Follow** inside a resident profile to follow them around the town.

## State and limits
- Saves are stored in **localStorage on the current device**; there is no cloud sync.
- The simulation runs in the browser and pauses when the tab is closed.
- Residents use lightweight procedural behaviors rather than paid AI APIs.
- This is an early playable slice; full navigation/pathfinding, interior spaces, complex relationships, and Blender-made models are not implemented.
- Mobile device QA and visual playtesting are still needed.

## License
All original prototype code. Third-party Three.js is loaded from its CDN under its own license.

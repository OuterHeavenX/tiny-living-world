# Changelog

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

# Neon Descent

Neon Descent is evolving into a top-down extraction action looter built in vanilla JavaScript and HTML5 Canvas, designed around risky scavenging runs, meaningful loot, and hideout progression across desktop and mobile-friendly setups.

## Highlights

- Extraction-focused runs with rising pressure and commit-heavy endgame escapes
- Progressive sector flow with breach events and shifting combat pacing
- Distinct class and weapon-build paths that change how runs feel
- Meta progression, workshop systems, and material banking shaping long-term play
- Runtime performance modes and combat-side safeguards for dense fights
- Keyboard-first controls with a browser-friendly local setup

## Current State

`v0.4.9-mvp`

This build reopens the run flow after the first objective pass became too punishing: bigger play space, lighter cover density, fewer enemies, easier extraction, and the field objective shifted toward an optional bonus instead of a hard pressure gate.

## How To Play

- `WASD` / Arrow keys: Move
- `Space`: Use ability
- `Esc`: Pause
- Inventory button: Open run inventory/backpack
- `F3`: Toggle performance overlay
- `F4`: Cycle balance preset

## How To Run

Run the game from a local static server:

- Python: `python -m http.server 8000`
- Open: `http://localhost:8000/neon-descent.html`

## Project Structure

- `neon-descent.html`: Current playable entry point and canonical source of truth
- `game.js`: Legacy/secondary script copy kept until the repo is fully unified
- `assets/`: Static project assets and supporting release material

## Known Issues

- Very dense fights can still need more tuning for perfect readability
- Performance and visual feedback are still being balanced against each other in chaos-heavy builds

## Next Up

- Reframe the live loop around better loot value, clearer extraction stakes, and less repetitive kiting
- Turn the current workshop/menu progression into a real hideout structure with stash, vendor, workbench, and intel roles
- Move maps toward points of interest, guarded loot, patrols, and route decisions instead of mostly open wave pressure
- Use operations as special endgame expeditions while standard runs become the main scavenging loop

## Feedback

Playtesting notes and feedback are welcome, especially around combat readability, extraction tension, progression clarity, and performance under upgraded builds.

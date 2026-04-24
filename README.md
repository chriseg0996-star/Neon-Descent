# Neon Descent

Neon Descent is a fast, progressive top-down extraction shooter built in vanilla JavaScript and HTML5 Canvas, designed around short high-pressure runs, escalating combat density, and performance-aware play across desktop and mobile-friendly setups.

## Highlights

- Extraction-focused runs with rising pressure and commit-heavy endgame escapes
- Progressive sector flow with breach events and shifting combat pacing
- Distinct class and weapon-build paths that change how runs feel
- Meta progression, workshop systems, and material banking shaping long-term play
- Runtime performance modes and combat-side safeguards for dense fights
- Keyboard-first controls with a browser-friendly local setup

## Current State

`v0.1.1-mvp`

This build is a public MVP polish update focused on readability, menu/HUD cleanup, combat feel, and performance tuning under heavier weapon and VFX load.

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

- Continue combat clarity and frame-stability work for projectile-heavy, AoE, and beam-heavy builds
- Make extraction rewards, materials, and workshop progression easier to understand during and after runs
- Keep simplifying menu flow and first-run presentation without turning the game into a tutorial wall
- Expand content only after the current vertical slice feels stable and clean

## Feedback

Playtesting notes and feedback are welcome, especially around combat readability, extraction tension, progression clarity, and performance under upgraded builds.

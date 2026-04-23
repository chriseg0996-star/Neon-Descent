# Neon Descent

Neon Descent is a progressive top-down extraction shooter built with vanilla JavaScript and HTML5 Canvas.

## Features

- Progressive sector system with gate unlock events.
- Biome shifts during runs for visual and pacing progression.
- Extraction loop with escalating threat levels (LOW/HIGH/CRITICAL).
- Dynamic balance presets: `arcade`, `standard`, `hardcore`.
- Runtime performance systems:
  - Mobile performance mode (`auto`, `on`, `off`)
  - Dynamic perf governor (quality <-> stable)
  - Real-time debug/performance overlay

## Controls

- `WASD` / Arrow keys: Move
- `Space`: Ability
- `Esc`: Pause
- `F3`: Toggle performance overlay
- `F4`: Cycle balance preset (`arcade -> standard -> hardcore`)

## In-Game Modes

- **Mobile Perf**
  - `AUTO`: detects device and applies optimized defaults.
  - `ON`: prioritizes stability and lower visual load.
  - `OFF`: prioritizes visual quality.

- **Balance Preset**
  - `ARCADE`: lower pressure, more forgiving runs.
  - `STANDARD`: default balanced run pacing.
  - `HARDCORE`: higher pressure and tighter extraction windows.

## How To Run

Because this project is plain HTML/JS, run from a local static server:

- Python: `python -m http.server 8000`
- Then open: `http://localhost:8000/neon-descent.html`

## Version

Current release target: `v0.1.0-mvp`

## Known Issues

- High-chaos moments can still reduce readability.
- Balance tuning is ongoing across presets and sectors.

## Roadmap (Short)

- Final combat/pacing tune pass from live playtest data.
- Release polish pass (UI readability + feedback cleanup).
- Content expansion after MVP lock (zones, enemies, weapons).

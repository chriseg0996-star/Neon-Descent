# QA Release Checklist (v0.1.1-mvp)

## Core Flow

- [ ] Start run from main menu works.
- [ ] Pause/resume (`Esc`) works reliably.
- [ ] Retry and return to menu work after run end.
- [ ] No crash on 3 consecutive runs.

## Combat

- [ ] Targeting feels responsive (no obvious hard lock bugs).
- [ ] Anti-kite pressure feels fair in `standard`.
- [ ] Boss spawn and kill flow complete without state issues.

## Extraction

- [ ] Extraction zone appears and relocates correctly.
- [ ] Threat labels update: LOW -> HIGH -> CRITICAL.
- [ ] Extraction interrupted behavior works when taking damage.
- [ ] Successful extraction ends run and rewards properly.

## Sector Progression

- [ ] Gates unlock with expected conditions.
- [ ] Sector breach event triggers once per gate.
- [ ] Sector flash and label feedback display correctly.

## Inventory / Loot

- [ ] Loot pickup and value tracking work.
- [ ] Full inventory shows swap/discard flow correctly.
- [ ] Consumables trigger expected behavior.

## Performance / Modes

- [ ] `F3` toggles perf overlay.
- [ ] `F4` cycles balance preset in-run.
- [ ] Menu button cycles Mobile Perf mode and persists.
- [ ] Menu button cycles Balance mode and persists.
- [ ] Mobile perf mode applies expected visual/perf behavior.
- [ ] Rapid-fire, beam, explosive, and multishot builds stay playable during dense fights.
- [ ] Regular mob death VFX no longer create obvious slowdown in kill streaks.

## Final Gate

- [ ] README and release notes match current build features.
- [ ] Known issues documented before publishing.

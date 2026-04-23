# Neon Descent v0.1.0-mvp

## Summary

First public MVP release of Neon Descent, focused on a stable progressive extraction loop, tactical combat pressure, and performance resilience.

## Highlights

- Added progressive sector flow with gate unlock events.
- Implemented biome shift progression during runs.
- Upgraded extraction with dynamic threat system:
  - LOW / HIGH / CRITICAL feedback
  - escalating pressure with capture commitment
- Added balance presets:
  - `arcade`, `standard`, `hardcore`
- Added mobile and performance controls:
  - `Mobile Perf`: Auto / On / Off
  - Runtime perf governor for quality/stability switching
- Added real-time performance overlay (`F3`) and balance quick switch (`F4`).

## Gameplay & Balance

- Improved anti-kite behavior for ranged and melee enemies.
- Smoothed run pacing toward more consistent 10-15 minute sessions.
- Reduced unfair early extraction pressure spikes.
- Refined threat escalation thresholds and readability cues.

## Performance

- Replaced frequent array `filter()` churn with in-place compaction.
- Throttled non-critical updates (HUD and selected world/extraction checks).
- Added VFX caps and dynamic degradation safeguards.

## Controls

- `WASD` / Arrows: Move
- `Space`: Ability
- `Esc`: Pause
- `F3`: Toggle perf overlay
- `F4`: Cycle balance preset

## Known Issues

- Visual clarity can still dip in very dense fights.
- Balance values may continue to evolve after broader playtesting.

## Next

- Final QA run sheet pass and preset lock.
- Release polish pass (UI clarity + consistency cleanup).
- Post-MVP content expansion.

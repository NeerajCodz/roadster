# Random course generation verification

Verified 2026-10-31. Normal play now draws a fresh uint32 seed on every start/restart/retry; explicit numeric seeds remain reproducible. The saved road/lane/difficulty setup is retained.

## Placement equation

For distance ahead `q = -z`, physical collision half-depth `h`, and signed NPC speed envelope `[uMin,uMax]`:

```text
cMin = playerCruise - uMax
cMax = playerRocket - uMin
contact = [max(0, (q-h)/cMax), (q+h)/cMin]
```

The implementation handles stationary/receding and zero-speed edge cases. NPC envelopes include braking to zero. Each body reserves every intersected lane, including its proposed lane-change sweep. The solver searches connected free time intervals from the actual player position and steering target, allowing 0.45 s reaction and at least 0.65 s for each adjacent-lane maneuver. Both source and destination must remain clear throughout a turn. Ramps and ground rocket activations are avoidable launch regions in the ground-route certificate.

Single-lane roads instead reserve separated contact windows and a complete flight/recharge cycle. A 0.75 s lift then coast clears the tallest and longest catalog vehicles while staying below gantries and sky barricades. The cycle includes landing, spent air divided by recharge rate, and timing margin, with a minimum of 2.9 s. Encounters use time-window separation, including differing NPC closing speeds, rather than relying solely on distance gaps.

New hazards and announced/committed NPC lane changes are rejected when no route remains. Ramp runway reservations protect takeoff, flight and landing in both insertion orders, including after the visible ramp passes. This establishes a safe generated route within the shipped motion bounds; the driver still chooses when to steer and fly.

## Evidence

- Full suite: **271 passed, zero failed** with `node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts`.
- 60 road/lane/difficulty combinations each complete 35 s using ordinary controls. Twelve hard oncoming stress cases complete 70 s across seeds 0, 1, 19 and 999 on 1/2/7 lanes; an additional three-lane rocket regression completes 35 s. These 73 playback scenarios never grant invincibility, clear entities or edit run state.
- All 24 fleet variants across three difficulties clear a real single-lane flight fixture without shield or invincibility.
- 270 seeded opening checks cover all multilane profiles; further tests verify fresh seeds, crypto fallback, deterministic replay, shuffled bags, opening variety, unreachable staggered rows, oncoming coincidence, wide bodies and continuous steering reservations.
- Rocket insertion and NPC maneuver runway bypasses were reproduced as failing tests, corrected, and verified green.
- Late-run encounter gaps retain random variation above their safety minimum. A regression reproduced the previous fixed-gap plateau before the upper bound was corrected.
- Difficulty density is measured with the same ordinary-control driver. The earlier invincible straight-line fixture abandoned its route and correctly stalled further spawning; the revised fixture preserves the original Easy < Medium < Hard assertions and also asserts survival.
- Application type-check, production build, formatting and reference-asset verification pass. All 29 original reference assets remain intact.
- Browser: started and restarted the saved Two-way / 7 lanes / Medium setup, observed changed traffic/ramp arrangement and intact HUD. Screenshots are local ignored artifacts: `artifacts/random-runs/run-a.png`, `run-b.png`, `run-b-near.png`.
- Independent final integration and route-math reviews found no further substantive issues. The browser error log was empty.

The generator performs conservative interval checks when admitting new bodies or maneuvers, rather than running the solver on every rendering frame. Population caps and the existing physical spawn/headway checks remain active.

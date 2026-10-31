# Volt launch ramps verification

Checked 2026-10-31 against the user's reference: one straight concave ramp and two progressively banked, mirrored roll ramps. Original procedural geometry uses the existing Volt palette. Player models and showroom are unchanged.

## Automated checks

- Full suite: `node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts` — 230 passed, zero failed after the reviewed contact fix. This includes the original 213 tests and 17 ramp tests.
- Focused ramp suite: all 17 pass, including six narrow/wide road configurations, retry resetting to Straight, mirrored raised-side entry rejection and a fast descending deck landing.
- Application type-check: `node node_modules/typescript/bin/tsc --noEmit` — passed.
- Inspector type-check: `node node_modules/typescript/bin/tsc --noEmit -p tools/ramps/tsconfig.json` — passed.
- Production build: `node node_modules/vite/bin/vite.js build` — passed.
- Asset verification: `node scripts/verify-assets.mjs` — all 29 reference asset hashes, sizes and two GLB headers passed.

Ramp tests cover sampled mesh contact, bounds and draw budget; mirrored roll direction and timing; independent paused light animation; deck support and bank; Q/E rejection on the deck; straight/free left/free right launches; rear-bumper clearance; no automatic lane change; early flight and steering cancellation; airborne and off-lane passes; pause, retry and legacy ramps; high-speed contact; generated kind cycling; avoiding raised-side entry teleports; descending onto the deck.

Independent code review found that steering beneath a raised deck could attach the car from below. The regression failed with a 2.454 m snap before the fix. Fresh contact now requires toe entry, deck proximity or a downward surface crossing. Both new regressions pass, and follow-up review found no material gaps.

## Browser inspection

- Inspected all three actual Three.js models in `/tools/ramps/index.html` at entry and side views. Adjusted framing so the complete decks and support frames fit. Verified curved surfaces, mirrored banking, trusses, ground feet, fixings, grip ribs, directional markings and light pulses.
- Played the saved Two-way / 7 lanes / Medium setup, including a fresh check after the reviewed contact fix. Held Q during the grounded approach. The opening ramp produced `STRAIGHT LAUNCH`, with 100% energy and more than 4 m altitude in the live HUD, without a queued ground roll.
- The inspector's error log contained no application errors. The graphics driver emitted a shader precision warning; rendering was visibly intact.
- Local proof images: `artifacts/ramps/volt-launch-ramps.png`, `artifacts/ramps/volt-frames.png` and `artifacts/ramps/straight-launch-live.png` (ignored generated artifacts).

Static ramp details are merged into seven material batches with six independent flow pulses: 13 mesh draws per model. The renderer pools by ramp kind and animates using simulation time.

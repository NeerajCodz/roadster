# Roaster Sim verification

Verified on 2026-10-25, Windows, Node 22.22.0.

- `npm test`: 60 passing tests, including simulation, keyboard focus, touch gestures, collision-aligned presentation, vehicle wheel axes, traffic warnings, trick scoring and gantry collisions.
- `npm run build`: TypeScript check and Vite production build pass.
- `npm run verify:assets`: all 29 original reference files match their byte lengths and SHA-256 hashes; both original GLB v2 headers pass.
- `git diff --check`: clean.
- Production preview HTTP: HTML returns 200 with the Roaster Sim title; original and concept models, HDR environment, and soundtrack return 200.

Browser checks during development covered desktop and 390×844 mobile layouts, start, help, garage vehicle selection, flight/energy use, barrel rolls, pause, results, saved records and keyboard activation. A header-focus regression was reproduced in the browser, fixed, then verified by flying with the sound button still focused. Results keyboard navigation was verified to return to the menu.

The last production-browser recheck was unavailable because local browser use was disabled in Work settings. Production compilation, HTTP serving, asset checks and all 60 regression tests were verified after the final code changes. Real-device touch playback has not been checked; gesture interpretation has automated coverage.

The user's separate model work under `tools/roadster` was left untouched and excluded from these commits.

## Airborne-only barrel rolls

Regression coverage now rejects Q/E while on the road or resting on a traffic roof, does not queue held ground inputs after takeoff, and ends an active spin on either landing surface. The roll HUD and touch-button availability use the same readiness rule. All 65 tests pass. The production build passes in an isolated snapshot of this fix with the committed renderer. The live checkout build encountered incomplete TypeScript edits in the concurrent model integration; those renderer/model files were preserved. The browser recheck remained unavailable because local browser use is disabled. User model files remain untouched.

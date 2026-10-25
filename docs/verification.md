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

## Procedural roadster and arcade showroom

- `npm test`: 85 passing tests. New coverage:
  - the exported `public/assets/models/roadster.glb` keeps its game contract: four wheel pivots that declare their tyre radius, four thruster mounts in a row at the tail, one recolourable `CarPaint`, a lit `BrakeLight`, 4.3 m length, tyres on the ground and under 180k triangles;
  - saved paint looks are validated and the palette colours stay distinct;
  - wheels roll forward on nose-forward models, using each model's declared radius.
- `npm run build`, `npx tsc -p tools/roadster/tsconfig.json`, `npx prettier --check src tests` and `npm run verify:assets` all pass.
- The model was rendered as contact sheets in headless Edge with `tools/roadster/render.mjs`. Every view (reference angle, orthographic, chase and menu cameras, close-ups) was compared with the user's reference photo through three critique rounds. The exported GLB was re-rendered to confirm it loads back identically.
- Browser checks on the dev server:
  - the new roadster loads by default on a fresh profile;
  - car switching works, with loading and forced-failure fallback;
  - quick paint and the paint shop work: finishes, colours, rims, reset, and the camera moving to the wheels on the RIMS tab;
  - drag-to-spin works;
  - the showroom hides during a run;
  - flames fire from the model's four thrusters in flight.

  Layouts were measured at 1440×900, 1280×720, 1024×768, 768×1024, 390×844, 844×390 and 1920×1080. Real-device touch remains unchecked.

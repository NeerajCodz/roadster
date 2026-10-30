# Roaster Sim verification

## Custom lane counts — 2026-10-31

- All 213 tests pass. The suite exercises every valid road/count/difficulty combination: Normal and Opposite with 1–7 lanes, Two-way with 2–7 total lanes, across Easy/Medium/Hard. Coverage includes centred positions, safe openings, edge clamps, legal directions, grounded traffic, body clearance, narrow-road progression and deterministic retry.
- Single-lane runs generate real NPCs and barricades with longer longitudinal spacing and at least two seconds of birth reaction time in the progression fixture. Their escape is flight. Two-lane roads can also require flight when vehicles meet; sampled ground escape checks apply to roads with three or more lanes.
- All 20 mode/count layouts have positive road/gantry geometry, correct separators and direction arrows. Camera projection tests cover both outer lanes, flight heights, boost, portrait/landscape screens and rapid seven-lane steering. Empty separator sets allocate no instance buffers.
- Sixty independent record buckets validate and migrate correctly. The nine original default-width keys are preserved. Invalid saved counts normalize safely, and count changes remain menu-only.
- Browser checks at 1280×720 and 390×844 verified seven-lane selection and the 3-oncoming/4-with-you split, outer-lane steering with the car visible on a phone, one-lane selection and flight, automatic minimum-two adjustment for Two-way, and seven-lane persistence after reload. No warnings/errors were recorded. The viewport override was reset. Real-device touch was not tested.
- Screenshots are saved under `artifacts/lanes/`: `setup-seven.png`, `two-way-seven.png`, `seven-lane-phone.png` and `single-lane-flight.png`.
- Game and fleet-inspector TypeScript checks, the production build, all 29 original asset checks, Prettier and whitespace checks pass. Production HTML, current JS/CSS and both player models return HTTP 200.
- Rendering caches are keyed by mode and count (at most 20). Asphalt, billboard and gantry sign textures are shared, hills remain global, and cached roots retain teardown ownership. Player assets and showroom behavior were preserved.

## Road modes and difficulty — 2026-10-31

- All 141 tests pass, including 37 new configuration, road geometry, driving-mode and record tests. The original 104 regressions remain green.
- Every Normal/Two-way/Opposite × Easy/Medium/Hard combination is exercised for lane limits, grounded NPCs, direction-aware travel, bounded populations, body clearance and ground reward reservations. The two-way fixture rejects NPC divider crossings; head-on movement adds closing speeds and swept collision catches fast passes.
- Difficulty tests measure actual cruise/boost speeds, flight drain/recharge, traffic populations, hazard counts, pickup rewards and indicator warning time. Easy, Medium and Hard differ in gameplay rather than only their labels.
- Retry reproduces the same seeded run and preserves its options. Configure rejects changes during play, pause and crash. Records are independently stored for all nine setups, validated on load, and legacy records migrate only to Normal/Medium.
- Visible road and gantry dimensions match the selected mode. All three modes retain the physical flight gap in their outer lanes. Oncoming headings, local steering/signals and road arrows have geometry regression coverage.
- Browser checks at 1280×720 and 390×844 covered mode/difficulty selection, Two-way/Hard and Opposite/Easy starts, the four-lane divider and three-lane road, active HUD labels and starting speeds, pause, retry, results, a new separate record, mobile launch and saved settings after reload. Keyboard Enter opens setup. No browser warnings or errors were recorded. The viewport override was reset afterward. Real-device touch was not tested.
- Browser screenshots are saved in `artifacts/modes/`: `run-setup.png`, `two-way-hard.png` and `opposite-easy.png`.
- Game and fleet-inspector TypeScript checks, the production build, all 29 asset checks, Prettier and `git diff --check` pass. Production HTTP checks returned 200 for HTML, current bundles and both player models.
- Mode road/scenery groups are cached for at most three layouts; shared asphalt/billboard textures and all cached groups are covered by renderer teardown. The player's models, showroom, paint shop and generator were preserved.

## NPC fleet — 2026-10-30

- All 104 regression tests pass. New coverage checks all 24 model bounds and axle layouts, road contact, outward-facing windows, visible service decals with complete UVs, fire-engine equipment clearance, clone-independent wheel animation and pause behavior.
- Four seeded two-minute accelerated runs reach all 24 types, average at least 24 active NPCs after 1.8 km, reach at least 28, stay within the 60-vehicle limit and retain a ground lane at the sampled physical contact positions. Twelve additional long seeded runs verify that NPCs stay grounded and flying barricades retain their varied heights.
- New ground obstacles leave physical headway and clearance around low reward/ramp routes. A fast car keeps space behind a full-size trailer, and NPCs brake behind grounded barricades. Existing deterministic replay, lane-change warning, rocket-boost safety, roof riding, flight and scoring regressions pass.
- TypeScript checks pass for the game and `tools/traffic/tsconfig.json`. The Vite production build, all 29 original asset checks, Prettier checks for source/tests/inspector, and `git diff --check` pass.
- Production HTTP checks return 200 for the game HTML, current JS/CSS bundles and both player models. The fleet inspector HTML and transformed TypeScript respond on the development server.
- Offline front and rear geometry previews of all 24 models were inspected. Review corrected inward glazing, buried service lettering, hidden fire-engine equipment and traffic/barricade overlap. The preview images are in `artifacts/traffic/` and are software geometry renders, not WebGL screenshots.
- Live browser inspection could not run because local browser use is disabled in Work settings. GPU appearance, live frame rate and the inspector's controls remain unverified in a browser this turn. Independent agent review was unavailable; the changes received local code review.
- Geometry is shared by model type, ordinary paint templates are cached by appearance, and individual brake materials remain independent. Dormant NPC clones are capped at two per appearance and 96 total. Overflow and renderer teardown preserve shared resources while releasing instance resources.
- The user's player models, showroom, paint shop and `tools/roadster` files were preserved. NPC models and markings are generated locally without additional media downloads or dependencies.

## Barricades — 2026-10-30

- 93 regression tests pass, including grounded NPC traffic across 12 seeded long runs, flying barricade heights/collisions, full frame bounds, exactly two downward boosters and independent pooled-clone animation.
- TypeScript and Vite production build pass. All 29 original asset checks pass.
- Ground and flying models inspected side by side in the browser; the two rails, striped paint, posts, feet and downward exhaust are visible.
- Live game start, acceleration and pause checked with no browser console errors.
- Instanced clone buffers are released on pool overflow and pooled groups are included during renderer teardown; shared geometry and materials remain valid.
- The user's car models, paint shop and model-generation tools were preserved.

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

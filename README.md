# Roaster Sim

A complete browser arcade game built with Three.js, TypeScript, and Vite. Choose a one-way, two-way or oncoming sunset freeway, lift above traffic with cold-gas thrusters, dive back to the road, and chain barrel rolls and near misses. Collect bolts, air refills, shields, magnets, double points, and rocket boosts while traffic becomes more demanding.

The game includes an arcade showroom and paint shop with three vehicles, sixteen colours, six finishes and rim colours, responsive desktop and touch controls, a live HUD, pause and results screens, sound settings, graphics settings, and local records. The simulation and interface are implemented in this repository; the original reference media is included locally.

## Run locally

Use Node.js **20.19+ on the 20.x line, or 22.12+**, with npm. CI uses Node 22. A modern browser with WebGL2 is required. No account, API key, backend, or environment variables are needed.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`. Serve the game through Vite or a static HTTP server so models and audio can load.

```sh
npm test                    # Run the renderer-independent simulation tests
node scripts/verify-assets.mjs # Check all 29 original asset hashes, sizes, and GLB headers
npm run build               # Type-check and produce dist/
npm run preview             # Serve the production build locally
```

The player roadster is generated, not hand-modelled. To change it, edit `tools/roadster/model/` and re-export. The script renders contact sheets with headless Edge or Chrome and writes the GLB:

```sh
node tools/roadster/render.mjs --model tools/roadster/model/index.ts --out artifacts/roadster/renders --shots grid,detail,hero
node tools/roadster/render.mjs --model tools/roadster/model/index.ts --out artifacts/roadster/renders --export public/assets/models/roadster.glb
```

`tools/roadster/DESIGN.md` describes the design and the contract the game relies on, and `tests/roadster-model.test.ts` checks the exported GLB against it.

Use `npm ci` instead of `npm install` for a reproducible install from the lockfile. The GitHub Actions workflow installs dependencies, verifies assets, runs the tests, and builds the game on pushes and pull requests.

## Play

Choose **LET'S DRIVE** (or press Enter/Space in the showroom) to open run setup, pick a road, total lane count and difficulty, then choose **START RUN**. The garage's Drive button opens the same setup. Your selection is remembered. Retry and restart keep the current setup; return to the showroom to change it.

Every start, retry and restart generates a fresh random course. Opening pickup trails, ramp lanes and distances, ramp order, encounter timing, NPC models/paint and hazard formations vary. Ramp kinds come from shuffled bags, so all three appear without a fixed repeating order. The selected road width and difficulty stay the same.

Placements are checked against reachable routes using real body dimensions, oncoming closing speeds, possible NPC braking and lane-change reservations. A gap must allow reaction time and a complete steering maneuver. Single-lane encounters reserve flight and air-recharge time, with refills before ground obstacles. Ramp takeoff and landing windows also remain clear of new bodies and NPC lane changes. The checks preserve a playable route while collisions and energy management remain active.

For debugging, `new Simulation(seed, options)` reproduces a course and its retries; normal play uses `new Simulation(undefined, options)` for fresh seeds. The active seed is available as `simulation.state.seed`. The contact-time equation and route graph are implemented in `src/game/route-planner.ts`; the opening arrangements and shuffle bags are in `src/game/run-generation.ts`.

| Road mode | Lanes | Traffic |
| --- | --- | --- |
| Normal | 1–7 | All vehicles travel in your direction. |
| Two-way | 2–7 total | Oncoming lanes on the left, same-direction lanes on the right, separated by double yellow lines. Odd counts give your side the extra lane: seven means three oncoming and four with you. |
| Opposite | 1–7 | Every NPC approaches head-on. Closing speed adds the NPC's speed to yours. |

NPCs stay on their own side of the two-way divider. Oncoming cars face you, including their headlights and turn signals. Lane limits, road markings, shoulders and overhead sign bounds follow the selected road width.

Single-lane roads use spaced flight encounters with longer reaction gaps and air pickups. You need to hop or fly over traffic rather than steer around it. Two-lane roads may also require flight when vehicles meet. One lane is disabled in Two-way; switching into Two-way from a single-lane setup selects two. The phone camera follows the car across the full width of a seven-lane road.

| Difficulty | Initial cruise | Flight energy use | Ground recharge | Score reward |
| --- | --- | --- | --- | --- |
| Easy | 130 km/h | 16% per second | 34% per second | ×0.8 |
| Medium | 158 km/h | 20% per second | 28% per second | ×1 |
| Hard | 180 km/h | 24% per second | 24% per second | ×1.5 |

Easy has lighter traffic, more space, longer indicator warnings, more frequent bonus pickups and later aerial formations. Hard adds traffic faster, raises NPC and boost speeds, introduces aerial hazards earlier and demands more careful energy use. Every level retains a safe opening, bounded populations, physical spawn clearance and at least a one-second warning before an NPC lane change. Cruise speed also rises gradually with distance. Normal/Medium preserves the original game balance.

Each of the 60 road/lane-count/difficulty combinations keeps its own score, distance and run records. Existing mode records retain their original default widths (Normal five, Two-way four, Opposite three); older overall records migrate into Normal/five/Medium. Lifetime totals are retained. The active setup appears in the HUD, pause screen and results.

The car cruises automatically. Keep a clear lane or fly over obstacles; releasing flight lets the car descend. Air refills on the ground. Barrel rolls work only while airborne: take off first, then press Q / E. They consume air, move one lane, and provide brief collision protection. Landing on the road or a traffic roof immediately ends the spin. Ramps launch the car, and a controlled landing can ride a traffic vehicle's roof. Near misses increase a temporary combo multiplier. NPC cars stay on the road; watch for flying barricades as the run progresses.

Three Volt launch ramps appear in shuffled order: **Straight**, **Left Roll**, and **Right Roll**. The car follows each curved deck's pitch and bank before leaving the lip. Roll ramps perform one free barrel roll in the indicated direction after the rear bumper clears the ramp, holding your current lane. Q / E stays blocked on the deck. Flying early or steering off skips the automatic ramp trick. The ramps use charcoal metal, titanium trusses, grip ribs, fixings, lime edge lighting and animated light pulses.

Open the [Volt ramp inspector](http://127.0.0.1:5173/tools/ramps/index.html) with the development server running to compare entry, side and launch views of the three models. Type-check it with `node node_modules/typescript/bin/tsc -p tools/ramps/tsconfig.json`.

| Action         | Desktop                                 | Touch                 |
| -------------- | --------------------------------------- | --------------------- |
| Start / retry  | Enter or Space, or the on-screen button | Start / retry button  |
| Change lanes   | A / D or Left / Right                   | Left / right buttons  |
| Boost          | Hold W, Up, or Shift                    | Hold Boost            |
| Hop / fly      | Tap / hold Space                        | Tap / hold Fly        |
| Dive           | Hold S or Down                          | Hold Dive             |
| Barrel roll    | Q / E                                   | Roll L / Roll R       |
| Pause / resume | Esc or P; pause / resume button         | Pause / resume button |
| Toggle sound   | M or sound button                       | Sound button          |

Touch supports simultaneous steering and flight inputs. The game pauses when the window loses focus or the page becomes hidden. Audio starts after a user interaction, following browser playback rules.

You can also use the scene itself on touch screens: swipe horizontally to steer, hold to fly, swipe down to dive, and double-tap while airborne to roll in your last steering direction. Input cancellation and queued swipe limits prevent stuck controls. The roll readiness meter shows its cooldown and low-energy state.

Traffic signals before changing lanes and brakes when following a slower vehicle. Flying barricades form aerial pairs and slaloms as difficulty increases. Rolls, near misses, roof rides, and big air build trick chains; each kilometre adds a milestone bonus. Power-ups have readable labels, active timers, and matching audio feedback.

The NPC fleet has 24 vehicle types: sedans, hatchbacks, SUVs, taxis, vans, pickups, box trucks, city buses, car transporters, coupes, estates, minivans, executive cars, crossovers, off-roaders, ambulances, police cars, fire engines, school buses, parcel vans, delivery trucks, tankers, flatbeds and articulated freight trucks. Ordinary vehicles use eight paint colours; service vehicles keep their markings. Models have shaped windows, wheel arches, grilles, mirrors, plates and independently rotating wheels, with working brake lights, indicators and emergency beacons.

Traffic builds gradually with targets based on road width and difficulty. Normal/Medium targets up to 42 active NPCs; the absolute limit is 60. Cars cruise faster than heavy trucks and maintain headway behind slower traffic and ground barricades. Crowded packs are staggered well ahead of the player. Buses and trailers retain their full size, including the 16.12 m transporter; collision bounds and lane-change clearance use those dimensions. New traffic spawns beyond the main wave with room around other vehicles, pickups and ramps.

Start the development server and open the [NPC fleet inspector](http://127.0.0.1:5173/tools/traffic/index.html) to view all 24 models, inspect an individual vehicle or switch between front and rear views. Its TypeScript check is `node node_modules/typescript/bin/tsc -p tools/traffic/tsconfig.json`.

Barricades have two yellow-and-black striped rails, dark posts, fixings and weighted rubber feet. Flying versions add exactly two downward boosters with animated exhaust. Both use shared 3 × 1.7 × 0.85 m collision bounds; the exhaust is cosmetic. NPC cars never spawn in the air.

To inspect both props side by side, start the development server and open [`/tools/barricades/index.html`](http://127.0.0.1:5173/tools/barricades/index.html). The barricade geometry and procedural paint textures are defined in `src/game/barricade.ts`.

## Garage, settings, and records

- **Showroom (home screen):** pick a car from the card carousel. Each card shows its class, stars and performance rank, and the info panel shows showroom specs. Quick paint swatches sit beside the cards, and you can drag the car to spin it. The specs are for show: every car plays by the same rules.
- **Paint shop (GARAGE):** body colour and finish (factory, gloss, metallic, satin, matte or chrome), rim colour, and reset to factory. Choices apply live and are saved per car. The camera moves to the wheels on the RIMS tab.
- **Roadster (2026 · Thrust)** is the default car: an original, unbranded procedural model of the white four-thruster roadster, generated by `tools/roadster` and exported to `public/assets/models/roadster.glb`. Flames fire from its four built-in thrusters, and its wheels and paint are separate so they can spin and be repainted.
- **Rush Original** is the textured player vehicle from the reference game. Its baked texture can only be tinted.
- **Aero GT** is the detailed CarConcept model, with PBR materials, a full interior and separate wheels. Its paint and license plate materials are adjusted at runtime.
- **High Quality** enables shadows and bloom with a higher rendering resolution. **Performance** lowers pixel density and disables those effects.
- Sound, graphics quality, selected vehicle, each car's paint, finish and rims, road/difficulty selection, records for each setup and lifetime totals are saved in this browser's `localStorage` under `roadster-rush-v1`. Run records update after a crash. Clearing site data resets them. Play remains available when storage is unavailable.

## Architecture

| File / directory                               | Responsibility                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/main.ts`                                  | Interface, keyboard and pointer input, dialogs, saved preferences, HUD, music and voice playback     |
| `src/game/simulation.ts`                       | Seeded, renderer-independent game state, movement, flight, traffic, collisions, scoring, and pickups |
| `src/game/run-settings.ts`                    | Shared immutable road modes and real difficulty profiles                                             |
| `src/game/run-random.ts`, `run-generation.ts`  | Fresh run seeds, reproducible randomness, varied opening layouts and shuffle bags                    |
| `src/game/route-planner.ts`                    | Physical contact-time envelopes, connected steering routes and flight/recharge spacing              |
| `src/game/run-records.ts`                     | Validated records for nine run setups and legacy record migration                                    |
| `src/game/road-layout.ts`, `road-geometry.ts`  | Shared mode-dependent lane markings, road dimensions, gantries and oncoming presentation              |
| `src/game/renderer.ts`                         | Three.js scene, model loading, freeway and scenery, lighting, effects, camera, and graphics quality  |
| `src/game/audio.ts`                            | Web Audio engine, wind, thrusters, and gameplay sound effects                                        |
| `src/game/keyboard.ts`, `src/game/gestures.ts` | Keyboard focus routing and touch gesture interpretation                                              |
| `src/game/presentation.ts`                     | Collision-aligned player position and per-vehicle traffic lights                                     |
| `src/game/traffic-catalog.ts`                  | Shared NPC dimensions, axle positions, speeds, paints and spawn weights                              |
| `src/game/traffic-model.ts`, `traffic-decals.ts` | Procedural NPC models, local bitmap markings, wheel and emergency-light animation                   |
| `tools/traffic/`                              | Development-only fleet overview and individual front/rear inspection                                |
| `src/game/cars.ts`                             | Vehicle registry, showroom specs, paint palette, finishes and saved-look validation                  |
| `src/game/vehicle.ts`                          | Wheel spin from road travel and each model's declared tyre radius                                    |
| `tools/roadster/`                              | Procedural roadster generator, design brief, contact-sheet renderer and GLB export                   |
| `src/style.css`                                | Responsive garage, HUD, dialogs, typography, and touch controls                                      |
| `tests/simulation.test.ts`                     | Simulation regression tests without a browser or GPU                                                 |
| `public/assets/`                               | Locally served models, HDR environment, original media, and license documents                        |
| `scripts/verify-assets.mjs`                    | Dependency-free validation of the original media inventory                                           |

The player stays near the scene origin while incoming entities move along the road. Rendering follows simulation state, so the game rules can be tested independently of WebGL. Models, fonts, images, and audio are served from the build's own files.

## Static build

`npm run build` creates a ready-to-serve **`dist/`** directory. Copy its complete contents, including assets, to a static web host. Vite uses `base: './'` for relative build paths, including hosting under a subdirectory. There is no server component or deployment step in this repository's CI. `npm run preview` is for checking the production output locally.

## Assets and credits

- **Original reference media:** the 29 assets from [Roadster Rush](https://roadster-rush.ai.studio/) were copied at the user's request: the player Roadster, nine traffic vehicle meshes in one GLB, four billboards, three music tracks, fourteen voice clips, the audio manifest, Inter font, and four icons. The two GLBs were extracted unchanged from embedded binary assets. No blanket reuse license was found for this media; the original models contain no license or copyright fields. Inter is covered separately below. Sources, file sizes, and SHA-256 hashes are recorded in the [reference asset manifest](public/assets/reference/asset-manifest.json); see the [reference asset notes](public/assets/reference/README.md).
- **Roadster (2026 · Thrust):** an original procedural model built in this repository (`tools/roadster`), following public coverage of the October 2026 roadster reveal. It carries no manufacturer names, logos or badges and needs no third-party license.
- **NPC fleet:** 24 original, unbranded procedural models and bitmap markings generated by this repository. These replace the nine reference traffic meshes during gameplay. No additional model downloads, image assets or runtime dependencies are required.
- **Aero GT / CarConcept:** model and textures by Eric Chadwick, © 2024 Darmstadt Graphics Group GmbH, from [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The stored GLB is unchanged; the game changes paint and plate materials at runtime. See the [asset attribution](public/assets/ATTRIBUTION.md), [original license](public/assets/CarConcept-LICENSE.md), [full CC BY text](public/assets/CC-BY-4.0.txt), and [Khronos logo notice](public/assets/Khronos-LOGO-LICENSE.txt).
- **Venice Sunset HDRI:** Greg Zaal / [Poly Haven](https://polyhaven.com/a/venice_sunset), [CC0](https://polyhaven.com/license).
- **Fonts:** Manrope and Space Grotesk are installed through the Fontsource npm packages under the SIL Open Font License. Their [Manrope license](public/assets/licenses/Manrope-OFL.txt) and [Space Grotesk license](public/assets/licenses/SpaceGrotesk-OFL.txt) are bundled with the static build. The copied Inter font credits The Inter Project Authors and includes its [SIL OFL license](public/assets/reference/Inter-OFL-LICENSE.txt) and [embedded font metadata](public/assets/reference/font-metadata.json).
- **Three.js:** [Three.js](https://threejs.org/), under the MIT license, including its example loaders and post-processing modules.

The individual media licenses and notices remain applicable to their respective assets.

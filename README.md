# Roaster Sim

A complete browser arcade game built with Three.js, TypeScript, and Vite. Drive a five-lane sunset freeway, lift above traffic with cold-gas thrusters, dive back to the road, and chain barrel rolls and near misses. Collect bolts, air refills, shields, magnets, double points, and rocket boosts while traffic becomes more demanding.

The game includes an Asphalt-style showroom and paint shop with three vehicles, sixteen colours, six finishes and rim colours, responsive desktop and touch controls, a live HUD, pause and results screens, sound settings, graphics settings, and local records. The simulation and interface are implemented in this repository; the original reference media is included locally.

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

The car cruises automatically. Keep a clear lane or fly over obstacles; releasing flight lets the car descend. Air refills on the ground. Barrel rolls work only while airborne: take off first, then press Q / E. They consume air, move one lane, and provide brief collision protection. Landing on the road or a traffic roof immediately ends the spin. Ramps launch the car, and a controlled landing can ride a traffic vehicle's roof. Near misses increase a temporary combo multiplier. Watch for traffic in the air as the run progresses.

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

Traffic signals before changing lanes, brakes when following a slower vehicle, and forms aerial pairs and slaloms as difficulty increases. Rolls, near misses, roof rides, and big air build trick chains; each kilometre adds a milestone bonus. Power-ups have readable labels, active timers, and matching audio feedback.

## Garage, settings, and records

- **Showroom (home screen):** pick a car from the card carousel. Each card shows its class, stars and performance rank, and the info panel shows showroom specs. Quick paint swatches sit beside the cards, and you can drag the car to spin it. The specs are for show: every car plays by the same rules.
- **Paint shop (GARAGE):** body colour and finish (factory, gloss, metallic, satin, matte or chrome), rim colour, and reset to factory. Choices apply live and are saved per car. The camera moves to the wheels on the RIMS tab.
- **Roadster (2026 · Thrust)** is the default car: an original, unbranded procedural model of the white four-thruster roadster, generated by `tools/roadster` and exported to `public/assets/models/roadster.glb`. Flames fire from its four built-in thrusters, and its wheels and paint are separate so they can spin and be repainted.
- **Rush Original** is the textured player vehicle from the reference game. Its baked texture can only be tinted.
- **Aero GT** is the detailed CarConcept model, with PBR materials, a full interior and separate wheels. Its paint and license plate materials are adjusted at runtime.
- **High Quality** enables shadows and bloom with a higher rendering resolution. **Performance** lowers pixel density and disables those effects.
- Sound, graphics quality, selected vehicle, each car's paint, finish and rims, best score, best distance, collected bolts, and completed run count are saved in this browser's `localStorage` under `roadster-rush-v1`. Run records update after a crash. Clearing site data resets them. Play remains available when storage is unavailable.

## Architecture

| File / directory                               | Responsibility                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/main.ts`                                  | Interface, keyboard and pointer input, dialogs, saved preferences, HUD, music and voice playback     |
| `src/game/simulation.ts`                       | Seeded, renderer-independent game state, movement, flight, traffic, collisions, scoring, and pickups |
| `src/game/renderer.ts`                         | Three.js scene, model loading, freeway and scenery, lighting, effects, camera, and graphics quality  |
| `src/game/audio.ts`                            | Web Audio engine, wind, thrusters, and gameplay sound effects                                        |
| `src/game/keyboard.ts`, `src/game/gestures.ts` | Keyboard focus routing and touch gesture interpretation                                              |
| `src/game/presentation.ts`                     | Collision-aligned player position and per-vehicle traffic lights                                     |
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
- **Aero GT / CarConcept:** model and textures by Eric Chadwick, © 2024 Darmstadt Graphics Group GmbH, from [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The stored GLB is unchanged; the game changes paint and plate materials at runtime. See the [asset attribution](public/assets/ATTRIBUTION.md), [original license](public/assets/CarConcept-LICENSE.md), [full CC BY text](public/assets/CC-BY-4.0.txt), and [Khronos logo notice](public/assets/Khronos-LOGO-LICENSE.txt).
- **Venice Sunset HDRI:** Greg Zaal / [Poly Haven](https://polyhaven.com/a/venice_sunset), [CC0](https://polyhaven.com/license).
- **Fonts:** Manrope and Space Grotesk are installed through the Fontsource npm packages under the SIL Open Font License. Their [Manrope license](public/assets/licenses/Manrope-OFL.txt) and [Space Grotesk license](public/assets/licenses/SpaceGrotesk-OFL.txt) are bundled with the static build. The copied Inter font credits The Inter Project Authors and includes its [SIL OFL license](public/assets/reference/Inter-OFL-LICENSE.txt) and [embedded font metadata](public/assets/reference/font-metadata.json).
- **Three.js:** [Three.js](https://threejs.org/), under the MIT license, including its example loaders and post-processing modules.

The individual media licenses and notices remain applicable to their respective assets.

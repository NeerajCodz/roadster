# Roadster model: design brief and contract

The player car is a procedural, unbranded white aerospace roadster with four rear thrusters. It follows the
redesigned second-generation roadster shown in October 2026 (white bodywork, gold-tinted glass, cold-gas
thrusters) as seen in the user's main reference photo, and keeps the proportions of the original Roadster Rush car
(`public/assets/reference/models/roadster_user.glb`, which is a rough AI mesh of the same design).
No manufacturer names, logos or badges appear on the model.

## Main reference (user-supplied photo, rear-left three-quarter, low camera, desert lakebed)

Reproduce this as closely as possible. Viewer shot `hero` uses the same camera angle.

**Overall character.** Very low, long wedge. The surfaces are large, almost flat facets joined by crisp but slightly
softened edges (2–8 mm radius look), not organic curves. Body is satin pearl white (#ecebe6, soft broad
reflections, light-grey shading). Everything below a rising diagonal line is gloss black.

**Side (car's left side visible).**
- A gloss-black lower body band (rocker/sill) runs from behind the front wheel to the rear wheel. Its top edge is one
  straight line that rises toward the rear: about 0.22 m above the ground behind the front wheel, about 0.45 m
  (near hub height) where it meets the rear wheel arch. Below it the body tucks in under the car.
- Above the band, the door and side are a flat white panel with a slight vertical tilt inward (tumblehome). A
  vertical door shut line drops from the side-window bottom, about one third of the wheelbase behind the front
  axle.
- A small black angular element, such as a side camera or vent, sits just behind and above the front wheel arch.
- Greenhouse: dark bronze/gold-tinted glass, nearly opaque from outside with warm bronze reflections. The side
  daylight opening is a long, low trapezoid from the A-pillar, which sits over the rear half of the front wheel,
  back to the C-pillar. A thin pale pillar splits it into a door window and a smaller rear quarter window. The
  bottom edge (beltline) is nearly straight and rises slightly to the rear.
- Roofline: a steep, fast windshield rises to a peak about 1.12 m high, a little ahead of mid-car. A long straight
  fastback then slopes down. The dark glass continues over the roof and down the fastback almost to the rear
  deck, so the whole top of the car reads as one bronze glass canopy framed by thin white rails.
- Rear haunch: a broad, flat white shoulder surface over the rear wheel. The car is clearly widest here, with
  strong tumblehome between the haunch and the narrow glass canopy. A sharp crease runs along the shoulder.
- Wheel arches are round, tight to the tyres, and have sharp lips. The rear arch's front-lower part blends into
  the black sill.

**Rear (dominant in the photo).**
- The rear deck ends in a slight ducktail lip. Directly beneath it, a **full-width thin red LED light bar** runs about
  1.8 m wide and 25–35 mm tall, glowing and wrapping slightly around both corners. It sits in a thin black band.
- Below that is a white body-colour band about 0.12–0.15 m tall. A white plate sits centred at its lower edge,
  about 0.30 × 0.15 m, with the text "RDSTR" and no real registration.
- The lower ~40 % of the rear is a **big gloss/satin-black rear fascia** that wraps around both corners into the
  black side sills. A recessed horizontal channel in it holds **four round thrusters in a row**, centred and
  evenly spaced about 0.15 m apart. Each has a polished chrome/silver ring of about 70–80 mm outer diameter, a
  dark nozzle throat and a faint warm copper inner glow. A smaller dark round port sits outboard of each end.
- Below the thrusters: a dark carbon diffuser with 4–6 vertical strakes. At each corner a large black vertical fin
  or leg comes down almost to the ground, making the rear fascia read as a black "U" frame.
- A small red angled reflector or marker sits on each rear-quarter side, below light-bar level.

**Wheels (very distinctive).** Large aero wheels: 20 in at the front, 21 in at the rear. The rim face is a flat
white (body-colour) aero disc with **six straight radial spokes**. Each spoke is a hollow frame: a bright titanium
outline, a dark interior and a bronze inner vane, so from a distance it reads as a dark blade with bright edges.
The white disc shows between the spokes. Thin black low-profile tyres, rear wider than front. Dark brake disc and
caliper are barely visible behind the spokes. The centre hub is dark titanium with a plain cap.

**Front (not visible in the photo; infer the same language, consistent with the original game car).** Sharp wedge
nose, with the leading edge about 0.41–0.46 m high. A thin white LED light bar runs across the nose under the hood's
leading edge. It is hood-width (about 1.35 m) and ends at body-coloured corner blocks. Small triangular headlight
slits sit at the inboard base of each fender facet (see `SPEC-2026.md`). Low hood between slightly raised front fender peaks; the
hood has faceted V-creases leading to the windshield base. Black lower fascia, intake and splitter mirror the
black rear frame. No grille.

Supplementary references live in the session scratchpad `ref/` folder: 2017–2020 roadster photos for general
proportions only, the original game car contact sheet, and a teaser of four thrusters firing from the rear.

## Dimensions (model frame, metres)

**`SPEC-2026.md` is authoritative** for every number: stations, heights, plan widths, front and rear details.
It was measured from the reveal coverage and scaled to 4.30 m. Key values:

| | |
|---|---|
| Length | **4.30 exactly** (bumper to bumper) |
| Width | 1.92 body (widest at the rear haunch); tyres flush with the haunches |
| Height | 1.14 roof peak |
| Wheelbase | **2.79**; front axle z = +1.34, rear axle z = −1.45 |
| Front tyre | 295/30 R20: outer Ø 0.676, width 0.29, hub height 0.338 |
| Rear tyre | 335/30 R21: outer Ø 0.724, width 0.33, hub height 0.362 |
| Track (hub x) | ±0.80 front, ±0.795 rear |
| Ground clearance | 0.11; tyre bottoms touch y = 0 |
| Wheel nodes | also set `userData.radius` (tyre radius in m) on each wheel node; the game spins wheels by travel/radius |

## Contract (the game loads the exported GLB through `GameRenderer.loadCar`)

- Module exports `buildRoadster(options?: { paint?: string }): THREE.Group | Promise<THREE.Group>`. It
  is deterministic (no `Math.random`) and browser-safe, and runs offline at export time, so a build of a few
  seconds is fine. Root group name `Roadster`.
- Frame: nose toward **+Z**, the car's left side toward **+X**, Y up, tyres touching y = 0, centred on x = 0, z from
  −2.15 to +2.15. The game rotates the model by π and normalises the length to 4.3 m.
- Wheels: four `Object3D` nodes named exactly **`WheelFrontL`, `WheelFrontR`, `WheelRearL`, `WheelRearR`**. L is
  +X. Each sits at its hub centre and contains only rotating parts (tyre, rim, cap, disc), spinning about local X.
  Calipers are static siblings outside the wheel nodes.
- Thrusters: four empty `Object3D` nodes `ThrusterMount0`…`ThrusterMount3`, ordered left to right as seen from
  behind. Each sits at a nozzle exit centre with no rotation; exhaust goes toward −Z.
- Materials: exactly one material matching `/paint|body.*color|carpaint/i`, named **`CarPaint`**, because the game
  recolours it. No other material or mesh name may contain "paint" or "license". Emissive red lights use material
  **`BrakeLight`**; the front light bar uses `Headlight`. Other names should be descriptive: `Glass`, `GlossBlack`,
  `Carbon`, `Chrome`, `ThrusterNozzle`, `Tire`, `WheelFace`, `WheelSpoke`, `BrakeDisc`, `Caliper`, `Interior`,
  `Seat`, `Plate`.
- Budget: ≤ 180k triangles, ≤ 140k vertices, ≤ 40 meshes (merge static geometry per material with
  `BufferGeometryUtils.mergeGeometries`), and an exported GLB of about 5 MB or less. Normals are required. Include
  UVs only where a texture is used; textures are small `CanvasTexture`s (≤ 512 px).
- Code must pass `npx tsc -p tools/roadster/tsconfig.json` (strict).

## Tooling

```bash
node tools/roadster/render.mjs --model tools/roadster/model/index.ts --out artifacts/roadster/renders --shots grid,detail
node tools/roadster/render.mjs --glb public/assets/reference/models/roadster_user.glb --out artifacts/roadster/renders --prefix original
node tools/roadster/render.mjs --model tools/roadster/model/index.ts --out artifacts/roadster/renders --export public/assets/models/roadster.glb
```

Single views can be passed to `--shots` as well: `hero`, `front34`, `rear34`, `side`, `front`, `rear`, `top`,
`chase`, `garage`, `wheel`, `nose`, `tail`, `cockpit`, `low`, `under`. The script prints mesh, triangle and
contract stats as JSON and writes PNGs that can be opened directly.

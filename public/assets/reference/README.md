# Original Roadster Rush public assets

Copied from https://roadster-rush.ai.studio/ at the user's request on 2026-10-25.

`asset-manifest.json` lists every downloaded game media asset, its source URL, size, and SHA-256 hash. No application JavaScript, CSS, or HTML was copied into this folder. The two GLBs were extracted byte-for-byte from embedded base64 asset literals in the publicly served JavaScript bundle; their standalone URLs return HTTP 404. GLB image textures remain embedded in the original binaries.

## Included

- Original player Roadster, including its three embedded JPEG material maps.
- Nine original traffic vehicle meshes: sedan, hatch, suv, taxi, van, pickup, boxtruck, bus, carrier.
- Four billboard JPEGs.
- Three music tracks and fourteen voice clips, plus the original audio manifest.
- Inter Latin variable WOFF2 font.
- Three favicons and one Apple touch icon.

The original source has no external HDR environment or decoder payload; its environment, roads, particles, and sound effects are generated at runtime. Runtime generated content is part of the application implementation, so it is not represented here as a downloaded file.

## Attribution and license information

The GLBs contain `asset.generator: Khronos glTF Blender I/O v5.0.21` and `asset.version: 2.0`, with no embedded copyright or license fields. The original car's names reference Tripo, but that name alone does not establish authorship or license. No blanket media license was found in the inspected HTML, JavaScript, CSS, or audio manifest. These assets are retained as provided, without assigning them a new license.

The font contains `Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)` and points to `https://openfontlicense.org`. Its exact embedded name metadata is in `font-metadata.json`; the original project's SIL Open Font License text is included as `Inter-OFL-LICENSE.txt`, sourced from https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt.

## Model use

Player file: `models/roadster_user.glb` (2,260,188 bytes, 58,378 triangles).
The player is one textured mesh with no separate wheels. It is Y-up with ground at Y=0, size X=2.232221, Y=1.266035, Z=4.297110. Rotate the loaded scene by PI around Y for a game traveling toward -Z, matching the original asset orientation adjustment.

Traffic file: `models/traffic.glb` (664,848 bytes). Select one vehicle by its node name rather than adding all nine overlapping vehicles. Traffic is Y-up, grounded at Y=0, and points toward -Z already. Materials are Paint, Trim, Glass, Headlight, Brake, Tire, Rim, Sign, Cargo. Clone the Paint material before changing an individual vehicle's color.

The original `audio/manifest.json` is unchanged. Its `base` is `assets/audio/`; when loading it from this project's location, map that to `/assets/reference/audio/`.

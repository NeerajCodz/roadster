// Cab-forward cabin under the bronze canopy: floor and footwell, front wheel-well covers, a long low
// dashboard under the deep windshield with a centre screen and titanium accents, a yoke on its column, a
// centre console, inner door trims with a sill shelf under the beltline, two ultra-white bucket seats with
// grey bolsters, a bulkhead behind the seats and a parcel shelf under the rear glass.
//
// Door trims, the bulkhead and the parcel shelf are found by casting rays against the inside of the shell,
// so they follow the body wherever it changes; index.ts then checks every cabin vertex for clearance.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { beltlineY } from './body.ts';
import type { Parts } from './parts.ts';
import { type BodySurface, flat } from './surface.ts';

type P3 = [number, number, number];
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const FLOOR_Y = 0.16;
/** Bulkhead station just behind the seat backs, under the white cross bar. */
const BULKHEAD_Z = -0.64;
/** Front of the cabin floor (toe board) and the rear face of the front wheel-well covers. */
const TOE_Z = 1.42;
const WELL_Z = 0.95;
const SEAT_X = 0.37;

/** Flat-shaded triangles from a list of quads / triangles given as point loops. */
function polygons(loops: THREE.Vector3[][]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const loop of loops) {
    for (let i = 1; i + 1 < loop.length; i++) for (const p of [loop[0], loop[i], loop[i + 1]]) pos.push(p.x, p.y, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Quad grid through rows of points (rows[i][k]); the cabin materials are double-sided. */
function grid(rows: THREE.Vector3[][]): THREE.BufferGeometry {
  const loops: THREE.Vector3[][] = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    for (let k = 0; k + 1 < rows[i].length; k++) loops.push([rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]]);
  }
  return polygons(loops);
}

function box(w: number, h: number, d: number, r: number, at: P3, rotX = 0, segments = 2): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, segments, r);
  g.deleteAttribute('uv');
  g.rotateX(rotX);
  g.translate(at[0], at[1], at[2]);
  return flat(g);
}

/** Prism along x from a (z, y) profile, with a small bevel; closed at both ends. */
function prismX(profile: [number, number][], halfWidth: number, bevel = 0.01): THREE.BufferGeometry {
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: halfWidth * 2 - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
  g.deleteAttribute('uv');
  g.rotateY(-Math.PI / 2); // shape x -> world z, extrusion -> world -x
  g.translate(halfWidth - bevel, 0, 0);
  return flat(g);
}

/** Inner door trims: an offset copy of the inside of the door / sill, topped by a shelf under the glass. */
function doorTrims(shell: BodySurface): THREE.BufferGeometry[] {
  const inset = 0.045;
  const zs = Array.from({ length: 15 }, (_, i) => WELL_Z - 0.005 - (i * (WELL_Z - 0.005 - BULKHEAD_Z - 0.02)) / 14);
  const rows: THREE.Vector3[][] = [];
  const shelfOuter: THREE.Vector3[] = [];
  for (let r = 0; r <= 6; r++) {
    const row: THREE.Vector3[] = [];
    for (const z of zs) {
      const top = beltlineY(z) - 0.035;
      const y = FLOOR_Y + 0.01 + ((top - FLOOR_Y - 0.01) * r) / 6;
      const hit = shell.cast(v(0.3, y, z), v(1, 0, 0));
      const x = hit ? hit.point.x - inset : 0.85;
      row.push(v(x, y, z));
      if (r === 6) shelfOuter.push(v((hit ? hit.point.x : 0.9) - 0.008, y, z));
    }
    rows.push(row);
  }
  const trim = grid(rows);
  const shelf = grid([rows[6], shelfOuter]);
  return [trim, shelf];
}

/** Section of the shell's inside at station z: rays fanned from a point in the cabin, inset by `inset`. */
function sectionOutline(shell: BodySurface, z: number, inset: number): THREE.Vector2[] {
  const centre = v(0, 0.55, z);
  const half: THREE.Vector2[] = [new THREE.Vector2(0, FLOOR_Y)];
  for (let i = 0; i <= 24; i++) {
    const a = -1.2 + (i / 24) * (1.2 + Math.PI / 2); // from down-outboard, through outboard, to straight up
    const dir = v(Math.cos(a), Math.sin(a), 0);
    const hit = shell.cast(centre, dir);
    if (!hit) continue;
    const p = hit.point.clone().addScaledVector(dir, -inset);
    if (p.y < FLOOR_Y) {
      // Below the floor: slide along the ray back up to floor level.
      const t = (FLOOR_Y - centre.y) / dir.y;
      p.copy(centre).addScaledVector(dir, Math.min(t, hit.distance - inset));
      p.y = Math.max(p.y, FLOOR_Y);
    }
    half.push(new THREE.Vector2(Math.max(0, p.x), p.y));
  }
  half[half.length - 1].x = 0;
  return half;
}

/** Vertical panel behind the seats following the inside of the body section. */
function bulkhead(shell: BodySurface): THREE.BufferGeometry {
  const half = sectionOutline(shell, BULKHEAD_Z, 0.04);
  const full = [...half, ...half.slice(1, -1).reverse().map((p) => new THREE.Vector2(-p.x, p.y))];
  const tris = THREE.ShapeUtils.triangulateShape(full, []);
  return polygons(tris.map((t) => t.map((k) => v(full[k].x, full[k].y, BULKHEAD_Z))));
}

/** Parcel shelf under the rear glass and sails: an offset of the shell's underside, 5 cm down. */
function parcelShelf(shell: BodySurface): THREE.BufferGeometry {
  const rows: THREE.Vector3[][] = [];
  for (let i = 0; i <= 10; i++) {
    const z = BULKHEAD_Z - 0.01 - (i * (1.8 + BULKHEAD_Z - 0.01)) / 10;
    const half = 0.6 - (0.18 * i) / 10;
    const row: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const x = -half + (2 * half * k) / 8;
      const hit = shell.cast(v(x, 0.8, z), v(0, 1, 0));
      row.push(v(x, hit ? hit.point.y - 0.05 : 0.84, z));
    }
    rows.push(row);
  }
  return grid(rows);
}

function seat(x: number, seats: THREE.BufferGeometry[], bolsters: THREE.BufferGeometry[]) {
  // Cushion and reclined backrest with an integrated headrest, grey side bolsters on both.
  seats.push(box(0.42, 0.1, 0.48, 0.04, [x, 0.26, -0.13], -0.08));
  seats.push(box(0.4, 0.62, 0.09, 0.04, [x, 0.55, -0.43], -0.36));
  seats.push(box(0.26, 0.15, 0.08, 0.035, [x, 0.9, -0.565], -0.36));
  for (const s of [-1, 1]) {
    bolsters.push(box(0.065, 0.13, 0.44, 0.03, [x + s * 0.215, 0.3, -0.13], -0.08));
    bolsters.push(box(0.065, 0.5, 0.13, 0.03, [x + s * 0.205, 0.53, -0.42], -0.36));
  }
}

function yoke(): THREE.BufferGeometry[] {
  const shape = new THREE.Shape();
  shape.moveTo(-0.17, -0.02); shape.lineTo(-0.17, 0.07); shape.quadraticCurveTo(-0.17, 0.1, -0.14, 0.1); shape.lineTo(-0.1, 0.1);
  shape.lineTo(-0.1, 0.07); shape.lineTo(-0.14, 0.07); shape.lineTo(-0.14, 0.0); shape.quadraticCurveTo(-0.1, -0.06, 0, -0.07);
  shape.quadraticCurveTo(0.1, -0.06, 0.14, 0.0); shape.lineTo(0.14, 0.07); shape.lineTo(0.1, 0.07); shape.lineTo(0.1, 0.1);
  shape.lineTo(0.14, 0.1); shape.quadraticCurveTo(0.17, 0.1, 0.17, 0.07); shape.lineTo(0.17, -0.02); shape.quadraticCurveTo(0.12, -0.1, 0, -0.105);
  shape.quadraticCurveTo(-0.12, -0.1, -0.17, -0.02);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 6 });
  g.deleteAttribute('uv');
  g.rotateX(-0.42);
  g.translate(SEAT_X, 0.7, 0.5);
  const column = new THREE.CylinderGeometry(0.03, 0.04, 0.22, 12);
  column.deleteAttribute('uv');
  column.rotateX(Math.PI / 2 - 0.42);
  column.translate(SEAT_X, 0.73, 0.62);
  return [flat(g), flat(column)];
}

/** Builds the cabin into `parts` and returns every cabin geometry for the clearance check. */
export function buildInterior(parts: Parts, shell: BodySurface): THREE.BufferGeometry[] {
  const interior: THREE.BufferGeometry[] = [];
  const seats: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  const screen: THREE.BufferGeometry[] = [];

  // ---- Tub: floor, footwell between the front wells, toe board, well covers -------------------
  interior.push(polygons([[v(-0.84, FLOOR_Y, BULKHEAD_Z), v(0.84, FLOOR_Y, BULKHEAD_Z), v(0.84, FLOOR_Y, WELL_Z), v(-0.84, FLOOR_Y, WELL_Z)]]));
  interior.push(polygons([[v(-0.57, FLOOR_Y, WELL_Z), v(0.57, FLOOR_Y, WELL_Z), v(0.57, 0.18, TOE_Z), v(-0.57, 0.18, TOE_Z)]]));
  interior.push(polygons([[v(-0.57, 0.18, TOE_Z), v(0.57, 0.18, TOE_Z), v(0.56, 0.64, TOE_Z + 0.015), v(-0.56, 0.64, TOE_Z + 0.015)]]));
  for (const s of [-1, 1]) {
    // Over the front wheel tunnels: top, inner wall and rear face (the tunnels themselves are bodywork).
    const [xi, xo, top] = [s * 0.585, s * 0.84, 0.68];
    interior.push(polygons([
      [v(xi, top, WELL_Z), v(xo, top, WELL_Z), v(xo, top, TOE_Z), v(xi, top, TOE_Z)],
      [v(xi, FLOOR_Y, WELL_Z), v(xi, top, WELL_Z), v(xi, top, TOE_Z), v(xi, 0.18, TOE_Z)],
      [v(xi, FLOOR_Y, WELL_Z), v(xo, FLOOR_Y, WELL_Z), v(xo, top, WELL_Z), v(xi, top, WELL_Z)],
    ]));
  }

  // ---- Door trims, bulkhead, parcel shelf (shaped by the shell) --------------------------------
  const [doorTrim, sillShelf] = doorTrims(shell);
  for (const g of [doorTrim, sillShelf]) interior.push(g, mirror(g));
  interior.push(bulkhead(shell));
  interior.push(parcelShelf(shell));

  // ---- Dashboard ---------------------------------------------------------------------------
  // A long low wedge between the well covers, kept well under the windshield.
  interior.push(prismX([[1.42, 0.63], [1.0, 0.7], [0.76, 0.72], [0.68, 0.7], [0.64, 0.6], [0.7, 0.46], [1.0, 0.38], [1.42, 0.38]], 0.57));
  // Titanium accent strip along the dash face.
  trim.push(box(1.1, 0.008, 0.01, 0.003, [0, 0.66, 0.655]));
  // Centre screen standing on the dash, tilted back under the glass, in a thin titanium bezel.
  const tilt = -0.45;
  screen.push(box(0.34, 0.19, 0.014, 0.006, [0, 0.8, 0.7], tilt));
  trim.push(box(0.35, 0.2, 0.008, 0.004, [0, 0.8 - 0.004 * Math.sin(-tilt), 0.7 + 0.008], tilt));
  // Yoke and column in front of the driver (car's left, +x).
  trim.push(...yoke());

  // ---- Centre console --------------------------------------------------------------------------
  interior.push(box(0.22, 0.25, 1.2, 0.04, [0, FLOOR_Y + 0.125, 0.12]));
  trim.push(box(0.02, 0.006, 0.9, 0.002, [0, FLOOR_Y + 0.252, 0.12]));

  // ---- Seats -------------------------------------------------------------------------------
  const bolsters: THREE.BufferGeometry[] = [];
  seat(SEAT_X, seats, bolsters);
  seat(-SEAT_X, seats, bolsters);
  interior.push(...bolsters);

  parts.interior.push(...interior);
  parts.seat.push(...seats);
  parts.trim.push(...trim);
  parts.black.push(...screen);
  return [...interior, ...seats, ...trim, ...screen];
}

/** Mirror across x = 0 (the cabin materials are double-sided, so the winding does not matter). */
function mirror(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone();
  m.scale(-1, 1, 1);
  m.computeVertexNormals();
  return m;
}

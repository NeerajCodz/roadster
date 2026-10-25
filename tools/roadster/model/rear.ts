// Rear end details (SPEC-2026 "Rear"): full-width red light bar recessed under the deck lip with a
// thinner second line below, recessed "RDSTR" plate with a camera above, and the exposed diffuser box
// (1.23 m wide, chamfered upper corners): a gloss-black frame with chamfered edges around a satin carbon back
// panel. Its upper row holds the four thrusters (0.08 m OD on 0.245 m centres): polished barrels with a dark
// bronze throat and a faint warm glow at the bottom of the bore. Below are four fan bays split by vertical fins,
// each with a suction-fan outlet (swept carbon blades, dark titanium cone hub). Red slivers mark the lower corners
// and the stowed rear wing shows as a flush bronze-titanium outline in the deck.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lathe } from './lathe.ts';
import type { Parts } from './parts.ts';
import { BodySurface, type SurfaceHit, flat, surfaceStrip } from './surface.ts';

/** Thruster nozzle centres, left to right as seen from behind (+x is the car's left). */
export const THRUSTER_X = [0.3675, 0.1225, -0.1225, -0.3675];
export const THRUSTER_Y = 0.432;
/** Outer radius of the polished thruster barrel; its base flange adds 4 mm, for the spec's 0.08 m outer diameter. */
const RING_R = 0.036;
/** Radius of the panel openings behind the thruster barrels (hidden under the barrel flanges). */
const BARREL_HOLE = 0.034;
/** Diffuser box: rear view outline and depth range. */
const BOX = { halfWidth: 0.615, bottom: 0.12, top: 0.5, chamfer: 0.07, front: -2.094, back: -2.147, panel: -2.119, wall: 0.022 };
/** Chamfer on the box frame's edges: a thin facet that catches a highlight line on the gloss black. */
const BOX_BEVEL = 0.007;
const DIVIDER_Y = 0.362;
const FAN_X = [0.4425, 0.1475, -0.1475, -0.4425];
const FAN_Y = 0.252;
const FAN_R = 0.084;

/** Lathe around +Y turned so +Y points toward -Z: profile (r, h) with h measured backward from z0. */
function revolveBack(profile: [number, number][], segments: number, x: number, y: number, z0: number): THREE.BufferGeometry {
  const g = lathe(profile, segments);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z0);
  return g;
}

/** Box outline in the rear view (x, y), counter-clockwise when seen from behind is not required. */
function boxShape(inset: number): THREE.Shape {
  const w = BOX.halfWidth - inset, b = BOX.bottom + inset, t = BOX.top - inset, c = BOX.chamfer - inset * 0.4;
  const s = new THREE.Shape();
  s.moveTo(-w, b); s.lineTo(w, b); s.lineTo(w, t - c); s.lineTo(w - c, t); s.lineTo(-w + c, t); s.lineTo(-w, t - c); s.closePath();
  return s;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  return flat(g);
}

/** Fan blades run from just outside the cone hub's collar to the duct wall. */
const BLADE_ROOT = 0.036;
const HUB_R = 0.03;

/**
 * One swept, pitched fan blade (both faces) in a fan outlet centred at (x, y) on the panel. It sweeps 18 degrees
 * from root to tip, and its chord twists 22 degrees while running from 13 mm to 5 mm behind the panel, so the
 * whole blade stays inside the shroud lip (16 mm). Its root clears the hub, so no blade crosses the hub's outline.
 * Each face is an indexed strip with smooth normals, so the twist shades as one surface instead of flashing
 * triangle by triangle.
 */
function fanBlade(x: number, y: number, panelZ: number, a0: number): THREE.BufferGeometry {
  const steps = 7;
  const pos: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const v = i / steps, r = BLADE_ROOT + (FAN_R - 0.007 - BLADE_ROOT) * v;
    for (const u of [0, 1]) {
      const phi = a0 + ((22 * u + 18 * v) * Math.PI) / 180;
      pos.push(x + r * Math.cos(phi), y + r * Math.sin(phi), panelZ - 0.013 + 0.008 * u);
    }
  }
  const front: number[] = [], back: number[] = [];
  for (let i = 0; i < steps; i++) {
    const [p, q, r, t] = [2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2];
    front.push(p, q, r, p, r, t);
    back.push(p, r, q, p, t, r);
  }
  const face = (index: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  };
  return mergeGeometries([face(front), face(back)])!;
}

/** Projects a horizontal strip around the tail at height y, limited to |x| <= halfWidth. */
export function tailStrip(surface: BodySurface, y: number, halfWidth: number, halfHeight: number, lift: number): THREE.BufferGeometry {
  const hits: SurfaceHit[] = [];
  for (let i = 0; i <= 160; i++) {
    const x = -halfWidth + (2 * halfWidth * i) / 160;
    const hit = surface.project(new THREE.Vector3(x, y, -1.9), new THREE.Vector3(0, 0, -1));
    if (hit) hits.push(hit);
  }
  return surfaceStrip(hits, halfHeight, lift);
}

/**
 * Light bar around the tail at height y: across the rear face and wrapping onto both corner faces up to z = minZ.
 * Over its last `taper` metres each end narrows to `floor` of its height, a short blunt blade.
 */
function wrapStrip(surface: BodySurface, y: number, minZ: number, halfHeight: number, lift: number, taper = 0.05, floor = 0.45): THREE.BufferGeometry {
  const origin = new THREE.Vector3(0, y, -1.7);
  const cast = (phi: number) => surface.project(origin, new THREE.Vector3(Math.sin(phi), 0, -Math.cos(phi))); // phi from -z toward +x
  const hits: SurfaceHit[] = [];
  // Adaptive sampling: bisect the ray angle wherever consecutive hits are far apart (around the
  // rounded corners), so the strip never cuts a chord through the body.
  const refine = (p0: number, h0: SurfaceHit, p1: number, h1: SurfaceHit, depth: number) => {
    if (depth > 8 || h0.point.distanceTo(h1.point) < 0.006) return;
    const pm = (p0 + p1) / 2, hm = cast(pm);
    if (!hm) return;
    refine(p0, h0, pm, hm, depth + 1);
    hits.push(hm);
    refine(pm, hm, p1, h1, depth + 1);
  };
  let prev: [number, SurfaceHit] | null = null;
  for (let i = 0; i <= 260; i++) {
    const phi = -1.3 + (2.6 * i) / 260;
    const hit = cast(phi);
    if (!hit) continue;
    if (prev) refine(prev[0], prev[1], phi, hit, 0);
    hits.push(hit);
    prev = [phi, hit];
  }
  const kept = hits.filter((h) => h.point.z < minZ);
  const even: SurfaceHit[] = [];
  for (const h of kept) if (!even.length || even[even.length - 1].point.distanceTo(h.point) >= 0.008) even.push(h);
  const along = [0];
  for (let i = 1; i < even.length; i++) along.push(along[i - 1] + even[i].point.distanceTo(even[i - 1].point));
  const total = along[along.length - 1];
  const width = (i: number) => {
    const t = Math.min(1, Math.min(along[i], total - along[i]) / taper);
    return halfHeight * (floor + (1 - floor) * t * t * (3 - 2 * t));
  };
  return surfaceStrip(even, width, lift);
}

export interface RearBuild {
  plate: THREE.Mesh;
  mounts: THREE.Object3D[];
}

export function buildRear(surface: BodySurface, parts: Parts, plateMaterial: THREE.Material): RearBuild {
  const mounts: THREE.Object3D[] = [];

  // ---- Light bars --------------------------------------------------------------------------
  // The main bar wraps about 4 cm past the corner crease onto each corner face and ends there as a short blunt
  // blade. The body's black band behind it stops at the crease, so a black blade 1.5 times the bar's height
  // carries it around the corner and ends 1 cm past the red tip.
  parts.brake.push(wrapStrip(surface, 0.844, -2.1, 0.0145, 0.0025));
  parts.black.push(wrapStrip(surface, 0.844, -2.09, 0.022, 0.001));
  // Thinner second line, centred in the black band between its lower edge (0.816) and the main bar. It overlaps
  // the black blade, so it stands 1.5 mm above it (no depth fighting at chase distances).
  parts.brake.push(tailStrip(surface, 0.8235, 0.8, 0.0025, 0.0025));

  // ---- Diffuser box ------------------------------------------------------------------------
  // Gloss-black frame whose outer and inner edges are chamfered (flat-shaded), so its perimeter and the thruster
  // row's upper lip trace thin highlight lines; the bevel stays inside the frame's outline.
  const frameShape = boxShape(0);
  frameShape.holes.push(boxShape(BOX.wall));
  const frame = new THREE.ExtrudeGeometry(frameShape, {
    depth: BOX.front - BOX.back - 2 * BOX_BEVEL, bevelEnabled: true, bevelThickness: BOX_BEVEL, bevelSize: BOX_BEVEL,
    bevelOffset: -BOX_BEVEL, bevelSegments: 1,
  });
  frame.deleteAttribute('uv');
  frame.translate(0, 0, BOX.back + BOX_BEVEL);
  parts.black.push(flat(frame));
  // Recessed satin carbon back panel inside the frame, open behind the thruster barrels so their throats run deep.
  const panelShape = boxShape(BOX.wall - 0.002);
  for (const x of THRUSTER_X) panelShape.holes.push(new THREE.Path().absarc(x, THRUSTER_Y, BARREL_HOLE, 0, Math.PI * 2, true));
  const panel = new THREE.ShapeGeometry(panelShape, 12);
  panel.deleteAttribute('uv');
  panel.rotateY(Math.PI); // face -z
  panel.translate(0, 0, BOX.panel);
  parts.carbon.push(flat(panel));
  // Horizontal divider between the thruster row and the fan bays; vertical fins between the bays.
  const inner = BOX.halfWidth - BOX.wall;
  const depth = BOX.panel - BOX.back;
  parts.carbon.push(box(inner * 2, 0.016, depth, 0, DIVIDER_Y, (BOX.panel + BOX.back) / 2));
  for (const x of [-0.295, 0, 0.295]) {
    parts.carbon.push(box(0.014, DIVIDER_Y - BOX.bottom - BOX.wall, depth, x, (DIVIDER_Y + BOX.bottom + BOX.wall) / 2, (BOX.panel + BOX.back) / 2));
  }

  // ---- Thrusters ---------------------------------------------------------------------------
  // Profiles are (radius, distance behind the panel). A polished barrel stands 27 mm proud of the panel
  // with a rolled lip; its bore stays chrome for 15 mm, then a dark bronze throat converges through the panel
  // opening to a small, faintly glowing core at the bottom, 34 mm inside the exit. The body's rear cap sits only
  // 10 mm in front of the panel, so nothing may reach deeper than that (it would be hidden inside the body).
  const barrel: [number, number][] = [
    [RING_R + 0.004, 0], [RING_R + 0.001, 0.004], [RING_R, 0.021], [RING_R - 0.002, 0.0255], [RING_R - 0.006, 0.027],
    [RING_R - 0.009, 0.0245], [RING_R - 0.01, 0.012],
  ];
  const throat: [number, number][] = [[RING_R - 0.01, 0.012], [0.022, 0.004], [0.018, -0.003], [0.015, -0.0065], [0.01, -0.0068]];
  const glow: [number, number][] = [[0.01, -0.0068], [0.005, -0.0069], [0, -0.007]];
  for (const x of THRUSTER_X) {
    parts.chrome.push(revolveBack(barrel, 48, x, THRUSTER_Y, BOX.panel));
    parts.nozzle.push(revolveBack(throat, 40, x, THRUSTER_Y, BOX.panel));
    parts.glow.push(revolveBack(glow, 24, x, THRUSTER_Y, BOX.panel));
    const mount = new THREE.Object3D();
    mount.name = `ThrusterMount${mounts.length}`;
    mount.position.set(x, THRUSTER_Y, BOX.panel - 0.027);
    mounts.push(mount);
  }

  // Smaller dark round ports outboard of the thruster row.
  for (const x of [0.515, -0.515]) {
    parts.carbon.push(revolveBack([[0.03, 0], [0.03, 0.012], [0.026, 0.016], [0.021, 0.014], [0.021, 0.004]], 32, x, THRUSTER_Y, BOX.panel));
    parts.black.push(revolveBack([[0.021, 0.004], [0.008, 0.003], [0, 0.003]], 20, x, THRUSTER_Y, BOX.panel));
  }

  // ---- Fan outlets -------------------------------------------------------------------------
  for (const x of FAN_X) {
    // Shroud ring with a rolled lip, dark duct floor, six swept carbon blades and a dark titanium cone hub. The hub
    // is a short collar and a separate cone (a crisp edge between them) whose tip stays inside the shroud lip.
    parts.carbon.push(revolveBack([[FAN_R + 0.006, 0], [FAN_R + 0.004, 0.012], [FAN_R, 0.016], [FAN_R - 0.006, 0.014], [FAN_R - 0.006, 0.004]], 48, x, FAN_Y, BOX.panel));
    parts.black.push(revolveBack([[FAN_R - 0.006, 0.004], [HUB_R, 0.004]], 40, x, FAN_Y, BOX.panel));
    parts.titanium.push(revolveBack([[HUB_R, 0.002], [HUB_R, 0.006]], 32, x, FAN_Y, BOX.panel));
    parts.titanium.push(revolveBack([[HUB_R, 0.006], [0.006, 0.0145], [0, 0.015]], 32, x, FAN_Y, BOX.panel));
    for (let k = 0; k < 6; k++) parts.carbon.push(fanBlade(x, FAN_Y, BOX.panel, (k * Math.PI) / 3));
  }

  // ---- Diffuser floor below the box, with strakes in line with the fins ----------------------
  const floor = new THREE.BufferGeometry();
  const fx = 0.68; // as wide as the underbody tray, so no gap opens beside the box behind the rear wheel wells
  // Wound to face down (it is only seen from below); it starts on the underbody tray's rear edge.
  floor.setAttribute('position', new THREE.Float32BufferAttribute([
    -fx, BOX.bottom + 0.004, BOX.front, fx, BOX.bottom + 0.004, BOX.front, fx, 0.106, -1.72,
    -fx, BOX.bottom + 0.004, BOX.front, fx, 0.106, -1.72, -fx, 0.106, -1.72,
  ], 3));
  floor.computeVertexNormals();
  parts.carbon.push(floor);
  // The strakes start behind the box's bottom wall and run forward under the floor, so no strake end hangs
  // below the box's bottom edge in rear views.
  for (const x of [-0.59, -0.295, 0, 0.295, 0.59]) {
    const fin = new THREE.Shape();
    fin.moveTo(BOX.front - 0.004, BOX.bottom + 0.004); fin.lineTo(BOX.front - 0.004, BOX.bottom);
    fin.lineTo(-1.76, 0.096); fin.lineTo(-1.74, 0.106);
    const g = new THREE.ExtrudeGeometry(fin, { depth: 0.008, bevelEnabled: false });
    g.deleteAttribute('uv');
    g.rotateY(-Math.PI / 2); // shape (z, y) -> plane x = const
    g.translate(x + 0.004, 0, 0);
    parts.carbon.push(flat(g));
  }

  // ---- Lower-corner red slivers ------------------------------------------------------------
  for (const s of [1, -1]) {
    const hits: SurfaceHit[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = s * (0.7 + (0.13 * i) / 12);
      const hit = surface.project(new THREE.Vector3(x, 0.4 - 0.025 * (i / 12), -1.9), new THREE.Vector3(0, 0, -1));
      if (hit) hits.push(hit);
    }
    if (hits.length > 1) parts.brake.push(surfaceStrip(s > 0 ? hits : hits.reverse(), 0.0045, 0.0022));
  }

  // ---- Plate in a black recess frame at the white band's lower edge, camera above ------------
  const plate = buildPlate(surface, parts, plateMaterial);
  const camY = 0.797;
  const camHit = surface.project(new THREE.Vector3(0, camY, -1.9), new THREE.Vector3(0, 0, -1));
  if (camHit) {
    const z = camHit.point.z;
    parts.black.push(revolveBack([[0.016, -0.004], [0.016, 0.006], [0.0135, 0.009], [0.008, 0.0105], [0, 0.0105]], 24, 0, camY, z));
    parts.glass.push(revolveBack([[0.006, 0.0103], [0, 0.0118]], 16, 0, camY, z));
  }

  // ---- Stowed rear wing: flush bronze-titanium outline in the deck ---------------------------
  const outline: THREE.Vector3[] = [];
  const [zf, zr, hw, rr] = [-1.875, -2.085, 0.74, 0.035];
  const corners: [number, number, number][] = [[hw - rr, zr + rr, -Math.PI / 2], [hw - rr, zf - rr, 0], [-hw + rr, zf - rr, Math.PI / 2], [-hw + rr, zr + rr, Math.PI]];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (i / 4) * (Math.PI / 2);
      outline.push(new THREE.Vector3(cx + Math.cos(a) * rr, 1.2, cz + Math.sin(a) * rr));
    }
  }
  outline.push(outline[0].clone());
  const deckHits: SurfaceHit[] = [];
  for (let i = 0; i + 1 < outline.length; i++) {
    const a = outline[i], b = outline[i + 1];
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.03));
    for (let k = 0; k < n; k++) {
      const hit = surface.cast(a.clone().lerp(b, k / n), new THREE.Vector3(0, -1, 0));
      if (hit) deckHits.push(hit);
    }
  }
  if (deckHits.length) deckHits.push(deckHits[0]);
  // 9 mm wide, so the polished outline catches a highlight in the tail and chase views.
  parts.bronze.push(surfaceStrip(deckHits, 0.0045, 0.001, 0.004));

  return { plate, mounts };
}

/** Plate size and centre height (at the white band's lower edge). */
const PLATE = { y: 0.688, halfWidth: 0.15, halfHeight: 0.075 };

/**
 * The "RDSTR" plate, sitting in a black frame that follows the rear face. The face leans back and curves slightly
 * over the plate's height, so the frame is a strip laid onto the surface around the plate outline, and the flat
 * plate is tilted to the chord between its top and bottom edges. The frame stands up to 2 mm prouder than the
 * plate, so the plate reads as recessed with an even black border on every side.
 */
function buildPlate(surface: BodySurface, parts: Parts, material: THREE.Material): THREE.Mesh {
  const back = new THREE.Vector3(0, 0, -1);
  const at = (x: number, y: number) => surface.project(new THREE.Vector3(x, y, -1.9), back);
  // Frame: rounded rectangle 6 mm outside the plate edge, 12 mm wide.
  const { y, halfWidth: hw, halfHeight: hh } = PLATE;
  const gap = 0.006, r = 0.012;
  const [fx, fy] = [hw + gap, hh + gap];
  const loop: [number, number][] = [];
  const arc = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 4; i++) { const a = a0 + (i / 4) * (Math.PI / 2); loop.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  };
  arc(fx - r, y - fy + r, -Math.PI / 2);
  arc(fx - r, y + fy - r, 0);
  arc(-fx + r, y + fy - r, Math.PI / 2);
  arc(-fx + r, y - fy + r, Math.PI);
  loop.push(loop[0]);
  const hits: SurfaceHit[] = [];
  for (let i = 0; i + 1 < loop.length; i++) {
    const [ax, ay] = loop[i], [bx, by] = loop[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.02));
    for (let k = 0; k < n; k++) {
      const hit = at(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
      if (hit) hits.push(hit);
    }
  }
  hits.push(hits[0]);
  parts.black.push(surfaceStrip(hits, gap, 0.0045, 0.009));

  // Plate: 3 mm thick and tilted to the chord of the surface between its top and bottom edges, with its face 2.5 mm
  // proud of the surface along those edges (the surface curves slightly away behind the middle of the plate).
  const top = at(0, y + hh), bottom = at(0, y - hh);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, hh * 2, 0.003), material);
  mesh.name = 'Plate';
  if (!top || !bottom) {
    mesh.position.set(0, y, -2.116);
    mesh.rotation.set(0, Math.PI, 0);
    return mesh;
  }
  const up = top.point.clone().sub(bottom.point).normalize();
  const xAxis = new THREE.Vector3(-1, 0, 0); // text reads left to right when seen from behind
  const normal = new THREE.Vector3().crossVectors(xAxis, up); // outward, toward -z
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, up, normal));
  mesh.position.copy(top.point).add(bottom.point).multiplyScalar(0.5).addScaledVector(normal, 0.001);
  return mesh;
}


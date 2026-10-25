// Aero wheels: low-profile tyre, polished rim lip ring, flat white aero disc (WheelFace, recoloured by the
// game's rim paint) carrying six straight radial spokes. Each spoke is a hollow frame: a polished titanium
// outline, a dark recessed interior and a bronze inner vane. Dark titanium hub with a plain cap, brake disc behind.
//
// Built facing +x (left side) in a local frame whose X axis is the axle; right-side wheels get a child
// flipped by PI about Y so the wheel node itself keeps an identity rotation and spins about local X.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { lathe, latheWithCorners } from './lathe.ts';
import type { Materials } from './materials.ts';
import { flat } from './surface.ts';

export interface WheelSpec {
  name: 'WheelFrontL' | 'WheelFrontR' | 'WheelRearL' | 'WheelRearR';
  hub: THREE.Vector3;
  /** Tyre outer radius (= hub height). */
  radius: number;
  /** Tyre section width. */
  width: number;
  /** Rim (bead seat) radius. */
  rimRadius: number;
}

/**
 * Revolves a (radius, axial) profile about the X axis (indexed, seamless normals). Profile order sets the facing
 * side; `corners` lists the profile points that are hard corners.
 */
export function revolveX(profile: [number, number][], segments: number, corners: number[] = []): THREE.BufferGeometry {
  const geometry = corners.length ? latheWithCorners(profile, segments, corners) : lathe(profile, segments);
  geometry.rotateZ(-Math.PI / 2); // lathe axis Y -> X
  return geometry;
}

/** Merges parts into one indexed geometry; flat-shaded (non-indexed) parts are welded first. */
const weld = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map((g) => (g.index ? g : mergeVertices(g))))!;

const SPOKES = 6;
const HUB_R = 0.072;

/** Axial position of the flat aero disc face. */
const discX = (spec: WheelSpec) => spec.width / 2 - 0.024;

function tyre(spec: WheelSpec): THREE.BufferGeometry {
  const R = spec.radius, h = spec.width / 2, rim = spec.rimRadius;
  const side = R - rim;
  // Inner bead -> inner sidewall -> rounded shoulder -> tread with two shallow grooves -> outer side.
  // The sidewall turns into the shoulder over two points, so no profile corner is sharper than about 50 degrees
  // (the lathe's smooth normals would shade a sharper one wrongly).
  const half: [number, number][] = [
    [rim + 0.006, h - 0.016], [rim + side * 0.3, h - 0.004], [rim + side * 0.62, h], [rim + side * 0.8, h - 0.0008],
    [rim + side * 0.845, h - 0.006], [R - 0.014, h - 0.011], [R - 0.004, h - 0.026], [R, h - 0.046],
  ];
  // One half of the tread (outer side): a shallow circumferential groove with crisp edges.
  const tread: [number, number][] = [[R, 0.2 * h], [R - 0.006, 0.23 * h], [R - 0.006, 0.31 * h], [R, 0.34 * h]];
  const flip = (p: [number, number][]) => p.map(([r, x]) => [r, -x] as [number, number]).reverse();
  // Profile runs from the inner bead (-x) to the outer bead (+x) so the lathe faces outward.
  const outerHalf: [number, number][] = [...tread, ...half.slice().reverse()];
  const profile = [...flip(outerHalf), ...outerHalf];
  const n = outerHalf.length;
  // Groove edges are hard corners: indices of the tread points in the flipped and in the outer half.
  const corners = tread.flatMap((_, i) => [n - 1 - i, n + i]);
  return revolveX(profile, 72, corners);
}

/** White aero disc, its rolled lip into the tyre bead, the back of the disc and the rim barrel. */
function face(spec: WheelSpec): THREE.BufferGeometry {
  const rim = spec.rimRadius, h = spec.width / 2, x0 = discX(spec);
  // Lip -> flat disc -> hub opening, facing +x.
  const front = revolveX([
    [rim + 0.008, h - 0.018], [rim + 0.004, h - 0.011], [rim - 0.006, h - 0.012], [rim - 0.014, x0 + 0.002],
    [rim - 0.03, x0], [HUB_R + 0.04, x0], [HUB_R + 0.004, x0], [HUB_R, x0 - 0.004],
  ], 72);
  const back = revolveX([[HUB_R, -0.03], [rim + 0.004, -0.03]], 48);
  const barrel = revolveX([[rim + 0.006, h - 0.016], [rim + 0.002, -h + 0.016]], 48);
  return mergeGeometries([front, back, barrel])!;
}

/** Shape (radial along +y, tangential along x) extruded along +z, then mapped onto the wheel face. */
function spokePart(shape: THREE.Shape, depth: number, base: number, angle: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  g.deleteAttribute('uv');
  // Shape (sx, sy, depth) -> wheel (x = base + depth, y = sy, z = -sx), then spin about the axle.
  g.rotateY(Math.PI / 2);
  g.translate(base, 0, 0);
  g.rotateX(angle);
  return flat(g);
}

function trapezoid(r0: number, r1: number, w0: number, w1: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w0 / 2, r0); s.lineTo(w0 / 2, r0); s.lineTo(w1 / 2, r1); s.lineTo(-w1 / 2, r1); s.closePath();
  return s;
}

interface SpokeSet { frame: THREE.BufferGeometry; dark: THREE.BufferGeometry; vane: THREE.BufferGeometry }

/** Six hollow-frame spokes: titanium outline, dark recessed interior, bronze centre vane. */
function spokes(spec: WheelSpec): SpokeSet {
  const x0 = discX(spec);
  // The roots start well under the hub dome, so their corners never show past its rim.
  const r0 = HUB_R - 0.02, r1 = spec.rimRadius - 0.022;
  // Bold enough to read as dark blades at a distance; the titanium outline stays thin.
  const w0 = 0.078, w1 = 0.06, t = 0.0066;
  const frame: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [], vane: THREE.BufferGeometry[] = [];
  for (let k = 0; k < SPOKES; k++) {
    const angle = (k * Math.PI * 2) / SPOKES;
    const outline = trapezoid(r0, r1, w0, w1);
    const hole = new THREE.Path();
    hole.moveTo(-w0 / 2 + t, r0 + t); hole.lineTo(-w1 / 2 + t, r1 - t); hole.lineTo(w1 / 2 - t, r1 - t); hole.lineTo(w0 / 2 - t, r0 + t);
    hole.closePath();
    outline.holes.push(hole);
    frame.push(spokePart(outline, 0.011, x0 - 0.002, angle));
    dark.push(spokePart(trapezoid(r0 + t * 0.5, r1 - t * 0.5, w0 - t, w1 - t), 0.005, x0 - 0.001, angle));
    vane.push(spokePart(trapezoid(r0 + 0.03, r1 - 0.02, 0.0052, 0.004), 0.0075, x0 - 0.001, angle));
  }
  return { frame: mergeGeometries(frame)!, dark: mergeGeometries(dark)!, vane: mergeGeometries(vane)! };
}

/** Polished titanium ring on the rolled lip where the white disc meets the tyre bead. */
function lipRing(spec: WheelSpec): THREE.BufferGeometry {
  const rim = spec.rimRadius, h = spec.width / 2;
  return revolveX([
    [rim + 0.0075, h - 0.017], [rim + 0.0055, h - 0.0095], [rim - 0.001, h - 0.0082], [rim - 0.008, h - 0.0098], [rim - 0.0105, h - 0.0135],
  ], 64);
}

/** Dark titanium hub dome with a plain cap; a titanium ring defines the cap edge. */
function hub(spec: WheelSpec): { dark: THREE.BufferGeometry; ring: THREE.BufferGeometry } {
  const x0 = discX(spec);
  const dark = revolveX([[HUB_R + 0.002, x0 - 0.004], [HUB_R, x0 + 0.01], [0.06, x0 + 0.017], [0.044, x0 + 0.02], [0.043, x0 + 0.022], [0, x0 + 0.024]], 48);
  const ring = new THREE.TorusGeometry(0.0445, 0.0025, 6, 40);
  ring.rotateY(Math.PI / 2);
  ring.translate(x0 + 0.0205, 0, 0);
  ring.deleteAttribute('uv');
  return { dark, ring };
}

/** Brake disc: a closed box section, every profile corner hard. */
function brakeDisc(spec: WheelSpec): THREE.BufferGeometry {
  const r0 = 0.1, r1 = spec.rimRadius - 0.04;
  return revolveX([[r0, -0.06], [r1, -0.06], [r1, -0.035], [r0, -0.035], [r0, -0.06]], 40, [1, 2, 3]);
}

export interface WheelBuild {
  nodes: THREE.Object3D[];
  calipers: THREE.BufferGeometry;
}

export function buildWheels(specs: WheelSpec[], m: Materials): WheelBuild {
  const nodes: THREE.Object3D[] = [];
  const calipers: THREE.BufferGeometry[] = [];
  const cache = new Map<string, THREE.Mesh[]>();
  for (const spec of specs) {
    const key = `${spec.radius}/${spec.width}/${spec.rimRadius}`;
    let meshes = cache.get(key);
    if (!meshes) {
      const set = spokes(spec);
      const h = hub(spec);
      const parts: [string, THREE.BufferGeometry, THREE.Material][] = [
        ['Tyre', tyre(spec), m.tire],
        ['AeroDisc', face(spec), m.wheelFace],
        ['SpokeFrames', weld([set.frame, h.ring, lipRing(spec)]), m.spoke],
        ['SpokeInterior', weld([set.dark, h.dark, brakeDisc(spec)]), m.wheelDark],
        ['SpokeVanes', weld([set.vane]), m.vane],
      ];
      meshes = parts.map(([name, geometry, material]) => {
        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        return mesh;
      });
      cache.set(key, meshes);
    }
    const node = new THREE.Object3D();
    node.name = spec.name;
    node.position.copy(spec.hub);
    node.userData.radius = spec.radius; // read by the game's wheel spin (travel / radius)
    const right = spec.hub.x < 0;
    const holder = new THREE.Group();
    holder.name = `${spec.name}Parts`;
    if (right) holder.rotation.y = Math.PI;
    for (const mesh of meshes) holder.add(mesh.clone());
    node.add(holder);
    nodes.push(node);
    // Caliper: static, behind the disc at the rear-top (front) or front-top (rear), inboard of the face.
    const front = spec.hub.z > 0;
    const cal = new THREE.BoxGeometry(0.05, 0.085, 0.14, 1, 1, 2);
    const angle = front ? 2.3 : 0.85; // position around the disc (radians from +z toward +y)
    const rr = spec.rimRadius - 0.07;
    cal.rotateX(-(angle - Math.PI / 2));
    cal.translate(spec.hub.x + (right ? 0.048 : -0.048), spec.hub.y + Math.sin(angle) * rr, spec.hub.z + Math.cos(angle) * rr);
    cal.deleteAttribute('uv');
    calipers.push(flat(cal));
  }
  return { nodes, calipers: mergeGeometries(calipers)! };
}

// Front end details (SPEC-2026 "Front"): hood-width white light bar under the hood's leading edge,
// small triangular headlights (a dark pocket with a lit sliver) at the inboard base of each fender facet,
// the dark recessed opening holding a multi-element wing (horizontal slats) with a camera at its top centre,
// and the protruding carbon chin splitter whose ends sweep slightly forward.
import * as THREE from 'three';
import type { Parts } from './parts.ts';
import { BodySurface, type SurfaceHit, flat, surfacePolygon, surfaceStrip, withMirror } from './surface.ts';

/** Hood V-crease (inboard base of the fender facet) in plan, from the cage: 0.675 at the nose -> 0.5. */
const creaseX = (z: number) => 0.675 - 0.2626 * (2.15 - z);
const FORWARD = new THREE.Vector3(0, 0, 1);

/** Horizontal path across the nose face at height y, projected along +z. */
function nosePath(surface: BodySurface, y: number, halfWidth: number, samples: number, yAt?: (x: number) => number): SurfaceHit[] {
  const hits: SurfaceHit[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = -halfWidth + (2 * halfWidth * i) / samples;
    const hit = surface.project(new THREE.Vector3(x, yAt ? yAt(x) : y, 1.9), FORWARD);
    if (hit) hits.push(hit);
  }
  return hits;
}

/** Triangle shrunk toward its incentre so every edge moves inward by `d` (measured in the xz plan). */
function insetTriangle([a, b, c]: THREE.Vector3[], d: number): THREE.Vector3[] {
  const la = b.distanceTo(c), lb = c.distanceTo(a), lc = a.distanceTo(b);
  const incentre = a.clone().multiplyScalar(la).addScaledVector(b, lb).addScaledVector(c, lc).divideScalar(la + lb + lc);
  const area = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).length() / 2;
  const scale = 1 - d / ((2 * area) / (la + lb + lc));
  return [a, b, c].map((p) => incentre.clone().lerp(p, scale));
}

export function buildFront(surface: BodySurface, parts: Parts) {
  // ---- Light bar ---------------------------------------------------------------------------
  parts.head.push(surfaceStrip(nosePath(surface, 0.438, 0.655, 120), 0.0085, 0.0025));

  // ---- Triangular headlights ---------------------------------------------------------------
  // Each is a slim wedge on the fender facet pointing forward: a near-black (carbon) pop-down pocket of about
  // 0.19 x 0.075 m whose long inboard edge follows the hood crease, with the lit LED as a sliver (about 0.16 m long,
  // 35 mm at its widest) along the pocket's upper, outboard edge. The dark pocket below the light makes it read as
  // a lamp rather than a white triangle on white paint.
  const down = new THREE.Vector3(0, 1, 0);
  const z0 = 1.975, z1 = 1.795;
  const tip = new THREE.Vector3(creaseX(z0) - 0.002, 1.0, z0);
  const heel = new THREE.Vector3(creaseX(z1) - 0.004, 1.0, z1);
  const outer = new THREE.Vector3(creaseX(z1) + 0.074, 1.0, z1 + 0.012);
  parts.carbon.push(...withMirror(surfacePolygon(surface, [tip, heel, outer], down, 0.0012, 3)));
  const sliver = [tip.clone().lerp(outer, 0.06), outer.clone().lerp(heel, 0.52), outer];
  parts.head.push(...withMirror(surfacePolygon(surface, insetTriangle(sliver, 0.003), down, 0.0024, 3)));

  // ---- Recessed opening with the active wing slats -----------------------------------------
  const [ox, oy0, oy1] = [0.54, 0.178, 0.318];
  const loop: THREE.Vector3[] = [];
  const corner = 0.03;
  // Rounded-rectangle outline of the opening (lifted frame).
  const pts: [number, number][] = [];
  const arc = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 4; i++) { const a = a0 + (i / 4) * (Math.PI / 2); pts.push([cx + Math.cos(a) * corner, cy + Math.sin(a) * corner]); } };
  arc(ox - corner, oy0 + corner, -Math.PI / 2);
  arc(ox - corner, oy1 - corner, 0);
  arc(-ox + corner, oy1 - corner, Math.PI / 2);
  arc(-ox + corner, oy0 + corner, Math.PI);
  pts.push(pts[0]);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.03));
    for (let k = 0; k < n; k++) loop.push(new THREE.Vector3(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, 1.9));
  }
  const frameHits = loop.map((p) => surface.project(p, FORWARD)).filter((h): h is SurfaceHit => h !== null);
  frameHits.push(frameHits[0]);
  parts.carbon.push(surfaceStrip(frameHits, 0.006, 0.006, 0.01));
  // Dark recess floor inside the frame.
  const inner = pts.map(([x, y]) => new THREE.Vector3(x * 0.995, oy0 + (y - oy0) * 0.99 + 0.0007, 1.9));
  parts.carbon.push(surfacePolygon(surface, inner, FORWARD, 0.0015, 2));
  // Five thin horizontal slats, each a small angled blade standing proud of the recess floor.
  for (let k = 0; k < 5; k++) {
    const y = oy0 + 0.022 + k * ((oy1 - oy0 - 0.044) / 4);
    const path = nosePath(surface, y, ox - 0.012, 40);
    parts.black.push(surfaceStrip(path, 0.0055, 0.0075, 0.009));
  }
  // Camera at the top centre of the opening.
  const cam = surface.project(new THREE.Vector3(0, oy1 + 0.018, 1.9), FORWARD);
  if (cam) {
    const pod = new THREE.CylinderGeometry(0.018, 0.02, 0.012, 20);
    pod.deleteAttribute('uv');
    pod.rotateX(Math.PI / 2);
    pod.translate(cam.point.x, cam.point.y, cam.point.z + 0.004);
    parts.black.push(flat(pod));
    const lens = new THREE.CircleGeometry(0.008, 16);
    lens.deleteAttribute('uv');
    lens.translate(cam.point.x, cam.point.y, cam.point.z + 0.0105);
    parts.glass.push(flat(lens));
  }

  // ---- Chin splitter -----------------------------------------------------------------------
  // Plan outline: straight centre section, ends sweeping slightly forward, then back to the corners.
  const splitter = new THREE.Shape();
  const plan: [number, number][] = [
    [-0.7, 1.96], [-0.71, 2.06], [-0.64, 2.128], [-0.5, 2.118], [0, 2.112], [0.5, 2.118], [0.64, 2.128], [0.71, 2.06], [0.7, 1.96],
  ];
  splitter.moveTo(plan[0][0], plan[0][1]);
  for (const [x, z] of plan.slice(1)) splitter.lineTo(x, z);
  splitter.closePath();
  const blade = new THREE.ExtrudeGeometry(splitter, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  blade.deleteAttribute('uv');
  // Shape (x, z) in the XY plane -> rotateX maps shape y to world z and the extrusion to -y.
  blade.rotateX(Math.PI / 2);
  blade.translate(0, 0.128, 0);
  parts.carbon.push(flat(blade));
}

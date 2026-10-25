// Side and underbody details: door shut lines (front cut at 0.33 L, forward-leaning rear cut at
// 0.59 / 0.56 L), the slim amber wedge marker with its black slot behind the front arch, red quarter
// reflectors, carbon-framed vents at the lower rear corners, the underbody tray and the inner walls of the
// wheel wells. (The slot vents beside the rear glass are continuous matte carbon slots in the body cage.)
import * as THREE from 'three';
import { FRONT_AXLE, REAR_AXLE } from './body.ts';
import type { Parts } from './parts.ts';
import { BodySurface, type SurfaceHit, flat, surfacePolygon, surfaceStrip, withMirror } from './surface.ts';

const SIDE = new THREE.Vector3(1, 0, 0);
/** z of a fraction f of the length from the nose. */
const zAt = (f: number) => 2.15 - f * 4.3;

/** Projects a polyline (given as points just outside the body) onto the surface along `outward`. */
function projectPath(surface: BodySurface, points: THREE.Vector3[], outward: THREE.Vector3, samples: number): SurfaceHit[] {
  const hits: SurfaceHit[] = [];
  const total = points.length - 1;
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * total;
    const k = Math.min(total - 1, Math.floor(t));
    const p = points[k].clone().lerp(points[k + 1], t - k);
    const hit = surface.project(p, outward);
    if (hit) hits.push(hit);
  }
  return hits;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Builds the side / underbody trim; returns the wheel-well inner walls, which close the cabin's sides. */
export function buildTrim(surface: BodySurface, parts: Parts): THREE.BufferGeometry[] {
  const wellWalls: THREE.BufferGeometry[] = [];
  // ---- Door shut lines ---------------------------------------------------------------------
  // Both start just under the beltline (glass edge) and stop on the black band top.
  const front = projectPath(surface, [v(1, 0.772, zAt(0.33) + 0.004), v(1, 0.275, zAt(0.33))], SIDE, 44);
  const rear = projectPath(surface, [v(1, 0.8, zAt(0.59)), v(1, 0.345, zAt(0.56))], SIDE, 40);
  for (const path of [front, rear]) parts.black.push(...withMirror(surfaceStrip(path, 0.0021, 0.0008, 0.004)));

  // ---- Amber wedge marker and black slot behind the front arch -----------------------------
  const mz = zAt(0.28);
  const wedge = [v(1, 0.52, mz + 0.05), v(1, 0.512, mz - 0.04), v(1, 0.533, mz - 0.04)];
  parts.marker.push(...withMirror(surfacePolygon(surface, wedge, SIDE, 0.0022, 2)));
  const slot = [v(1, 0.515, mz - 0.058), v(1, 0.515, mz - 0.118), v(1, 0.528, mz - 0.118), v(1, 0.528, mz - 0.058)];
  parts.black.push(...withMirror(surfacePolygon(surface, slot, SIDE, 0.0018, 2)));

  // ---- Red angled reflectors on the rear quarters ------------------------------------------
  const refl = projectPath(surface, [v(1, 0.7, -1.95), v(1, 0.717, -2.04)], SIDE, 8);
  parts.brake.push(...withMirror(surfaceStrip(refl, 0.006, 0.002)));

  // ---- Carbon-framed vents at the lower rear corners ---------------------------------------
  const [vz0, vz1, vy0, vy1] = [-1.905, -2.03, 0.2, 0.39];
  const ventFrame = projectPath(surface, [v(1, vy0, vz0), v(1, vy1, vz0), v(1, vy1, vz1), v(1, vy0, vz1), v(1, vy0, vz0)], SIDE, 48);
  parts.carbon.push(...withMirror(surfaceStrip(ventFrame, 0.006, 0.004, 0.008)));
  for (let k = 1; k <= 3; k++) {
    const y = vy0 + ((vy1 - vy0) * k) / 4;
    const slat = projectPath(surface, [v(1, y, vz0 - 0.006), v(1, y, vz1 + 0.006)], SIDE, 10);
    parts.carbon.push(...withMirror(surfaceStrip(slat, 0.004, 0.003, 0.006)));
  }

  // ---- Underbody tray -----------------------------------------------------------------------
  const tray = new THREE.BoxGeometry(1.36, 0.012, 3.68);
  tray.deleteAttribute('uv');
  tray.translate(0, 0.104, 0.12);
  parts.carbon.push(flat(tray));

  // ---- Inner walls of the wheel wells (planar ellipses closing the arch tunnels) -----------
  for (const [axle, x, rz, ry] of [[FRONT_AXLE, 0.628, 0.375, 0.33], [REAR_AXLE, 0.598, 0.415, 0.405]] as const) {
    const ymin = 0.106 - axle.y;
    const pts: THREE.Vector2[] = [];
    const a0 = Math.asin(Math.max(-1, ymin / ry));
    for (let i = 0; i <= 32; i++) {
      const a = a0 + ((Math.PI - 2 * a0) * i) / 32;
      pts.push(new THREE.Vector2(Math.cos(a) * rz, Math.sin(a) * ry));
    }
    const wall = new THREE.ShapeGeometry(new THREE.Shape(pts), 1);
    wall.deleteAttribute('uv');
    // Shape (u, v) -> world (z = axle.z - u, y = axle.y + v) at plane x, facing +x (outward).
    wall.rotateY(Math.PI / 2);
    wall.translate(x, axle.y, axle.z);
    wellWalls.push(...withMirror(flat(wall)));
  }
  parts.black.push(...wellWalls);
  return wellWalls;
}

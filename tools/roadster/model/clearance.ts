// Build-time check that the cabin stays inside the body: every interior vertex must see the inside of the
// shell (canopy glass or bodywork) straight above it, and toward its own side of the car, with some
// clearance. Anything that pokes through the windshield, roof or doors is reported.
import * as THREE from 'three';
import type { BodySurface } from './surface.ts';

export interface ClearanceViolation {
  point: THREE.Vector3;
  direction: 'up' | 'side';
  /** Distance to the shell along the ray, or null when the ray never met the inside of the shell. */
  gap: number | null;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Casts from each (deduplicated) vertex of `geometries` upward and sideways against a double-sided shell.
 * A vertex is clear when both rays leave the shell from inside at least `margin` metres away.
 */
export function findClearanceViolations(shell: BodySurface, geometries: THREE.BufferGeometry[], margin = 0.004): ClearanceViolation[] {
  const seen = new Set<string>();
  const out: ClearanceViolation[] = [];
  const p = new THREE.Vector3();
  const check = (point: THREE.Vector3, dir: THREE.Vector3, direction: ClearanceViolation['direction']) => {
    const hit = shell.cast(point, dir);
    if (hit && hit.fromInside && hit.distance >= margin) return;
    out.push({ point: point.clone(), direction, gap: hit && hit.fromInside ? hit.distance : null });
  };
  for (const geometry of geometries) {
    const pos = geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const key = `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      check(p, UP, 'up');
      if (Math.abs(p.x) > 0.05) check(p, new THREE.Vector3(Math.sign(p.x), 0, 0), 'side');
    }
  }
  return out;
}

/** Throws with a readable summary when any interior vertex is too close to (or outside) the shell. */
export function assertCabinClearance(shell: BodySurface, geometries: THREE.BufferGeometry[], margin = 0.004) {
  const violations = findClearanceViolations(shell, geometries, margin);
  if (!violations.length) return;
  const sample = violations.slice(0, 8).map(({ point: q, direction, gap }) =>
    `(${q.x.toFixed(3)}, ${q.y.toFixed(3)}, ${q.z.toFixed(3)}) ${direction} ${gap === null ? 'outside the shell' : `${(gap * 1000).toFixed(1)} mm`}`);
  throw new Error(`Cabin clearance: ${violations.length} interior vertices poke through or touch the body/canopy:\n  ${sample.join('\n  ')}`);
}

/**
 * Throws when the subdivided shell folds over itself: a triangle whose face normal points against the average of
 * its own vertex normals. That happens where a crease or corner pinches a narrow strip of the cage (an A-pillar
 * foot, a sheared quad next to the T-top spine) and shows as a thin dark hook or sliver in renders.
 */
export function assertNoFolds(geometries: THREE.BufferGeometry[]) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const face = new THREE.Vector3(), vertex = new THREE.Vector3(), n = new THREE.Vector3();
  const folds: THREE.Vector3[] = [];
  for (const geometry of geometries) {
    const pos = geometry.getAttribute('position'), nor = geometry.getAttribute('normal');
    const index = geometry.index ?? { count: pos.count, getX: (i: number) => i };
    for (let t = 0; t < index.count; t += 3) {
      const [i, j, k] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, j); c.fromBufferAttribute(pos, k);
      face.subVectors(b, a).cross(n.subVectors(c, a));
      if (face.lengthSq() < 1e-16) continue;
      vertex.fromBufferAttribute(nor, i).add(n.fromBufferAttribute(nor, j)).add(n.fromBufferAttribute(nor, k));
      if (face.dot(vertex) < 0) folds.push(a.clone().add(b).add(c).divideScalar(3));
    }
  }
  if (!folds.length) return;
  const sample = folds.slice(0, 8).map((p) => `(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`);
  throw new Error(`Body shell folds over itself at ${folds.length} triangles:\n  ${sample.join('\n  ')}`);
}

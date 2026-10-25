// Surface-of-revolution helpers shared by the wheels and the rear thrusters, ports and fan outlets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * LatheGeometry of a (radius, height) profile around +Y, indexed and without UVs. The lathe's own analytic
 * normals are kept: they are continuous across the phi = 0 / 2 PI seam, where computeVertexNormals() would split
 * them (the seam vertices are duplicated), and they are smooth across profile corners as well, so a profile that
 * needs a hard corner goes through latheWithCorners(). Vertices on the axis (r = 0) get the axis direction, so
 * domes, cones and discs shade cleanly at their tips. The profile order sets the facing side, as in LatheGeometry.
 */
export function lathe(profile: [number, number][], segments: number, phiStart = 0): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), segments, phiStart, Math.PI * 2);
  geometry.deleteAttribute('uv');
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const n = new THREE.Vector3();
  for (let i = 0; i < normal.count; i++) {
    n.fromBufferAttribute(normal, i);
    if (Math.hypot(position.getX(i), position.getZ(i)) < 1e-9) n.set(0, Math.sign(n.y) || 1, 0);
    n.normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  return geometry;
}

/**
 * A lathe whose profile has hard corners at the given point indices: the profile is cut there into separate lathes
 * that share the corner points, so each side of a corner keeps its own normal (a crisp edge) while the stretches
 * between corners stay smooth.
 */
export function latheWithCorners(profile: [number, number][], segments: number, corners: number[], phiStart = 0): THREE.BufferGeometry {
  const cuts = [...new Set(corners)].filter((i) => i > 0 && i < profile.length - 1).sort((a, b) => a - b);
  const bounds = [0, ...cuts, profile.length - 1];
  const pieces: THREE.BufferGeometry[] = [];
  for (let k = 0; k + 1 < bounds.length; k++) pieces.push(lathe(profile.slice(bounds[k], bounds[k + 1] + 1), segments, phiStart));
  return pieces.length === 1 ? pieces[0] : mergeGeometries(pieces)!;
}

// Ray casting against the subdivided body, used to lay trim strips, shut lines and markers
// exactly onto the limit surface (with a small outward offset so nothing z-fights).
import * as THREE from 'three';

export interface SurfaceHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** Distance from the ray origin. */
  distance: number;
  /** True when the ray hit the back of a triangle, i.e. it left the closed shell from inside. */
  fromInside: boolean;
}

export class BodySurface {
  private readonly raycaster = new THREE.Raycaster();
  private readonly meshes: THREE.Mesh[];
  /**
   * The source meshes are split into spatial chunks (by triangle centroid) so that the raycaster's
   * bounding-sphere test skips most triangles: a cheap stand-in for a BVH. A double-sided surface also
   * reports hits on the inside of the shell (used by the cabin clearance check).
   */
  constructor(sources: THREE.Mesh[], options: { cells?: [number, number, number]; doubleSided?: boolean } = {}) {
    const cells = options.cells ?? [3, 3, 10];
    const sided = options.doubleSided ? new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) : null;
    this.meshes = [];
    for (const source of sources) {
      source.updateMatrixWorld(true);
      const geometry = source.geometry as THREE.BufferGeometry;
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const size = box.getSize(new THREE.Vector3());
      const pos = geometry.getAttribute('position');
      const nor = geometry.getAttribute('normal');
      // Non-indexed geometries are read as consecutive triangles.
      const index = geometry.index ?? { count: pos.count, getX: (i: number) => i };
      const buckets = new Map<number, number[]>();
      const c = new THREE.Vector3();
      for (let t = 0; t < index.count; t += 3) {
        c.set(0, 0, 0);
        for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(pos, index.getX(t + k)));
        c.divideScalar(3).sub(box.min);
        const ix = Math.min(cells[0] - 1, Math.floor((c.x / (size.x || 1)) * cells[0]));
        const iy = Math.min(cells[1] - 1, Math.floor((c.y / (size.y || 1)) * cells[1]));
        const iz = Math.min(cells[2] - 1, Math.floor((c.z / (size.z || 1)) * cells[2]));
        const key = (ix * cells[1] + iy) * cells[2] + iz;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(index.getX(t), index.getX(t + 1), index.getX(t + 2));
      }
      for (const tris of buckets.values()) {
        // Compact copy of the referenced vertices so the bounds describe only this chunk.
        const remap = new Map<number, number>();
        const p: number[] = [], n: number[] = [], idx: number[] = [];
        for (const v of tris) {
          let w = remap.get(v);
          if (w === undefined) {
            w = remap.size; remap.set(v, w);
            p.push(pos.getX(v), pos.getY(v), pos.getZ(v)); n.push(nor.getX(v), nor.getY(v), nor.getZ(v));
          }
          idx.push(w);
        }
        const chunk = new THREE.BufferGeometry();
        chunk.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
        chunk.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
        chunk.setIndex(idx);
        chunk.computeBoundingSphere();
        chunk.computeBoundingBox();
        const mesh = new THREE.Mesh(chunk, sided ?? source.material);
        mesh.matrixWorld.copy(source.matrixWorld);
        mesh.matrixAutoUpdate = false;
        this.meshes.push(mesh);
      }
    }
  }

  /** First hit along a ray; the normal is the interpolated vertex normal (smooth). */
  cast(origin: THREE.Vector3, direction: THREE.Vector3): SurfaceHit | null {
    this.raycaster.set(origin, direction.clone().normalize());
    const hits = this.raycaster.intersectObjects(this.meshes, false);
    const hit = hits[0];
    if (!hit || !hit.face) return null;
    const mesh = hit.object as THREE.Mesh;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const normalAttr = geometry.getAttribute('normal');
    const n = new THREE.Vector3();
    if (normalAttr && hit.barycoord) {
      const na = new THREE.Vector3().fromBufferAttribute(normalAttr, hit.face.a);
      const nb = new THREE.Vector3().fromBufferAttribute(normalAttr, hit.face.b);
      const nc = new THREE.Vector3().fromBufferAttribute(normalAttr, hit.face.c);
      n.addScaledVector(na, hit.barycoord.x).addScaledVector(nb, hit.barycoord.y).addScaledVector(nc, hit.barycoord.z).normalize();
    } else n.copy(hit.face.normal);
    const fromInside = hit.face.normal.dot(this.raycaster.ray.direction) > 0;
    return { point: hit.point.clone(), normal: n, distance: hit.distance, fromInside };
  }

  /** Casts from far outside toward the surface along -direction, i.e. "projects along direction". */
  project(p: THREE.Vector3, outward: THREE.Vector3, distance = 3): SurfaceHit | null {
    const dir = outward.clone().normalize();
    return this.cast(p.clone().addScaledVector(dir, distance), dir.clone().negate());
  }
}

/**
 * Builds a raised strip (ribbon with side walls and end caps) following a path of surface hits. The
 * strip's width lies in the surface, across the path (tangent x normal), so its face points outward.
 * `halfWidth` may vary along the path (a function of the hit index) for tapered ends.
 * Returns a flat-shaded non-indexed geometry.
 */
export function surfaceStrip(hits: SurfaceHit[], halfWidth: number | ((index: number) => number), lift: number, depth = lift + 0.004): THREE.BufferGeometry {
  const widthAt = typeof halfWidth === 'number' ? () => halfWidth : halfWidth;
  const positions: number[] = [];
  const quads: [number, number, number, number][] = [];
  // Path samples: the hits, plus a mitre sample wherever the path crosses a crease.
  const samples: StripSample[] = [];
  hits.forEach((hit, i) => {
    const mitre = i > 0 ? creaseMitre(hits[i - 1], hit) : null;
    if (mitre) samples.push({ ...mitre, width: (widthAt(i - 1) + widthAt(i)) / 2 });
    samples.push({ point: hit.point, normal: hit.normal, scale: 1, width: widthAt(i) });
  });
  const ring = (sample: StripSample, i: number) => {
    const prev = samples[Math.max(0, i - 1)].point, next = samples[Math.min(samples.length - 1, i + 1)].point;
    const tangent = next.clone().sub(prev).normalize();
    const a = tangent.cross(sample.normal).normalize().multiplyScalar(sample.width);
    const top = sample.point.clone().addScaledVector(sample.normal, lift * sample.scale);
    const base = sample.point.clone().addScaledVector(sample.normal, (lift - depth) * sample.scale);
    return [base.clone().sub(a), top.clone().sub(a), top.clone().add(a), base.clone().add(a)];
  };
  const rings = samples.map(ring);
  rings.forEach((r) => r.forEach((p) => positions.push(p.x, p.y, p.z)));
  for (let i = 0; i + 1 < rings.length; i++) {
    const o = i * 4, n = o + 4;
    quads.push([o + 0, o + 1, n + 1, n + 0]); // lower wall
    quads.push([o + 1, o + 2, n + 2, n + 1]); // face
    quads.push([o + 2, o + 3, n + 3, n + 2]); // upper wall
  }
  // End caps.
  const last = (rings.length - 1) * 4;
  quads.push([0, 3, 2, 1]);
  quads.push([last, last + 1, last + 2, last + 3]);
  return quadsToGeometry(positions, quads);
}

interface StripSample {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** Multiplier of the lift along `normal` (1, or 1 / cos(half angle) on a crease mitre). */
  scale: number;
  width: number;
}

/**
 * Mitre sample where the path between two consecutive hits crosses a crease (their normals more than 30 degrees
 * apart), or null on a smooth surface. Lifting the two hits along their own normals would make the strip cut a
 * chord through the corner, so the body would show through it as a dark slit. The mitre sits on the crease (the
 * intersection of the two tangent planes, nearest the chord's midpoint) and is lifted along the bisector by
 * lift / cos(half angle), which keeps the strip the same height above both faces.
 */
function creaseMitre(a: SurfaceHit, b: SurfaceHit): Omit<StripSample, 'width'> | null {
  const c = a.normal.dot(b.normal);
  if (c > Math.cos(Math.PI / 6) || c < -0.9) return null;
  const d1 = a.normal.dot(a.point), d2 = b.normal.dot(b.point), k = 1 - c * c;
  const onBoth = a.normal.clone().multiplyScalar((d1 - d2 * c) / k).addScaledVector(b.normal, (d2 - d1 * c) / k);
  const along = a.normal.clone().cross(b.normal).normalize();
  const mid = a.point.clone().add(b.point).multiplyScalar(0.5);
  const point = onBoth.addScaledVector(along, along.dot(mid.clone().sub(onBoth)));
  if (point.distanceTo(mid) > a.point.distanceTo(b.point)) return null;
  return { point, normal: a.normal.clone().add(b.normal).normalize(), scale: Math.sqrt(2 / (1 + c)) };
}

/** Converts quads/triangles (counter-clockwise from outside) into a flat-shaded non-indexed geometry. */
export function quadsToGeometry(positions: number[], quads: number[][]): THREE.BufferGeometry {
  const index: number[] = [];
  for (const q of quads) {
    if (q.length === 3) index.push(q[0], q[1], q[2]);
    else index.push(q[0], q[1], q[2], q[0], q[2], q[3]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

/**
 * A flat polygon (given in a plane by its outline points, just outside the body) laid onto the surface:
 * the outline is fan-triangulated around its centroid, refined `levels` times, and every vertex is
 * projected along -`outward` onto the body and lifted by `lift` along the surface normal.
 */
export function surfacePolygon(surface: BodySurface, outline: THREE.Vector3[], outward: THREE.Vector3, lift: number, levels = 2): THREE.BufferGeometry {
  const centre = outline.reduce((c, p) => c.add(p), new THREE.Vector3()).divideScalar(outline.length);
  let tris: THREE.Vector3[][] = [];
  for (let i = 0; i < outline.length; i++) tris.push([centre, outline[i], outline[(i + 1) % outline.length]]);
  for (let l = 0; l < levels; l++) {
    const next: THREE.Vector3[][] = [];
    for (const [a, b, c] of tris) {
      const ab = a.clone().lerp(b, 0.5), bc = b.clone().lerp(c, 0.5), ca = c.clone().lerp(a, 0.5);
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    tris = next;
  }
  const positions: number[] = [];
  const cache = new Map<string, THREE.Vector3>();
  const place = (p: THREE.Vector3) => {
    const key = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
    let q = cache.get(key);
    if (!q) {
      const hit = surface.project(p, outward);
      q = hit ? hit.point.addScaledVector(hit.normal, lift) : p.clone();
      cache.set(key, q);
    }
    return q;
  };
  for (const tri of tris) for (const p of tri) { const q = place(p); positions.push(q.x, q.y, q.z); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  // Make the polygon face outward regardless of the outline's winding.
  const n = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute('normal') as THREE.BufferAttribute, 0);
  if (n.dot(outward) < 0) {
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 3) {
      const x = pos.getX(i + 1), y = pos.getY(i + 1), z = pos.getZ(i + 1);
      pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
      pos.setXYZ(i + 2, x, y, z);
    }
    geometry.computeVertexNormals();
  }
  return geometry;
}

/** Mirrors a non-indexed geometry across x = 0 (fixing the winding). */
export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = (g.index ? g.toNonIndexed() : g.clone());
  m.scale(-1, 1, 1);
  const pos = m.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 3) {
    const x = pos.getX(i + 1), y = pos.getY(i + 1), z = pos.getZ(i + 1);
    pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    pos.setXYZ(i + 2, x, y, z);
  }
  m.computeVertexNormals();
  return m;
}

/** The geometry and its mirror image across x = 0. */
export const withMirror = (g: THREE.BufferGeometry) => [g, mirrorX(g)];

/** Non-indexed copy of a geometry (or the geometry itself when it already is non-indexed). */
export const flat = (g: THREE.BufferGeometry): THREE.BufferGeometry => (g.index ? g.toNonIndexed() : g);

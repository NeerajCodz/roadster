// Catmull-Clark subdivision for polygon control cages, with boundary edges, semi-sharp/sharp crease
// edges (DeRose et al. 1998 rules, integer and fractional sharpness), corner vertices and per-face
// material ids. The final quad mesh is turned into one indexed BufferGeometry per material with
// smooth normals that are split along hard creases, open boundaries and material borders.
import * as THREE from 'three';

/** Edge sharpness value for an infinitely sharp crease. */
export const HARD = Number.POSITIVE_INFINITY;

export interface Cage {
  /** Flat xyz positions. */
  positions: number[];
  /** Faces as vertex index loops, counter-clockwise when seen from outside. */
  faces: number[][];
  /** Material id per face. */
  faceMat: number[];
  /** Crease sharpness per undirected edge (see edgeKey). Missing edges are smooth. */
  creases: Map<number, number>;
  /** Vertices that are kept fixed (sharp corners). */
  corners: Set<number>;
}

const KEY_BASE = 1 << 22;
/** Order-independent key of the edge between vertices a and b. */
export const edgeKey = (a: number, b: number) => (a < b ? a * KEY_BASE + b : b * KEY_BASE + a);

export function emptyCage(): Cage {
  return { positions: [], faces: [], faceMat: [], creases: new Map(), corners: new Set() };
}

interface EdgeTable {
  v0: Int32Array;
  v1: Int32Array;
  f0: Int32Array;
  f1: Int32Array;
  sharp: Float64Array;
  index: Map<number, number>;
}

function buildEdges(cage: Cage): EdgeTable {
  const index = new Map<number, number>();
  const v0: number[] = [], v1: number[] = [], f0: number[] = [], f1: number[] = [];
  cage.faces.forEach((face, f) => {
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      const key = edgeKey(a, b);
      const existing = index.get(key);
      if (existing === undefined) {
        index.set(key, v0.length);
        v0.push(a); v1.push(b); f0.push(f); f1.push(-1);
      } else {
        if (f1[existing] !== -1) throw new Error(`non-manifold edge ${a}-${b}`);
        if (v0[existing] === a) throw new Error(`inconsistent face winding at edge ${a}-${b} (faces ${f0[existing]} and ${f})`);
        f1[existing] = f;
      }
    }
  });
  const sharp = new Float64Array(v0.length);
  for (let e = 0; e < v0.length; e++) sharp[e] = cage.creases.get(edgeKey(v0[e], v1[e])) ?? 0;
  return { v0: Int32Array.from(v0), v1: Int32Array.from(v1), f0: Int32Array.from(f0), f1: Int32Array.from(f1), sharp, index };
}

/** One level of Catmull-Clark subdivision. Output faces are all quads. */
export function subdivideOnce(cage: Cage): Cage {
  const P = cage.positions;
  const nV = P.length / 3;
  const nF = cage.faces.length;
  const E = buildEdges(cage);
  const nE = E.v0.length;

  // Face points.
  const fp = new Float64Array(nF * 3);
  cage.faces.forEach((face, f) => {
    let x = 0, y = 0, z = 0;
    for (const v of face) { x += P[v * 3]; y += P[v * 3 + 1]; z += P[v * 3 + 2]; }
    fp[f * 3] = x / face.length; fp[f * 3 + 1] = y / face.length; fp[f * 3 + 2] = z / face.length;
  });

  // Edge points.
  const ep = new Float64Array(nE * 3);
  for (let e = 0; e < nE; e++) {
    const a = E.v0[e], b = E.v1[e];
    const boundary = E.f1[e] < 0;
    const s = boundary ? HARD : E.sharp[e];
    for (let k = 0; k < 3; k++) {
      const mid = (P[a * 3 + k] + P[b * 3 + k]) / 2;
      if (s >= 1) { ep[e * 3 + k] = mid; continue; }
      const smooth = (P[a * 3 + k] + P[b * 3 + k] + fp[E.f0[e] * 3 + k] + fp[E.f1[e] * 3 + k]) / 4;
      ep[e * 3 + k] = s > 0 ? smooth + (mid - smooth) * s : smooth;
    }
  }

  // Vertex adjacency.
  const vEdges: number[][] = Array.from({ length: nV }, () => []);
  const vFaces: number[][] = Array.from({ length: nV }, () => []);
  for (let e = 0; e < nE; e++) { vEdges[E.v0[e]].push(e); vEdges[E.v1[e]].push(e); }
  cage.faces.forEach((face, f) => { for (const v of face) vFaces[v].push(f); });

  // Vertex points.
  const vp = new Float64Array(nV * 3);
  for (let v = 0; v < nV; v++) {
    const edges = vEdges[v], faces = vFaces[v];
    const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
    if (edges.length === 0) { vp[v * 3] = px; vp[v * 3 + 1] = py; vp[v * 3 + 2] = pz; continue; }
    const sharpEdges: number[] = [];
    let boundary = false;
    for (const e of edges) {
      if (E.f1[e] < 0) { boundary = true; sharpEdges.push(e); } else if (E.sharp[e] > 0) sharpEdges.push(e);
    }
    const sharpness = (e: number) => (E.f1[e] < 0 ? HARD : E.sharp[e]);
    // Smooth (interior) rule; for boundary vertices the smooth rule is never used.
    let sx = px, sy = py, sz = pz;
    if (!boundary) {
      const n = edges.length;
      let qx = 0, qy = 0, qz = 0, rx = 0, ry = 0, rz = 0;
      for (const f of faces) { qx += fp[f * 3]; qy += fp[f * 3 + 1]; qz += fp[f * 3 + 2]; }
      qx /= faces.length; qy /= faces.length; qz /= faces.length;
      for (const e of edges) {
        const a = E.v0[e], b = E.v1[e];
        rx += (P[a * 3] + P[b * 3]) / 2; ry += (P[a * 3 + 1] + P[b * 3 + 1]) / 2; rz += (P[a * 3 + 2] + P[b * 3 + 2]) / 2;
      }
      rx /= n; ry /= n; rz /= n;
      sx = (qx + 2 * rx + (n - 3) * px) / n; sy = (qy + 2 * ry + (n - 3) * py) / n; sz = (qz + 2 * rz + (n - 3) * pz) / n;
    }
    const k = sharpEdges.length;
    let tx = sx, ty = sy, tz = sz;
    if (cage.corners.has(v) || k > 2) {
      let vs = 0;
      for (const e of sharpEdges) vs += Math.min(sharpness(e), 1);
      vs = cage.corners.has(v) || boundary ? 1 : vs / k;
      tx = sx + (px - sx) * vs; ty = sy + (py - sy) * vs; tz = sz + (pz - sz) * vs;
    } else if (k === 2) {
      const far = sharpEdges.map((e) => (E.v0[e] === v ? E.v1[e] : E.v0[e]));
      const cx = (6 * px + P[far[0] * 3] + P[far[1] * 3]) / 8;
      const cy = (6 * py + P[far[0] * 3 + 1] + P[far[1] * 3 + 1]) / 8;
      const cz = (6 * pz + P[far[0] * 3 + 2] + P[far[1] * 3 + 2]) / 8;
      const vs = boundary ? 1 : Math.min(1, (Math.min(sharpness(sharpEdges[0]), 1e9) + Math.min(sharpness(sharpEdges[1]), 1e9)) / 2);
      tx = sx + (cx - sx) * vs; ty = sy + (cy - sy) * vs; tz = sz + (cz - sz) * vs;
    }
    vp[v * 3] = tx; vp[v * 3 + 1] = ty; vp[v * 3 + 2] = tz;
  }

  // Assemble child mesh: [vertex points][edge points][face points].
  const positions = new Array<number>((nV + nE + nF) * 3);
  for (let i = 0; i < nV * 3; i++) positions[i] = vp[i];
  for (let i = 0; i < nE * 3; i++) positions[nV * 3 + i] = ep[i];
  for (let i = 0; i < nF * 3; i++) positions[(nV + nE) * 3 + i] = fp[i];
  const faces: number[][] = [];
  const faceMat: number[] = [];
  const creases = new Map<number, number>();
  cage.faces.forEach((face, f) => {
    const n = face.length;
    const fv = nV + nE + f;
    for (let i = 0; i < n; i++) {
      const prev = face[(i + n - 1) % n], cur = face[i], next = face[(i + 1) % n];
      const eNext = nV + E.index.get(edgeKey(cur, next))!;
      const ePrev = nV + E.index.get(edgeKey(prev, cur))!;
      faces.push([cur, eNext, fv, ePrev]);
      faceMat.push(cage.faceMat[f]);
    }
  });
  for (let e = 0; e < nE; e++) {
    const s = E.sharp[e];
    if (s <= 0) continue;
    const child = s === HARD ? HARD : s - 1;
    if (child <= 0) continue;
    creases.set(edgeKey(E.v0[e], nV + e), child);
    creases.set(edgeKey(nV + e, E.v1[e]), child);
  }
  return { positions, faces, faceMat, creases, corners: new Set(cage.corners) };
}

export function subdivide(cage: Cage, levels: number): Cage {
  let mesh = cage;
  for (let i = 0; i < levels; i++) mesh = subdivideOnce(mesh);
  return mesh;
}

/** Options for turning a subdivided cage into render geometry. */
export interface MeshOutputOptions {
  /** Treat creases at or above this sharpness as normal-splitting (default: only HARD). */
  splitSharpness?: number;
  /** Smoothing angle: faces meeting at more than this angle across any edge get split normals. */
  autoSmoothAngle?: number;
}

/**
 * Converts a (subdivided) cage into one BufferGeometry per material id. Normals are area weighted and
 * split along hard creases, boundaries and material borders.
 */
export function cageToGeometries(mesh: Cage, options: MeshOutputOptions = {}): Map<number, THREE.BufferGeometry> {
  const P = mesh.positions;
  const split = options.splitSharpness ?? HARD;
  const autoCos = options.autoSmoothAngle === undefined ? -2 : Math.cos(options.autoSmoothAngle);
  const nF = mesh.faces.length;
  // Face normals (area weighted, via the polygon's Newell normal).
  const fn = new Float64Array(nF * 3);
  mesh.faces.forEach((face, f) => {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < face.length; i++) {
      const a = face[i] * 3, b = face[(i + 1) % face.length] * 3;
      nx += (P[a + 1] - P[b + 1]) * (P[a + 2] + P[b + 2]);
      ny += (P[a + 2] - P[b + 2]) * (P[a] + P[b]);
      nz += (P[a] - P[b]) * (P[a + 1] + P[b + 1]);
    }
    fn[f * 3] = nx / 2; fn[f * 3 + 1] = ny / 2; fn[f * 3 + 2] = nz / 2;
  });
  // Corner ids: corner c of face f -> offset[f] + c.
  const offset = new Int32Array(nF + 1);
  for (let f = 0; f < nF; f++) offset[f + 1] = offset[f] + mesh.faces[f].length;
  const parent = new Int32Array(offset[nF]);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  // Join corners of neighbouring faces across smooth edges.
  const seen = new Map<number, number>(); // edge key -> face*8+cornerIndex of first occurrence
  mesh.faces.forEach((face, f) => {
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      const key = edgeKey(a, b);
      const other = seen.get(key);
      if (other === undefined) { seen.set(key, f * 8 + i); continue; }
      const g = Math.floor(other / 8), j = other % 8;
      if (mesh.faceMat[g] !== mesh.faceMat[f]) continue;
      if ((mesh.creases.get(key) ?? 0) >= split) continue;
      if (autoCos > -2) {
        const la = Math.hypot(fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]) || 1;
        const lb = Math.hypot(fn[g * 3], fn[g * 3 + 1], fn[g * 3 + 2]) || 1;
        const dot = (fn[f * 3] * fn[g * 3] + fn[f * 3 + 1] * fn[g * 3 + 1] + fn[f * 3 + 2] * fn[g * 3 + 2]) / (la * lb);
        if (dot < autoCos) continue;
      }
      const gFace = mesh.faces[g];
      // In face g the edge runs b -> a: corner j is b, corner j+1 is a.
      const ga = offset[g] + ((j + 1) % gFace.length), gb = offset[g] + j;
      union(offset[f] + i, ga);
      union(offset[f] + ((i + 1) % face.length), gb);
    }
  });
  // Accumulate normals per corner group.
  const acc = new Float64Array(parent.length * 3);
  mesh.faces.forEach((face, f) => {
    for (let i = 0; i < face.length; i++) {
      const r = find(offset[f] + i);
      acc[r * 3] += fn[f * 3]; acc[r * 3 + 1] += fn[f * 3 + 1]; acc[r * 3 + 2] += fn[f * 3 + 2];
    }
  });
  // Emit geometries per material.
  const builders = new Map<number, { pos: number[]; nor: number[]; idx: number[]; map: Map<number, number> }>();
  mesh.faces.forEach((face, f) => {
    const mat = mesh.faceMat[f];
    let b = builders.get(mat);
    if (!b) { b = { pos: [], nor: [], idx: [], map: new Map() }; builders.set(mat, b); }
    const ids = face.map((v, i) => {
      const r = find(offset[f] + i);
      let id = b!.map.get(r);
      if (id === undefined) {
        id = b!.pos.length / 3;
        b!.map.set(r, id);
        b!.pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        const nx = acc[r * 3], ny = acc[r * 3 + 1], nz = acc[r * 3 + 2];
        const l = Math.hypot(nx, ny, nz) || 1;
        b!.nor.push(nx / l, ny / l, nz / l);
      }
      return id;
    });
    if (ids.length === 4) {
      // Split along the shorter diagonal for even shading.
      const d02 = dist2(P, face[0], face[2]), d13 = dist2(P, face[1], face[3]);
      if (d02 <= d13) b.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
      else b.idx.push(ids[0], ids[1], ids[3], ids[1], ids[2], ids[3]);
    } else {
      for (let i = 1; i + 1 < ids.length; i++) b.idx.push(ids[0], ids[i], ids[i + 1]);
    }
  });
  const out = new Map<number, THREE.BufferGeometry>();
  for (const [mat, b] of builders) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    geometry.setIndex(b.idx);
    out.set(mat, geometry);
  }
  return out;
}

function dist2(P: number[], a: number, b: number) {
  const dx = P[a * 3] - P[b * 3], dy = P[a * 3 + 1] - P[b * 3 + 1], dz = P[a * 3 + 2] - P[b * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Mirrors a half cage (x >= 0) across x = 0. Vertices with |x| < eps are shared (the seam is welded)
 * and snapped to x = 0; mirrored faces get reversed winding.
 */
export function mirrorX(half: Cage, eps = 1e-5): Cage {
  const n = half.positions.length / 3;
  const positions = half.positions.slice();
  const map = new Int32Array(n);
  for (let v = 0; v < n; v++) {
    if (Math.abs(positions[v * 3]) < eps) { positions[v * 3] = 0; map[v] = v; continue; }
    map[v] = positions.length / 3;
    positions.push(-positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
  }
  const faces = half.faces.map((face) => face.slice());
  const faceMat = half.faceMat.slice();
  half.faces.forEach((face, f) => { faces.push(face.map((v) => map[v]).reverse()); faceMat.push(half.faceMat[f]); });
  const creases = new Map(half.creases);
  for (const [key, s] of half.creases) {
    const a = Math.floor(key / KEY_BASE), b = key % KEY_BASE;
    creases.set(edgeKey(map[a], map[b]), s);
  }
  const corners = new Set(half.corners);
  for (const v of half.corners) corners.add(map[v]);
  return { positions, faces, faceMat, creases, corners };
}

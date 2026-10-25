// Helpers for authoring control cages: vertex/face creation, crease tagging and boundary flanges.
import { type Cage, HARD, edgeKey, emptyCage } from './subd.ts';

export type Vec3 = [number, number, number];

export class CageBuilder {
  readonly cage: Cage = emptyCage();

  vertex(p: Vec3): number {
    this.cage.positions.push(p[0], p[1], p[2]);
    return this.cage.positions.length / 3 - 1;
  }

  position(v: number): Vec3 {
    const P = this.cage.positions;
    return [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  }

  setPosition(v: number, p: Vec3) {
    const P = this.cage.positions;
    P[v * 3] = p[0]; P[v * 3 + 1] = p[1]; P[v * 3 + 2] = p[2];
  }

  /** Adds a face; vertices are given counter-clockwise as seen from outside. */
  face(vertices: number[], mat: number): number {
    if (new Set(vertices).size !== vertices.length) throw new Error(`degenerate face ${vertices.join(',')}`);
    this.cage.faces.push(vertices);
    this.cage.faceMat.push(mat);
    return this.cage.faces.length - 1;
  }

  crease(a: number, b: number, sharpness = HARD) {
    const key = edgeKey(a, b);
    this.cage.creases.set(key, Math.max(this.cage.creases.get(key) ?? 0, sharpness));
  }

  /** Creases every consecutive pair of a vertex chain. */
  creaseChain(chain: (number | undefined)[], sharpness = HARD) {
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = chain[i], b = chain[i + 1];
      if (a !== undefined && b !== undefined && a !== b) this.crease(a, b, sharpness);
    }
  }

  corner(v: number) {
    this.cage.corners.add(v);
  }

  /** Tags all edges between faces of different materials as infinitely sharp. */
  creaseMaterialBorders() {
    const owner = new Map<number, number>();
    this.cage.faces.forEach((face, f) => {
      for (let i = 0; i < face.length; i++) {
        const key = edgeKey(face[i], face[(i + 1) % face.length]);
        const other = owner.get(key);
        if (other === undefined) owner.set(key, f);
        else if (this.cage.faceMat[other] !== this.cage.faceMat[f]) this.cage.creases.set(key, HARD);
      }
    });
  }

  /**
   * Marks vertices as corners where a material border turns by more than `minTurnDeg`, so that
   * window and panel outlines keep crisp corners instead of being rounded by the crease rule.
   */
  cornerMaterialTurns(minTurnDeg: number) {
    const owner = new Map<number, number>();
    const borders = new Map<number, number[]>();
    this.cage.faces.forEach((face, f) => {
      for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length];
        const key = edgeKey(a, b);
        const other = owner.get(key);
        if (other === undefined) { owner.set(key, f); continue; }
        if (this.cage.faceMat[other] === this.cage.faceMat[f]) continue;
        for (const [v, w] of [[a, b], [b, a]]) {
          if (!borders.has(v)) borders.set(v, []);
          borders.get(v)!.push(w);
        }
      }
    });
    const cosLimit = Math.cos(Math.PI - (minTurnDeg * Math.PI) / 180);
    for (const [v, ends] of borders) {
      if (ends.length !== 2) continue;
      const p = this.position(v), a = this.position(ends[0]), c = this.position(ends[1]);
      const u = [a[0] - p[0], a[1] - p[1], a[2] - p[2]], w = [c[0] - p[0], c[1] - p[1], c[2] - p[2]];
      const cos = (u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / (Math.hypot(...u) * Math.hypot(...w));
      // Straight continuation has cos = -1; a turn of minTurnDeg has cos = -cos(minTurn).
      if (cos > cosLimit) this.corner(v);
    }
  }

  /**
   * Extrudes a chain of boundary vertices into a flange: each vertex v gets a partner at target(v) and
   * every boundary edge of the chain gets a quad joining it to its partner edge. The original edges become
   * creases with the given sharpness. Returns the partner vertex of each chain vertex.
   */
  flange(chain: number[], target: (v: number, index: number) => Vec3, mat: number, sharpness = HARD): number[] {
    const directed = new Set<string>();
    for (const face of this.cage.faces) for (let i = 0; i < face.length; i++) directed.add(`${face[i]}>${face[(i + 1) % face.length]}`);
    const partner = chain.map((v, i) => this.vertex(target(v, i)));
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = chain[i], b = chain[i + 1], a2 = partner[i], b2 = partner[i + 1];
      if (directed.has(`${a}>${b}`)) this.face([b, a, a2, b2], mat);
      else if (directed.has(`${b}>${a}`)) this.face([a, b, b2, a2], mat);
      else throw new Error(`flange: ${a}-${b} is not a boundary edge`);
      if (sharpness > 0) this.crease(a, b, sharpness);
    }
    return partner;
  }
}

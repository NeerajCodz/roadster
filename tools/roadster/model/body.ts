// Control cage of the roadster body shell (left half, x >= 0), mirrored and subdivided.
// Numbers follow tools/roadster/SPEC-2026.md (stations z = 2.15 - f * 4.30).
//
// Topology: a "sleeve" grid of 21 stations (s0 at the nose ... s20 at the tail) by 12 profile rows,
// plus a front and a rear end-cap grid that close the sleeve, like box modelling a car in Blender.
//
//   profile row  j0  sill underside (open boundary, flanged inwards)
//                j1  sill lower outer edge
//                j2  top of the black sill band (material border, rises toward the rear)
//                j3  lower door line            } arch loops: rows j0..j4 are cut away around the
//                j4  upper door / arch top line } wheels; the cut vertices sit on the arch circles
//                j5  shoulder crease (corner of the end caps)
//                j6  fender peak -> beltline (side-glass bottom) -> haunch inner edge
//                j7  inner fender facet -> A-pillar outer edge / side-glass top -> sail outer edge
//                j8  hood V-crease -> windshield edge -> T-top outer edge -> slot-vent outer edge
//                j9  hood / windshield / T-top middle -> rear-glass outer edge
//                j10 hood / windshield middle -> T-top inner edge (spine) -> rear-glass middle
//                j11 centre line (x = 0, welded to the mirror half)
//
//   stations     s0 nose, s1 corner chamfer, s2..s5 front arch (s3 windshield leading edge,
//                s4 A-pillar foot), s6 door front, s7/s8 header, s9 roof, s10/s11 B-pillar,
//                s12/s13 cross bar, s14 side-glass point, s14..s17 rear arch, s18 deck-corner support,
//                s19 deck, s20 tail.
//
// The end caps are 7 x 6 grids whose outer column is the station's j0..j5 and whose top row is the
// station's j5..j11, so the cap corners become valence-3 vertices like a subdivided box corner.
import { CageBuilder, type Vec3 } from './cage.ts';
import { type Cage, HARD, mirrorX } from './subd.ts';

export const MAT = { paint: 0, black: 1, glass: 2, carbon: 3 } as const;

/** Front and rear axle positions (z, hub height = tyre radius). */
export const FRONT_AXLE = { z: 1.34, y: 0.338 };
export const REAR_AXLE = { z: -1.45, y: 0.362 };
// Arch control-polygon radii: the boundary crease curve settles ~2.5 % inside the polygon, giving lip
// radii of ~0.352 (front arch top at 0.69) and ~0.388 (rear arch top at 0.75).
const RF = 0.362;
const RR = 0.398;
const LIP_F = 0.946;
const LIP_R = 0.96;

/** Crease sharpness of the character lines (>= subdivision levels gives a geometrically sharp edge). */
export const SHARP = { shoulder: 3, fender: 3, hood: 3, facet: 3, sail: 1.4 } as const;

const deg = Math.PI / 180;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Point on an arch circle; theta is measured from +z (toward the nose) over the top. */
function arch(axle: { z: number; y: number }, r: number, thetaDeg: number, x: number): Vec3 {
  return [x, axle.y + r * Math.sin(thetaDeg * deg), axle.z + r * Math.cos(thetaDeg * deg)];
}
const af = (t: number, x = LIP_F) => arch(FRONT_AXLE, RF, t, x);
const ar = (t: number, x = LIP_R) => arch(REAR_AXLE, RR, t, x);

/**
 * The sail-side edge (j8) of the slot vents beside the rear glass sits this much lower than the glass edge,
 * so each matte carbon slot reads as a continuous channel recessed between the sail and the glass.
 */
const SLOT_DROP = 0.014;

/** Top of the black sill band between the wheels: one straight line, 0.25 -> 0.41 toward the rear. */
const bandY = (z: number) => 0.25 + 0.0812 * (0.95 - z);
/** Shoulder crease: one straight line from 0.62 behind the front arch to 0.87 at the tail. */
const shoulderY = (z: number) => 0.622 + 0.0787 * (0.98 - z);
/** Inward lean of the black sill band below the door (dx / dy). */
const SILL_LEAN = 0.12;
/** Door surface with slight tumblehome: x as a function of height. */
const doorX = (y: number) => 0.95 - 0.022 * (y - 0.25) / 0.4;

type Row = (Vec3 | null)[];

/** Rows j0..j5 of a door station between the wheels. */
function sideRows(z: number): Vec3[] {
  const b = bandY(z), s = shoulderY(z);
  const y3 = b + (s - b) * 0.36, y4 = b + (s - b) * 0.7;
  // The sill band (j1..j2) leans in at a constant SILL_LEAN, so it is one flat facet between the wheels and its
  // reflections run straight; the underside (j0) follows it.
  const x1 = doorX(b) - SILL_LEAN * (b - 0.152);
  return [[x1 - 0.093, 0.12, z], [x1, 0.152, z], [doorX(b), b, z], [doorX(y3), y3, z], [doorX(y4), y4, z], [doorX(s) - 0.004, s, z]];
}

/** Station table: 21 stations x 12 rows. null marks vertices inside a wheel-arch cut-out. */
function stations(): Row[] {
  const S: Row[] = [];
  // s0: nose perimeter. j0..j5 run up the front edge of the corner chamfer, j5..j11 along the hood's
  // sharp leading edge (j5..j8 squeeze into the corner block, the hood is 1.35 m wide). j7 stays near hood
  // height, so the black fascia under the edge runs level up to the block instead of climbing into a point.
  S.push([
    [0.655, 0.125, 2.07], [0.69, 0.165, 2.095], [0.703, 0.3, 2.118], [0.707, 0.38, 2.124], [0.709, 0.45, 2.128], [0.71, 0.505, 2.13],
    [0.697, 0.497, 2.136], [0.684, 0.466, 2.141], [0.672, 0.462, 2.146], [0.45, 0.46, 2.15], [0.225, 0.46, 2.15], [0, 0.46, 2.15],
  ]);
  // s1..s4: the front fenders are three flat facets meeting at crisp edges: the side (x = LIP_F up to the
  // shoulder j5), a narrow outer top facet up to the fender peak (j6, a straight line at constant x, so it
  // reads as a straight V edge in front view) and the inner facet down to the hood V-crease (j8). j7 lies on
  // the straight line from j6 to j8, so the inner facet stays flat.
  // s1: rear edge of the corner chamfer; the fender peaks rise above the hood (V in front view).
  {
    const peak: Vec3 = [0.858, 0.64, 1.938], crease: Vec3 = [0.62, 0.535, 1.944];
    S.push([
      [0.86, 0.12, 1.905], [0.926, 0.162, 1.912], [LIP_F, 0.3, 1.922], [LIP_F, 0.4, 1.927], [LIP_F, 0.5, 1.93], [LIP_F, 0.585, 1.933],
      peak, lerp3(peak, crease, 0.5), crease, [0.414, 0.535, 1.944], [0.207, 0.535, 1.944], [0, 0.535, 1.944],
    ]);
  }
  // s2: front of the front arch.
  {
    const peak: Vec3 = [0.86, 0.722, 1.69], crease: Vec3 = [0.556, 0.624, 1.695];
    S.push([
      af(-34, 0.85), af(-20, 0.925), af(-6, 0.943), af(20), af(48), [LIP_F, 0.69, 1.675],
      peak, lerp3(peak, crease, 0.5), crease, [0.37, 0.624, 1.695], [0.185, 0.624, 1.695], [0, 0.624, 1.695],
    ]);
  }
  // s3: windshield leading edge (1.0 m wide), ahead of the front axle: cab-forward. j7 sits nearer the hood
  // crease here, so the small white quad between the fender facet and the windshield tapers evenly into the
  // A-pillar foot instead of pinching.
  {
    const peak: Vec3 = [0.862, 0.762, 1.478], crease: Vec3 = [0.5, 0.7, 1.4835];
    S.push([
      null, null, null, null, af(76), [LIP_F, 0.735, 1.47],
      peak, lerp3(peak, crease, 0.6), crease, [0.333, 0.7, 1.4835], [0.167, 0.7, 1.4835], [0, 0.7, 1.4835],
    ]);
  }
  // s4: A-pillar feet (windshield 1.53 m wide, pillar foot 5 cm wide); the side glass starts in a point here.
  S.push([
    null, null, null, null, af(104), [LIP_F, 0.742, 1.235],
    [0.864, 0.764, 1.2255], [0.815, 0.768, 1.2255], [0.765, 0.772, 1.2255], [0.52, 0.782, 1.2255], [0.26, 0.786, 1.2255], [0, 0.787, 1.2255],
  ]);
  // A-pillars: thin white strips from the feet (5 cm) to the header corners (4 cm, 1.1 m apart).
  const pillar = (z: number): [Vec3, Vec3] => {
    const t = (1.2255 - z) / 0.9255;
    return [[0.815 - 0.225 * t, 0.768 + 0.298 * t, z], [0.765 - 0.215 * t, 0.772 + 0.303 * t, z]];
  };
  const ws = (z: number) => 0.7 + 0.3385 * (1.4835 - z); // windshield centre line, ~18.7 degrees
  // s5: rear of the front arch; the shoulder crease starts at the arch lip.
  {
    const [outer, inner] = pillar(0.98);
    const c = ws(0.98);
    S.push([
      af(215, 0.85), af(204, 0.925), af(192, 0.943), af(162), af(132), [LIP_F, 0.645, 0.99],
      [0.868, 0.768, 0.98], outer, inner, [0.48, c - 0.004, 0.98], [0.24, c - 0.001, 0.98], [0, c, 0.98],
    ]);
  }
  // s6: front door shut line region, mid windshield.
  {
    const [outer, inner] = pillar(0.73);
    const c = ws(0.73);
    S.push([...sideRows(0.73), [0.868, 0.778, 0.73], outer, inner, [0.44, c - 0.007, 0.73], [0.22, c - 0.002, 0.73], [0, c, 0.73]]);
  }
  // s7: windshield top edge (header front); s8: header rear = T-top front edge.
  S.push([...sideRows(0.3), [0.868, 0.79, 0.3], [0.59, 1.066, 0.3], [0.55, 1.075, 0.3], [0.37, 1.09, 0.3], [0.09, 1.098, 0.3], [0, 1.1, 0.3]]);
  S.push([...sideRows(0.24), [0.868, 0.791, 0.24], [0.596, 1.074, 0.24], [0.556, 1.084, 0.24], [0.31, 1.099, 0.24], [0.06, 1.105, 0.24], [0, 1.106, 0.24]]);
  // s9: roof, nearly flat around the 1.14 m peak; T-tops either side of a narrow spine.
  S.push([...sideRows(-0.1), [0.87, 0.8, -0.1], [0.62, 1.106, -0.1], [0.58, 1.118, -0.1], [0.32, 1.134, -0.1], [0.06, 1.139, -0.1], [0, 1.14, -0.1]]);
  // s10, s11: thin B-pillar (top of the forward-leaning rear door cut).
  S.push([...sideRows(-0.36), [0.868, 0.809, -0.36], [0.624, 1.104, -0.36], [0.584, 1.116, -0.36], [0.32, 1.133, -0.36], [0.06, 1.138, -0.36], [0, 1.139, -0.36]]);
  S.push([...sideRows(-0.42), [0.866, 0.822, -0.42], [0.625, 1.101, -0.42], [0.585, 1.113, -0.42], [0.32, 1.13, -0.42], [0.06, 1.135, -0.42], [0, 1.136, -0.42]]);
  // s12, s13: white cross bar between the T-tops and the trapezoidal rear glass.
  S.push([...sideRows(-0.54), [0.85, 0.86, -0.54], [0.627, 1.095, -0.54], [0.587, 1.107, -0.54], [0.32, 1.123, -0.54], [0.06, 1.128, -0.54], [0, 1.129, -0.54]]);
  S.push([...sideRows(-0.62), [0.833, 0.886, -0.62], [0.65, 1.084, -0.62], [0.552, 1.103 - SLOT_DROP / 2, -0.62], [0.5, 1.11, -0.62], [0.08, 1.1196, -0.62], [0, 1.12, -0.62]]);
  // s14: side-glass rear point (0.75 L, 1.03 m); front of the rear arch. The band top meets the arch
  // at 0.41.
  S.push([
    ar(-35, 0.85), ar(-15, 0.93), ar(7, 0.952), ar(30), ar(55), [0.956, shoulderY(-1.075), -1.075],
    [0.704, 1.016, -1.075], [0.69, 1.026, -1.075], [0.48, 1.033 - SLOT_DROP, -1.075], [0.428, 1.036, -1.075], [0.214, 1.039, -1.075], [0, 1.04, -1.075],
  ]);
  // s15, s16: rear arch top under the broad haunch; flat sail panels flank the narrowing rear glass.
  S.push([
    null, null, null, null, ar(80), [0.962, shoulderY(-1.3), -1.3],
    [0.652, 0.99, -1.3], [0.624, 0.995, -1.3], [0.428, 0.997 - SLOT_DROP, -1.3], [0.388, 0.998, -1.3], [0.194, 1.0, -1.3], [0, 1.001, -1.3],
  ]);
  S.push([
    null, null, null, null, ar(105), [0.964, shoulderY(-1.6), -1.6],
    [0.628, 0.94, -1.6], [0.578, 0.944, -1.6], [0.378, 0.946 - SLOT_DROP, -1.6], [0.338, 0.947, -1.6], [0.169, 0.949, -1.6], [0, 0.95, -1.6],
  ]);
  // s17: rear of the rear arch; the rear glass ends here (0.6 m wide).
  S.push([
    ar(213, 0.85), ar(192, 0.93), ar(165, 0.952), ar(145), ar(126), [0.963, shoulderY(-1.81), -1.81],
    [0.614, 0.903, -1.806], [0.556, 0.905, -1.806], [0.34, 0.906 - SLOT_DROP, -1.806], [0.3, 0.906, -1.806], [0.15, 0.907, -1.806], [0, 0.907, -1.806],
  ]);
  // s18: support station between the arch and the deck. It carries the haunch's inner edge (j6) and the
  // shoulder smoothly from the narrow rear glass out to the deck corner, which keeps the haunch free of
  // shading waves near the deck lip.
  S.push([
    [0.856, 0.108, -1.9], [0.934, 0.265, -1.925], [0.953, 0.57, -1.93], [0.958, 0.677, -1.925], [0.961, 0.758, -1.905],
    [0.962, shoulderY(-1.915), -1.915],
    [0.66, 0.889, -1.915], [0.592, 0.891, -1.915], [0.392, 0.892, -1.915], [0.312, 0.892, -1.915], [0.156, 0.893, -1.915],
    [0, 0.893, -1.915],
  ]);
  // s19: rear deck; the black lower corner wraps around the corner. The black lower fascia reaches up to 0.68,
  // leaving a 0.13 m white band under the light bar's black band.
  S.push([
    [0.86, 0.09, -1.99], [0.935, 0.26, -2.0], [0.953, 0.68, -2.01], [0.957, 0.745, -2.015], [0.959, 0.8, -2.02], [0.96, 0.858, -2.02],
    [0.74, 0.874, -2.02], [0.64, 0.876, -2.02], [0.46, 0.877, -2.02], [0.33, 0.877, -2.02], [0.165, 0.878, -2.02], [0, 0.878, -2.02],
  ]);
  // s20: tail perimeter. j5..j11 form the sharp overhanging deck lip at 0.87.
  S.push([
    [0.84, 0.07, -2.1], [0.912, 0.28, -2.115], [0.928, 0.68, -2.124], [0.93, 0.745, -2.128], [0.93, 0.805, -2.134], [0.93, 0.866, -2.143],
    [0.83, 0.874, -2.148], [0.7, 0.877, -2.15], [0.56, 0.879, -2.15], [0.36, 0.88, -2.15], [0.18, 0.88, -2.15], [0, 0.88, -2.15],
  ]);
  return S;
}

/**
 * Height of the side-glass bottom edge (cage row j6) at z, from the A-pillar foot back to the cross bar.
 * Used to keep the cabin's door trims under the beltline.
 */
export function beltlineY(z: number): number {
  const pts = stations().map((row) => row[6]).filter((p): p is Vec3 => !!p && p[2] <= 1.23 && p[2] >= -0.63);
  pts.sort((a, b) => b[2] - a[2]);
  if (z >= pts[0][2]) return pts[0][1];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if (z <= a[2] && z >= b[2]) return a[1] + ((b[1] - a[1]) * (a[2] - z)) / (a[2] - b[2]);
  }
  return pts[pts.length - 1][1];
}

const NS = 21;
const NR = 12;
const CORNER = 5; // profile row that forms the end-cap corner
const TOP = NR - 1;

export interface BodyCage {
  cage: Cage;
  /** Half-cage vertex grid for reference (station, row) -> vertex. */
  grid: (number | undefined)[][];
}

/** Material of the sleeve face between stations s..s+1 and rows j..j+1. */
function sleeveMaterial(s: number, j: number): number {
  if (j <= 1) return MAT.black; // sill and its underside
  if (j === 6 && ((s >= 4 && s <= 9) || (s >= 11 && s <= 13))) return MAT.glass; // door + quarter windows
  if (j >= 8 && j <= 10 && s >= 3 && s <= 6) return MAT.glass; // hexagonal windshield
  if (j >= 8 && j <= 9 && s >= 8 && s <= 11) return MAT.glass; // T-tops
  if (j >= 9 && j <= 10 && s >= 13 && s <= 16) return MAT.glass; // rear glass
  if (j === 8 && s >= 13 && s <= 16) return MAT.carbon; // continuous dark (matte) slot vents between sails and glass
  return MAT.paint;
}

export function buildBodyCage(): BodyCage {
  const b = new CageBuilder();
  const S = stations();
  const grid: (number | undefined)[][] = S.map((row) => row.map((p) => (p ? b.vertex(p) : undefined)));
  const g = (s: number, j: number) => {
    const v = grid[s][j];
    if (v === undefined) throw new Error(`missing cage vertex s${s} j${j}`);
    return v;
  };

  // ---- Sleeve faces -------------------------------------------------------------------------
  for (let s = 0; s + 1 < NS; s++) {
    for (let j = 0; j + 1 < NR; j++) {
      const a = grid[s][j], bb = grid[s + 1][j], c = grid[s + 1][j + 1], d = grid[s][j + 1];
      if (a === undefined || bb === undefined || c === undefined || d === undefined) continue;
      // Outward winding (seen from +x, screen-right is -z): stations run right, rows run upward.
      if (s === 4 && j === CORNER) {
        // Behind the front fender the shoulder drops from the fender top to the door shoulder: two flat
        // triangular facets split by a crisp diagonal instead of one twisted (pillowy) quad.
        b.face([a, bb, c], sleeveMaterial(s, j));
        b.face([a, c, d], sleeveMaterial(s, j));
        b.crease(a, c, HARD);
        continue;
      }
      b.face([a, bb, c, d], sleeveMaterial(s, j));
    }
  }

  // ---- End caps -----------------------------------------------------------------------------
  // Cap grid C[u][w]: u = 0 (centre) .. 6 (outer corner), w = 0 (bottom) .. 5 (top edge).
  const corner0 = b.position(g(0, CORNER));
  const capFront = buildCap(b, grid, 0, (u, w, top, side) => {
    // Front fascia: recessed between the white corner blocks (the step between columns 5 and 6 is the
    // blocks' inboard face) and slightly undercut below the hood's sharp leading edge.
    const x = side[0] * [0, 0.32, 0.64, 0.86, 0.935, 0.965][u];
    const y = side[1] + (top[1] - corner0[1]) * (w / 5);
    const undercut = [0.075, 0.05, 0.034, 0.026, 0.016][w];
    const z = top[2] - undercut - 0.02;
    return [x, y, z];
  });
  const capRear = buildCap(b, grid, NS - 1, (u, w, top, side) => {
    // Rear fascia tucked under the overhanging lip; light-bar band at the top (w 4..5).
    const xs = [0, 0.18, 0.36, 0.56, 0.7, 0.83];
    const x = xs[u] ?? top[0];
    let y = side[1] + (top[1] - 0.866) * (w / 5);
    if (w === 0) y = u <= 3 ? 0.13 : 0.065; // corner legs reach almost to the ground; the diffuser box covers the centre
    const z = [-2.104, -2.108, -2.111, -2.114, -2.122][w];
    return [x, y, z];
  });
  const capMaterial = (rear: boolean) => (u: number, w: number) => {
    // Front: black fascia, white corner-block faces. The top strip beside each block (u 4, w 4) climbs with the
    // hood edge into the block, so it is white as well: the black fascia stops level with the hood line.
    if (!rear) return (u === 5 && w >= 2) || (u === 4 && w === 4) ? MAT.paint : MAT.black;
    return w <= 1 || w === 4 ? MAT.black : MAT.paint;
  };
  addCapFaces(b, capFront, false, capMaterial(false));
  addCapFaces(b, capRear, true, capMaterial(true));

  // ---- Creases ------------------------------------------------------------------------------
  b.creaseMaterialBorders();
  const rowChain = (j: number, from = 0, to = NS - 1) => grid.slice(from, to + 1).map((row) => row[j]);
  b.creaseChain(rowChain(CORNER), SHARP.shoulder); // chamfer top -> fender outer edge -> shoulder crease -> deck edge
  b.creaseChain(rowChain(CORNER, 0, 6), HARD); // front fender shoulder: the flat side meets the top facet crisply
  // Behind the front arch the shoulder drops from the fender top (s4) to the door shoulder (s5) as one flat ramp:
  // a pinned corner at the foot of the ramp and a hard edge up to the beltline keep the drop from rounding into
  // a soft S.
  b.corner(g(5, CORNER));
  b.crease(g(5, CORNER), g(5, 6), HARD);
  b.creaseChain(rowChain(6, 0, 4), HARD); // fender peaks flowing into the beltline
  b.creaseChain(rowChain(7, 0, 3), SHARP.fender); // keeps the inner fender facet flat
  b.creaseChain(rowChain(8, 0, 3), SHARP.hood); // hood V-creases toward the windshield corners
  b.creaseChain(rowChain(7, 14, NS - 2), SHARP.sail); // sail outer edges
  b.creaseChain(rowChain(2), HARD); // band top stays a straight crisp line
  b.creaseChain(rowChain(1, 5, 14), 1); // sill lower edge between the wheels
  // Corner chamfers, the hood's sharp leading edge and the deck lip.
  b.creaseChain(grid[1].slice(0, 9), SHARP.facet); // the chamfer stays a distinct facet up to the hood crease
  b.creaseChain(grid[0], HARD);
  b.creaseChain(grid[NS - 1].slice(0, CORNER + 1), SHARP.facet);
  b.creaseChain(grid[NS - 1].slice(CORNER), HARD);
  // Front fascia: the corner blocks' inboard faces stay crisp.
  b.creaseChain(capFront[5], HARD);
  b.creaseChain(capFront[4], HARD);
  // Rear cap: crisp U-frame legs and the lower edge of the light-bar band.
  b.corner(capRear[4][0]);
  b.corner(capRear[3][0]);

  // ---- Flanges: wheel-well tunnels and underside --------------------------------------------
  const bottom: number[] = [];
  const targets = new Map<number, Vec3>();
  const push = (v: number, t: Vec3) => { if (!targets.has(v)) bottom.push(v); targets.set(v, t); };
  for (let u = 0; u <= 6; u++) {
    const [x, y, z] = b.position(capFront[u][0]);
    push(capFront[u][0], [x * 0.92, y - 0.005, z - 0.26]);
  }
  const archFront = new Set([2, 3, 4, 5]);
  const archRear = new Set([14, 15, 16, 17]);
  for (let s = 1; s < NS - 1; s++) {
    const front = archFront.has(s);
    const inArch = front || archRear.has(s);
    // Wheel-well tunnel: the arch outline extruded inward. The front tunnel roof slopes down inward so
    // it stays under the low fender facets.
    const xin = front ? 0.63 : 0.6;
    const tunnel = (p: Vec3): Vec3 => [xin, front ? p[1] - 0.045 * Math.max(0, (p[1] - 0.5) / 0.2) : p[1], p[2]];
    if (inArch && (s === 2 || s === 14)) {
      for (let j = 0; j <= 4; j++) push(g(s, j), tunnel(b.position(g(s, j))));
    } else if (inArch && (s === 5 || s === 17)) {
      for (let j = 4; j >= 0; j--) push(g(s, j), tunnel(b.position(g(s, j))));
    } else if (inArch) {
      push(g(s, 4), tunnel(b.position(g(s, 4))));
    } else {
      const p = b.position(g(s, 0)); push(g(s, 0), [p[0] - 0.17, p[1] - 0.005, p[2]]);
    }
  }
  for (let u = 6; u >= 0; u--) {
    const [x, y, z] = b.position(capRear[u][0]);
    push(capRear[u][0], [x * (u >= 4 ? 0.96 : 1), y, z + 0.22]); // the outer flange tucks in gently under the corner legs
  }
  b.flange(bottom, (v) => targets.get(v)!, MAT.black, HARD);
  // Keep the arch ends crisp where the sill meets the arch.
  for (const s of [2, 5, 14, 17]) b.corner(g(s, 0));
  // Window, windshield and canopy outlines keep crisp corners.
  b.cornerMaterialTurns(35);
  // The side glass's rear point follows the crease rule instead of being pinned: three surfaces meet
  // there and a pinned corner dimples the sail around it.
  b.cage.corners.delete(g(14, 6));
  b.cage.corners.delete(g(14, 7));
  // Front fender peaks turn crisply from the corner chamfer into the straight fender-peak line.
  b.corner(g(1, 6));
  // A-pillar feet: a crisp line across the foot keeps the narrow pillar strip from folding into the windshield.
  b.crease(g(4, 7), g(4, 8), HARD);

  return { cage: mirrorX(b.cage), grid };
}

type CapPoint = (u: number, w: number, top: Vec3, side: Vec3) => Vec3;

/** Builds the vertex grid of an end cap attached to station `s`. */
function buildCap(b: CageBuilder, grid: (number | undefined)[][], s: number, place: CapPoint): number[][] {
  const C: number[][] = [];
  for (let u = 0; u <= 6; u++) {
    C.push([]);
    for (let w = 0; w <= 5; w++) {
      if (w === 5) C[u].push(grid[s][TOP - u]!);
      else if (u === 6) C[u].push(grid[s][w]!);
      else {
        const top = b.position(grid[s][TOP - u]!);
        const side = b.position(grid[s][w]!);
        const p = place(u, w, top, side);
        if (u === 0) p[0] = 0;
        C[u].push(b.vertex(p));
      }
    }
  }
  return C;
}

function addCapFaces(b: CageBuilder, C: number[][], rear: boolean, mat: (u: number, w: number) => number) {
  for (let u = 0; u < 6; u++) {
    for (let w = 0; w < 5; w++) {
      const q = [C[u][w], C[u + 1][w], C[u + 1][w + 1], C[u][w + 1]];
      // Front cap faces +z: seen from the front, +x is to the right -> u increases to the right.
      b.face(rear ? q.reverse() : q, mat(u, w));
    }
  }
}

// Procedural white aerospace roadster built with Catmull-Clark subdivision surfaces.
// Frame: nose toward +Z, the car's left side toward +X, Y up, tyres on y = 0, length 4.30 m.
// Proportions follow tools/roadster/SPEC-2026.md; the look follows tools/roadster/DESIGN.md.
//
//   body.ts      low-poly control cage of the shell (half, mirrored) with creases and material ids
//   subd.ts      Catmull-Clark subdivision with creases / boundaries, normals split along hard edges
//   surface.ts   ray casting onto the limit surface to lay trim, lights and badges onto the body
//   front.ts     light bar, triangular headlight slits, slatted wing opening, camera, splitter
//   rear.ts      light bars, plate, diffuser box with the four thrusters and fan bays, floor, wing outline
//   trim.ts      shut lines, side marker, reflectors, corner vents, slot-vent channels, underbody
//   wheels.ts    aero wheels (white disc, six hollow-frame spokes) and calipers
//   lathe.ts     surface-of-revolution helper (seamless normals) for the wheels and the rear round parts
//   interior.ts  optional cabin under the canopy, shaped against the shell (off by default: the glass is opaque)
//   clearance.ts build-time checks: no cabin part pokes through the canopy or bodywork, the shell never folds
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildBodyCage, MAT, FRONT_AXLE, REAR_AXLE } from './body.ts';
import { assertCabinClearance, assertNoFolds } from './clearance.ts';
import { buildFront } from './front.ts';
import { buildInterior } from './interior.ts';
import { createMaterials } from './materials.ts';
import { createParts } from './parts.ts';
import { buildRear } from './rear.ts';
import { cageToGeometries, subdivide } from './subd.ts';
import { BodySurface } from './surface.ts';
import { buildTrim } from './trim.ts';
import { buildWheels, type WheelSpec } from './wheels.ts';

export interface RoadsterOptions {
  paint?: string;
  /**
   * Build the cabin (seats, dash, yoke, trims). The bronze canopy is opaque from outside, so the cabin cannot be
   * seen and is left out by default (3 meshes, about 6.5k triangles). Turn it on for a see-through glass variant.
   */
  cabin?: boolean;
}

/**
 * Development builds (the Vite viewer / exporter, or Node) verify that the cabin clears the canopy and body and
 * that the subdivided shell has no folds; a production bundle skips the checks.
 */
const CHECK_CLEARANCE = import.meta.env?.DEV ?? true;

/** Subdivision levels applied to the body cage. */
const LEVELS = 3;
/** Dihedral angle above which shell normals are split. */
const AUTO_SMOOTH = (24 * Math.PI) / 180;

function plateTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#f4f4f1'; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#1d1f22'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, 492, 236);
  ctx.fillStyle = '#16181b';
  ctx.font = 'bold 150px "Arial Narrow", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('RDSTR', 256, 136);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Merges geometries (indexed or not) into one indexed geometry with position + normal only. */
function mergeList(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  // Weld identical vertices (same position and normal) to stay inside the vertex budget.
  return mergeVertices(out, 1e-5);
}

/**
 * Tri-planar UVs (projection along each vertex normal's dominant axis), `tile` metres per texture repeat.
 * Only used for the carbon weave, whose small repeating pattern hides the projection seams.
 */
function addTriplanarUv(geometry: THREE.BufferGeometry, tile: number) {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, w] = ax >= ay && ax >= az ? [p.getZ(i), p.getY(i)] : ay >= az ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / tile; uv[i * 2 + 1] = w / tile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Normalizes every normal; zero-length ones (degenerate lathe poles) get the nearest valid neighbour's. */
function sanitizeNormals(geometry: THREE.BufferGeometry) {
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!normal) return;
  const n = new THREE.Vector3();
  let last = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < normal.count; i++) {
    n.fromBufferAttribute(normal, i);
    const length = n.length();
    if (!(length > 1e-6)) n.copy(last);
    else { n.divideScalar(length); last = n.clone(); }
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  normal.needsUpdate = true;
}

export function buildRoadster(options: RoadsterOptions = {}): THREE.Group {
  const m = createMaterials(options.paint);
  const root = new THREE.Group();
  root.name = 'Roadster';
  const add = (name: string, list: THREE.BufferGeometry[], material: THREE.Material) => {
    if (!list.length) return null;
    const mesh = new THREE.Mesh(list.length === 1 && list[0].index ? list[0] : mergeList(list), material);
    mesh.name = name;
    root.add(mesh);
    return mesh;
  };

  // Body shell: subdivided cage, one geometry per material.
  const { cage } = buildBodyCage();
  // Normals split along hard creases / material borders and wherever the limit surface folds by more than
  // the auto-smooth angle (the semi-sharp character lines), so facet edges read crisp.
  const shell = cageToGeometries(subdivide(cage, LEVELS), { autoSmoothAngle: AUTO_SMOOTH });
  const paintGeo = shell.get(MAT.paint)!, blackGeo = shell.get(MAT.black)!, glassGeo = shell.get(MAT.glass)!;
  const carbonGeo = shell.get(MAT.carbon);
  const opaque = [paintGeo, blackGeo, ...(carbonGeo ? [carbonGeo] : [])];
  if (CHECK_CLEARANCE) assertNoFolds([...opaque, glassGeo]);

  // Details are laid onto the outside of the limit surface (white and black parts of the shell); the optional
  // cabin is shaped and checked against the inside of the whole shell, glass included.
  const surface = new BodySurface(opaque.map((g) => new THREE.Mesh(g)));
  const parts = createParts();
  const rear = buildRear(surface, parts, m.plate);
  buildFront(surface, parts);
  const wellWalls = buildTrim(surface, parts);
  if (options.cabin) {
    const inside = new BodySurface([...opaque, glassGeo, ...wellWalls].map((g) => new THREE.Mesh(g)), { doubleSided: true });
    const cabin = buildInterior(parts, inside);
    if (CHECK_CLEARANCE) assertCabinClearance(inside, cabin);
  }

  add('BodyShell', [paintGeo], m.paint);
  add('LowerBody', [blackGeo, ...parts.black], m.black);
  add('Canopy', [glassGeo, ...parts.glass], m.glass);
  const carbon = add('CarbonParts', [...(carbonGeo ? [carbonGeo] : []), ...parts.carbon], m.carbon);
  if (carbon) addTriplanarUv(carbon.geometry, 0.05);
  add('Brightwork', parts.chrome, m.chrome);
  add('WingOutline', parts.bronze, m.bronze);
  add('ThrusterNozzles', parts.nozzle, m.nozzle);
  add('ThrusterGlow', parts.glow, m.glow);
  add('TailLights', parts.brake, m.brake);
  add('HeadLights', parts.head, m.head);
  add('SideMarkers', parts.marker, m.marker);
  add('Cabin', parts.interior, m.interior);
  add('Seats', parts.seat, m.seat);
  add('CabinTrim', parts.trim, m.trim);
  const texture = plateTexture();
  if (texture) { m.plate.map = texture; m.plate.needsUpdate = true; }
  root.add(rear.plate);
  root.add(...rear.mounts);

  // Wheels: 295/30 R20 front, 335/30 R21 rear; tyre outer faces flush with the body sides.
  const specs: WheelSpec[] = [
    { name: 'WheelFrontL', hub: new THREE.Vector3(0.8, FRONT_AXLE.y, FRONT_AXLE.z), radius: 0.338, width: 0.29, rimRadius: 0.254 },
    { name: 'WheelFrontR', hub: new THREE.Vector3(-0.8, FRONT_AXLE.y, FRONT_AXLE.z), radius: 0.338, width: 0.29, rimRadius: 0.254 },
    { name: 'WheelRearL', hub: new THREE.Vector3(0.795, REAR_AXLE.y, REAR_AXLE.z), radius: 0.362, width: 0.33, rimRadius: 0.267 },
    { name: 'WheelRearR', hub: new THREE.Vector3(-0.795, REAR_AXLE.y, REAR_AXLE.z), radius: 0.362, width: 0.33, rimRadius: 0.267 },
  ];
  const wheels = buildWheels(specs, m);
  root.add(...wheels.nodes);
  add('DarkTitanium', [wheels.calipers, ...parts.titanium], m.caliper); // brake calipers and fan-outlet hubs

  const seen = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || seen.has(object.geometry)) return;
    seen.add(object.geometry);
    sanitizeNormals(object.geometry);
  });

  return root;
}

export default buildRoadster;

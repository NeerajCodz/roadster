import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isCommercial, trafficSpec, type TrafficVehicleSpec } from './traffic-catalog';
import { makeTrafficDecal } from './traffic-decals';

const euler = (x = 0, y = 0, z = 0) => new THREE.Euler(x, y, z);
function bevelBox(w: number, h: number, d: number, r = 0.035) {
  r = Math.min(r, w * 0.22, h * 0.22, d * 0.22);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2 + r);
  shape.lineTo(w / 2 - r, -h / 2 + r);
  shape.lineTo(w / 2 - r, h / 2 - r);
  shape.lineTo(-w / 2 + r, h / 2 - r);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d - 2 * r,
    bevelEnabled: true,
    bevelSize: r,
    bevelThickness: r,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 1,
  });
  g.translate(0, 0, -d / 2 + r);
  return g;
}
class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(
    g: THREE.BufferGeometry,
    m: THREE.Material,
    p: number[] = [0, 0, 0],
    r: THREE.Euler | THREE.Quaternion = euler(),
  ) {
    const flat = g.index ? g.toNonIndexed() : g;
    const q = r instanceof THREE.Quaternion ? r : new THREE.Quaternion().setFromEuler(r);
    flat.applyMatrix4(
      new THREE.Matrix4().compose(new THREE.Vector3().fromArray(p), q, new THREE.Vector3(1, 1, 1)),
    );
    const list = this.parts.get(m) ?? [];
    list.push(flat);
    this.parts.set(m, list);
  }
  box(
    w: number,
    h: number,
    d: number,
    m: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    r: THREE.Euler = euler(),
    round = 0.025,
  ) {
    this.add(bevelBox(w, h, d, round), m, [x, y, z], r);
  }
  beam(a: number[], b: number[], radius: number, m: THREE.Material) {
    const start = new THREE.Vector3().fromArray(a),
      end = new THREE.Vector3().fromArray(b),
      delta = end.clone().sub(start);
    this.add(
      new THREE.CylinderGeometry(radius, radius, delta.length(), 6),
      m,
      start.add(end).multiplyScalar(0.5).toArray(),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()),
    );
  }
  flush(root: THREE.Group) {
    for (const [material, parts] of this.parts) {
      const geometry = mergeGeometries(parts, false)!;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = material.name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    this.parts.clear();
  }
}
function materials(spec: TrafficVehicleSpec) {
  const service: Record<string, string> = {
    taxi: '#dfb52f',
    police: '#e4e5dc',
    ambulance: '#eeeee1',
    fire: '#b73928',
    school: '#dea724',
    parcel: '#e1dfcf',
  };
  const paint = new THREE.MeshPhysicalMaterial({
    name: spec.livery === 'none' ? 'Paint' : 'ServicePaint',
    color: service[spec.livery] ?? '#9fadb2',
    metalness: 0.6,
    roughness: 0.28,
    clearcoat: 0.9,
    clearcoatRoughness: 0.2,
  });
  const trim = new THREE.MeshStandardMaterial({ name: 'Trim', color: '#252d2f', roughness: 0.76 });
  const glass = new THREE.MeshPhysicalMaterial({
    name: 'Glazing',
    color: '#1f3541',
    metalness: 0.32,
    roughness: 0.12,
    clearcoat: 1,
  });
  const chrome = new THREE.MeshStandardMaterial({
    name: 'Chrome',
    color: '#a5aeb0',
    metalness: 0.9,
    roughness: 0.28,
  });
  const rubber = new THREE.MeshStandardMaterial({
    name: 'Tire',
    color: '#151a1b',
    roughness: 0.96,
  });
  const brake = new THREE.MeshStandardMaterial({
    name: 'Brake',
    color: '#ad2418',
    emissive: '#c32919',
    emissiveIntensity: 0.3,
    roughness: 0.3,
  });
  const head = new THREE.MeshStandardMaterial({
    name: 'Headlights',
    color: '#f2efdb',
    emissive: '#ffecc7',
    emissiveIntensity: 0.9,
    roughness: 0.15,
  });
  const cargo = new THREE.MeshStandardMaterial({
    name: 'Cargo',
    color: '#b8bcaf',
    metalness: 0.35,
    roughness: 0.7,
  });
  const plate = new THREE.MeshStandardMaterial({
    name: 'Registration',
    map: makeTrafficDecal(
      `RS ${String((spec.id.length * 137 + spec.length * 47) | 0).padStart(4, '0')}`,
      '#dedfcf',
      '#182124',
      128,
      32,
    ),
    roughness: 0.6,
  });
  const word: Record<string, string> = {
    taxi: 'METRO TAXI',
    police: 'HIGHWAY POLICE',
    ambulance: 'AMBULANCE',
    fire: 'FIRE RESCUE',
    school: 'SCHOOL BUS',
    parcel: 'PARCEL EXPRESS',
  };
  const livery = new THREE.MeshStandardMaterial({
    name: 'ServiceLivery',
    map: makeTrafficDecal(
      word[spec.livery] ?? 'COAST TRANSPORT',
      spec.livery === 'fire'
        ? '#b73928'
        : spec.livery === 'school'
          ? '#dea724'
          : spec.livery === 'taxi'
            ? '#dfb52f'
            : '#e1e3d8',
      spec.livery === 'fire' ? '#fff1cc' : '#253942',
    ),
    roughness: 0.64,
  });
  return { paint, trim, glass, chrome, rubber, brake, head, cargo, plate, livery };
}
type Materials = ReturnType<typeof materials>;

function bodyShell(spec: TrafficVehicleSpec, belt: number, m: Materials, b: Batch) {
  const half = spec.length / 2 - 0.045,
    base = 0.27;
  const shape = new THREE.Shape();
  shape.moveTo(-half, base);
  for (const axle of spec.axles) {
    const radius = spec.wheelRadius * 1.12;
    shape.lineTo(axle - radius, base);
    shape.lineTo(axle - radius, spec.wheelRadius);
    shape.absarc(axle, spec.wheelRadius, radius, Math.PI, 0, true);
    shape.lineTo(axle + radius, base);
  }
  shape.lineTo(half, base);
  shape.lineTo(half, belt - 0.12);
  shape.quadraticCurveTo(half - 0.04, belt, half - 0.25, belt);
  shape.lineTo(-half + 0.3, belt);
  shape.quadraticCurveTo(-half, belt - 0.03, -half, belt - 0.16);
  shape.closePath();
  const width = spec.width - 0.19;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - 0.06,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.03,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 12,
  });
  geometry.translate(0, 0, -width / 2 + 0.03);
  geometry.rotateY(-Math.PI / 2);
  b.add(geometry, m.paint);
}
function cabin(
  b: Batch,
  m: Materials,
  width: number,
  belt: number,
  roof: number,
  front: number,
  rear: number,
  roofFront: number,
  roofRear: number,
) {
  const low = width * 0.46,
    high = width * 0.36;
  const pts = [
    [-low, belt, front],
    [low, belt, front],
    [-high, roof, roofFront],
    [high, roof, roofFront],
    [-low, belt, rear],
    [low, belt, rear],
    [-high, roof, roofRear],
    [high, roof, roofRear],
  ];
  const faces = [
    [0, 1, 3, 2],
    [1, 5, 7, 3],
    [5, 4, 6, 7],
    [4, 0, 2, 6],
    [2, 3, 7, 6],
    [4, 5, 1, 0],
  ];
  const pos: number[] = [],
    uv: number[] = [];
  for (const f of faces)
    for (const i of [0, 2, 1, 0, 3, 2]) {
      pos.push(...pts[f[i]]);
      uv.push(
        ...[
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ][i],
      );
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  b.add(geo, m.glass);
  b.box(
    width * 0.73,
    0.055,
    roofRear - roofFront + 0.06,
    m.paint,
    0,
    roof - 0.016,
    (roofFront + roofRear) / 2,
  );
  for (const side of [-1, 1]) {
    b.beam([side * low, belt, front], [side * high, roof, roofFront], 0.035, m.paint);
    b.beam([side * high, roof, roofRear], [side * low, belt, rear], 0.04, m.paint);
    const center = (roofFront + roofRear) * 0.5;
    b.beam([side * low, belt, center], [side * high, roof, center], 0.028, m.trim);
    b.box(0.025, 0.045, rear - front, m.chrome, side * low, belt + 0.015, (front + rear) / 2);
  }
}
function lampsAndTrim(s: TrafficVehicleSpec, m: Materials, b: Batch, heavy = false) {
  const half = s.length / 2,
    lampY = heavy ? 0.96 : 0.65,
    bumperY = heavy ? 0.56 : 0.4;
  b.box(s.width * 0.88, 0.14, 0.14, m.trim, 0, bumperY, -half + 0.07);
  b.box(s.width * 0.88, 0.14, 0.14, m.trim, 0, bumperY, half - 0.07);
  b.box(s.width * 0.37, heavy ? 0.3 : 0.16, 0.055, m.trim, 0, lampY - 0.03, -half + 0.03);
  for (let i = 0; i < 5; i++)
    b.box(s.width * 0.33, 0.012, 0.012, m.chrome, 0, lampY - 0.09 + i * 0.035, -half + 0.001);
  for (const side of [-1, 1]) {
    b.box(
      s.width * 0.23,
      heavy ? 0.13 : 0.095,
      0.065,
      m.head,
      side * s.width * 0.32,
      lampY,
      -half + 0.031,
    );
    b.box(
      s.width * 0.2,
      heavy ? 0.18 : 0.1,
      0.065,
      m.brake,
      side * s.width * 0.33,
      lampY,
      half - 0.032,
    );
    b.box(
      0.13,
      0.08,
      0.24,
      m.trim,
      side * (s.width / 2 - 0.067),
      heavy ? 1.7 : 0.95,
      -s.length * 0.17,
    );
    b.box(
      0.012,
      0.06,
      0.16,
      m.chrome,
      side * (s.width / 2 - 0.003),
      heavy ? 1.7 : 0.95,
      -s.length * 0.17,
    );
  }
  b.add(new THREE.PlaneGeometry(0.43, 0.12), m.plate, [0, bumperY + 0.06, half + 0.001]);
  b.add(
    new THREE.PlaneGeometry(0.43, 0.12),
    m.plate,
    [0, bumperY + 0.06, -half - 0.001],
    euler(0, Math.PI, 0),
  );
}
function servicePanels(
  s: TrafficVehicleSpec,
  m: Materials,
  b: Batch,
  y: number,
  z = 0,
  length = 1.7,
) {
  if (s.livery === 'none') return;
  const panelX =
    s.livery === 'fire' ? s.width * 0.452 : isCommercial(s) ? s.width * 0.485 : s.width / 2 - 0.085;
  for (const side of [-1, 1]) {
    b.add(
      new THREE.PlaneGeometry(length, 0.3),
      m.livery,
      [side * panelX, y, z],
      euler(0, (side * Math.PI) / 2, 0),
    );
  }
}
function emergencyLights(
  root: THREE.Group,
  s: TrafficVehicleSpec,
  b: Batch,
  m: Materials,
  roof: number,
  z = 0,
) {
  b.box(0.85, 0.045, 0.24, m.trim, 0, roof + 0.025, z);
  for (const [side, color] of [
    [-1, '#ec3b20'],
    [1, '#4a99e5'],
  ] as const) {
    const mat = new THREE.MeshStandardMaterial({
      name: 'EmergencyLight',
      color,
      emissive: color,
      emissiveIntensity: 2,
      roughness: 0.2,
    });
    const light = new THREE.Mesh(bevelBox(0.36, 0.1, 0.22, 0.025), mat);
    light.name = side < 0 ? 'EmergencyLeft' : 'EmergencyRight';
    light.position.set(side * 0.23, roof + 0.1, z);
    root.add(light);
  }
}
function addWheels(root: THREE.Group, s: TrafficVehicleSpec, m: Materials) {
  const r = s.wheelRadius,
    w = Math.min(0.28, s.width * 0.115);
  for (const [index, z] of s.axles.entries())
    for (const side of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.name = `TrafficWheel${index}${side < 0 ? 'L' : 'R'}`;
      wheel.userData = { trafficWheel: true, radius: r, frontAxle: index === 0 };
      wheel.position.set(side * (s.width / 2 - w / 2), r, z);
      const lathe = [
        new THREE.Vector2(r * 0.61, -w / 2),
        new THREE.Vector2(r * 0.84, -w / 2),
        new THREE.Vector2(r * 0.97, -w * 0.36),
        new THREE.Vector2(r, -w * 0.2),
        new THREE.Vector2(r, w * 0.2),
        new THREE.Vector2(r * 0.97, w * 0.36),
        new THREE.Vector2(r * 0.84, w / 2),
        new THREE.Vector2(r * 0.61, w / 2),
      ];
      const tireGeometry = new THREE.LatheGeometry(lathe, 20);
      tireGeometry.rotateZ(Math.PI / 2);
      const tire = new THREE.Mesh(tireGeometry, m.rubber);
      tire.castShadow = true;
      wheel.add(tire);
      const rimBatch = new Batch();
      rimBatch.add(
        new THREE.CylinderGeometry(r * 0.57, r * 0.57, w * 0.85, 16),
        m.chrome,
        [0, 0, 0],
        euler(0, 0, Math.PI / 2),
      );
      for (const face of [-1, 1]) {
        const x = face * w * 0.49;
        rimBatch.add(
          new THREE.TorusGeometry(r * 0.63, r * 0.045, 6, 18),
          m.chrome,
          [x, 0, 0],
          euler(0, Math.PI / 2, 0),
        );
        for (let spoke = 0; spoke < 6; spoke++) {
          const a = (spoke * Math.PI) / 3;
          rimBatch.box(
            w * 0.02,
            r * 0.75,
            r * 0.08,
            m.chrome,
            x,
            Math.cos(a) * r * 0.23,
            Math.sin(a) * r * 0.23,
            euler(a, 0, 0),
            0.003,
          );
        }
      }
      rimBatch.flush(wheel);
      root.add(wheel);
    }
}

function passenger(root: THREE.Group, s: TrafficVehicleSpec, m: Materials, b: Batch) {
  const L = s.length,
    W = s.width,
    H = s.height;
  const van = s.family === 'van',
    pickup = s.family === 'pickup',
    suv = s.family === 'suv',
    sport = s.family === 'sports';
  const emergency = ['police', 'ambulance'].includes(s.livery);
  const equipment = emergency ? 0.15 : s.livery === 'taxi' ? 0.2 : s.id === 'offroad' ? 0.17 : 0;
  const roof = H - equipment;
  const belt = Math.max(
    s.wheelRadius * 2.15,
    Math.min(roof - 0.45, van || suv ? 0.98 : sport ? 0.68 : 0.82),
  );
  bodyShell(s, belt, m, b);
  let front = -L * 0.2,
    rear = L * 0.29,
    rf = -L * 0.07,
    rr = L * 0.13;
  if (s.family === 'hatch') {
    rear = L * 0.4;
    rr = L * 0.28;
  }
  if (s.family === 'wagon') {
    rear = L * 0.43;
    rr = L * 0.31;
  }
  if (suv) {
    front = -L * 0.24;
    rf = -L * 0.13;
    rear = L * 0.43;
    rr = L * 0.33;
  }
  if (sport) {
    front = -L * 0.21;
    rf = -L * 0.06;
    rear = L * 0.28;
    rr = L * 0.1;
  }
  if (pickup) {
    front = -L * 0.24;
    rf = -L * 0.12;
    rear = L * 0.11;
    rr = L * 0.04;
  }
  if (van) {
    front = -L * 0.38;
    rf = -L * 0.29;
    rear = L * 0.46;
    rr = L * 0.4;
  }
  if (van && s.id !== 'minivan') {
    const cargoStart = -L * 0.03,
      cargoEnd = L / 2 - 0.08;
    b.box(
      W * 0.87,
      roof - belt,
      cargoEnd - cargoStart,
      m.paint,
      0,
      (roof + belt) / 2,
      (cargoEnd + cargoStart) / 2,
      euler(),
      0.07,
    );
    cabin(b, m, W * 0.94, belt, roof - 0.04, front, cargoStart + 0.03, rf, -L * 0.08);
    for (const side of [-1, 1]) {
      b.box(
        0.025,
        0.035,
        cargoEnd - cargoStart - 0.18,
        m.trim,
        side * W * 0.438,
        belt + 0.15,
        (cargoEnd + cargoStart) / 2,
      );
      b.box(0.035, 0.045, 0.22, m.chrome, side * W * 0.446, belt + 0.58, 0.2);
    }
    b.box(0.025, roof - belt - 0.12, 0.02, m.trim, 0, (roof + belt) / 2, cargoEnd + 0.006);
    for (const x of [-W * 0.23, W * 0.23])
      b.box(0.035, 0.24, 0.025, m.chrome, x, belt + 0.45, cargoEnd + 0.025);
    // A flat roof panel gives the cargo body its declared maximum height.
    b.box(
      W * 0.86,
      0.04,
      cargoEnd - cargoStart,
      m.paint,
      0,
      roof - 0.02,
      (cargoEnd + cargoStart) / 2,
    );
  } else cabin(b, m, W, belt, roof, front, rear, rf, rr);
  for (const side of [-1, 1]) {
    for (const z of [front * 0.45, rear * 0.65]) {
      b.box(0.022, 0.032, 0.18, m.chrome, side * (W * 0.46), belt - 0.1, z);
      b.box(0.012, belt - 0.3, 0.014, m.trim, side * (W * 0.455), (0.3 + belt) / 2, z + 0.17);
    }
    b.box(0.035, 0.09, L * 0.68, m.trim, side * W * 0.455, 0.32, 0);
  }
  if (pickup) {
    const start = rear + 0.05,
      end = L / 2 - 0.13;
    b.box(W * 0.77, 0.06, end - start, m.trim, 0, belt - 0.04, (start + end) / 2);
    for (const side of [-1, 1])
      b.box(0.14, 0.23, end - start, m.paint, side * W * 0.415, belt + 0.07, (start + end) / 2);
    b.box(W * 0.84, 0.23, 0.13, m.paint, 0, belt + 0.07, end);
    b.box(0.3, 0.04, 0.025, m.chrome, 0, belt + 0.13, end + 0.068);
  }
  if (suv || s.family === 'wagon' || s.id === 'minivan')
    for (const side of [-1, 1]) {
      b.beam(
        [side * W * 0.28, roof + 0.005, rf + 0.1],
        [side * W * 0.28, roof + 0.005, rr - 0.1],
        0.022,
        m.chrome,
      );
    }
  if (s.id === 'offroad') {
    b.box(W * 0.63, 0.09, (rr - rf) * 0.9, m.trim, 0, H - 0.045, (rr + rf) / 2);
    for (let i = 0; i < 4; i++)
      b.box(
        0.035,
        0.07,
        (rr - rf) * 0.86,
        m.chrome,
        -W * 0.23 + i * W * 0.153,
        H - 0.065,
        (rr + rf) / 2,
      );
    b.add(
      new THREE.CylinderGeometry(0.3, 0.3, 0.16, 18),
      m.rubber,
      [0, 0.95, L / 2 - 0.085],
      euler(Math.PI / 2, 0, 0),
    );
  }
  if (s.id === 'executive') b.box(W * 0.55, 0.014, 0.7, m.glass, 0, roof + 0.011, (rf + rr) / 2);
  if (sport) {
    b.box(W * 0.74, 0.055, 0.24, m.trim, 0, belt + 0.17, L * 0.35);
    for (const x of [-W * 0.26, W * 0.26])
      b.box(0.035, 0.18, 0.07, m.trim, x, belt + 0.1, L * 0.35);
  }
  if (s.id === 'minivan')
    for (const side of [-1, 1])
      b.box(0.025, 0.018, L * 0.35, m.chrome, side * W * 0.46, belt + 0.1, L * 0.15);
  lampsAndTrim(s, m, b);
  if (s.livery === 'taxi') {
    b.box(0.53, 0.18, 0.24, m.paint, 0, H - 0.09, 0);
    const taxiSign = new THREE.MeshStandardMaterial({
      name: 'TaxiSign',
      map: makeTrafficDecal('TAXI', '#dfb52f', '#182124', 128, 32),
      roughness: 0.5,
    });
    for (const side of [-1, 1])
      b.add(
        new THREE.PlaneGeometry(0.5, 0.13),
        taxiSign,
        [0, H - 0.09, side * 0.121],
        euler(0, side < 0 ? Math.PI : 0, 0),
      );
    for (const side of [-1, 1])
      for (let i = 0; i < 12; i++)
        b.box(
          0.02,
          0.06,
          0.08,
          i % 2 ? m.trim : m.paint,
          side * W * 0.46,
          belt - 0.16,
          -0.8 + i * 0.14,
        );
  }
  servicePanels(s, m, b, belt - 0.06, 0, Math.min(1.8, L * 0.4));
  if (emergency) emergencyLights(root, s, b, m, roof);
  if (s.livery === 'ambulance')
    for (const side of [-1, 1]) {
      b.box(0.02, 0.16, L * 0.62, m.brake, side * W * 0.438, 1.25, L * 0.1);
      b.box(0.025, 0.46, 0.14, m.brake, side * W * 0.445, 1.8, L * 0.25);
      b.box(0.025, 0.14, 0.46, m.brake, side * W * 0.447, 1.8, L * 0.25);
    }
}

function truckCab(s: TrafficVehicleSpec, m: Materials, b: Batch, cabLength: number, roof: number) {
  const front = -s.length / 2,
    rear = front + cabLength;
  b.box(
    s.width * 0.89,
    roof - 0.57,
    cabLength - 0.14,
    m.paint,
    0,
    (roof + 0.57) / 2,
    (front + rear) / 2,
    euler(),
    0.09,
  );
  b.box(s.width * 0.76, 0.63, 0.025, m.glass, 0, roof - 0.48, front + 0.09, euler(-0.1, 0, 0));
  b.box(0.055, 0.67, 0.04, m.paint, 0, roof - 0.48, front + 0.05);
  for (const side of [-1, 1]) {
    b.box(
      0.035,
      0.58,
      cabLength * 0.5,
      m.glass,
      side * s.width * 0.449,
      roof - 0.48,
      rear - cabLength * 0.35,
    );
    b.box(0.025, 0.04, 0.22, m.chrome, side * s.width * 0.458, roof - 0.91, rear - 0.44);
    b.box(0.16, 0.16, 0.8, m.chrome, side * s.width * 0.43, 0.5, rear - 0.6);
  }
  b.box(s.width * 0.82, 0.07, cabLength * 0.8, m.paint, 0, roof - 0.02, (front + rear) / 2);
  return rear;
}
function loadCar(b: Batch, m: Materials, z: number, y: number, w: number, l: number) {
  b.box(w, 0.35, l, m.cargo, 0, y + 0.3, z, euler(), 0.09);
  b.box(w * 0.74, 0.43, l * 0.46, m.glass, 0, y + 0.65, z + 0.1, euler(), 0.08);
  for (const x of [-w * 0.48, w * 0.48])
    for (const end of [-1, 1])
      b.add(
        new THREE.CylinderGeometry(0.21, 0.21, 0.12, 12),
        m.rubber,
        [x, y + 0.21, z + end * l * 0.29],
        euler(0, 0, Math.PI / 2),
      );
}
function commercial(root: THREE.Group, s: TrafficVehicleSpec, m: Materials, b: Batch) {
  const L = s.length,
    W = s.width,
    H = s.height,
    front = -L / 2,
    rear = L / 2;
  b.box(W * 0.72, 0.24, L * 0.96, m.trim, 0, 0.62, 0);
  if (s.family === 'bus') {
    const school = s.livery === 'school';
    const start = front + (school ? 1.3 : 0.08),
      length = rear - 0.08 - start;
    b.box(
      W * 0.9,
      H - 0.66,
      length,
      m.paint,
      0,
      (H + 0.66) / 2,
      (start + rear - 0.08) / 2,
      euler(),
      0.1,
    );
    if (school) b.box(W * 0.82, 0.5, 1.28, m.paint, 0, 1.15, front + 0.67, euler(), 0.08);
    b.box(W * 0.78, 0.78, 0.025, m.glass, 0, H - 0.72, start - 0.012);
    b.add(
      new THREE.PlaneGeometry(W * 0.65, 0.22),
      m.livery,
      [0, H - 0.23, start - 0.025],
      euler(0, Math.PI, 0),
    );
    const n = school ? 8 : 12;
    for (const side of [-1, 1]) {
      for (let i = 0; i < n; i++)
        b.box(
          0.025,
          0.78,
          (length / (n + 1)) * 0.79,
          m.glass,
          side * W * 0.454,
          H - 0.78,
          start + 0.5 + (i * (length - 0.8)) / n,
        );
      b.box(0.03, 0.06, length * 0.94, m.trim, side * W * 0.458, 0.97, (start + rear) / 2);
      if (school)
        b.box(0.04, 0.045, length * 0.95, m.trim, side * W * 0.458, 1.22, (start + rear) / 2);
    }
    for (let i = 0; i < 7; i++)
      b.box(W * 0.53, 0.025, 0.04, m.trim, 0, 1.17 + i * 0.075, rear - 0.02);
    b.box(0.9, 0.06, 1.1, m.cargo, 0, H - 0.025, L * 0.1);
    lampsAndTrim(s, m, b, true);
    return;
  }
  const cabLength =
    s.family === 'carrier' ? 3.3 : s.family === 'semi' || s.family === 'tanker' ? 3.1 : 2.35;
  const cabRoof = Math.min(
    H - 0.12,
    s.family === 'carrier' ? 2.65 : s.family === 'tanker' ? 2.8 : 2.75,
  );
  const cabRear = truckCab(s, m, b, cabLength, cabRoof);
  const cargoFront = cabRear + 0.14,
    cargoRear = rear - 0.1,
    cargoLength = cargoRear - cargoFront,
    center = (cargoFront + cargoRear) / 2;
  if (s.family === 'tanker') {
    const radius = Math.min(W * 0.44, (H - 1.0) / 2),
      tankLength = cargoLength - 0.1;
    const g = new THREE.CapsuleGeometry(radius, Math.max(0.2, tankLength - 2 * radius), 5, 20);
    g.rotateX(Math.PI / 2);
    b.add(g, m.chrome, [0, H - radius - 0.06, center]);
    for (const z of [center - tankLength * 0.28, center + tankLength * 0.28])
      b.add(new THREE.TorusGeometry(radius + 0.025, 0.035, 6, 20), m.trim, [
        0,
        H - radius - 0.06,
        z,
      ]);
    for (const side of [-1, 1])
      b.beam(
        [side * 0.35, H - 0.02, cargoFront + 0.5],
        [side * 0.35, H - 0.02, cargoRear - 0.5],
        0.025,
        m.trim,
      );
    b.box(0.5, 0.025, 0.65, m.cargo, 0, H - 0.013, center);
  } else if (s.family === 'flatbed') {
    b.box(W * 0.94, 0.16, cargoLength, m.cargo, 0, 1.02, center);
    for (let i = 0; i < 5; i++)
      b.box(W * 0.14, 0.035, cargoLength - 0.1, m.trim, -W * 0.34 + i * W * 0.17, 1.12, center);
    const wood = new THREE.MeshStandardMaterial({
      name: 'CrateWood',
      color: '#9a7c50',
      roughness: 0.92,
    });
    for (const z of [center - cargoLength * 0.24, center + cargoLength * 0.24]) {
      b.box(W * 0.74, 1.0, cargoLength * 0.34, wood, 0, 1.62, z, euler(), 0.018);
      for (const side of [-1, 1])
        b.box(0.04, 1.05, cargoLength * 0.35, m.trim, side * W * 0.27, 1.64, z);
      b.box(W * 0.76, 0.06, 0.14, m.trim, 0, 2.15, z);
    }
    b.box(W * 0.82, 0.08, 0.4, m.paint, 0, H - 0.04, cabRear - 0.4);
  } else if (s.family === 'carrier') {
    const upper = H - 1.22;
    for (const y of [0.99, upper]) {
      for (const x of [-W * 0.35, W * 0.35]) b.box(0.34, 0.12, cargoLength, m.cargo, x, y, center);
      for (const z of [cargoFront + 0.15, center, cargoRear - 0.15])
        b.box(W * 0.86, 0.08, 0.1, m.chrome, 0, y, z);
    }
    for (const side of [-1, 1]) {
      for (const z of [cargoFront + 0.1, center, cargoRear - 0.1])
        b.beam([side * W * 0.43, 1, z], [side * W * 0.43, H - 0.03, z], 0.035, m.paint);
      b.beam(
        [side * W * 0.43, H - 0.025, cargoFront],
        [side * W * 0.43, H - 0.025, cargoRear],
        0.025,
        m.chrome,
      );
    }
    const carLength = Math.min(3.4, (cargoLength - 0.8) / 2);
    for (const y of [1.08, upper + 0.1])
      for (const z of [center - cargoLength * 0.26, center + cargoLength * 0.26])
        loadCar(b, m, z, y, W * 0.65, carLength);
  } else if (s.livery === 'fire') {
    const bodyRoof = H - 0.18;
    b.box(
      W * 0.9,
      bodyRoof - 1.15,
      cargoLength,
      m.paint,
      0,
      (bodyRoof + 1.15) / 2,
      center,
      euler(),
      0.06,
    );
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const z = cargoFront + 0.3 + (i * (cargoLength - 0.5)) / 4;
        b.box(0.03, 1.05, cargoLength * 0.2, m.chrome, side * W * 0.455, 1.7, z);
        for (let slat = 0; slat < 6; slat++)
          b.box(0.04, 0.015, cargoLength * 0.18, m.trim, side * W * 0.47, 1.25 + slat * 0.16, z);
      }
    for (const side of [-1, 1])
      b.beam(
        [side * 0.4, H - 0.04, cargoFront + 0.15],
        [side * 0.4, H - 0.04, cargoRear - 0.15],
        0.03,
        m.chrome,
      );
    for (let i = 0; i < 12; i++)
      b.box(
        0.82,
        0.03,
        0.035,
        m.chrome,
        0,
        H - 0.04,
        cargoFront + 0.2 + (i * (cargoLength - 0.4)) / 12,
      );
    emergencyLights(root, s, b, m, cabRoof, front + cabLength / 2);
    servicePanels(s, m, b, 2.55, center, 2.3);
  } else {
    b.box(W * 0.94, H - 1.05, cargoLength, m.cargo, 0, (H + 1.05) / 2, center, euler(), 0.045);
    for (const side of [-1, 1])
      for (let i = 0; i < Math.ceil(cargoLength / 0.34); i++)
        b.box(
          0.018,
          H - 1.23,
          0.025,
          m.chrome,
          side * W * 0.475,
          (H + 1.05) / 2,
          cargoFront + 0.1 + i * 0.32,
        );
    b.box(0.03, H - 1.2, 0.04, m.trim, 0, (H + 1.05) / 2, cargoRear + 0.031);
    for (const x of [-W * 0.3, W * 0.3])
      b.box(0.035, H * 0.33, 0.05, m.chrome, x, H * 0.5, cargoRear + 0.03);
    if (s.livery !== 'none') servicePanels(s, m, b, 2.2, center, Math.min(3, cargoLength * 0.8));
  }
  lampsAndTrim(s, m, b, true);
}

/** Detailed models share static draw batches and keep their wheel roots independent. */
export function createTrafficVehicle(variant: number): THREE.Group {
  const spec = trafficSpec(variant),
    root = new THREE.Group(),
    m = materials(spec),
    batch = new Batch();
  root.name = spec.name;
  root.userData = { vehicleId: spec.id, vehicleFamily: spec.family };
  if (isCommercial(spec)) commercial(root, spec, m, batch);
  else passenger(root, spec, m, batch);
  batch.flush(root);
  addWheels(root, spec, m);
  return root;
}

const animations = new WeakMap<
  THREE.Group,
  { time: number; wheels: THREE.Object3D[]; emergency: THREE.Object3D[] }
>();
export function animateTrafficVehicle(
  group: THREE.Group,
  time: number,
  speed: number,
  steer = 0,
): void {
  let state = animations.get(group);
  if (!state) {
    const wheels: THREE.Object3D[] = [],
      emergency: THREE.Object3D[] = [];
    group.traverse((node) => {
      if (node.userData.trafficWheel) wheels.push(node);
      if (/^Emergency(?:Left|Right)$/.test(node.name)) emergency.push(node);
    });
    state = { time, wheels, emergency };
    animations.set(group, state);
  }
  const dt = Math.max(0, Math.min(0.1, time - state.time));
  state.time = time;
  for (const wheel of state.wheels) {
    wheel.rotation.x -= (dt * speed) / (Number(wheel.userData.radius) || 0.35);
    if (wheel.userData.frontAxle) wheel.rotation.y = steer;
  }
  for (const [index, light] of state.emergency.entries())
    light.visible = Math.floor(time * 5 + index) % 2 === 0;
}

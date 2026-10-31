import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { normalizeRampKind, RAMP_LAYOUT, sampleRamp, type RampKind } from './ramp-layout';

/** Original Volt launch hardware. The mesh and tyre support use the same sampled surface. */
export function createLaunchRamp(kind: RampKind): THREE.Group {
  const root = new THREE.Group();
  root.name = `Volt-${kind}`;
  root.userData.rampKind = kind;
  const batches = new Map<string, THREE.BufferGeometry[]>();
  const materials: Record<string, THREE.MeshStandardMaterial> = {
    RidingDeck: new THREE.MeshStandardMaterial({
      color: '#29352d',
      metalness: 0.72,
      roughness: 0.48,
    }),
    StructuralFrame: new THREE.MeshStandardMaterial({
      color: '#111b17',
      metalness: 0.65,
      roughness: 0.55,
    }),
    EdgeGlow: new THREE.MeshStandardMaterial({
      color: '#dcf569',
      emissive: '#dcf569',
      emissiveIntensity: 1.6,
      roughness: 0.35,
    }),
    Trim: new THREE.MeshStandardMaterial({ color: '#aab9af', metalness: 0.88, roughness: 0.32 }),
    DirectionMarkings: new THREE.MeshStandardMaterial({
      color: '#dcf569',
      emissive: '#dcf569',
      emissiveIntensity: 0.3,
      roughness: 0.6,
    }),
    Fixings: new THREE.MeshStandardMaterial({ color: '#dae0d8', metalness: 0.9, roughness: 0.3 }),
    Grip: new THREE.MeshStandardMaterial({ color: '#131c17', roughness: 0.95 }),
  };
  function add(name: string, geometry: THREE.BufferGeometry) {
    geometry.deleteAttribute('uv');
    const geometries = batches.get(name) ?? [];
    geometries.push(geometry);
    batches.set(name, geometries);
  }
  function box(name: string, size: number[], position: number[]) {
    add(
      name,
      new THREE.BoxGeometry(...(size as [number, number, number])).translate(
        ...(position as [number, number, number]),
      ),
    );
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const direction = b.clone().sub(a);
    if (direction.length() < 0.001) return;
    const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 6);
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
    );
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    add(name, geometry);
  }
  function point(t: number, u: number, lift = 0) {
    const p = sampleRamp(kind, t, u);
    return new THREE.Vector3(p.x, lift < 0 ? Math.max(0.065, p.y + lift) : p.y + lift, p.z);
  }
  const positions: number[] = [],
    indices: number[] = [];
  const segments = 64,
    across = 8;
  for (let layer = 0; layer < 2; layer++) {
    for (let row = 0; row <= segments; row++)
      for (let col = 0; col <= across; col++) {
        const p = sampleRamp(kind, row / segments, (col / across) * 2 - 1);
        positions.push(p.x, layer ? Math.max(0, p.y - RAMP_LAYOUT.deckThickness) : p.y, p.z);
      }
  }
  const layerSize = (segments + 1) * (across + 1);
  for (let row = 0; row < segments; row++)
    for (let col = 0; col < across; col++) {
      const a = row * (across + 1) + col,
        b = a + 1,
        c = a + across + 2,
        d = c - 1;
      indices.push(
        a,
        b,
        c,
        a,
        c,
        d,
        a + layerSize,
        c + layerSize,
        b + layerSize,
        a + layerSize,
        d + layerSize,
        c + layerSize,
      );
    }
  function edge(a: number, b: number) {
    indices.push(a, a + layerSize, b + layerSize, a, b + layerSize, b);
  }
  for (let row = 0; row < segments; row++) {
    edge((row + 1) * (across + 1), row * (across + 1));
    edge(row * (across + 1) + across, (row + 1) * (across + 1) + across);
  }
  for (let col = 0; col < across; col++) {
    edge(col, col + 1);
    edge(layerSize - 1 - col, layerSize - 2 - col);
  }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  deck.setIndex(indices);
  deck.computeVertexNormals();
  add('RidingDeck', deck);
  box('Trim', [3.2, 0.04, 0.28], [0, 0.02, 3.94]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 40; i++) {
      beam('Trim', point(i / 40, side, 0.045), point((i + 1) / 40, side, 0.045), 0.037);
      beam(
        'EdgeGlow',
        point(i / 40, side * 0.965, 0.075),
        point((i + 1) / 40, side * 0.965, 0.075),
        0.025,
      );
      beam(
        'StructuralFrame',
        point(i / 40, side * 0.82, -0.12),
        point((i + 1) / 40, side * 0.82, -0.12),
        0.065,
      );
    }
    let previous: THREE.Vector3 | undefined;
    for (const t of [0.18, 0.38, 0.58, 0.78, 0.98]) {
      const top = point(t, side * 0.82, -0.12),
        foot = new THREE.Vector3(top.x, 0.07, top.z);
      box('StructuralFrame', [0.27, 0.14, 0.44], [foot.x, 0.07, foot.z]);
      beam('StructuralFrame', foot, top, 0.055);
      if (previous) beam('StructuralFrame', previous, top, 0.032);
      previous = foot;
      const bolt = point(t, side * 0.89, 0.06);
      beam('Fixings', bolt, bolt.clone().add(new THREE.Vector3(0, 0.025, 0)), 0.045);
    }
  }
  for (let i = 1; i < 18; i++) {
    const t = i / 18;
    beam('Grip', point(t, -0.78, 0.012), point(t, 0.78, 0.012), 0.012);
    if (i % 3 === 0) beam('StructuralFrame', point(t, -0.82, -0.15), point(t, 0.82, -0.15), 0.045);
  }
  for (const t of [0.23, 0.48, 0.73]) {
    beam('DirectionMarkings', point(t - 0.055, -0.32, 0.027), point(t + 0.055, 0, 0.027), 0.045);
    beam('DirectionMarkings', point(t - 0.055, 0.32, 0.027), point(t + 0.055, 0, 0.027), 0.045);
  }
  for (const [name, geometries] of batches) {
    const merged = mergeGeometries(geometries, false)!;
    const mesh = new THREE.Mesh(merged, materials[name]);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    for (const geometry of geometries) geometry.dispose();
  }
  const pulse = new THREE.SphereGeometry(0.052, 8, 6);
  for (let i = 0; i < 6; i++) {
    const light = new THREE.Mesh(pulse, materials.EdgeGlow);
    light.name = `FlowPulse${i}`;
    root.add(light);
  }
  animateLaunchRamp(root, 0);
  return root;
}

/** Transform-only animation is safe for pooled clones and freezes with run time. */
export function animateLaunchRamp(group: THREE.Group, time: number): void {
  const kind = normalizeRampKind(group.userData.rampKind);
  for (let i = 0; i < 6; i++) {
    const light = group.getObjectByName(`FlowPulse${i}`);
    const t = ((Number.isFinite(time) ? time : 0) * 0.6 + (i % 3) / 3) % 1;
    const p = sampleRamp(kind, t, i < 3 ? -0.965 : 0.965);
    light?.position.set(p.x, p.y + 0.08, p.z);
  }
}

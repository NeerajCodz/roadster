import type { GameState } from './simulation';
import * as THREE from 'three';

interface Position {
  x: number;
  y: number;
  z: number;
}

/** Keep presentation movement separate from the camera's cinematic smoothing. */
export function updatePlayerPosition(
  position: Position,
  state: Pick<GameState, 'status' | 'x' | 'y'>,
  dt: number,
): void {
  if (state.status !== 'menu') {
    position.x = state.x;
    position.y = state.y;
    position.z = 0;
    return;
  }
  const blend = 1 - Math.exp(-dt * 14);
  position.x += -position.x * blend;
  position.y += -position.y * blend;
  position.z += -position.z * blend;
}

export interface TrafficLights {
  brakes: THREE.MeshStandardMaterial[];
  left: THREE.Group;
  right: THREE.Group;
  geometry: THREE.BoxGeometry;
  material: THREE.MeshStandardMaterial;
}

/** Each pooled vehicle owns its changing light materials; asset geometry remains shared. */
export function createTrafficLights(vehicle: THREE.Group): TrafficLights {
  const copies = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
  vehicle.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const independentBrake = (original: THREE.Material): THREE.Material => {
      if (
        !(original instanceof THREE.MeshStandardMaterial) ||
        !/^(brake|brakelight)$/i.test(original.name)
      )
        return original;
      let copy = copies.get(original);
      if (!copy) {
        copy = original.clone();
        copy.emissive.set('#ff2514');
        copies.set(original, copy);
      }
      return copy;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(independentBrake)
      : independentBrake(object.material);
  });

  vehicle.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(vehicle, true);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = vehicle.getWorldScale(new THREE.Vector3());
  const geometry = new THREE.BoxGeometry(0.22, 0.12, 0.08);
  const material = new THREE.MeshStandardMaterial({
    color: '#ffb526',
    emissive: '#ff970b',
    emissiveIntensity: 3,
    roughness: 0.4,
  });
  const left = new THREE.Group();
  const right = new THREE.Group();
  for (const [direction, group] of [
    [-1, left],
    [1, right],
  ] as const) {
    for (const z of [bounds.min.z - 0.05, bounds.max.z + 0.05]) {
      const lamp = new THREE.Mesh(geometry, material);
      lamp.position.copy(
        vehicle.worldToLocal(
          new THREE.Vector3(
            center.x + direction * Math.max(0.25, size.x / 2 - 0.16),
            bounds.min.y + Math.min(1.6, size.y * 0.6),
            z,
          ),
        ),
      );
      lamp.scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);
      group.add(lamp);
    }
    group.visible = false;
    vehicle.add(group);
  }
  return { brakes: [...copies.values()], left, right, geometry, material };
}

export function updateTrafficLights(
  lights: TrafficLights,
  traffic: { signal?: -1 | 0 | 1; braking?: boolean },
  time: number,
): void {
  const blink = time % 0.8 < 0.4;
  lights.left.visible = traffic.signal === -1 && blink;
  lights.right.visible = traffic.signal === 1 && blink;
  for (const material of lights.brakes) material.emissiveIntensity = traffic.braking ? 3 : 0.3;
}

/** Release instance-only resources without disposing the shared vehicle geometry. */
export function disposeTrafficLights(lights: TrafficLights): void {
  for (const material of lights.brakes) material.dispose();
  lights.geometry.dispose();
  lights.material.dispose();
}

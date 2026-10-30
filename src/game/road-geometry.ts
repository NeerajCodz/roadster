import * as THREE from 'three';
import { gantryFor } from './road-layout';
import { directionForLane, LANE_WIDTH, roadFor, type RoadModeId } from './run-settings';

export const ROAD_LENGTH = 800;
/** A common multiple of the arrow, dash and guard-post spacing. */
export const ROAD_MARKING_PERIOD = 48;
const ROAD_CENTER_Z = -340;

export function roadProfileKey(mode: RoadModeId, laneCount?: number) {
  const road = roadFor(mode, laneCount);
  return `${road.id}:${road.lanes.length}`;
}

export function roadMetrics(mode: RoadModeId, laneCount?: number) {
  const half = (roadFor(mode, laneCount).lanes.length * LANE_WIDTH) / 2;
  return {
    travelHalfWidth: half,
    deckWidth: half * 2 + 4.5,
    edgeX: half + 0.4,
    guardrailX: half + 1.5,
    lampX: half + 2.7,
    vergeX: half + 15,
    billboardX: half + 17,
    sceneryOffset: half - 9,
  };
}

function instances(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: THREE.Matrix4[],
) {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  mesh.name = name;
  transforms.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** DOM-free road factory used by the renderer and geometry regression tests. */
export function createRoadGeometry(
  mode: RoadModeId,
  asphalt?: THREE.Texture,
  laneCount?: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `Road:${mode}`;
  group.userData.roadMode = mode;
  const road = roadFor(mode, laneCount),
    metrics = roadMetrics(mode, laneCount);
  group.userData.laneCount = road.lanes.length;
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(metrics.deckWidth, 0.6, ROAD_LENGTH),
    new THREE.MeshStandardMaterial({ color: '#747780', roughness: 0.97, map: asphalt ?? null }),
  );
  deck.name = 'RoadSurface';
  deck.position.set(0, -0.31, ROAD_CENTER_Z);
  deck.receiveShadow = true;
  group.add(deck);

  const white = new THREE.MeshStandardMaterial({ color: '#ddd8b7', roughness: 0.9 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#e0b04a', roughness: 0.8 });
  const separators: number[] = [];
  const dividers: number[] = [];
  for (let i = 1; i < road.lanes.length; i++) {
    const left = road.lanes[i - 1],
      right = road.lanes[i];
    const x = ((left + right) / 2) * LANE_WIDTH;
    if (directionForLane(mode, left) !== directionForLane(mode, right)) dividers.push(x);
    else separators.push(x);
  }
  const dashes: THREE.Matrix4[] = [];
  for (let z = 60; z > -770; z -= 24)
    for (const x of separators) dashes.push(new THREE.Matrix4().makeTranslation(x, 0.016, z));
  if (dashes.length)
    group.add(instances('LaneSeparators', new THREE.BoxGeometry(0.1, 0.02, 4), white, dashes));
  else {
    const empty = new THREE.Group();
    empty.name = 'LaneSeparators';
    group.add(empty);
  }
  if (dividers.length) {
    const divider = new THREE.Group();
    divider.name = 'CenterDivider';
    const geometry = new THREE.BoxGeometry(0.1, 0.025, ROAD_LENGTH);
    for (const x of dividers)
      for (const offset of [-0.12, 0.12]) {
        const stripe = new THREE.Mesh(geometry, yellow);
        stripe.position.set(x + offset, 0.025, ROAD_CENTER_Z);
        divider.add(stripe);
      }
    group.add(divider);
  }

  const arrow = new THREE.Shape();
  arrow.moveTo(0, 1.5);
  arrow.lineTo(-0.65, 0.55);
  arrow.lineTo(-0.21, 0.55);
  arrow.lineTo(-0.21, -1.3);
  arrow.lineTo(0.21, -1.3);
  arrow.lineTo(0.21, 0.55);
  arrow.lineTo(0.65, 0.55);
  arrow.closePath();
  const arrowGeometry = new THREE.ShapeGeometry(arrow);
  arrowGeometry.rotateX(-Math.PI / 2);
  const arrows: THREE.Matrix4[] = [];
  for (const lane of road.lanes)
    for (let z = 48; z > -770; z -= ROAD_MARKING_PERIOD) {
      const matrix = new THREE.Matrix4().makeRotationY(
        directionForLane(mode, lane) < 0 ? Math.PI : 0,
      );
      matrix.setPosition(lane * LANE_WIDTH, 0.035, z);
      arrows.push(matrix);
    }
  group.add(instances('DirectionArrows', arrowGeometry, white, arrows));

  const edges = new THREE.Group();
  edges.name = 'EdgeLines';
  const rails = new THREE.Group();
  rails.name = 'GuardRails';
  const curbs = new THREE.Group();
  curbs.name = 'Curbs';
  const edgeGeometry = new THREE.BoxGeometry(0.14, 0.025, ROAD_LENGTH);
  const curbGeometry = new THREE.BoxGeometry(0.6, 0.5, ROAD_LENGTH);
  const railGeometry = new THREE.BoxGeometry(0.13, 0.44, ROAD_LENGTH);
  const curbMaterial = new THREE.MeshStandardMaterial({ color: '#8c8b7b', roughness: 0.9 });
  const railMaterial = new THREE.MeshStandardMaterial({
    color: '#a5a49a',
    metalness: 0.75,
    roughness: 0.4,
  });
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(edgeGeometry, yellow);
    edge.position.set(side * metrics.edgeX, 0.025, ROAD_CENTER_Z);
    edges.add(edge);
    const curb = new THREE.Mesh(curbGeometry, curbMaterial);
    curb.position.set(side * metrics.guardrailX, 0.2, ROAD_CENTER_Z);
    curbs.add(curb);
    const rail = new THREE.Mesh(railGeometry, railMaterial);
    rail.position.set(side * metrics.guardrailX, 1, ROAD_CENTER_Z);
    rails.add(rail);
  }
  group.add(edges, rails, curbs);
  const posts: THREE.Matrix4[] = [];
  for (let z = 50; z > -780; z -= 12)
    for (const side of [-1, 1])
      posts.push(new THREE.Matrix4().makeTranslation(side * metrics.guardrailX, 0.55, z));
  group.add(instances('GuardPosts', new THREE.BoxGeometry(0.13, 1.1, 0.18), railMaterial, posts));
  const verge = new THREE.Group();
  verge.name = 'Verges';
  const vergeGeometry = new THREE.BoxGeometry(25, 6, ROAD_LENGTH);
  const vergeMaterial = new THREE.MeshStandardMaterial({ color: '#40523c', roughness: 1 });
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(vergeGeometry, vergeMaterial);
    mesh.position.set(side * metrics.vergeX, -5, ROAD_CENTER_Z);
    verge.add(mesh);
  }
  group.add(verge);
  return group;
}

/** Visible hazard frame, with the same dimensions returned to physics by gantryFor. */
export function createGantryGeometry(
  mode: RoadModeId,
  panelMaterial?: THREE.Material,
  laneCount?: number,
): THREE.Group {
  const layout = gantryFor(mode, laneCount),
    group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: '#8d9287',
    metalness: 0.65,
    roughness: 0.4,
  });
  const poleGeometry = new THREE.CylinderGeometry(0.15, 0.2, 14, 6);
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(poleGeometry, metal);
    pole.position.set((side * layout.beam.width) / 2, 7, 0);
    group.add(pole);
  }
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(layout.beam.width, layout.beam.height, layout.beam.depth),
    metal,
  );
  beam.name = 'GantryBeam';
  beam.position.y = layout.beam.y;
  group.add(beam);
  const face =
    panelMaterial ?? new THREE.MeshStandardMaterial({ color: '#284b40', roughness: 0.8 });
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(layout.panel.width, layout.panel.height, layout.panel.depth),
    [metal, metal, metal, metal, face, metal],
  );
  panel.name = 'GantryPanel';
  panel.position.y = layout.panel.y;
  group.add(panel);
  return group;
}

/** Follow laterally on narrow screens so wider roads cannot leave the player's car offscreen. */
export function gameplayRoadCamera(
  x: number,
  altitude: number,
  aspect: number,
  boosting: boolean,
  position = new THREE.Vector3(),
  lookAt = new THREE.Vector3(),
) {
  const follow = 1 - THREE.MathUtils.smoothstep(aspect, 0.8, 1.6);
  position.set(
    x * THREE.MathUtils.lerp(0.38, 1, follow),
    4.4 + altitude * 0.83,
    10.5 + (boosting ? 1.4 : 0),
  );
  lookAt.set(x * THREE.MathUtils.lerp(0.52, 1, follow), 1.2 + altitude * 0.8, -15);
  return { position, lookAt, fov: boosting ? 68 : 58 };
}

/** A phone's horizontal field of view cannot afford the desktop camera's lateral lag. */
export function followGameplayCamera(
  position: THREE.Vector3,
  target: THREE.Vector3,
  aspect: number,
  blend: number,
) {
  position.lerp(target, blend);
  if (aspect < 1) position.x = target.x;
}

/** World-X controls become local steering/signals when the vehicle faces the player. */
export function trafficRoadPose(traffic: {
  direction?: 1 | -1;
  x: number;
  targetLane?: number;
  signal?: -1 | 0 | 1;
}) {
  const direction = traffic.direction ?? 1;
  const worldSteer =
    traffic.targetLane === undefined
      ? 0
      : THREE.MathUtils.clamp((traffic.targetLane * LANE_WIDTH - traffic.x) * -0.04, -0.15, 0.15);
  const steer = worldSteer * direction;
  return {
    heading: (direction < 0 ? Math.PI : 0) + steer * 0.3,
    steer,
    signal: ((traffic.signal ?? 0) * direction) as -1 | 0 | 1,
  };
}

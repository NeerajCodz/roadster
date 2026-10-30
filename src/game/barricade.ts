import * as THREE from 'three';
import { BARRICADE_BODY } from './barricade-layout';

const POST_X = 1.16;
const RAIL_Y = [0.57, 1.27];

/** A chamfered box whose bevels remain inside the requested dimensions. */
function bevelBox(
  width: number,
  height: number,
  depth: number,
  bevel: number,
): THREE.ExtrudeGeometry {
  const x = width / 2 - bevel;
  const y = height / 2 - bevel;
  const shape = new THREE.Shape();
  shape.moveTo(-x, -y);
  shape.lineTo(x, -y);
  shape.lineTo(x, y);
  shape.lineTo(-x, y);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2 + bevel);
  // Planar coordinates keep the diagonal paint continuous across both broad faces.
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, positions.getX(i) / width + 0.5, positions.getY(i) / height + 0.5);
  return geometry;
}

function boardTextures(): { color: THREE.DataTexture; roughness: THREE.DataTexture } {
  const width = 512,
    height = 64;
  const paint = new Uint8Array(width * height * 4);
  const rough = new Uint8Array(paint.length);
  let seed = 3519;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const yellow =
        y < 3 ||
        y >= height - 3 ||
        (((x / width) * BARRICADE_BODY.width + (y / height) * 0.4) / 0.54) % 1 >= 0.42;
      const grit = random();
      const wornEdge = y < 3 || y >= height - 3;
      const scratch = random() > 0.991 || (y % 19 === 0 && random() > 0.67);
      const base = yellow ? [244, 190, 30] : [22, 24, 22];
      const dirt = wornEdge ? 0.6 + grit * 0.2 : 0.84 + grit * 0.16;
      for (let channel = 0; channel < 3; channel++)
        paint[i + channel] = scratch ? 82 + grit * 45 : base[channel] * dirt;
      paint[i + 3] = 255;
      rough[i] = rough[i + 1] = rough[i + 2] = scratch || wornEdge ? 250 : 192 + grit * 46;
      rough[i + 3] = 255;
    }
  const color = new THREE.DataTexture(paint, width, height);
  color.colorSpace = THREE.SRGBColorSpace;
  const roughness = new THREE.DataTexture(rough, width, height);
  for (const texture of [color, roughness]) {
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }
  return { color, roughness };
}

function instances(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  positions: number[][],
  rotation?: THREE.Euler,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const transform = new THREE.Object3D();
  if (rotation) transform.rotation.copy(rotation);
  positions.forEach((position, index) => {
    transform.position.fromArray(position);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function addBooster(
  root: THREE.Group,
  side: 'Left' | 'Right',
  metal: THREE.Material,
  rubber: THREE.Material,
): void {
  const engine = new THREE.Group();
  engine.name = `Booster${side}`;
  engine.userData.role = 'booster';
  engine.position.x = side === 'Left' ? -POST_X : POST_X;
  const hardware = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    y: number,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.y = y;
    mesh.castShadow = true;
    engine.add(mesh);
    return mesh;
  };
  hardware(`BoosterMount${side}`, bevelBox(0.32, 0.04, 0.3, 0.01), rubber, -0.025);
  hardware(`BoosterHousing${side}`, new THREE.CylinderGeometry(0.12, 0.14, 0.22, 14), metal, -0.14);
  hardware(
    `BoosterCollar${side}`,
    new THREE.CylinderGeometry(0.16, 0.16, 0.055, 14),
    rubber,
    -0.225,
  );
  hardware(
    `Nozzle${side}`,
    new THREE.CylinderGeometry(0.115, 0.17, 0.18, 16, 1, true),
    metal,
    -0.315,
  );
  const rim = hardware(
    `NozzleRim${side}`,
    new THREE.TorusGeometry(0.17, 0.023, 6, 16),
    metal,
    -0.405,
  );
  rim.rotation.x = Math.PI / 2;
  const jet = new THREE.Group();
  jet.name = `Jet${side}`;
  jet.position.y = -0.41;
  const plume = (name: string, radius: number, length: number, color: string, opacity: number) => {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(radius, length, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    mesh.name = name;
    mesh.rotation.z = Math.PI;
    mesh.position.y = -length / 2;
    jet.add(mesh);
  };
  plume(`JetOuter${side}`, 0.15, 0.95, '#ff982d', 0.72);
  plume(`JetCore${side}`, 0.085, 0.72, '#c5f8ff', 0.94);
  engine.add(jet);
  root.add(engine);
}

export function createBarricade(flying: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = flying ? 'FlyingBarricade' : 'GroundBarricade';
  group.userData.flying = flying;
  const body = new THREE.Group();
  body.name = 'BarricadeBody';
  group.add(body);
  const texture = boardTextures();
  const black = new THREE.MeshStandardMaterial({
    color: '#202321',
    roughness: 0.82,
    metalness: 0.15,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: '#111412', roughness: 0.97 });
  const metal = new THREE.MeshStandardMaterial({
    color: '#8c9594',
    roughness: 0.36,
    metalness: 0.88,
  });
  const striped = new THREE.MeshStandardMaterial({
    map: texture.color,
    roughnessMap: texture.roughness,
    roughness: 0.9,
    metalness: 0.05,
  });
  const reflectors = new THREE.MeshStandardMaterial({
    color: '#fff0c7',
    emissive: '#e5c267',
    emissiveIntensity: 0.35,
    roughness: 0.24,
  });
  const railGeometry = bevelBox(BARRICADE_BODY.width, 0.4, 0.16, 0.022);
  for (const [index, y] of RAIL_Y.entries()) {
    const rail = new THREE.Mesh(railGeometry, [striped, black]);
    rail.name = index === 0 ? 'LowerRail' : 'UpperRail';
    rail.position.y = y;
    rail.castShadow = true;
    rail.receiveShadow = true;
    body.add(rail);
  }
  body.add(
    instances(
      'Posts',
      bevelBox(0.2, 1.5, 0.2, 0.018),
      black,
      [-POST_X, POST_X].map((x) => [x, 0.87, 0]),
    ),
  );
  body.add(
    instances(
      'PostCaps',
      bevelBox(0.26, 0.14, 0.26, 0.05),
      black,
      [-POST_X, POST_X].map((x) => [x, BARRICADE_BODY.height - 0.07, 0]),
    ),
  );
  body.add(
    instances(
      'Feet',
      bevelBox(0.65, 0.18, BARRICADE_BODY.depth, 0.055),
      rubber,
      [-POST_X, POST_X].map((x) => [x, 0.09, 0]),
    ),
  );
  body.add(
    instances(
      'FootCollars',
      bevelBox(0.31, 0.16, 0.31, 0.025),
      black,
      [-POST_X, POST_X].map((x) => [x, 0.23, 0]),
    ),
  );
  const clamps: number[][] = [],
    bolts: number[][] = [],
    tabs: number[][] = [],
    grips: number[][] = [];
  for (const x of [-POST_X, POST_X]) {
    for (const y of RAIL_Y) {
      clamps.push([x, y, 0]);
      for (const z of [-0.135, 0.135]) for (const dy of [-0.09, 0.09]) bolts.push([x, y + dy, z]);
    }
    for (const z of [-0.27, -0.17, 0.17, 0.27]) grips.push([x, 0.184, z]);
  }
  for (const x of [-1.38, 1.38])
    for (const y of RAIL_Y) for (const z of [-0.09, 0.09]) tabs.push([x, y, z]);
  body.add(instances('RailClamps', bevelBox(0.27, 0.42, 0.24, 0.018), black, clamps));
  body.add(
    instances(
      'Bolts',
      new THREE.CylinderGeometry(0.027, 0.027, 0.022, 6),
      metal,
      bolts,
      new THREE.Euler(Math.PI / 2, 0, 0),
    ),
  );
  body.add(instances('ReflectiveTabs', new THREE.BoxGeometry(0.1, 0.13, 0.022), reflectors, tabs));
  body.add(instances('FootTreads', new THREE.BoxGeometry(0.48, 0.012, 0.045), black, grips));
  if (flying) {
    addBooster(group, 'Left', metal, rubber);
    addBooster(group, 'Right', metal, rubber);
  }
  return group;
}

/** Only per-clone jet transforms change; the frame, hardware and shared materials stay fixed. */
export function animateBarricade(group: THREE.Group, time: number): void {
  if (!Number.isFinite(time)) return;
  for (const [index, side] of ['Left', 'Right'].entries()) {
    const jet = group.getObjectByName(`Jet${side}`);
    if (!jet) continue;
    const pulse = Math.sin(time * 29 + index * 2.4);
    jet.scale.set(0.95 + pulse * 0.05, 0.92 + pulse * 0.16, 0.95 + pulse * 0.05);
  }
}

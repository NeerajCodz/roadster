// Contact-sheet viewer for the procedural roadster. Driven by tools/roadster/render.mjs
// through headless Edge/Chrome, but also usable by opening /tools/roadster/viewer.html in `vite`.
//   ?model=/tools/roadster/model/index.ts  module exporting buildRoadster() (default)
//   ?glb=/assets/models/roadster.glb       view a GLB instead
//   ?shots=grid                            initial layout (grid | detail | <view name>[,<view name>...])
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

type Vec3 = [number, number, number];
interface ViewDef {
  label: string; light: 'studio' | 'game' | 'sunset'; pos: Vec3; target: Vec3;
  fov?: number; orthoWidth?: number; up?: Vec3; yaw?: number; wheel?: boolean;
}
declare global {
  interface Window {
    __roadsterReady?: boolean; __roadsterErrors: string[]; __roadsterStats?: unknown;
    __render?: (shots: string, width: number, height: number) => unknown;
    __exportGlb?: () => Promise<number>; __exportChunk?: (offset: number, size: number) => string;
  }
}

window.__roadsterErrors = [];
addEventListener('error', (event) => window.__roadsterErrors.push(String(event.error?.stack ?? event.message)));
addEventListener('unhandledrejection', (event) => window.__roadsterErrors.push(String(event.reason?.stack ?? event.reason)));

// Model frame: nose toward +Z, car's left side toward +X, Y up, ground at y = 0, length 4.3 m.
const VIEWS: Record<string, ViewDef> = {
  front34: { label: 'FRONT 3/4', light: 'studio', pos: [4.3, 1.35, 5.5], target: [0, 0.5, 0.15], fov: 28 },
  rear34: { label: 'REAR 3/4 (right)', light: 'studio', pos: [-4.4, 1.5, -5.5], target: [0, 0.5, -0.1], fov: 28 },
  hero: { label: 'HERO = USER REFERENCE ANGLE (rear-left, low)', light: 'sunset', pos: [4.6, 0.78, -5.6], target: [0.35, 0.52, -0.55], fov: 30 },
  side: { label: 'RIGHT SIDE (ortho)', light: 'studio', pos: [-10, 0.62, 0], target: [0, 0.62, 0], orthoWidth: 4.9 },
  front: { label: 'FRONT (ortho)', light: 'studio', pos: [0, 0.62, 10], target: [0, 0.62, 0], orthoWidth: 2.7 },
  rear: { label: 'REAR (ortho)', light: 'studio', pos: [0, 0.62, -10], target: [0, 0.62, 0], orthoWidth: 2.7 },
  top: { label: 'TOP (ortho, nose right)', light: 'studio', pos: [0, 10, 0], target: [0, 0, 0], up: [1, 0, 0], orthoWidth: 4.9 },
  chase: { label: 'GAME CHASE CAM', light: 'game', pos: [0, 4.4, 10.5], target: [0, 1.2, -15], fov: 58, yaw: Math.PI },
  garage: { label: 'GAME MENU CAM', light: 'game', pos: [8.5, 3.5, 9], target: [-3, 0.7, -0.5], fov: 48, yaw: Math.PI + 0.12 },
  wheel: { label: 'FRONT-LEFT WHEEL', light: 'studio', pos: [2.2, 0.25, 0.9], target: [0, 0, 0], fov: 26, wheel: true },
  nose: { label: 'NOSE', light: 'studio', pos: [1.7, 0.95, 4.7], target: [0, 0.5, 1.7], fov: 30 },
  tail: { label: 'TAIL', light: 'studio', pos: [-1.7, 1.05, -4.7], target: [0, 0.55, -1.8], fov: 30 },
  cockpit: { label: 'COCKPIT', light: 'studio', pos: [1.9, 2.5, 1.0], target: [0, 0.75, -0.15], fov: 34 },
  low: { label: 'LOW FRONT 3/4', light: 'game', pos: [3.2, 0.45, 4.6], target: [0, 0.55, 0.3], fov: 34 },
  under: { label: 'UNDERSIDE', light: 'studio', pos: [0.01, -6, 0], target: [0, 0, 0], up: [1, 0, 0], orthoWidth: 4.9 },
};
const LAYOUTS: Record<string, string[]> = {
  grid: ['front34', 'hero', 'side', 'front', 'rear', 'top', 'chase', 'garage', 'wheel'],
  detail: ['nose', 'tail', 'wheel', 'cockpit', 'low', 'rear34'],
};

const params = new URLSearchParams(location.search);
const canvas = document.querySelector('canvas')!;
const labels = document.querySelector<HTMLDivElement>('#labels')!;
const statsBar = document.querySelector<HTMLDivElement>('#stats')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setScissorTest(true);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
const studioEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
let gameEnv = studioEnv;
try {
  const hdr = await new HDRLoader().loadAsync('/assets/venice_sunset_1k.hdr');
  gameEnv = pmrem.fromEquirectangular(hdr).texture; hdr.dispose();
} catch { window.__roadsterErrors.push('venice_sunset_1k.hdr unavailable; game views use the studio environment'); }

const studio = new THREE.Group();
const key = new THREE.DirectionalLight('#ffffff', 2.4);
key.position.set(3.5, 9, 5); key.castShadow = true;
const fill = new THREE.DirectionalLight('#dfe8ff', 0.7); fill.position.set(-6, 3, -4);
studio.add(key, key.target, fill, new THREE.HemisphereLight('#ffffff', '#8a8f94', 0.35));
const studioFloor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: '#d4d7da', roughness: 0.92 }));
studioFloor.rotation.x = -Math.PI / 2; studioFloor.receiveShadow = true; studio.add(studioFloor);

// Mirrors the game's renderer.ts lighting rig.
const game = new THREE.Group();
const sun = new THREE.DirectionalLight('#ffcf97', 4.2); sun.position.set(-50, 45, -100); sun.castShadow = true;
const rim = new THREE.DirectionalLight('#d9e7ff', 2.6); rim.position.set(8, 10, 15);
game.add(sun, sun.target, rim, new THREE.HemisphereLight('#b8c9ef', '#6c5944', 2.1));
const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(22.5, 400), new THREE.MeshStandardMaterial({ color: '#5d5e58', roughness: 0.96 }));
asphalt.rotation.x = -Math.PI / 2; asphalt.position.z = -150; asphalt.receiveShadow = true; game.add(asphalt);
const laneLines = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 4), new THREE.MeshStandardMaterial({ color: '#ddd8b7' }), 80);
{ let n = 0; const m = new THREE.Matrix4(); for (let z = 20; z > -300; z -= 24) for (const x of [-5.4, -1.8, 1.8, 5.4]) { m.makeRotationX(-Math.PI / 2).setPosition(x, 0.005, z); laneLines.setMatrixAt(n++, m); } laneLines.count = n; }
game.add(laneLines);
for (const light of [key, sun]) { light.shadow.mapSize.set(2048, 2048); light.shadow.bias = -0.0004; light.shadow.normalBias = 0.03; }
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 30 });
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 100, far: 160 });
// Low warm sun over a pale desert floor, approximating the user's main reference photo.
const sunset = new THREE.Group();
const lowSun = new THREE.DirectionalLight('#ffe2bf', 3.2); lowSun.position.set(6, 5, 9); lowSun.castShadow = true;
lowSun.shadow.mapSize.set(2048, 2048); lowSun.shadow.bias = -0.0004; lowSun.shadow.normalBias = 0.03;
Object.assign(lowSun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
const desert = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: '#b9a690', roughness: 1 }));
desert.rotation.x = -Math.PI / 2; desert.receiveShadow = true;
sunset.add(lowSun, lowSun.target, desert, new THREE.HemisphereLight('#dfe6f2', '#a08a72', 1.1));
scene.add(studio, game, sunset);

async function loadModel(): Promise<THREE.Object3D> {
  const glb = params.get('glb');
  if (glb) return (await new GLTFLoader().loadAsync(glb)).scene;
  const module = await import(/* @vite-ignore */ params.get('model') ?? '/tools/roadster/model/index.ts');
  const build = module.buildRoadster ?? module.default;
  if (typeof build !== 'function') throw new Error('Model module must export buildRoadster()');
  return await build({ paint: params.get('paint') ?? undefined });
}

const started = performance.now();
const model = await loadModel();
const buildMs = Math.round(performance.now() - started);
model.traverse((object) => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
model.updateMatrixWorld(true);
const rawBounds = new THREE.Box3().setFromObject(model, true);
const rawSize = rawBounds.getSize(new THREE.Vector3());
// Same normalisation as GameRenderer.loadPlayerModel: 4.3 m long, centred on x/z, on the ground.
const scale = 4.3 / rawSize.z;
const normalized = new THREE.Group();
normalized.add(model); normalized.scale.setScalar(scale);
const center = rawBounds.getCenter(new THREE.Vector3());
normalized.position.set(-center.x * scale, -rawBounds.min.y * scale, -center.z * scale);
const pivot = new THREE.Group(); pivot.add(normalized); scene.add(pivot);

function collectStats() {
  let triangles = 0, vertices = 0, meshes = 0;
  const materials = new Map<string, number>();
  const nodes: string[] = [];
  model.traverse((object) => {
    if (object.name) nodes.push(object.name);
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    const geometry = object.geometry as THREE.BufferGeometry;
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    vertices += geometry.attributes.position.count * count;
    triangles += ((geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3) * count;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.set(material.name || '(unnamed)', (materials.get(material.name || '(unnamed)') ?? 0) + 1);
  });
  const wheels = nodes.filter((name) => /^Wheel(?:Front|Rear)[LR]$/.test(name));
  const paint = [...materials.keys()].filter((name) => /paint|body.*color|carpaint/i.test(name));
  const warnings: string[] = [];
  if (wheels.length !== 4) warnings.push(`expected 4 wheel nodes WheelFrontL/R WheelRearL/R, found ${wheels.length}`);
  if (paint.length !== 1) warnings.push(`expected exactly 1 paint material (/paint|body.*color|carpaint/i), found ${paint.join(',') || 'none'}`);
  if (Math.abs(scale - 1) > 0.02) warnings.push(`model length ${rawSize.z.toFixed(3)} m; expected 4.3`);
  if (Math.abs(center.x) > 0.02 || Math.abs(center.z) > 0.05 || Math.abs(rawBounds.min.y) > 0.02) warnings.push('model not centred on x/z or not grounded at y=0');
  return {
    buildMs, triangles: Math.round(triangles), vertices, meshes, materials: Object.fromEntries(materials), wheels,
    size: rawSize.toArray().map((value) => +value.toFixed(3)), center: center.toArray().map((value) => +value.toFixed(3)), minY: +rawBounds.min.y.toFixed(3),
    nodeCount: nodes.length, warnings, errors: window.__roadsterErrors,
  };
}
const stats = collectStats();
window.__roadsterStats = stats;

const perspective = new THREE.PerspectiveCamera(30, 1, 0.05, 500);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 500);
const wheelNode = model.getObjectByName('WheelFrontL');

function renderView(name: string, x: number, y: number, width: number, height: number, canvasHeight: number) {
  const view = VIEWS[name];
  if (!view) throw new Error(`Unknown view ${name}`);
  pivot.rotation.y = view.yaw ?? 0; pivot.updateMatrixWorld(true);
  const studioLight = view.light === 'studio';
  studio.visible = studioLight; game.visible = view.light === 'game'; sunset.visible = view.light === 'sunset';
  scene.environment = studioLight ? studioEnv : gameEnv;
  scene.environmentIntensity = studioLight ? 1 : view.light === 'sunset' ? 0.9 : 1.2;
  scene.background = new THREE.Color(studioLight ? '#c3c8cc' : view.light === 'sunset' ? '#d9dee3' : '#c99e86');
  scene.fog = view.light === 'game' ? new THREE.Fog('#b49a95', 110, 650) : null;
  const target = new THREE.Vector3(...view.target);
  const position = new THREE.Vector3(...view.pos);
  if (view.wheel && wheelNode) { wheelNode.getWorldPosition(target); position.add(target); }
  const aspect = width / height;
  let camera: THREE.Camera;
  if (view.orthoWidth) {
    const halfWidth = view.orthoWidth / 2, halfHeight = halfWidth / aspect;
    Object.assign(ortho, { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight });
    ortho.up.set(...(view.up ?? [0, 1, 0])); ortho.position.copy(position); ortho.lookAt(target); ortho.updateProjectionMatrix();
    camera = ortho;
  } else {
    Object.assign(perspective, { fov: view.fov ?? 30, aspect }); perspective.up.set(...(view.up ?? [0, 1, 0]));
    perspective.position.copy(position); perspective.lookAt(target); perspective.updateProjectionMatrix();
    camera = perspective;
  }
  renderer.setViewport(x, canvasHeight - y - height, width, height);
  renderer.setScissor(x, canvasHeight - y - height, width, height);
  renderer.render(scene, camera);
  const label = document.createElement('div');
  label.className = 'label'; label.textContent = view.label;
  label.style.left = `${x + 6}px`; label.style.top = `${y + 6}px`;
  labels.append(label);
}

window.__render = (shots: string, width: number, height: number) => {
  const names = LAYOUTS[shots] ?? shots.split(',');
  const columns = names.length <= 1 ? 1 : names.length <= 4 ? 2 : 3;
  const rows = Math.ceil(names.length / columns);
  renderer.setSize(width, height, false);
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  labels.replaceChildren();
  renderer.setScissor(0, 0, width, height); renderer.setClearColor('#1a1c1e'); renderer.clear();
  const cellWidth = Math.floor(width / columns), cellHeight = Math.floor(height / rows);
  names.forEach((name, index) => renderView(name, (index % columns) * cellWidth, Math.floor(index / columns) * cellHeight, cellWidth - 2, cellHeight - 2, height));
  statsBar.textContent = `${stats.triangles.toLocaleString()} tris · ${stats.vertices.toLocaleString()} verts · ${stats.meshes} meshes · size ${stats.size.join(' × ')} m · build ${stats.buildMs} ms`
    + (stats.warnings.length ? ` · WARN: ${stats.warnings.join('; ')}` : '') + (window.__roadsterErrors.length ? ` · ERRORS: ${window.__roadsterErrors.length}` : '');
  return stats;
};

let exported: Uint8Array | null = null;
window.__exportGlb = async () => {
  pivot.rotation.y = 0;
  const result = await new GLTFExporter().parseAsync(model, { binary: true, onlyVisible: true });
  exported = new Uint8Array(result as ArrayBuffer);
  return exported.byteLength;
};
window.__exportChunk = (offset: number, size: number) => {
  if (!exported) throw new Error('call __exportGlb first');
  let binary = '';
  const slice = exported.subarray(offset, Math.min(exported.byteLength, offset + size));
  for (let i = 0; i < slice.length; i += 0x8000) binary += String.fromCharCode(...slice.subarray(i, i + 0x8000));
  return btoa(binary);
};

window.__render(params.get('shots') ?? 'grid', Number(params.get('w') ?? innerWidth), Number(params.get('h') ?? innerHeight));
window.__roadsterReady = true;

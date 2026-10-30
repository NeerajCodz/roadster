import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TRAFFIC_CATALOG, TRAFFIC_PAINTS } from '../../src/game/traffic-catalog';
import { createTrafficVehicle } from '../../src/game/traffic-model';

const canvas = document.querySelector('canvas')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
const pmrem = new THREE.PMREMGenerator(renderer),
  room = new RoomEnvironment(),
  environment = pmrem.fromScene(room, 0.04);
room.dispose();
pmrem.dispose();
const entries = TRAFFIC_CATALOG.map((spec, index) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a2520');
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.85;
  scene.add(new THREE.HemisphereLight('#d7e4ed', '#505840', 1.8));
  const light = new THREE.DirectionalLight('#ffefda', 3);
  light.position.set(-5, 12, -8);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  Object.assign(light.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
  light.shadow.bias = -0.0003;
  scene.add(light);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: '#3a493d', roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.012;
  floor.receiveShadow = true;
  scene.add(floor);
  const model = createTrafficVehicle(index);
  model.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      const list = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of list)
        if (mat instanceof THREE.MeshStandardMaterial && mat.name === 'Paint')
          mat.color.set(TRAFFIC_PAINTS[index % 8].color);
    }
  });
  scene.add(model);
  return { spec, scene, camera: new THREE.PerspectiveCamera(38, 1, 0.1, 200) };
});
const cards = document.querySelector<HTMLDivElement>('#cards')!,
  select = document.querySelector<HTMLSelectElement>('#vehicle')!,
  detail = document.querySelector<HTMLElement>('#detail')!;
select.innerHTML = TRAFFIC_CATALOG.map(
  (spec, i) => `<option value="${i}">${String(i + 1).padStart(2, '0')} / ${spec.name}</option>`,
).join('');
let page = 0,
  selected = 0,
  overview = true,
  rear = false;
function ui() {
  cards.hidden = !overview;
  detail.hidden = overview;
  cards.innerHTML = entries
    .slice(page * 12, page * 12 + 12)
    .map(
      ({ spec }, i) =>
        `<article data-index="${page * 12 + i}"><div><b>${spec.name.toUpperCase()}</b><small>${spec.length.toFixed(1)} M / ${spec.axles.length} AXLES / ${spec.livery === 'none' ? 'PBR PAINT' : spec.livery.toUpperCase()}</small></div></article>`,
    )
    .join('');
  const spec = entries[selected].spec;
  detail.innerHTML = `<h1>${spec.name.toUpperCase()}</h1><p>${spec.length.toFixed(2)} × ${spec.width.toFixed(2)} × ${spec.height.toFixed(2)} M / ${spec.axles.length} AXLES</p>`;
  document.querySelector('#mode')!.textContent = overview ? 'Inspect vehicle' : 'Fleet overview';
  document.querySelector('#angle')!.textContent = rear ? 'Front view' : 'Rear view';
  document.querySelector('#page')!.textContent = overview
    ? `24 VEHICLE TYPES / PAGE ${page + 1} OF 2`
    : 'ACTUAL VEHICLE DIMENSIONS / FRONT FACES −Z';
  draw();
}
function renderEntry(index: number, left: number, top: number, width: number, height: number) {
  const entry = entries[index],
    { spec, camera } = entry;
  camera.aspect = width / height;
  camera.position.set(
    spec.length * 0.63,
    spec.height + spec.length * 0.2,
    (rear ? 1 : -1) * spec.length * 0.84,
  );
  camera.lookAt(0, spec.height * 0.43, 0);
  camera.updateProjectionMatrix();
  renderer.setViewport(left, innerHeight - top - height, width, height);
  renderer.setScissor(left, innerHeight - top - height, width, height);
  renderer.render(entry.scene, camera);
}
function draw() {
  renderer.setScissorTest(false);
  renderer.setClearColor('#17211e');
  renderer.clear();
  renderer.setScissorTest(true);
  if (overview) {
    for (const card of cards.children) {
      const rect = card.getBoundingClientRect();
      renderEntry(
        Number((card as HTMLElement).dataset.index),
        rect.left,
        rect.top,
        rect.width,
        rect.height,
      );
    }
  } else renderEntry(selected, 0, 60, innerWidth, innerHeight - 120);
  renderer.setScissorTest(false);
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  draw();
}
select.addEventListener('change', () => {
  selected = Number(select.value);
  overview = false;
  ui();
});
document.querySelector('#mode')!.addEventListener('click', () => {
  overview = !overview;
  ui();
});
document.querySelector('#angle')!.addEventListener('click', () => {
  rear = !rear;
  ui();
});
document.querySelector('#next')!.addEventListener('click', () => {
  page = (page + 1) % 2;
  overview = true;
  ui();
});
document.querySelector('#previous')!.addEventListener('click', () => {
  page = (page + 1) % 2;
  overview = true;
  ui();
});
addEventListener('resize', resize);
renderer.setSize(innerWidth, innerHeight);
ui();

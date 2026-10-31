import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLaunchRamp, animateLaunchRamp } from '../../src/game/ramp';
import { RAMP_KINDS } from '../../src/game/ramp-layout';

const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('canvas')!,
  antialias: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const pmrem = new THREE.PMREMGenerator(renderer),
  room = new RoomEnvironment();
const environment = pmrem.fromScene(room, 0.04);
room.dispose();
pmrem.dispose();
const scenes = RAMP_KINDS.map((kind) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#141c18');
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.8;
  scene.add(new THREE.HemisphereLight('#e3efdf', '#334134', 1.2));
  const key = new THREE.DirectionalLight('#fff1d4', 2.2);
  key.position.set(-3, 8, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
  key.shadow.bias = -0.0003;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#d9efcf', 1.2);
  rim.position.set(4, 5, -4);
  scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: '#17231b', roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.015;
  floor.receiveShadow = true;
  scene.add(floor);
  const ramp = createLaunchRamp(kind);
  scene.add(ramp);
  return { scene, ramp };
});
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 150);
let view = 'entry';
for (const button of document.querySelectorAll<HTMLButtonElement>('button'))
  button.addEventListener('click', () => {
    view = button.dataset.view!;
    for (const peer of document.querySelectorAll('button'))
      peer.setAttribute('aria-pressed', String(peer === button));
  });
function resize() {
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
const started = performance.now();
function frame(now: number) {
  renderer.setScissorTest(true);
  const width = innerWidth / 3,
    height = innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (view === 'side') camera.position.set(21, 7.6, 2.4);
  else if (view === 'lip') camera.position.set(-6.3, 7.7, -15.4);
  else camera.position.set(6.6, 8, 16.1);
  camera.lookAt(0, 1.2, 0);
  scenes.forEach(({ scene, ramp }, i) => {
    animateLaunchRamp(ramp, (now - started) / 1000);
    renderer.setViewport(i * width, 0, width, height);
    renderer.setScissor(i * width, 0, width, height);
    renderer.render(scene, camera);
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

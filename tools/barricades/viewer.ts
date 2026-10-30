import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { animateBarricade, createBarricade } from '../../src/game/barricade';

const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('canvas')!,
  antialias: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#151c1a');
scene.fog = new THREE.Fog('#151c1a', 18, 40);
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const environment = pmrem.fromScene(room, 0.04);
scene.environment = environment.texture;
scene.environmentIntensity = 0.65;
room.dispose();
pmrem.dispose();
scene.add(new THREE.HemisphereLight('#dce8ed', '#373d2b', 1.7));
const key = new THREE.DirectionalLight('#ffefd5', 3.5);
key.position.set(-3, 7, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 });
key.shadow.bias = -0.0002;
scene.add(key);
const rim = new THREE.DirectionalLight('#b8dce7', 1.5);
rim.position.set(4, 4, -5);
scene.add(rim);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: '#29332d', roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
floor.receiveShadow = true;
scene.add(floor);
const ground = createBarricade(false);
ground.position.set(-2.1, 0, 0);
ground.rotation.y = 0.12;
scene.add(ground);
const flying = createBarricade(true);
flying.position.set(2.1, 1.5, 0);
flying.rotation.y = -0.12;
scene.add(flying);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(3, 3.2, 9.2);
camera.lookAt(0, 1.5, 0);
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
const start = performance.now();
function frame(now: number) {
  animateBarricade(flying, (now - start) / 1000);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

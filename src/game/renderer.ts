import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Entity, GameState } from './simulation';

const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
const ROAD_LENGTH = 800;
const PAINTS = ['#d7ed65', '#ece9df', '#9bacbb', '#e4633f', '#222b2b'];
const ORIGINAL_CAR = 'reference/models/roadster_user.glb';
const TRAFFIC_TYPES = ['sedan', 'hatch', 'suv', 'taxi', 'van', 'pickup', 'boxtruck', 'bus', 'carrier'];
const SCENERY_LENGTH = 1000;

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1600);
  readonly player = new THREE.Group();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private output: OutputPass;
  private road = new THREE.Group();
  private scenery = new THREE.Group();
  private car = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private entityMeshes = new Map<number, THREE.Group>();
  private exhausts: THREE.Mesh[] = [];
  private wheels: THREE.Object3D[] = [];
  private paints: THREE.MeshStandardMaterial[] = [];
  private shadow: THREE.Mesh;
  private shield: THREE.Mesh;
  private streaks: THREE.LineSegments;
  private quality: 'high' | 'performance' = 'high';
  private elapsed = 0;
  private lastStatus = 'menu';
  private disposed = false;
  private modelRequest = 0;
  private loadedModel = '';
  private paintIndex = 0;
  private modelCache = new Map<string, THREE.Group>();
  private modelLoads = new Map<string, Promise<THREE.Group | null>>();
  private trafficTemplates: THREE.Group[] = [];
  private entityTemplates = new Map<string, THREE.Group>();
  private entityPools = new Map<string, THREE.Group[]>();
  private ownedRoots = new Set<THREE.Object3D>();
  private textures = new Set<THREE.Texture>();
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
  private environmentGenerator: THREE.PMREMGenerator | null = null;
  private targetPlayer = new THREE.Vector3();
  private targetCamera = new THREE.Vector3();
  private entityIds = new Set<number>();
  private fogDay = new THREE.Color('#927b94');
  private fogNight = new THREE.Color('#302a54');
  onModelLoaded?: (name: string) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.scene.fog = new THREE.Fog(this.fogDay, 140, 700);
    this.scene.add(new THREE.HemisphereLight('#c0a0de', '#554132', 1.05));
    this.sun = new THREE.DirectionalLight('#ffb674', 2.6);
    this.sun.position.set(-50, 45, -100);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -24, right: 24, top: 40, bottom: -28, near: 1, far: 240 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    const rim = new THREE.DirectionalLight('#c7d4ff', 1.1);
    rim.position.set(8, 10, 15);
    this.scene.add(rim);
    const pmrem = this.environmentGenerator = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environmentTarget = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environmentTarget.texture;
    room.dispose();
    new HDRLoader().load(asset('venice_sunset_1k.hdr'), (hdr) => {
      if (!this.disposed) {
        const target = pmrem.fromEquirectangular(hdr);
        this.environmentTarget?.dispose(); this.environmentTarget = target;
        this.scene.environment = target.texture; this.scene.environmentIntensity = 0.95;
      }
      hdr.dispose();
      if (this.environmentGenerator === pmrem) { pmrem.dispose(); this.environmentGenerator = null; }
    }, undefined, () => { if (this.environmentGenerator === pmrem) { pmrem.dispose(); this.environmentGenerator = null; } });

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { night: { value: 0 } },
      vertexShader: 'varying vec3 vWorld; void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 vWorld; uniform float night;
        void main(){vec3 d=normalize(vWorld);float h=max(d.y,0.);
        vec3 horizon=mix(vec3(.64,.24,.13),vec3(.08,.025,.13),night);
        vec3 middle=mix(vec3(.31,.105,.24),vec3(.055,.018,.14),night);
        vec3 zenith=mix(vec3(.06,.06,.18),vec3(.008,.012,.04),night);
        vec3 c=mix(horizon,middle,smoothstep(0.,.18,h));
        c=mix(c,zenith,smoothstep(.15,.85,h));
        float sun=pow(max(dot(d,normalize(vec3(-.28,.12,-1.))),0.),600.);
        c+=vec3(1.,.50,.22)*sun*(1.-night)*1.8;
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    }));
    this.scene.add(this.sky);
    this.buildRoad();
    this.buildScenery();
    this.car = this.makeTraffic(0, '#d7ed65');
    this.car.scale.setScalar(1.08);
    this.ownedRoots.add(this.car);
    this.player.add(this.car);
    this.player.add(this.buildThrusters());
    this.scene.add(this.player);
    this.shadow = this.createShadow();
    this.scene.add(this.shadow);
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(3.1, 24, 16), new THREE.MeshBasicMaterial({ color: '#b8f1cb', transparent: true, opacity: 0.09, wireframe: true, depthWrite: false }));
    this.shield.visible = false; this.player.add(this.shield);
    this.streaks = this.createStreaks(); this.scene.add(this.streaks);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.28, 0.5, 1.4);
    this.composer.addPass(this.bloom);
    this.output = new OutputPass(); this.composer.addPass(this.output);
    this.resize();
    this.camera.position.set(5.5, 2.4, 6.2);
    this.camera.lookAt(-4.5, 0.65, -0.3);
    void this.loadCar(ORIGINAL_CAR);
    void this.loadTraffic();
  }

  async loadCar(path: string) {
    if (this.disposed) return;
    const request = ++this.modelRequest;
    if (this.loadedModel === path) { this.onModelLoaded?.(path); return; }
    try {
      let model = this.modelCache.get(path);
      if (!model) {
        let pending = this.modelLoads.get(path);
        if (!pending) {
          pending = this.loadPlayerModel(path);
          this.modelLoads.set(path, pending);
          void pending.finally(() => this.modelLoads.delete(path));
        }
        model = await pending ?? undefined;
      }
      if (!model || this.disposed || request !== this.modelRequest) return;
      this.player.remove(this.car);
      this.car = model;
      this.wheels = []; this.paints = [];
      const paintMaterials = new Set<THREE.MeshStandardMaterial>();
      this.car.traverse((object) => {
        if (/^Wheel(?:Front|Rear)[LR]$/i.test(object.name)) this.wheels.push(object);
        if (!(object instanceof THREE.Mesh)) return;
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial && /paint|body.*color|carpaint|tripo_material/i.test(mat.name)) paintMaterials.add(mat);
        }
      });
      this.paints = [...paintMaterials]; this.setPaint(this.paintIndex);
      this.player.add(this.car); this.loadedModel = path;
      this.onModelLoaded?.(path);
    } catch (error) { if (!this.disposed) console.warn('Using built-in vehicle; detailed model unavailable.', error); }
  }

  private async loadPlayerModel(path: string): Promise<THREE.Group | null> {
    try {
      const gltf = await new GLTFLoader().loadAsync(asset(path));
      if (this.disposed) { this.disposeObjects([gltf.scene]); return null; }
      const model = new THREE.Group();
      const oriented = new THREE.Group(); oriented.rotation.y = Math.PI; oriented.add(gltf.scene);
      oriented.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(oriented, true);
      const size = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.z) || size.z <= 0) { this.disposeObjects([gltf.scene]); return null; }
      const scale = 4.3 / size.z;
      const center = bounds.getCenter(new THREE.Vector3());
      oriented.scale.setScalar(scale);
      oriented.position.set(-center.x * scale, -bounds.min.y * scale + 0.03, -center.z * scale);
      model.add(oriented);
      model.userData.bounds = { width: size.x * scale, height: size.y * scale, length: 4.3 };
      gltf.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true; object.receiveShadow = true;
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
          if (/tripo_material/i.test(mat.name)) {
            mat.color.set('#ffffff'); mat.metalness = Math.min(0.6, mat.metalness);
            mat.normalScale.set(0.3, 0.3); mat.envMapIntensity = 1.5;
          } else if (/paint|body.*color|carpaint/i.test(mat.name)) {
            mat.metalness = 0.8; mat.roughness = 0.24;
          }
          if (mat.map) mat.map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          if (/license/i.test(mat.name)) { if (mat.map) this.textures.add(mat.map); mat.map = null; mat.color.set('#181b18'); mat.needsUpdate = true; }
          if (/brakelight/i.test(mat.name)) { mat.emissive.set('#ff2e0b'); mat.emissiveIntensity = 2; }
        }
      });
      this.modelCache.set(path, model); this.ownedRoots.add(model);
      return model;
    } catch (error) {
      if (!this.disposed) console.warn('Vehicle asset could not be loaded.', error);
      return null;
    }
  }

  setPaint(index: number) {
    this.paintIndex = index;
    for (const mat of this.paints) mat.color.set(/tripo_material/i.test(mat.name) && index === 0 ? '#ffffff' : PAINTS[index] ?? PAINTS[0]);
  }
  setQuality(quality: 'high' | 'performance') {
    this.quality = quality;
    if (this.disposed) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.6 : 1));
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.renderer.shadowMap.enabled = quality === 'high';
    this.bloom.enabled = quality === 'high'; this.resize();
  }
  resize() {
    if (this.disposed) return;
    const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight);
    this.renderer.setSize(width, height); this.composer?.setSize(width, height);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }

  update(state: GameState, dt: number, garage = false) {
    if (this.disposed) return;
    dt = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.1) : 0;
    this.elapsed += dt;
    const menu = state.status === 'menu';
    const moving = state.status === 'playing';
    const travel = menu ? this.elapsed * 2 : state.distance;
    const roadOffset = travel % 24;
    this.road.position.z = roadOffset;
    this.scenery.position.z = travel % SCENERY_LENGTH;
    const night = menu ? 0 : Math.pow(Math.sin(state.distance / 4400 * Math.PI), 2) * 0.8;
    ((this.sky.material as THREE.ShaderMaterial).uniforms.night).value = night;
    this.sun.intensity = 2.6 - night * 1.7;
    this.scene.environmentIntensity = 0.95 - night * 0.35;
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(this.fogDay).lerp(this.fogNight, night);
    this.targetPlayer.set(menu ? 0 : state.x, menu ? 0 : state.y, 0);
    this.player.position.lerp(this.targetPlayer, 1 - Math.exp(-dt * 14));
    const rollAngle = state.roll > 0 ? state.rollDirection * (1 - state.roll / 0.65) * Math.PI * 2 : 0;
    const lean = menu ? 0 : THREE.MathUtils.clamp((state.lane * 3.6 - state.x) * -0.065, -0.18, 0.18);
    this.player.rotation.z = rollAngle + lean;
    this.player.rotation.x = menu ? 0 : THREE.MathUtils.clamp(-state.vy * 0.014, -0.12, 0.2);
    this.player.rotation.y = menu ? (garage ? Math.sin(this.elapsed * 0.15) * 0.2 : 0.12) : THREE.MathUtils.clamp((state.lane * 3.6 - state.x) * -0.04, -0.12, 0.12);
    if (state.status === 'crashed') { this.player.rotation.z += Math.sin(this.elapsed * 7) * 0.08; }
    const fly = !menu && (state.y > 0.5 || state.boosting);
    for (let i = 0; i < this.exhausts.length; i++) {
      const flame = this.exhausts[i];
      flame.visible = fly;
      const length = (fly ? 1.7 : 0.15) * (0.85 + Math.sin(this.elapsed * 50 + i) * 0.15);
      flame.scale.set(1, length, 1); flame.position.z = 2.25 + 0.85 * length;
      (flame.material as THREE.MeshBasicMaterial).opacity = fly ? 0.8 : 0.35;
    }
    for (const wheel of this.wheels) if (moving) wheel.rotation.x -= dt * state.speed / 0.4;
    this.shadow.position.set(this.player.position.x, 0.018, 0);
    const shadowScale = 1 + state.y * 0.07;
    this.shadow.scale.set(shadowScale, shadowScale, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.55 - state.y * 0.03);
    this.shield.visible = state.shield > 0;
    this.shield.rotation.y += dt;
    if (menu) {
      const portrait = this.camera.aspect < 0.8;
      const target = this.targetCamera.set(garage ? 5.2 : 5.5, garage ? 2.6 : 2.4, garage ? 6.5 : 6.2);
      if (portrait) target.set(8, 5.5, 13.5);
      this.camera.position.lerp(target, 1 - Math.exp(-dt * 2.5));
      if (portrait) this.camera.lookAt(-0.8, 4.1, 0); else this.camera.lookAt(garage ? -3.9 : -4.5, 0.65, -0.3);
      this.camera.fov = 48;
    } else {
      const height = state.y;
      const target = this.targetCamera.set(state.x * 0.38, 4.4 + height * 0.83, 10.5 + (state.boosting ? 1.4 : 0));
      this.camera.position.lerp(target, 1 - Math.exp(-dt * (this.lastStatus === 'menu' ? 3.5 : 5)));
      this.camera.lookAt(state.x * 0.52, 1.2 + height * 0.8, -15);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, state.boosting ? 68 : 58, Math.min(1, dt * 3));
    }
    this.camera.updateProjectionMatrix();
    this.syncEntities(menu ? [] : state.entities, dt);
    this.streaks.visible = state.boosting && moving;
    this.streaks.position.set(state.x, state.y, (this.elapsed * 80) % 50);
    this.lastStatus = state.status;
    if (this.quality === 'high') this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  private buildRoad() {
    const textureCanvas = document.createElement('canvas'); textureCanvas.width = textureCanvas.height = 256;
    const ctx = textureCanvas.getContext('2d')!;
    ctx.fillStyle = '#393b40'; ctx.fillRect(0, 0, 256, 256);
    let seed = 13;
    for (let i = 0; i < 28000; i++) {
      seed = (seed * 16807) % 2147483647; const x = seed % 256;
      seed = (seed * 16807) % 2147483647; const y = seed % 256;
      ctx.fillStyle = i % 2 ? 'rgba(15,18,17,.13)' : 'rgba(220,220,210,.10)'; ctx.fillRect(x, y, 1, 1);
    }
    const asphalt = new THREE.CanvasTexture(textureCanvas); asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping; asphalt.repeat.set(10, 200); asphalt.colorSpace = THREE.SRGBColorSpace;
    const road = new THREE.Mesh(new THREE.BoxGeometry(22.5, 0.6, ROAD_LENGTH), new THREE.MeshStandardMaterial({ color: '#747780', roughness: 0.97, map: asphalt }));
    road.position.set(0, -0.31, -340); road.receiveShadow = true; this.road.add(road);
    const lineMaterial = new THREE.MeshStandardMaterial({ color: '#ddd8b7', roughness: 0.9 });
    const lines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.10, 0.02, 4), lineMaterial, 140);
    const m = new THREE.Matrix4(); let n = 0;
    for (let z = 60; z > -770; z -= 24) for (const x of [-5.4, -1.8, 1.8, 5.4]) { m.makeTranslation(x, 0.016, z); lines.setMatrixAt(n++, m); }
    lines.count = n; this.road.add(lines);
    const stripMat = new THREE.MeshStandardMaterial({ color: '#d4b76d', roughness: 0.65 });
    for (const x of [-9.4, 9.4]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, ROAD_LENGTH), stripMat); edge.position.set(x, 0.025, -340); this.road.add(edge);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, ROAD_LENGTH), new THREE.MeshStandardMaterial({ color: '#8c8b7b', roughness: 0.9 })); curb.position.set(x * 1.12, 0.2, -340); this.road.add(curb);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.44, ROAD_LENGTH), new THREE.MeshStandardMaterial({ color: '#a5a49a', metalness: 0.75, roughness: 0.4 })); rail.position.set(x * 1.12, 1, -340); this.road.add(rail);
    }
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 1.1, 0.18), new THREE.MeshStandardMaterial({ color: '#81847b', metalness: 0.6 }), 140);
    n = 0; for (let z = 50; z > -780; z -= 12) for (const x of [-10.5, 10.5]) { m.makeTranslation(x, 0.55, z); posts.setMatrixAt(n++, m); } posts.count = n; this.road.add(posts);
    this.scene.add(this.road);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: '#3e513f', roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -8, -400); this.scene.add(ground);
    const vergeMaterial = new THREE.MeshStandardMaterial({ color: '#40523c', roughness: 1 });
    for (const x of [-24, 24]) {
      const verge = new THREE.Mesh(new THREE.BoxGeometry(25, 6, ROAD_LENGTH), vergeMaterial);
      verge.position.set(x, -5, -340); this.road.add(verge);
    }
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1200, 2200), new THREE.MeshStandardMaterial({ color: '#587579', metalness: 0.2, roughness: 0.45 })); ocean.rotation.x = -Math.PI / 2; ocean.position.set(-660, -6.5, -400); this.scene.add(ocean);
  }

  private buildScenery() {
    let seed = 1138; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion();
    const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#7a627f', roughness: 0.9, map: this.buildingTexture() }), 110);
    for (let i = 0; i < 110; i++) {
      const h = 12 + rand() * 85, w = 10 + rand() * 22;
      m.compose(new THREE.Vector3(38 + rand() * 280, h / 2 - 8, -rand() * 950), q, new THREE.Vector3(w, h, w * 0.7));
      buildings.setMatrixAt(i, m); buildings.setColorAt(i, new THREE.Color().setHSL(0.10 + rand() * 0.08, 0.07, 0.30 + rand() * 0.2));
    } this.scenery.add(buildings);
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.25, 11, 6);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#746b50', roughness: 1 }), 80);
    const leaves = new THREE.InstancedMesh(this.palmFrondGeometry(), new THREE.MeshStandardMaterial({ color: '#344f35', side: THREE.DoubleSide, roughness: 1 }), 640);
    const obj = new THREE.Object3D();
    for (let i = 0; i < 80; i++) {
      const x = (i % 2 ? -1 : 1) * (15 + rand() * 8), z = 65 - i * 12;
      const height = 0.8 + rand() * 0.5;
      m.compose(new THREE.Vector3(x, 5.5 * height - 2, z), q, new THREE.Vector3(1, height, 1)); trunks.setMatrixAt(i, m);
      for (let j = 0; j < 8; j++) { obj.position.set(x, 11 * height - 2, z); obj.rotation.set(0, j * Math.PI / 4 + rand() * 0.15, 0.03 + rand() * 0.16); obj.scale.setScalar(0.85 + rand() * 0.35); obj.updateMatrix(); leaves.setMatrixAt(i * 8 + j, obj.matrix); }
    } this.scenery.add(trunks, leaves);
    const lamps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.12, 10, 6), new THREE.MeshStandardMaterial({ color: '#4e5755', metalness: 0.65, roughness: 0.4 }), 40);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 0.1, 0.14), new THREE.MeshStandardMaterial({ color: '#4e5755', metalness: 0.65 }), 40);
    const bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: '#fff0ba', emissive: '#ffcf75', emissiveIntensity: 1.4 }), 40);
    for (let i = 0; i < 40; i++) {
      const side = i % 2 ? -1 : 1, z = 60 - Math.floor(i / 2) * 44;
      m.makeTranslation(side * 11.7, 5, z); lamps.setMatrixAt(i, m);
      m.makeTranslation(side * 10.2, 10, z); arms.setMatrixAt(i, m);
      m.makeTranslation(side * 9.4, 9.93, z); bulbs.setMatrixAt(i, m);
    } this.scenery.add(lamps, arms, bulbs);
    for (let i = 0; i < 12; i++) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(130 + rand() * 140, 70 + rand() * 130, 6), new THREE.MeshStandardMaterial({ color: '#928c89', roughness: 1, flatShading: true }));
      hill.position.set(-450 + i * 95, -18, -690 - rand() * 300); hill.rotation.y = rand() * 6; this.scene.add(hill);
    }
    for (let i = 0; i < 5; i++) this.scenery.add(this.makeSign(-100 - i * 200));
    for (let i = 0; i < 4; i++) this.scenery.add(this.makeBillboard(i, -150 - i * 220));
    // Two identical kilometre segments let the nearest scenery wrap without popping.
    const nextSegment = this.scenery.clone(true); nextSegment.position.z = -SCENERY_LENGTH;
    this.scenery.add(nextSegment);
    this.scene.add(this.scenery);
  }

  private buildingTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#606775'; ctx.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 8) for (let x = 3; x < 64; x += 8) { ctx.fillStyle = (x + y) % 3 ? '#293d4d' : '#ac865e'; ctx.fillRect(x, y, 4, 4); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  private palmFrondGeometry() {
    const vertices: number[] = [];
    const curve = (t: number) => 0.45 * Math.sin(t * Math.PI) - 1.65 * t * t;
    const triangle = (...points: number[][]) => { for (const point of points) vertices.push(...point); };
    for (let i = 0; i < 12; i++) {
      const t = i / 12, next = (i + 1) / 12;
      const x = t * 4.8, nx = next * 4.8, y = curve(t), ny = curve(next);
      triangle([x, y, -0.035], [nx, ny, -0.025], [x, y, 0.035]);
      triangle([x, y, 0.035], [nx, ny, -0.025], [nx, ny, 0.025]);
      if (i === 0) continue;
      const width = 0.12 + Math.sin(t * Math.PI) * 0.6;
      for (const side of [-1, 1]) triangle([x - 0.15, y, 0], [x + 0.48, y - 0.11, side * width], [x + 0.17, y - 0.025, 0]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.computeVertexNormals();
    return geometry;
  }
  private makeSign(z: number) {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#8d9287', metalness: 0.65, roughness: 0.4 });
    for (const x of [-12, 12]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 14, 6), metal); pole.position.set(x, 7, z); group.add(pole); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(24, 0.4, 0.4), metal); beam.position.set(0, 13, z); group.add(beam);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#284b40'; ctx.fillRect(0, 0, 1024, 256); ctx.strokeStyle = '#c8d4bc'; ctx.lineWidth = 6; ctx.strokeRect(10, 10, 1004, 236);
    ctx.fillStyle = '#e8edda'; ctx.textAlign = 'center'; ctx.font = 'bold 52px sans-serif'; ctx.fillText('PACIFIC COAST   /   NORTH', 512, 95); ctx.font = '42px sans-serif'; ctx.fillText('↓           OPEN ROAD           ↓', 512, 183);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(13, 3.25, 0.18), [metal, metal, metal, metal, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), metal]); sign.position.set(0, 11.3, z); group.add(sign); return group;
  }

  private makeBillboard(index: number, z: number) {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#596261', metalness: 0.65, roughness: 0.45 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(14.6, 7.6, 0.4), metal);
    frame.position.y = 13; group.add(frame);
    for (const x of [-4, 4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 13, 0.45), metal);
      post.position.set(x, 6.5, -0.1); group.add(post);
    }
    const texture = new THREE.TextureLoader().load(asset(`reference/textures/billboard_${index}.jpg`), loaded => {
      if (this.disposed) loaded.dispose();
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.textures.add(texture);
    const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: '#ffffff', emissiveIntensity: 0.2, roughness: 0.8 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), material);
    panel.position.set(0, 13, 0.23); group.add(panel);
    const side = index % 2 ? -1 : 1;
    group.position.set(side * 26, 0, z); group.rotation.y = -side * 0.25;
    return group;
  }

  private async loadTraffic() {
    try {
      const gltf = await new GLTFLoader().loadAsync(asset('reference/models/traffic.glb'));
      if (this.disposed) { this.disposeObjects([gltf.scene]); return; }
      this.ownedRoots.add(gltf.scene);
      const colors = ['#b65342', '#ddd4bf', '#7d9199', '#e1b74c', '#c3c9bf', '#527773', '#afc0bf', '#c9ae70', '#9e4940'];
      for (const [index, type] of TRAFFIC_TYPES.entries()) {
        const source = gltf.scene.getObjectByName(type);
        if (!source) throw new Error(`Traffic model is missing ${type}`);
        const model = source.clone(true);
        const materials = new Map<THREE.Material, THREE.Material>();
        model.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true; object.receiveShadow = true;
          const cloneMaterial = (original: THREE.Material) => {
            let copy = materials.get(original);
            if (!copy) {
              copy = original.clone(); materials.set(original, copy);
              if (copy instanceof THREE.MeshStandardMaterial) {
                if (/^paint$/i.test(copy.name)) copy.color.set(colors[index]);
                if (/headlight/i.test(copy.name)) { copy.emissive.set('#fff0c8'); copy.emissiveIntensity = 0.8; }
                if (/^brake$/i.test(copy.name)) { copy.emissive.set('#e52e20'); copy.emissiveIntensity = 0.9; }
              }
            }
            return copy;
          };
          object.material = Array.isArray(object.material) ? object.material.map(cloneMaterial) : cloneMaterial(object.material);
        });
        model.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model, true);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const scale = Math.min(1, 6 / Math.max(size.z, 0.001));
        model.position.x -= center.x; model.position.y -= bounds.min.y; model.position.z -= center.z;
        const template = new THREE.Group(); template.add(model); template.scale.setScalar(scale);
        template.userData.bounds = { width: size.x * scale, height: size.y * scale, length: size.z * scale };
        template.userData.trafficType = type;
        this.trafficTemplates[index] = template; this.ownedRoots.add(template);
      }
    } catch (error) {
      if (!this.disposed) console.warn('Using built-in traffic; original traffic asset unavailable.', error);
    }
  }

  private makeTraffic(variant: number, color?: string) {
    const group = new THREE.Group();
    const colors = ['#a9b9b1', '#e9d9ba', '#8f9baf', '#ba6a52', '#6a7772', '#d5b760'];
    const body = new THREE.MeshPhysicalMaterial({ color: color ?? colors[variant % colors.length], metalness: 0.62, roughness: 0.28, clearcoat: 0.8 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#24363e', metalness: 0.45, roughness: 0.1, clearcoat: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: '#151b1b', roughness: 0.6 });
    const truck = variant % 5 === 4, van = variant % 5 === 3;
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
    };
    box(1.9, 0.48, 4.3, 0, 0.58, 0, body);
    box(1.95, 0.12, 4.4, 0, 0.31, 0, dark);
    if (truck || van) { box(1.85, truck ? 2 : 1.4, truck ? 3 : 3.6, 0, truck ? 1.65 : 1.3, truck ? 0.5 : 0, body); box(1.65, 0.55, 0.08, 0, 1.24, -1.56, glass); }
    else {
      const cabin = box(1.62, 0.65, 1.95, 0, 1.08, 0.15, glass); cabin.rotation.x = 0.02;
      box(1.64, 0.08, 1.3, 0, 1.42, 0.28, body);
      box(0.07, 0.65, 1.9, -0.8, 1.08, 0.15, body); box(0.07, 0.65, 1.9, 0.8, 1.08, 0.15, body);
      box(1.75, 0.13, 1.1, 0, 0.86, -1.3, body);
    }
    for (const x of [-0.97, 0.97]) for (const z of [-1.28, 1.25]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.25, 16), dark); tire.rotation.z = Math.PI / 2; tire.position.set(x, 0.39, z); tire.castShadow = true; group.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.26, 10), new THREE.MeshStandardMaterial({ color: '#8d9592', metalness: 0.9, roughness: 0.2 })); rim.rotation.z = Math.PI / 2; rim.position.copy(tire.position); group.add(rim);
    }
    const rear = new THREE.MeshStandardMaterial({ color: '#d92b1d', emissive: '#e5391c', emissiveIntensity: 2 });
    const head = new THREE.MeshStandardMaterial({ color: '#fff8d8', emissive: '#fff0c8', emissiveIntensity: 1 });
    for (const x of [-0.67, 0.67]) { box(0.4, 0.09, 0.06, x, 0.75, 2.17, rear); box(0.4, 0.09, 0.06, x, 0.76, -2.17, head); }
    box(0.5, 0.16, 0.025, 0, 0.5, 2.21, new THREE.MeshStandardMaterial({ color: '#e4e4cb' }));
    return group;
  }

  private buildThrusters() {
    const group = new THREE.Group();
    const chrome = new THREE.MeshStandardMaterial({ color: '#323c38', metalness: 0.9, roughness: 0.25 });
    for (const x of [-0.7, 0.7]) {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.3, 20, 1, true), chrome); nozzle.rotation.x = Math.PI / 2; nozzle.position.set(x, 0.4, 2.25); group.add(nozzle);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 1.7, 14, 1, true), new THREE.MeshBasicMaterial({ color: '#d5f4a0', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      flame.rotation.x = Math.PI / 2; flame.position.set(x, 0.4, 3.1); this.exhausts.push(flame); group.add(flame);
    }
    return group;
  }

  private syncEntities(entities: Entity[], dt: number) {
    this.entityIds.clear();
    for (const entity of entities) this.entityIds.add(entity.id);
    for (const [id, group] of this.entityMeshes) if (!this.entityIds.has(id)) {
      this.releaseEntity(group); this.entityMeshes.delete(id);
    }
    for (const entity of entities) {
      const variant = ((entity.variant % TRAFFIC_TYPES.length) + TRAFFIC_TYPES.length) % TRAFFIC_TYPES.length;
      const traffic = this.trafficTemplates[variant];
      const key = entity.kind === 'traffic' ? `traffic:${traffic ? 'original' : 'fallback'}:${variant}` : `${entity.kind}:${entity.pickup ?? ''}`;
      let group = this.entityMeshes.get(entity.id);
      if (group && group.userData.entityKey !== key) { this.releaseEntity(group); group = undefined; }
      if (!group) {
        let template = this.entityTemplates.get(key);
        if (!template) {
          template = entity.kind === 'traffic' ? traffic ?? this.makeTraffic(variant) : this.makePickup(entity);
          this.entityTemplates.set(key, template); this.ownedRoots.add(template);
        }
        group = this.entityPools.get(key)?.pop() ?? template.clone(true);
        group.userData.entityKey = key;
        this.entityMeshes.set(entity.id, group); this.scene.add(group);
      }
      group.position.set(entity.x, entity.y, entity.z);
      if (entity.kind === 'pickup') { group.position.y += Math.sin(this.elapsed * 3 + entity.id) * 0.16; group.rotation.y += dt * 1.6; }
    }
  }

  private releaseEntity(group: THREE.Group) {
    this.scene.remove(group);
    group.rotation.set(0, 0, 0);
    const key = group.userData.entityKey as string;
    let pool = this.entityPools.get(key);
    if (!pool) { pool = []; this.entityPools.set(key, pool); }
    // Clones share their prototype's geometry and material. Only the scene nodes are recycled.
    if (pool.length < 24) pool.push(group);
  }
  private makePickup(entity: Entity) {
    const group = new THREE.Group();
    if (entity.kind === 'ramp') {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.25, 6), new THREE.MeshStandardMaterial({ color: '#cadf69', metalness: 0.5, roughness: 0.45 })); ramp.rotation.x = -0.19; ramp.position.y = 0.45; group.add(ramp); return group;
    }
    if (entity.kind === 'barrier') {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(3, 1.3, 0.7), new THREE.MeshStandardMaterial({ color: '#d78042', roughness: 0.8 })); barrier.position.y = 0.65; group.add(barrier); return group;
    }
    const colors: Record<string, string> = { bolt: '#dcf569', air: '#9be4ee', shield: '#84f2c4', magnet: '#ed98d3', double: '#ffe7a4', rocket: '#ffa166' };
    const color = colors[entity.pickup ?? 'bolt'];
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.2, emissive: color, emissiveIntensity: 0.7 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.07, 8, 20), mat); group.add(ring);
    const icon = new THREE.Mesh(new THREE.OctahedronGeometry(entity.pickup === 'bolt' ? 0.23 : 0.32), mat); group.add(icon);
    return group;
  }
  private createShadow() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const ctx = c.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64); gradient.addColorStop(0, 'rgba(0,0,0,1)'); gradient.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 6.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.55 })); mesh.rotation.x = -Math.PI / 2; return mesh;
  }
  private createStreaks() {
    const points: number[] = [];
    for (let i = 0; i < 60; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 28, z = Math.random() * -100; if (Math.abs(x) < 5) continue; points.push(x, y, z, x, y, z + 5); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.35 }));
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; ++this.modelRequest;
    this.bloom.dispose(); this.output.dispose(); this.composer.dispose();
    this.sun.shadow.dispose();
    this.environmentGenerator?.dispose(); this.environmentGenerator = null;
    this.scene.environment = null;
    this.environmentTarget?.dispose(); this.environmentTarget = null;
    this.disposeObjects([this.scene, ...this.ownedRoots], this.textures);
    this.renderer.dispose(); this.scene.clear();
    this.entityMeshes.clear(); this.entityPools.clear(); this.entityTemplates.clear();
    this.modelCache.clear(); this.modelLoads.clear(); this.trafficTemplates = [];
    this.ownedRoots.clear(); this.textures.clear();
  }

  private disposeObjects(roots: Iterable<THREE.Object3D>, extraTextures: Iterable<THREE.Texture> = []) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set(extraTextures);
    const instances = new Set<THREE.InstancedMesh>();
    for (const root of roots) root.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
      if (object instanceof THREE.InstancedMesh) instances.add(object);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      if (material instanceof THREE.ShaderMaterial) {
        for (const uniform of Object.values(material.uniforms)) if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
      }
    }
    for (const instance of instances) instance.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Entity, GameState } from './simulation';
import { spinWheels } from './vehicle';
import { carById, FACTORY, FINISH_PARAMS, type CarLook } from './cars';
import { GANTRY_LAYOUT } from './road-layout';
import { LANE_WIDTH, roadFor, type RoadModeId } from './run-settings';
import {
  createRoadGeometry,
  createGantryGeometry,
  roadMetrics,
  roadProfileKey,
  gameplayRoadCamera,
  followGameplayCamera,
  trafficRoadPose,
  ROAD_MARKING_PERIOD,
} from './road-geometry';
import { animateBarricade, createBarricade } from './barricade';
import { TRAFFIC_CATALOG, TRAFFIC_PAINTS, trafficSpec } from './traffic-catalog';
import { animateTrafficVehicle, createTrafficVehicle } from './traffic-model';
import {
  createTrafficLights,
  disposeInstanceBuffers,
  disposeTrafficLights,
  updatePlayerPosition,
  updateTrafficLights,
  type TrafficLights,
} from './presentation';

const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
const PAINT_MATERIAL = /paint|body.*color|carpaint|tripo_material/i;
const RIM_MATERIAL = /^(?:WheelFace|Rim1|Rim2)$/;
const FLAME_SLOTS = 4;
/** Turntable angle that shows a front wheel to the paint-shop camera on the RIMS tab. */
const RIM_VIEW_YAW = -1.3;
const wrapAngle = (angle: number) =>
  THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
const SCENERY_LENGTH = GANTRY_LAYOUT.repeatLength;

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
  private roadMode: string | null = null;
  private roadModes = new Map<string, { road: THREE.Group; scenery: THREE.Group }>();
  private asphalt: THREE.Texture | null = null;
  private billboardTextures = new Map<number, THREE.Texture>();
  private gantryTexture: THREE.Texture | null = null;
  private car = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private entityMeshes = new Map<number, THREE.Group>();
  private exhausts: THREE.Mesh[] = [];
  private nozzles: THREE.Mesh[] = [];
  private wheels: THREE.Object3D[] = [];
  private paints: THREE.MeshStandardMaterial[] = [];
  private rims: THREE.MeshStandardMaterial[] = [];
  private shadow: THREE.Mesh;
  private shield: THREE.Mesh;
  private streaks: THREE.LineSegments;
  private quality: 'high' | 'performance' = 'high';
  private elapsed = 0;
  private lastStatus = 'menu';
  private disposed = false;
  private modelRequest = 0;
  private loadedModel = '';
  private look: CarLook = { ...carById('roadster').look };
  /** Showroom turntable angle and spin from pointer drags; reset when a run starts. */
  private menuYaw = 0;
  private menuYawVelocity = 0;
  private menuDragging = false;
  /** The paint shop's RIMS tab pulls the camera in toward the wheels. */
  private showroomFocus: 'car' | 'wheels' = 'car';
  private reducedMotion =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  private modelCache = new Map<string, THREE.Group>();
  private modelLoads = new Map<string, Promise<THREE.Group | null>>();
  private trafficTemplates = new Map<number, THREE.Group>();
  private entityTemplates = new Map<string, THREE.Group>();
  private entityPools = new Map<string, THREE.Group[]>();
  private trafficLights = new Map<THREE.Group, TrafficLights>();
  private ownedRoots = new Set<THREE.Object3D>();
  private textures = new Set<THREE.Texture>();
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
  private environmentGenerator: THREE.PMREMGenerator | null = null;
  private targetCamera = new THREE.Vector3();
  private targetAim = new THREE.Vector3();
  private entityIds = new Set<number>();
  private fogDay = new THREE.Color('#927b94');
  private fogNight = new THREE.Color('#302a54');
  onModelLoaded?: (name: string) => void;
  onModelError?: (name: string) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
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
    Object.assign(this.sun.shadow.camera, {
      left: -24,
      right: 24,
      top: 40,
      bottom: -28,
      near: 1,
      far: 240,
    });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    const rim = new THREE.DirectionalLight('#c7d4ff', 1.1);
    rim.position.set(8, 10, 15);
    this.scene.add(rim);
    const pmrem = (this.environmentGenerator = new THREE.PMREMGenerator(this.renderer));
    const room = new RoomEnvironment();
    this.environmentTarget = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environmentTarget.texture;
    room.dispose();
    new HDRLoader().load(
      asset('venice_sunset_1k.hdr'),
      (hdr) => {
        if (!this.disposed) {
          const target = pmrem.fromEquirectangular(hdr);
          this.environmentTarget?.dispose();
          this.environmentTarget = target;
          this.scene.environment = target.texture;
          this.scene.environmentIntensity = 0.95;
        }
        hdr.dispose();
        if (this.environmentGenerator === pmrem) {
          pmrem.dispose();
          this.environmentGenerator = null;
        }
      },
      undefined,
      () => {
        if (this.environmentGenerator === pmrem) {
          pmrem.dispose();
          this.environmentGenerator = null;
        }
      },
    );

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1200, 32, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { night: { value: 0 } },
        vertexShader:
          'varying vec3 vWorld; void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
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
      }),
    );
    this.scene.add(this.sky);
    this.buildTerrain();
    this.setRoadMode('normal');
    this.car = this.makeTraffic(0, '#d7ed65');
    this.car.scale.setScalar(1.08);
    this.ownedRoots.add(this.car);
    this.player.add(this.car);
    this.player.add(this.buildThrusters());
    this.scene.add(this.player);
    this.shadow = this.createShadow();
    this.scene.add(this.shadow);
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(3.1, 24, 16),
      new THREE.MeshBasicMaterial({
        color: '#b8f1cb',
        transparent: true,
        opacity: 0.09,
        wireframe: true,
        depthWrite: false,
      }),
    );
    this.shield.visible = false;
    this.player.add(this.shield);
    this.streaks = this.createStreaks();
    this.scene.add(this.streaks);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.28, 0.5, 1.4);
    this.composer.addPass(this.bloom);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.resize();
    this.camera.position.set(5.5, 2.4, 6.2);
    this.camera.lookAt(-4.5, 0.65, -0.3);
    void this.loadCar(carById('roadster').model);
  }

  async loadCar(path: string) {
    if (this.disposed) return;
    const request = ++this.modelRequest;
    if (this.loadedModel === path) {
      this.onModelLoaded?.(path);
      return;
    }
    try {
      let model = this.modelCache.get(path);
      if (!model) {
        let pending = this.modelLoads.get(path);
        if (!pending) {
          pending = this.loadPlayerModel(path);
          this.modelLoads.set(path, pending);
          void pending.finally(() => this.modelLoads.delete(path));
        }
        model = (await pending) ?? undefined;
      }
      if (this.disposed || request !== this.modelRequest) return;
      if (!model) {
        this.onModelError?.(path);
        return;
      }
      this.player.remove(this.car);
      this.car = model;
      this.wheels = [];
      const paintMaterials = new Set<THREE.MeshStandardMaterial>();
      const rimMaterials = new Set<THREE.MeshStandardMaterial>();
      this.car.traverse((object) => {
        if (/^Wheel(?:Front|Rear)[LR]$/i.test(object.name)) this.wheels.push(object);
        if (!(object instanceof THREE.Mesh)) return;
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
          if (PAINT_MATERIAL.test(mat.name)) paintMaterials.add(mat);
          else if (RIM_MATERIAL.test(mat.name)) rimMaterials.add(mat);
        }
      });
      this.paints = [...paintMaterials];
      this.rims = [...rimMaterials];
      this.applyLook();
      this.layoutThrusters(model.userData.thrusters as THREE.Vector3[] | undefined);
      this.player.add(this.car);
      this.loadedModel = path;
      this.onModelLoaded?.(path);
    } catch (error) {
      if (!this.disposed)
        console.warn('Using built-in vehicle; detailed model unavailable.', error);
    }
  }

  private async loadPlayerModel(path: string): Promise<THREE.Group | null> {
    try {
      const gltf = await new GLTFLoader().loadAsync(asset(path));
      if (this.disposed) {
        this.disposeObjects([gltf.scene]);
        return null;
      }
      const model = new THREE.Group();
      const oriented = new THREE.Group();
      oriented.rotation.y = Math.PI;
      oriented.add(gltf.scene);
      oriented.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(oriented, true);
      const size = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.z) || size.z <= 0) {
        this.disposeObjects([gltf.scene]);
        return null;
      }
      const scale = 4.3 / size.z;
      const center = bounds.getCenter(new THREE.Vector3());
      oriented.scale.setScalar(scale);
      oriented.position.set(-center.x * scale, -bounds.min.y * scale + 0.03, -center.z * scale);
      model.add(oriented);
      model.userData.bounds = { width: size.x * scale, height: size.y * scale, length: 4.3 };
      // Models that carry their own thrusters mark each nozzle exit; flames attach there.
      model.updateMatrixWorld(true);
      const thrusters: THREE.Vector3[] = [];
      for (let i = 0; i < FLAME_SLOTS; i++) {
        const mount = gltf.scene.getObjectByName(`ThrusterMount${i}`);
        if (mount) thrusters.push(mount.getWorldPosition(new THREE.Vector3()));
      }
      if (thrusters.length) model.userData.thrusters = thrusters;
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        for (const mat of mats) {
          if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
          if (/tripo_material/i.test(mat.name)) {
            mat.color.set('#ffffff');
            mat.metalness = Math.min(0.6, mat.metalness);
            mat.normalScale.set(0.3, 0.3);
            mat.envMapIntensity = 1.5;
          } else if (/paint/i.test(mat.name) && mat.name !== 'CarPaint') {
            mat.metalness = 0.8;
            mat.roughness = 0.24;
          }
          // Remember the authored finish so the paint shop can always restore it.
          if (PAINT_MATERIAL.test(mat.name) || RIM_MATERIAL.test(mat.name)) {
            const physical = mat as THREE.MeshPhysicalMaterial;
            mat.userData.factory = {
              color: mat.color.clone(),
              metalness: mat.metalness,
              roughness: mat.roughness,
              clearcoat: physical.clearcoat ?? 0,
              clearcoatRoughness: physical.clearcoatRoughness ?? 0,
            };
          }
          if (mat.map)
            mat.map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          if (/license/i.test(mat.name)) {
            if (mat.map) this.textures.add(mat.map);
            mat.map = null;
            mat.color.set('#181b18');
            mat.needsUpdate = true;
          }
          // The procedural roadster's `BrakeLight` is already tuned; light the others' lamps.
          if (/brakelight/i.test(mat.name) && mat.name !== 'BrakeLight') {
            mat.emissive.set('#ff2e0b');
            mat.emissiveIntensity = 2;
          }
        }
      });
      this.modelCache.set(path, model);
      this.ownedRoots.add(model);
      return model;
    } catch (error) {
      if (!this.disposed) console.warn('Vehicle asset could not be loaded.', error);
      return null;
    }
  }

  /** Paint shop: body colour, finish and rim colour for the current (and any later) car. */
  setLook(look: CarLook) {
    this.look = { ...look };
    this.applyLook();
  }

  private applyLook() {
    const { body, finish, rim } = this.look;
    for (const mat of this.paints) {
      const factory = mat.userData.factory;
      if (!factory) continue;
      const params = finish === 'factory' ? factory : FINISH_PARAMS[finish];
      if (body === FACTORY) mat.color.copy(factory.color);
      else mat.color.set(body);
      mat.metalness = params.metalness;
      mat.roughness = params.roughness;
      if (mat instanceof THREE.MeshPhysicalMaterial) {
        mat.clearcoat = params.clearcoat;
        mat.clearcoatRoughness = params.clearcoatRoughness;
      }
    }
    for (const mat of this.rims) {
      const factory = mat.userData.factory;
      if (!factory) continue;
      if (rim === FACTORY) mat.color.copy(factory.color);
      else mat.color.set(rim);
    }
  }

  /** Showroom turntable: drag deltas in radians, with a release fling. */
  dragMenuYaw(delta: number) {
    this.menuDragging = true;
    this.menuYaw += delta;
    this.menuYawVelocity = THREE.MathUtils.clamp(delta * 60, -6, 6);
  }
  releaseMenuYaw() {
    this.menuDragging = false;
  }
  setShowroomFocus(focus: 'car' | 'wheels') {
    this.showroomFocus = focus;
  }

  /** Point the flames at the model's own thruster mounts, or at the generic nozzles. */
  private layoutThrusters(mounts: THREE.Vector3[] | undefined) {
    for (const nozzle of this.nozzles) nozzle.visible = !mounts;
    this.exhausts.forEach((flame, i) => {
      const base = flame.userData.base as THREE.Vector3;
      // Cold-gas thrusters vent a pale blue plume; the generic nozzles keep the electric green.
      (flame.material as THREE.MeshBasicMaterial).color.set(mounts ? '#cfe6ff' : '#d5f4a0');
      if (mounts) {
        flame.userData.enabled = i < mounts.length;
        if (i < mounts.length) base.copy(mounts[i]);
        flame.userData.radius = 0.32;
      } else {
        flame.userData.enabled = i < 2;
        base.set(i === 0 ? -0.7 : 0.7, 0.4, 2.25);
        flame.userData.radius = 1;
      }
    });
  }
  setQuality(quality: 'high' | 'performance') {
    this.quality = quality;
    if (this.disposed) return;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.6 : 1),
    );
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.renderer.shadowMap.enabled = quality === 'high';
    this.bloom.enabled = quality === 'high';
    this.resize();
  }
  resize() {
    if (this.disposed) return;
    const width = Math.max(1, window.innerWidth),
      height = Math.max(1, window.innerHeight);
    this.renderer.setSize(width, height);
    this.composer?.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(state: GameState, dt: number, garage = false) {
    if (this.disposed) return;
    dt = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.1) : 0;
    this.elapsed += dt;
    const menu = state.status === 'menu';
    const moving = state.status === 'playing';
    this.setRoadMode(state.options?.mode ?? 'normal', state.options?.laneCount);
    const travel = menu ? this.elapsed * 2 : state.distance;
    const roadOffset = travel % ROAD_MARKING_PERIOD;
    this.road.position.z = roadOffset;
    this.scenery.position.z = travel % SCENERY_LENGTH;
    const night = menu ? 0 : Math.pow(Math.sin((state.distance / 4400) * Math.PI), 2) * 0.8;
    (this.sky.material as THREE.ShaderMaterial).uniforms.night.value = night;
    this.sun.intensity = 2.6 - night * 1.7;
    this.scene.environmentIntensity = 0.95 - night * 0.35;
    if (this.scene.fog instanceof THREE.Fog)
      this.scene.fog.color.copy(this.fogDay).lerp(this.fogNight, night);
    updatePlayerPosition(this.player.position, state, dt);
    const rollAngle =
      state.roll > 0 ? state.rollDirection * (1 - state.roll / 0.65) * Math.PI * 2 : 0;
    const lean = menu
      ? 0
      : THREE.MathUtils.clamp((state.lane * LANE_WIDTH - state.x) * -0.065, -0.18, 0.18);
    this.player.rotation.z = rollAngle + lean;
    this.player.rotation.x = menu ? 0 : THREE.MathUtils.clamp(-state.vy * 0.014, -0.12, 0.2);
    if (menu) {
      // Drag to spin the car; it coasts, then the garage turntable takes over.
      if (!this.menuDragging) {
        this.menuYaw += this.menuYawVelocity * dt;
        this.menuYawVelocity *= Math.exp(-dt * 2.5);
        const settled = Math.abs(this.menuYawVelocity) < 0.3;
        if (garage && this.showroomFocus === 'wheels' && settled) {
          // RIMS: park the car front three-quarter on to the paint-shop camera so a wheel faces it.
          const offset = wrapAngle(RIM_VIEW_YAW - this.menuYaw);
          this.menuYaw += offset * (1 - Math.exp(-dt * 3));
        } else if (garage && settled && !this.reducedMotion?.matches) this.menuYaw += dt * 0.22;
      }
    } else if (this.menuYaw !== 0) {
      // Unwind the turntable over a few frames rather than snapping the car round.
      const unwound = wrapAngle(this.menuYaw) * Math.exp(-dt * 6);
      this.menuYaw = Math.abs(unwound) < 1e-3 ? 0 : unwound;
      this.menuYawVelocity = 0;
    }
    this.player.rotation.y = menu
      ? 0.12 + this.menuYaw
      : THREE.MathUtils.clamp((state.lane * LANE_WIDTH - state.x) * -0.04, -0.12, 0.12) +
        this.menuYaw;
    if (state.status === 'crashed') {
      this.player.rotation.z += Math.sin(this.elapsed * 7) * 0.08;
    }
    const fly = !menu && (state.y > 0.5 || state.boosting);
    for (let i = 0; i < this.exhausts.length; i++) {
      const flame = this.exhausts[i];
      const base = flame.userData.base as THREE.Vector3;
      const radius = flame.userData.radius as number;
      flame.visible = fly && flame.userData.enabled === true;
      const length = (fly ? 1.7 : 0.15) * (0.85 + Math.sin(this.elapsed * 50 + i) * 0.15);
      flame.scale.set(radius, length, radius);
      flame.position.set(base.x, base.y, base.z + 0.85 * length);
      (flame.material as THREE.MeshBasicMaterial).opacity = fly ? 0.8 : 0.35;
    }
    if (moving) spinWheels(this.wheels, dt * state.speed);
    this.shadow.position.set(this.player.position.x, 0.018, 0);
    const shadowScale = 1 + state.y * 0.07;
    this.shadow.scale.set(shadowScale, shadowScale, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(
      0.08,
      0.55 - state.y * 0.03,
    );
    this.shield.visible = state.shield > 0;
    this.shield.rotation.y += dt;
    if (menu) {
      const portrait = this.camera.aspect < 0.8;
      const target = this.targetCamera.set(
        garage ? 5.2 : 5.5,
        garage ? 2.6 : 2.4,
        garage ? 6.5 : 6.2,
      );
      // Narrower than 16:10, back off so the turntable car stays clear of the screen edge.
      target.multiplyScalar(THREE.MathUtils.clamp(1.6 / this.camera.aspect, 1, 1.25));
      // Portrait stacks the menu over a showroom sheet: centre the car between them, a little
      // below the middle under the hero copy and higher (seen from above) over the paint shop.
      if (portrait) target.set(9, garage ? 8.4 : 6.2, 15.2);
      // RIMS tab: dolly in low and centre the car so the wheels fill the frame.
      const wheels = garage && this.showroomFocus === 'wheels';
      // Portrait keeps its height so the car stays in the clear band above the paint sheet.
      if (wheels) target.set(target.x * 0.62, portrait ? target.y : 1.15, target.z * 0.62);
      // The paint shop swings round to the sun side: facing the low sun backlit the paint and
      // bloomed chrome, so colours are judged front-lit instead. Orbiting by angle rather than a
      // straight lerp keeps the camera clear of the car on the way round, and the aim turns with
      // it so the car keeps its place in the frame.
      const pos = this.camera.position;
      const ease = 1 - Math.exp(-dt * 2.5);
      const base = Math.atan2(target.x, target.z);
      let angle = Math.atan2(pos.x, pos.z);
      const goal = base + (garage ? 2.35 : 0);
      angle +=
        (THREE.MathUtils.euclideanModulo(goal - angle + Math.PI, Math.PI * 2) - Math.PI) * ease;
      const radius = THREE.MathUtils.lerp(
        Math.hypot(pos.x, pos.z),
        Math.hypot(target.x, target.z),
        ease,
      );
      pos.set(
        Math.sin(angle) * radius,
        THREE.MathUtils.lerp(pos.y, target.y, ease),
        Math.cos(angle) * radius,
      );
      const aimX = portrait ? 0 : wheels ? -1.6 : garage ? -3.9 : -4.5;
      const aimZ = portrait ? 0 : -0.3;
      const turn = angle - base;
      this.camera.lookAt(
        aimX * Math.cos(turn) + aimZ * Math.sin(turn),
        // Portrait: the aim follows the camera height so switching panels pans smoothly.
        portrait ? THREE.MathUtils.clamp(1.6 - (pos.y - 6.2) * 2, -2.8, 1.6) : wheels ? 0.4 : 0.65,
        aimZ * Math.cos(turn) - aimX * Math.sin(turn),
      );
      this.camera.fov = 48;
    } else {
      const height = state.y;
      const pose = gameplayRoadCamera(
        state.x,
        height,
        this.camera.aspect,
        state.boosting,
        this.targetCamera,
        this.targetAim,
      );
      const target = pose.position;
      const pos = this.camera.position;
      const ease = 1 - Math.exp(-dt * (this.lastStatus === 'menu' ? 3.5 : 5));
      if (pos.z < 2) {
        // Leaving the paint shop's front view: swing round the car instead of through it.
        const angle = Math.atan2(pos.x, pos.z);
        const goal = Math.atan2(target.x, target.z);
        const next =
          angle +
          (THREE.MathUtils.euclideanModulo(goal - angle + Math.PI, Math.PI * 2) - Math.PI) * ease;
        const radius = THREE.MathUtils.lerp(
          Math.hypot(pos.x, pos.z),
          Math.hypot(target.x, target.z),
          ease,
        );
        pos.set(
          Math.sin(next) * radius,
          THREE.MathUtils.lerp(pos.y, target.y, ease),
          Math.cos(next) * radius,
        );
      } else followGameplayCamera(pos, target, this.camera.aspect, ease);
      // Watch the car while the camera is still swinging round from in front of it, then hand
      // over to the usual look down the road once it is behind (pos.z is about 10.5 in play).
      const behind = THREE.MathUtils.smoothstep(pos.z, -2, 8);
      this.camera.lookAt(
        THREE.MathUtils.lerp(state.x, pose.lookAt.x, behind),
        THREE.MathUtils.lerp(0.6 + height, pose.lookAt.y, behind),
        THREE.MathUtils.lerp(0, pose.lookAt.z, behind),
      );
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, pose.fov, Math.min(1, dt * 3));
    }
    this.camera.updateProjectionMatrix();
    this.syncEntities(menu ? [] : state.entities, dt, state.time);
    this.streaks.visible = state.boosting && moving;
    this.streaks.position.set(state.x, state.y, (this.elapsed * 80) % 50);
    this.lastStatus = state.status;
    if (this.quality === 'high') this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private setRoadMode(mode: RoadModeId, laneCount?: number) {
    const count = roadFor(mode, laneCount).lanes.length;
    const key = roadProfileKey(mode, count);
    if (key === this.roadMode) return;
    this.scene.remove(this.road, this.scenery);
    let cached = this.roadModes.get(key);
    if (!cached) {
      this.road = this.buildRoad(mode, count);
      this.scenery = new THREE.Group();
      this.buildScenery(mode, count);
      cached = { road: this.road, scenery: this.scenery };
      this.roadModes.set(key, cached);
      this.ownedRoots.add(cached.road);
      this.ownedRoots.add(cached.scenery);
    }
    this.road = cached.road;
    this.scenery = cached.scenery;
    this.scene.add(this.road, this.scenery);
    this.roadMode = key;
  }

  private buildRoad(mode: RoadModeId, laneCount: number) {
    if (!this.asphalt) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#393b40';
      context.fillRect(0, 0, 256, 256);
      let seed = 13;
      for (let i = 0; i < 28000; i++) {
        seed = (seed * 16807) % 2147483647;
        const x = seed % 256;
        seed = (seed * 16807) % 2147483647;
        const y = seed % 256;
        context.fillStyle = i % 2 ? 'rgba(15,18,17,.13)' : 'rgba(220,220,210,.10)';
        context.fillRect(x, y, 1, 1);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(10, 200);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.asphalt = texture;
      this.textures.add(texture);
    }
    return createRoadGeometry(mode, this.asphalt, laneCount);
  }

  private buildTerrain() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshStandardMaterial({ color: '#3e513f', roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -8, -400);
    this.scene.add(ground);
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 2200),
      new THREE.MeshStandardMaterial({ color: '#587579', metalness: 0.2, roughness: 0.45 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(-660, -6.5, -400);
    this.scene.add(ocean);
  }

  private buildScenery(mode: RoadModeId, laneCount: number) {
    const metrics = roadMetrics(mode, laneCount);
    let seed = 1138;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const buildings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: '#7a627f',
        roughness: 0.9,
        map: this.buildingTexture(),
      }),
      110,
    );
    for (let i = 0; i < 110; i++) {
      const h = 12 + rand() * 85,
        w = 10 + rand() * 22;
      m.compose(
        new THREE.Vector3(38 + metrics.sceneryOffset + rand() * 280, h / 2 - 8, -rand() * 950),
        q,
        new THREE.Vector3(w, h, w * 0.7),
      );
      buildings.setMatrixAt(i, m);
      buildings.setColorAt(
        i,
        new THREE.Color().setHSL(0.1 + rand() * 0.08, 0.07, 0.3 + rand() * 0.2),
      );
    }
    this.scenery.add(buildings);
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.25, 11, 6);
    const trunks = new THREE.InstancedMesh(
      trunkGeo,
      new THREE.MeshStandardMaterial({ color: '#746b50', roughness: 1 }),
      80,
    );
    const leaves = new THREE.InstancedMesh(
      this.palmFrondGeometry(),
      new THREE.MeshStandardMaterial({ color: '#344f35', side: THREE.DoubleSide, roughness: 1 }),
      640,
    );
    const obj = new THREE.Object3D();
    for (let i = 0; i < 80; i++) {
      const x = (i % 2 ? -1 : 1) * (15 + metrics.sceneryOffset + rand() * 8),
        z = 65 - i * 12;
      const height = 0.8 + rand() * 0.5;
      m.compose(new THREE.Vector3(x, 5.5 * height - 2, z), q, new THREE.Vector3(1, height, 1));
      trunks.setMatrixAt(i, m);
      for (let j = 0; j < 8; j++) {
        obj.position.set(x, 11 * height - 2, z);
        obj.rotation.set(0, (j * Math.PI) / 4 + rand() * 0.15, 0.03 + rand() * 0.16);
        obj.scale.setScalar(0.85 + rand() * 0.35);
        obj.updateMatrix();
        leaves.setMatrixAt(i * 8 + j, obj.matrix);
      }
    }
    this.scenery.add(trunks, leaves);
    const lamps = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.07, 0.12, 10, 6),
      new THREE.MeshStandardMaterial({ color: '#4e5755', metalness: 0.65, roughness: 0.4 }),
      40,
    );
    const arms = new THREE.InstancedMesh(
      new THREE.BoxGeometry(3.2, 0.1, 0.14),
      new THREE.MeshStandardMaterial({ color: '#4e5755', metalness: 0.65 }),
      40,
    );
    const bulbs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.3, 0.08, 0.3),
      new THREE.MeshStandardMaterial({
        color: '#fff0ba',
        emissive: '#ffcf75',
        emissiveIntensity: 1.4,
      }),
      40,
    );
    for (let i = 0; i < 40; i++) {
      const side = i % 2 ? -1 : 1,
        z = 60 - Math.floor(i / 2) * 44;
      m.makeTranslation(side * metrics.lampX, 5, z);
      lamps.setMatrixAt(i, m);
      m.makeTranslation(side * (metrics.lampX - 1.5), 10, z);
      arms.setMatrixAt(i, m);
      m.makeTranslation(side * metrics.edgeX, 9.93, z);
      bulbs.setMatrixAt(i, m);
    }
    this.scenery.add(lamps, arms, bulbs);
    for (let i = 0; i < (this.roadModes.size === 0 ? 12 : 0); i++) {
      const hill = new THREE.Mesh(
        new THREE.ConeGeometry(130 + rand() * 140, 70 + rand() * 130, 6),
        new THREE.MeshStandardMaterial({ color: '#928c89', roughness: 1, flatShading: true }),
      );
      hill.position.set(-450 + i * 95, -18, -690 - rand() * 300);
      hill.rotation.y = rand() * 6;
      this.scene.add(hill);
    }
    for (let i = 0; i < GANTRY_LAYOUT.count; i++)
      this.scenery.add(
        this.makeSign(-GANTRY_LAYOUT.firstDistance - i * GANTRY_LAYOUT.spacing, mode, laneCount),
      );
    for (let i = 0; i < 4; i++)
      this.scenery.add(this.makeBillboard(i, -150 - i * 220, mode, laneCount));
    // Two identical kilometre segments let the nearest scenery wrap without popping.
    const nextSegment = this.scenery.clone(true);
    nextSegment.position.z = -SCENERY_LENGTH;
    this.scenery.add(nextSegment);
    this.scene.add(this.scenery);
  }

  private buildingTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#606775';
    ctx.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 8)
      for (let x = 3; x < 64; x += 8) {
        ctx.fillStyle = (x + y) % 3 ? '#293d4d' : '#ac865e';
        ctx.fillRect(x, y, 4, 4);
      }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private palmFrondGeometry() {
    const vertices: number[] = [];
    const curve = (t: number) => 0.45 * Math.sin(t * Math.PI) - 1.65 * t * t;
    const triangle = (...points: number[][]) => {
      for (const point of points) vertices.push(...point);
    };
    for (let i = 0; i < 12; i++) {
      const t = i / 12,
        next = (i + 1) / 12;
      const x = t * 4.8,
        nx = next * 4.8,
        y = curve(t),
        ny = curve(next);
      triangle([x, y, -0.035], [nx, ny, -0.025], [x, y, 0.035]);
      triangle([x, y, 0.035], [nx, ny, -0.025], [nx, ny, 0.025]);
      if (i === 0) continue;
      const width = 0.12 + Math.sin(t * Math.PI) * 0.6;
      for (const side of [-1, 1])
        triangle([x - 0.15, y, 0], [x + 0.48, y - 0.11, side * width], [x + 0.17, y - 0.025, 0]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
  private makeSign(z: number, mode: RoadModeId, laneCount: number) {
    if (!this.gantryTexture) {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 256;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#284b40';
      ctx.fillRect(0, 0, 1024, 256);
      ctx.strokeStyle = '#c8d4bc';
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 10, 1004, 236);
      ctx.fillStyle = '#e8edda';
      ctx.textAlign = 'center';
      ctx.font = 'bold 52px sans-serif';
      ctx.fillText('PACIFIC COAST   /   NORTH', 512, 95);
      ctx.font = '42px sans-serif';
      ctx.fillText('↓           OPEN ROAD           ↓', 512, 183);
      const texture = new THREE.CanvasTexture(c);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.gantryTexture = texture;
      this.textures.add(texture);
    }
    const group = createGantryGeometry(
      mode,
      new THREE.MeshStandardMaterial({ map: this.gantryTexture, roughness: 0.8 }),
      laneCount,
    );
    group.position.z = z;
    return group;
  }

  private makeBillboard(index: number, z: number, mode: RoadModeId, laneCount: number) {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({
      color: '#596261',
      metalness: 0.65,
      roughness: 0.45,
    });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(14.6, 7.6, 0.4), metal);
    frame.position.y = 13;
    group.add(frame);
    for (const x of [-4, 4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 13, 0.45), metal);
      post.position.set(x, 6.5, -0.1);
      group.add(post);
    }
    let texture = this.billboardTextures.get(index);
    if (!texture) {
      texture = new THREE.TextureLoader().load(
        asset(`reference/textures/billboard_${index}.jpg`),
        (loaded) => {
          if (this.disposed) loaded.dispose();
        },
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      this.textures.add(texture);
      this.billboardTextures.set(index, texture);
    }
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      emissiveMap: texture,
      emissive: '#ffffff',
      emissiveIntensity: 0.2,
      roughness: 0.8,
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), material);
    panel.position.set(0, 13, 0.23);
    group.add(panel);
    const side = index % 2 ? -1 : 1;
    group.position.set(side * roadMetrics(mode, laneCount).billboardX, 0, z);
    group.rotation.y = -side * 0.25;
    return group;
  }

  private makeTraffic(variant: number, color?: string) {
    const group = new THREE.Group();
    const colors = ['#a9b9b1', '#e9d9ba', '#8f9baf', '#ba6a52', '#6a7772', '#d5b760'];
    const body = new THREE.MeshPhysicalMaterial({
      color: color ?? colors[variant % colors.length],
      metalness: 0.62,
      roughness: 0.28,
      clearcoat: 0.8,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#24363e',
      metalness: 0.45,
      roughness: 0.1,
      clearcoat: 1,
    });
    const dark = new THREE.MeshStandardMaterial({ color: '#151b1b', roughness: 0.6 });
    const truck = variant % 5 === 4,
      van = variant % 5 === 3;
    const box = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      material: THREE.Material,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    box(1.9, 0.48, 4.3, 0, 0.58, 0, body);
    box(1.95, 0.12, 4.4, 0, 0.31, 0, dark);
    if (truck || van) {
      box(1.85, truck ? 2 : 1.4, truck ? 3 : 3.6, 0, truck ? 1.65 : 1.3, truck ? 0.5 : 0, body);
      box(1.65, 0.55, 0.08, 0, 1.24, -1.56, glass);
    } else {
      const cabin = box(1.62, 0.65, 1.95, 0, 1.08, 0.15, glass);
      cabin.rotation.x = 0.02;
      box(1.64, 0.08, 1.3, 0, 1.42, 0.28, body);
      box(0.07, 0.65, 1.9, -0.8, 1.08, 0.15, body);
      box(0.07, 0.65, 1.9, 0.8, 1.08, 0.15, body);
      box(1.75, 0.13, 1.1, 0, 0.86, -1.3, body);
    }
    for (const x of [-0.97, 0.97])
      for (const z of [-1.28, 1.25]) {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.25, 16), dark);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(x, 0.39, z);
        tire.castShadow = true;
        group.add(tire);
        const rim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.25, 0.26, 10),
          new THREE.MeshStandardMaterial({ color: '#8d9592', metalness: 0.9, roughness: 0.2 }),
        );
        rim.rotation.z = Math.PI / 2;
        rim.position.copy(tire.position);
        group.add(rim);
      }
    const rear = new THREE.MeshStandardMaterial({
      name: 'Brake',
      color: '#d92b1d',
      emissive: '#e5391c',
      emissiveIntensity: 2,
    });
    const head = new THREE.MeshStandardMaterial({
      color: '#fff8d8',
      emissive: '#fff0c8',
      emissiveIntensity: 1,
    });
    for (const x of [-0.67, 0.67]) {
      box(0.4, 0.09, 0.06, x, 0.75, 2.17, rear);
      box(0.4, 0.09, 0.06, x, 0.76, -2.17, head);
    }
    box(0.5, 0.16, 0.025, 0, 0.5, 2.21, new THREE.MeshStandardMaterial({ color: '#e4e4cb' }));
    return group;
  }

  private buildThrusters() {
    const group = new THREE.Group();
    const chrome = new THREE.MeshStandardMaterial({
      color: '#323c38',
      metalness: 0.9,
      roughness: 0.25,
    });
    for (const x of [-0.7, 0.7]) {
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.21, 0.3, 20, 1, true),
        chrome,
      );
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(x, 0.4, 2.25);
      this.nozzles.push(nozzle);
      group.add(nozzle);
    }
    // Enough flames for four built-in thrusters; layoutThrusters decides which burn and where.
    for (let i = 0; i < FLAME_SLOTS; i++) {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 1.7, 14, 1, true),
        new THREE.MeshBasicMaterial({
          color: '#d5f4a0',
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      flame.rotation.x = Math.PI / 2;
      flame.userData.base = new THREE.Vector3();
      flame.visible = false;
      this.exhausts.push(flame);
      group.add(flame);
    }
    this.layoutThrusters(undefined);
    return group;
  }

  private syncEntities(entities: Entity[], dt: number, time: number) {
    this.entityIds.clear();
    for (const entity of entities) this.entityIds.add(entity.id);
    for (const [id, group] of this.entityMeshes)
      if (!this.entityIds.has(id)) {
        this.releaseEntity(group);
        this.entityMeshes.delete(id);
      }
    for (const entity of entities) {
      const spec = trafficSpec(entity.variant);
      const variant = TRAFFIC_CATALOG.indexOf(spec);
      const appearance =
        spec.livery === 'none'
          ? Math.abs(Math.trunc(entity.appearance ?? entity.id)) % TRAFFIC_PAINTS.length
          : 0;
      const key =
        entity.kind === 'traffic'
          ? `traffic:${variant}:${appearance}`
          : entity.kind === 'barrier'
            ? `barrier:${entity.y > 0 ? 'flying' : 'ground'}`
            : `${entity.kind}:${entity.pickup ?? ''}`;
      let group = this.entityMeshes.get(entity.id);
      if (group && group.userData.entityKey !== key) {
        this.releaseEntity(group);
        group = undefined;
      }
      if (!group) {
        let template = this.entityTemplates.get(key);
        if (!template) {
          template =
            entity.kind === 'traffic'
              ? this.fleetTemplate(variant, appearance)
              : this.makePickup(entity);
          this.entityTemplates.set(key, template);
          this.ownedRoots.add(template);
        }
        group = this.entityPools.get(key)?.pop() ?? template.clone(true);
        if (entity.kind === 'traffic' && !this.trafficLights.has(group)) {
          this.trafficLights.set(group, createTrafficLights(group));
        }
        group.userData.entityKey = key;
        this.entityMeshes.set(entity.id, group);
        this.scene.add(group);
      }
      group.position.set(entity.x, entity.y, entity.z);
      const lights = this.trafficLights.get(group);
      const pose = trafficRoadPose(entity);
      if (lights)
        updateTrafficLights(lights, { signal: pose.signal, braking: entity.braking }, time);
      if (entity.kind === 'traffic') {
        animateTrafficVehicle(group, time, entity.speed ?? spec.cruiseSpeed, pose.steer);
        group.rotation.y = pose.heading;
      }
      if (entity.kind === 'pickup') {
        group.position.y += Math.sin(this.elapsed * 3 + entity.id) * 0.16;
        group.rotation.y += dt * 1.6;
      }
      if (entity.kind === 'barrier') animateBarricade(group, time + entity.id * 0.21);
    }
  }

  private fleetTemplate(variant: number, appearance: number): THREE.Group {
    let base = this.trafficTemplates.get(variant);
    if (!base) {
      base = createTrafficVehicle(variant);
      this.trafficTemplates.set(variant, base);
      this.ownedRoots.add(base);
    }
    const template = base.clone(true);
    const copies = new Map<THREE.Material, THREE.Material>();
    template.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const paint = (material: THREE.Material) => {
        if (!(material instanceof THREE.MeshStandardMaterial) || material.name !== 'Paint')
          return material;
        let copy = copies.get(material);
        if (!copy) {
          copy = material.clone();
          (copy as THREE.MeshStandardMaterial).color.set(TRAFFIC_PAINTS[appearance].color);
          copies.set(material, copy);
        }
        return copy;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(paint)
        : paint(object.material);
    });
    return template;
  }

  private releaseEntity(group: THREE.Group) {
    this.scene.remove(group);
    group.rotation.set(0, 0, 0);
    const key = group.userData.entityKey as string;
    let pool = this.entityPools.get(key);
    if (!pool) {
      pool = [];
      this.entityPools.set(key, pool);
    }
    // Clones share their prototype's geometry and material. Only the scene nodes are recycled.
    const traffic = key.startsWith('traffic:');
    const dormantTraffic = traffic
      ? [...this.entityPools.entries()].reduce(
          (count, [poolKey, groups]) =>
            count + (poolKey.startsWith('traffic:') ? groups.length : 0),
          0,
        )
      : 0;
    if (pool.length < (traffic ? 2 : 24) && (!traffic || dormantTraffic < 96)) pool.push(group);
    else {
      disposeInstanceBuffers(group);
      const lights = this.trafficLights.get(group);
      if (lights) {
        disposeTrafficLights(lights);
        this.trafficLights.delete(group);
      }
    }
  }
  private makePickup(entity: Entity) {
    const group = new THREE.Group();
    if (entity.kind === 'ramp') {
      const ramp = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 0.25, 6),
        new THREE.MeshStandardMaterial({ color: '#cadf69', metalness: 0.5, roughness: 0.45 }),
      );
      ramp.rotation.x = -0.19;
      ramp.position.y = 0.45;
      group.add(ramp);
      return group;
    }
    if (entity.kind === 'barrier') {
      return createBarricade(entity.y > 0);
    }
    const colors: Record<string, string> = {
      bolt: '#dcf569',
      air: '#9be4ee',
      shield: '#84f2c4',
      magnet: '#ed98d3',
      double: '#ffe7a4',
      rocket: '#ffa166',
    };
    const color = colors[entity.pickup ?? 'bolt'];
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.65,
      roughness: 0.2,
      emissive: color,
      emissiveIntensity: 0.7,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.07, 8, 20), mat);
    group.add(ring);
    const icon = new THREE.Mesh(
      new THREE.OctahedronGeometry(entity.pickup === 'bolt' ? 0.23 : 0.32),
      mat,
    );
    group.add(icon);
    if (entity.pickup && entity.pickup !== 'bolt') {
      const labels = {
        air: 'AIR',
        shield: 'SHIELD',
        magnet: 'MAGNET',
        double: '2×',
        rocket: 'ROCKET',
      };
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 96;
      const context = canvas.getContext('2d')!;
      context.fillStyle = 'rgba(12, 22, 20, 0.88)';
      context.fillRect(0, 0, 320, 96);
      context.strokeStyle = color;
      context.lineWidth = 5;
      context.strokeRect(3, 3, 314, 90);
      context.font = 'bold 46px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = color;
      context.fillText(labels[entity.pickup], 160, 49);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.textures.add(texture);
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, depthWrite: false, toneMapped: false }),
      );
      label.position.y = 1.05;
      label.scale.set(2.1, 0.63, 1);
      group.add(label);
    }
    return group;
  }
  private createShadow() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 6.5),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }
  private createStreaks() {
    const points: number[] = [];
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 60,
        y = Math.random() * 28,
        z = Math.random() * -100;
      if (Math.abs(x) < 5) continue;
      points.push(x, y, z, x, y, z + 5);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0.35 }),
    );
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    ++this.modelRequest;
    this.bloom.dispose();
    this.output.dispose();
    this.composer.dispose();
    this.sun.shadow.dispose();
    this.environmentGenerator?.dispose();
    this.environmentGenerator = null;
    this.scene.environment = null;
    this.environmentTarget?.dispose();
    this.environmentTarget = null;
    this.disposeObjects(
      [
        this.scene,
        ...this.ownedRoots,
        ...this.trafficLights.keys(),
        ...[...this.entityPools.values()].flat(),
      ],
      this.textures,
    );
    this.renderer.dispose();
    this.scene.clear();
    this.entityMeshes.clear();
    this.entityPools.clear();
    this.trafficLights.clear();
    this.entityTemplates.clear();
    this.modelCache.clear();
    this.modelLoads.clear();
    this.trafficTemplates.clear();
    this.roadModes.clear();
    this.billboardTextures.clear();
    this.gantryTexture = null;
    this.asphalt = null;
    this.ownedRoots.clear();
    this.textures.clear();
  }

  private disposeObjects(
    roots: Iterable<THREE.Object3D>,
    extraTextures: Iterable<THREE.Texture> = [],
  ) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set(extraTextures);
    const instances = new Set<THREE.InstancedMesh>();
    for (const root of roots)
      root.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Line ||
          object instanceof THREE.Points
        ) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(material);
        }
        if (object instanceof THREE.InstancedMesh) instances.add(object);
        if (object instanceof THREE.Sprite) materials.add(object.material);
      });
    for (const material of materials) {
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) textures.add(value);
      if (material instanceof THREE.ShaderMaterial) {
        for (const uniform of Object.values(material.uniforms))
          if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
      }
    }
    for (const instance of instances) instance.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
  }
}

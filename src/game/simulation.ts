import { gantryFor, PLAYER_BODY } from './road-layout';
import { BARRICADE_BODY } from './barricade-layout';
import {
  normalizeRampKind,
  RAMP_KINDS,
  RAMP_LAYOUT,
  sampleRamp,
  type RampKind,
} from './ramp-layout';
import { TRAFFIC_CATALOG, TRAFFIC_PAINTS, trafficBounds, trafficSpec } from './traffic-catalog';
import { createRunSeed, createSeededRandom } from './run-random';
import { createShuffledBag, generateOpening, randomGap } from './run-generation';
import {
  contactWindow,
  findReachableRoute,
  flightCycleSeconds,
  type RouteBody,
  type RouteWaypoint,
} from './route-planner';
import {
  DEFAULT_RUN_OPTIONS,
  LANE_WIDTH,
  directionForLane,
  difficultyFor,
  roadFor,
  sanitizeRunOptions,
  type RunOptions,
  type ResolvedRunOptions,
} from './run-settings';

export type GameStatus = 'menu' | 'playing' | 'paused' | 'crashed';
export type PickupKind = 'bolt' | 'air' | 'shield' | 'magnet' | 'double' | 'rocket';
export interface Entity {
  id: number;
  kind: 'traffic' | 'pickup' | 'barrier' | 'ramp';
  x: number;
  y: number;
  z: number;
  lane: number;
  variant: number;
  pickup?: PickupKind;
  passed?: boolean;
  targetLane?: number;
  signal?: -1 | 0 | 1;
  braking?: boolean;
  appearance?: number;
  speed?: number;
  direction?: 1 | -1;
  rampKind?: RampKind;
}
export interface GameEvent {
  type: string;
  label?: string;
}
export interface GameState {
  readonly options: ResolvedRunOptions;
  readonly seed: number;
  status: GameStatus;
  time: number;
  distance: number;
  score: number;
  bolts: number;
  speed: number;
  lane: number;
  x: number;
  y: number;
  vy: number;
  air: number;
  roll: number;
  rollDirection: number;
  rollDuration: number;
  rampBank: number;
  rampPitch: number;
  rollCooldown: number;
  boosting: boolean;
  combo: number;
  comboTimer: number;
  shield: number;
  magnet: number;
  double: number;
  rocket: number;
  invincible: number;
  entities: Entity[];
  events: GameEvent[];
  nearMisses: number;
}
export interface Controls {
  left: boolean;
  right: boolean;
  accelerate: boolean;
  fly: boolean;
  dive: boolean;
  rollLeft: boolean;
  rollRight: boolean;
}
export const EMPTY_CONTROLS: Controls = Object.freeze({
  left: false,
  right: false,
  accelerate: false,
  fly: false,
  dive: false,
  rollLeft: false,
  rollRight: false,
});

const freshState = (
  status: GameStatus,
  options: ResolvedRunOptions = DEFAULT_RUN_OPTIONS,
  seed = 0,
): GameState => ({
  options,
  seed,
  status,
  time: 0,
  distance: 0,
  score: 0,
  bolts: 0,
  speed: difficultyFor(options.difficulty).cruiseSpeed,
  lane: roadFor(options.mode, options.laneCount).startLane,
  x: roadFor(options.mode, options.laneCount).startLane * LANE_WIDTH,
  y: 0,
  vy: 0,
  air: 100,
  roll: 0,
  rollDirection: 1,
  rollDuration: 0.65,
  rampBank: 0,
  rampPitch: 0,
  rollCooldown: 0,
  boosting: false,
  combo: 1,
  comboTimer: 0,
  shield: 0,
  magnet: 0,
  double: 0,
  rocket: 0,
  invincible: 0,
  entities: [],
  events: [],
  nearMisses: 0,
});

const ROLL_DURATION = 0.65;
// A full roll needs enough tyre clearance for the body to rotate above the surface.
const ROLL_CLEARANCE = Math.hypot(PLAYER_BODY.width / 2, PLAYER_BODY.height);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const approach = (value: number, target: number, rate: number, dt: number) =>
  target + (value - target) * Math.exp(-rate * dt);
const LANE_CHANGE_TIME = 1.15;
interface TrafficMotion {
  decisionAt: number;
  brakeAt: number;
  brakeUntil: number;
  warningAt: number;
  movingAt: number | null;
  sourceLane: number;
  speed?: number;
}

/** A renderer-independent run. All distances are metres, speeds metres/second.
 * The player stays at z=0; incoming entities travel from negative to positive z.
 * Roll and pickup effects are remaining seconds, and lane is the target lane.
 */
export class Simulation {
  state: GameState = freshState('menu');
  private readonly fixedSeed: number | undefined;
  private lastSeed: number | undefined;
  private randomSource = createSeededRandom(0);
  private nextId = 1;
  private nextWaveDistance = 130;
  private wave = 0;
  private previous: Controls = { ...EMPTY_CONTROLS };
  private flightExhausted = false;
  private roofId: number | null = null;
  private rampId: number | null = null;
  private pendingRampRoll: { id: number; direction: -1 | 1 } | null = null;
  private nextRampKind: () => RampKind = () => 'straight';
  private rampReservations: { id: number; x: number; start: number; end: number }[] = [];
  private riddenRoofs = new Set<number>();
  private motions = new Map<number, TrafficMotion>();
  private nextMilestone = 1000;
  private airborneTime = 0;
  private bigAirAwarded = false;
  private resolvedGantry = -1;
  private nextAmbientDistance = 110;

  constructor(seed?: number, options: Partial<RunOptions> = DEFAULT_RUN_OPTIONS) {
    this.fixedSeed = seed === undefined ? undefined : seed >>> 0;
    this.randomSource = createSeededRandom(this.fixedSeed ?? 0);
    this.state = freshState('menu', sanitizeRunOptions(options));
  }

  private get road() {
    return roadFor(this.state.options.mode, this.state.options.laneCount);
  }
  private get rules() {
    return difficultyFor(this.state.options.difficulty);
  }
  private laneBit(lane: number) {
    return 1 << this.road.lanes.indexOf(lane);
  }
  private get maxBlockedLanes() {
    if (this.road.lanes.length === 1) return 1;
    return this.road.lanes.length - (this.road.lanes.length >= 4 ? 2 : 1);
  }

  configure(options: unknown): boolean {
    if (this.state.status !== 'menu') return false;
    this.state = freshState('menu', sanitizeRunOptions(options));
    return true;
  }

  start(options?: Partial<RunOptions>): void {
    const seed = this.fixedSeed ?? createRunSeed(this.lastSeed);
    this.lastSeed = seed;
    this.state = freshState(
      'playing',
      sanitizeRunOptions({ ...this.state.options, ...options }),
      seed,
    );
    this.randomSource = createSeededRandom(seed);
    this.nextRampKind = createShuffledBag(RAMP_KINDS, () => this.random());
    this.nextId = 1;
    this.nextWaveDistance = randomGap(130, 110, () => this.random());
    this.nextAmbientDistance = randomGap(110, 90, () => this.random());
    this.nextMilestone = 1000;
    this.motions.clear();
    this.airborneTime = 0;
    this.bigAirAwarded = false;
    this.resolvedGantry = -1;
    this.wave = 0;
    this.previous = { ...EMPTY_CONTROLS };
    this.flightExhausted = false;
    this.roofId = null;
    this.rampId = null;
    this.pendingRampRoll = null;
    this.rampReservations = [];
    this.riddenRoofs.clear();
    for (const entity of generateOpening(this.state.options, () => this.random()))
      this.add(entity.kind, entity.lane, entity.z, entity.y ?? 0, entity.pickup);
    this.state.events.push({ type: 'start' });
  }

  pause(): void {
    if (this.state.status === 'playing') this.state.status = 'paused';
  }

  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'playing';
      this.previous = { ...EMPTY_CONTROLS };
    }
  }

  menu(): void {
    this.state = freshState('menu', this.state.options);
    this.previous = { ...EMPTY_CONTROLS };
    this.flightExhausted = false;
    this.roofId = null;
    this.rampId = null;
    this.pendingRampRoll = null;
    this.rampReservations = [];
    this.riddenRoofs.clear();
    this.motions.clear();
    this.airborneTime = 0;
    this.bigAirAwarded = false;
    this.resolvedGantry = -1;
  }

  getRollReadiness(): 'grounded' | 'low-air' | 'cooldown' | 'ready' {
    const s = this.state;
    if (this.rampId !== null) return 'grounded';
    if (s.y - this.roofFloor() < ROLL_CLEARANCE) return 'grounded';
    if (s.air < 8) return 'low-air';
    return s.rollCooldown > 0 || this.pendingRampRoll ? 'cooldown' : 'ready';
  }

  /** Safe steering witness for the current known course, in seconds from now. */
  getCourseRoute(): RouteWaypoint[] | null {
    return findReachableRoute(
      this.routeContext(),
      this.state.entities.flatMap((entity) => {
        const body = this.routeBody(entity);
        return body ? [body] : [];
      }),
    );
  }

  private routeContext() {
    return {
      lanes: this.road.lanes,
      startX: this.state.x,
      startTargetX: this.state.lane * LANE_WIDTH,
      playerMinSpeed: this.rules.cruiseSpeed,
      playerMaxSpeed: this.rules.rocketSpeed,
    };
  }

  private routeBody(entity: Entity): RouteBody | null {
    if (
      (entity.kind === 'pickup' && entity.pickup !== 'rocket') ||
      entity.passed ||
      entity.y > PLAYER_BODY.height + 0.12
    )
      return null;
    return this.physicalBody(entity);
  }

  private physicalBody(entity: Entity): RouteBody | null {
    if (entity.kind === 'pickup' && entity.pickup !== 'rocket') return null;
    const bounds =
      entity.kind === 'traffic'
        ? trafficBounds(entity.variant)
        : entity.kind === 'pickup'
          ? { width: 0.27, length: 0.3 }
          : entity.kind === 'ramp'
            ? { width: RAMP_LAYOUT.width, length: RAMP_LAYOUT.length }
            : { width: BARRICADE_BODY.width, length: BARRICADE_BODY.depth };
    const speed =
      entity.kind === 'traffic'
        ? trafficSpec(entity.variant).cruiseSpeed * this.rules.trafficSpeed
        : 0;
    const direction = entity.direction ?? 1;
    return {
      x: entity.x,
      z: entity.z,
      ...bounds,
      speedMin: direction < 0 ? -speed : 0,
      speedMax: direction < 0 ? 0 : speed,
      targetX: entity.targetLane === undefined ? undefined : entity.targetLane * LANE_WIDTH,
    };
  }

  private preservesGroundRoute(candidate: Entity): boolean {
    if (this.road.lanes.length === 1) return true;
    const body = this.routeBody(candidate);
    if (!body) return true;
    const bodies = this.state.entities.flatMap((entity) => {
      if (entity.id === candidate.id) return [];
      const existing = this.routeBody(entity);
      return existing ? [existing] : [];
    });
    return findReachableRoute(this.routeContext(), [...bodies, body]) !== null;
  }

  private rampReservation(ramp: Entity) {
    const half = (RAMP_LAYOUT.length + PLAYER_BODY.length) / 2;
    return {
      id: ramp.id,
      x: ramp.x,
      start: this.state.time + Math.max(0, (-ramp.z - half) / this.rules.rocketSpeed),
      end: this.state.time + Math.max(0, (-ramp.z + half) / this.rules.cruiseSpeed) + 2.1,
    };
  }

  /** Reserve an optional stunt's takeoff, flight and landing before accepting other bodies. */
  private preservesRampRunways(candidate: Entity): boolean {
    if ((candidate.kind === 'pickup' && candidate.pickup !== 'rocket') || candidate.y > 9.5)
      return true;
    const conflicts = (bodyEntity: Entity, runway: ReturnType<Simulation['rampReservation']>) => {
      const body = this.physicalBody(bodyEntity);
      if (!body || bodyEntity.id === runway.id || bodyEntity.passed || bodyEntity.y > 9.5)
        return false;
      const halfWidth = (PLAYER_BODY.width + body.width) / 2 + 0.15;
      if (
        Math.min(body.x, body.targetX ?? body.x) - halfWidth > runway.x ||
        Math.max(body.x, body.targetX ?? body.x) + halfWidth < runway.x
      )
        return false;
      const window = contactWindow(this.routeContext(), body);
      return (
        window !== null &&
        this.state.time + window.start <= runway.end &&
        this.state.time + window.end >= runway.start
      );
    };
    if (this.rampReservations.some((runway) => conflicts(candidate, runway))) return false;
    if (candidate.kind === 'ramp') {
      const runway = this.rampReservation(candidate);
      if (this.state.entities.some((entity) => conflicts(entity, runway))) return false;
    }
    return true;
  }

  private preservesSingleLaneFlight(candidate: Entity): boolean {
    if (this.road.lanes.length !== 1) return true;
    const body = this.routeBody(candidate);
    if (!body) return true;
    const window = contactWindow(this.routeContext(), body);
    if (!window || window.start < 0.65) return false;
    const cycle = flightCycleSeconds(this.rules);
    return this.state.entities.every((other) => {
      const existing = this.routeBody(other);
      if (!existing) return true;
      const occupied = contactWindow(this.routeContext(), existing);
      return (
        !occupied || window.start >= occupied.end + cycle || occupied.start >= window.end + cycle
      );
    });
  }

  update(dt: number, controls: Controls): void {
    const s = this.state;
    s.events = [];
    if (s.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    // A background tab never teleports the car through a row of obstacles.
    dt = Math.min(dt, 0.1);
    const left = controls.left && !this.previous.left;
    const right = controls.right && !this.previous.right;
    if (controls.left !== controls.right && (left || right)) {
      const lane = clamp(
        s.lane + (right ? 1 : -1),
        this.road.lanes[0],
        this.road.lanes[this.road.lanes.length - 1],
      );
      if (lane !== s.lane) s.events.push({ type: 'lane' });
      s.lane = lane;
    }
    const rollLeft = controls.rollLeft && !this.previous.rollLeft;
    const rollRight = controls.rollRight && !this.previous.rollRight;
    if (
      controls.rollLeft !== controls.rollRight &&
      (rollLeft || rollRight) &&
      this.getRollReadiness() === 'ready'
    ) {
      s.roll = ROLL_DURATION;
      s.rollDuration = ROLL_DURATION;
      s.rollDirection = rollLeft ? -1 : 1;
      s.rollCooldown = 1.7;
      s.invincible = Math.max(s.invincible, 0.72);
      s.air -= 8;
      s.lane = clamp(
        s.lane + s.rollDirection,
        this.road.lanes[0],
        this.road.lanes[this.road.lanes.length - 1],
      );
      this.trick('roll', 'BARREL ROLL', 100);
    }
    if (!controls.fly) this.flightExhausted = false;
    this.previous = { ...controls };
    const count = Math.ceil(dt / (1 / 120));
    const step = dt / count;
    for (let i = 0; i < count && s.status === 'playing'; i++) this.step(step, controls);
    const live = new Set(
      s.entities.filter((entity) => entity.kind === 'traffic').map((entity) => entity.id),
    );
    for (const id of this.motions.keys()) if (!live.has(id)) this.motions.delete(id);
  }

  private step(dt: number, controls: Controls): void {
    const s = this.state;
    for (const key of [
      'roll',
      'rollCooldown',
      'shield',
      'magnet',
      'double',
      'rocket',
      'invincible',
      'comboTimer',
    ] as const) {
      s[key] = Math.max(0, s[key] - dt);
      if (s[key] < 1e-9) s[key] = 0;
    }
    if (s.comboTimer === 0) s.combo = 1;
    s.time += dt;
    this.rampReservations = this.rampReservations.filter((runway) => runway.end >= s.time);
    const cruise = this.rules.cruiseSpeed + Math.min(this.rules.speedRamp, s.distance / 2200);
    s.boosting = controls.accelerate || s.rocket > 0;
    const targetSpeed =
      s.rocket > 0
        ? this.rules.rocketSpeed
        : controls.accelerate
          ? cruise + this.rules.boostSpeed
          : cruise;
    s.speed = approach(s.speed, targetSpeed, 1.9, dt);
    const travel = s.speed * dt;
    const previousDistance = s.distance;
    s.distance += travel;
    while (s.distance >= this.nextMilestone) {
      s.score +=
        250 *
        (this.nextMilestone / 1000) *
        s.combo *
        (s.double > 0 ? 2 : 1) *
        this.rules.scoreMultiplier;
      s.events.push({ type: 'milestone', label: `${this.nextMilestone / 1000} KM MILESTONE` });
      this.nextMilestone += 1000;
    }
    s.score += travel * 0.6 * s.combo * (s.double > 0 ? 2 : 1) * this.rules.scoreMultiplier;
    const previousX = s.x;
    s.x = approach(s.x, s.lane * LANE_WIDTH, 11, dt);
    const previousY = s.y;
    this.moveVertically(dt, controls, this.roofFloor());
    if (this.rampId === null) {
      s.rampBank = approach(s.rampBank, 0, 8, dt);
      s.rampPitch = approach(s.rampPitch, 0, 8, dt);
    }
    this.collideGantries(previousDistance, previousX, previousY);
    if (s.status !== 'playing') return;

    for (const entity of s.entities) {
      const oldZ = entity.z;
      // Traffic travels forward too; stationary pickups/ramps meet the full road speed.
      const trafficSpeed = entity.kind === 'traffic' ? this.moveTraffic(entity, dt) : 0;
      entity.z += Math.max(0, s.speed - trafficSpeed) * dt;
      const dx = Math.abs(s.x - entity.x);
      if (entity.kind === 'pickup') {
        const magnetic = s.magnet > 0 && entity.pickup === 'bolt';
        const reachX = magnetic ? 5.6 : 1.25;
        const reachY = magnetic ? 4.5 : 1.8;
        const reachZ = magnetic ? 9 : 2.3;
        if (
          !entity.passed &&
          dx < reachX &&
          Math.abs(s.y + 0.9 - entity.y) < reachY &&
          oldZ < reachZ &&
          entity.z > -reachZ
        ) {
          entity.passed = true;
          this.pickup(entity.pickup ?? 'bolt');
        }
        continue;
      }
      if (entity.kind === 'ramp') {
        this.rideRamp(entity, oldZ, previousX, previousY, controls);
        continue;
      }
      const bounds =
        entity.kind === 'traffic'
          ? trafficBounds(entity.variant)
          : {
              width: BARRICADE_BODY.width,
              height: BARRICADE_BODY.height,
              length: BARRICADE_BODY.depth,
            };
      const top = entity.y + bounds.height;
      const width = (2.23 + bounds.width) / 2 - 0.28;
      const depth = (4.3 + bounds.length) / 2 - 0.45;
      const verticalOverlap = s.y + 1.12 > entity.y + 0.12 && s.y < top - 0.12;
      // Feet crossing a roof from above are a landing, rather than a side impact.
      if (
        entity.kind === 'traffic' &&
        s.vy <= 0 &&
        previousY >= top - 0.035 &&
        s.y <= top &&
        dx < bounds.width / 2 + 0.45 &&
        Math.abs(entity.z) < bounds.length / 2 + 0.65
      ) {
        s.y = top;
        s.vy = 0;
        s.roll = 0;
        this.roofId = entity.id;
        entity.passed = true;
        if (!this.riddenRoofs.has(entity.id)) {
          this.riddenRoofs.add(entity.id);
          this.trick('roof-ride', 'ROOF RIDE', 150);
        }
      } else if (
        !entity.passed &&
        dx < width &&
        verticalOverlap &&
        oldZ < depth &&
        entity.z > -depth
      ) {
        if (s.invincible > 0) {
          entity.passed = true;
        } else if (s.shield > 0) {
          s.shield = 0;
          s.invincible = 1.1;
          entity.passed = true;
          s.events.push({ type: 'shield', label: 'SHIELD SAVE' });
        } else {
          s.status = 'crashed';
          s.boosting = false;
          s.events.push({ type: 'crash', label: 'RUN ENDED' });
          break;
        }
      }
      if (!entity.passed && entity.z > depth) {
        entity.passed = true;
        if (dx >= width && dx < width + 2.6 && verticalOverlap) {
          s.nearMisses++;
          s.combo = Math.min(10, s.combo + 1);
          s.comboTimer = 4.5;
          s.score += 100 * s.combo * (s.double > 0 ? 2 : 1) * this.rules.scoreMultiplier;
          s.events.push({ type: 'near-miss', label: `NEAR MISS ×${s.combo}` });
        }
      }
    }
    this.launchRampRoll();
    s.entities = s.entities.filter(
      (entity) => entity.z < 36 && !(entity.kind === 'pickup' && entity.passed),
    );
    if (s.status === 'playing') {
      if (s.y > 0.6) this.airborneTime += dt;
      else if (s.y === 0) {
        this.airborneTime = 0;
        this.bigAirAwarded = false;
      }
      if (!this.bigAirAwarded && this.airborneTime >= 1 && s.y >= 8) {
        this.bigAirAwarded = true;
        this.trick('big-air', 'BIG AIR', 150);
      }
    }
    if (s.status === 'playing' && s.distance >= this.nextWaveDistance) {
      this.spawnWave();
      this.nextWaveDistance += randomGap(
        this.rules.waveGap - s.distance / 100,
        this.rules.waveMinGap,
        () => this.random(),
      );
    }
    if (s.status === 'playing' && s.time > 2 && s.distance >= this.nextAmbientDistance) {
      this.spawnAmbientTraffic();
      this.nextAmbientDistance =
        s.distance +
        randomGap(
          this.rules.ambientGap * (s.distance < 800 ? 4 / 3 : 1),
          this.rules.ambientGap * 0.8,
          () => this.random(),
        );
    }
  }

  private trick(type: string, label: string, points: number): void {
    const s = this.state;
    s.combo = Math.min(10, s.combo + 1);
    s.comboTimer = 4.5;
    s.score += points * s.combo * (s.double > 0 ? 2 : 1) * this.rules.scoreMultiplier;
    s.events.push({ type, label });
  }

  private collideGantries(distance: number, x: number, y: number): void {
    const s = this.state;
    const layout = gantryFor(s.options.mode, s.options.laneCount);
    const halfLength = PLAYER_BODY.length / 2;
    const firstCycle = Math.max(
      0,
      Math.floor(
        (distance - halfLength - layout.beam.depth / 2 - layout.firstDistance) /
          layout.repeatLength,
      ),
    );
    const lastCycle = Math.floor(
      (s.distance + halfLength + layout.beam.depth / 2 - layout.firstDistance) /
        layout.repeatLength,
    );
    for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
      for (let n = 0; n < layout.count; n++) {
        const index = cycle * layout.count + n;
        if (index <= this.resolvedGantry) continue;
        const position = cycle * layout.repeatLength + layout.firstDistance + n * layout.spacing;
        if (
          position + halfLength + layout.beam.depth / 2 < distance ||
          position - halfLength - layout.beam.depth / 2 > s.distance
        )
          continue;
        const hit = [layout.panel, layout.beam].some((part) => {
          const limits = [
            [-part.width / 2 - PLAYER_BODY.width / 2, part.width / 2 + PLAYER_BODY.width / 2],
            [part.y - part.height / 2 - PLAYER_BODY.height, part.y + part.height / 2],
            [position - part.depth / 2 - halfLength, position + part.depth / 2 + halfLength],
          ];
          const from = [x, y, distance];
          const to = [s.x, s.y, s.distance];
          let enter = 0,
            exit = 1;
          // Swept body vs exact scenery bounds, including between frame endpoints.
          for (let axis = 0; axis < 3; axis++) {
            const delta = to[axis] - from[axis];
            const [low, high] = limits[axis];
            if (Math.abs(delta) < 1e-12) {
              if (from[axis] < low || from[axis] > high) return false;
            } else {
              const a = (low - from[axis]) / delta;
              const b = (high - from[axis]) / delta;
              enter = Math.max(enter, Math.min(a, b));
              exit = Math.min(exit, Math.max(a, b));
              if (enter > exit) return false;
            }
          }
          return true;
        });
        if (!hit) continue;
        if (s.invincible > 0) this.resolvedGantry = index;
        else if (s.shield > 0) {
          this.resolvedGantry = index;
          s.shield = 0;
          s.invincible = 1.1;
          s.events.push({ type: 'shield', label: 'SHIELD SAVE' });
        } else {
          s.status = 'crashed';
          s.boosting = false;
          s.events.push({ type: 'crash', label: 'RUN ENDED' });
          return;
        }
      }
    }
  }

  private moveTraffic(entity: Entity, dt: number): number {
    const s = this.state;
    let motion = this.motions.get(entity.id);
    if (!motion) {
      motion = {
        decisionAt: s.time + 0.6 + this.random() * 0.6,
        brakeAt: s.time + 1.3 + this.random() * 0.6,
        brakeUntil: 0,
        warningAt: 0,
        movingAt: null,
        sourceLane: entity.lane,
      };
      this.motions.set(entity.id, motion);
    }
    const baseSpeed = trafficSpec(entity.variant).cruiseSpeed * this.rules.trafficSpeed;
    const direction = entity.direction ?? 1;
    if (s.time >= motion.brakeAt) {
      if (entity.z < -110) motion.brakeUntil = s.time + 1.2;
      motion.brakeAt = Infinity;
    }
    let targetSpeed = baseSpeed * (s.time < motion.brakeUntil ? 0.65 : 1);
    let safeSpeed = Infinity;
    const ownLength = trafficBounds(entity.variant).length;
    let packLanes = this.laneBit(entity.lane);
    for (const other of s.entities) {
      const gap = (entity.z - other.z) * direction;
      if (
        other.id === entity.id ||
        (other.kind !== 'traffic' && other.kind !== 'barrier') ||
        other.y !== 0
      )
        continue;
      if (gap > 0 && gap < 55) {
        packLanes |= this.laneBit(other.lane);
        if (other.targetLane !== undefined) packLanes |= this.laneBit(other.targetLane);
      }
      if (Math.abs(other.x - entity.x) > 1.9) continue;
      if (other.kind === 'traffic' && (other.direction ?? 1) !== direction) continue;
      const otherLength =
        other.kind === 'traffic' ? trafficBounds(other.variant).length : BARRICADE_BODY.depth;
      const followingGap = (ownLength + otherLength) / 2 + this.rules.headway;
      if (gap <= 0 || gap > followingGap + 35) continue;
      const leaderSpeed =
        other.kind === 'traffic'
          ? (other.speed ?? trafficSpec(other.variant).cruiseSpeed * this.rules.trafficSpeed)
          : 0;
      targetSpeed = Math.min(targetSpeed, leaderSpeed + Math.max(0, gap - followingGap) * 0.6);
      safeSpeed = Math.min(safeSpeed, leaderSpeed + Math.max(0, gap - followingGap) / dt);
    }
    // Stagger a solid pack well ahead of the player, leaving a longitudinal escape
    // instead of directing a driver to make a sudden nearby lane change.
    if (
      this.road.lanes.length > 1 &&
      entity.z < -95 &&
      packLanes === (1 << this.road.lanes.length) - 1
    )
      targetSpeed = Math.min(targetSpeed, 6);
    const previousSpeed = motion.speed ?? baseSpeed;
    const actualSpeed = Math.max(
      0,
      Math.min(
        safeSpeed,
        entity.z < -65 ? approach(previousSpeed, targetSpeed, 3, dt) : previousSpeed,
      ),
    );
    motion.speed = actualSpeed;
    entity.speed = actualSpeed;
    entity.braking = actualSpeed < baseSpeed - 0.8;
    const relative = Math.max(20, s.speed - direction * baseSpeed * 0.65);
    if (entity.targetLane !== undefined) {
      if (motion.movingAt === null) {
        if (s.time - motion.warningAt >= this.rules.signalSeconds) {
          // Reserve completion distance for an unexpected rocket picked up mid-maneuver.
          const worstClosing = this.rules.rocketSpeed + (direction < 0 ? baseSpeed : 0);
          if (
            entity.z < -75 &&
            entity.z < -(35 + worstClosing * LANE_CHANGE_TIME) &&
            this.destinationClear(entity, entity.targetLane, LANE_CHANGE_TIME) &&
            this.leavesEscapeLane(entity, entity.targetLane)
          )
            motion.movingAt = s.time;
          else {
            entity.targetLane = undefined;
            entity.signal = 0;
            motion.decisionAt = s.time + this.rules.decisionSeconds;
          }
        }
      } else {
        const progress = clamp((s.time - motion.movingAt) / LANE_CHANGE_TIME, 0, 1);
        const smooth = progress * progress * (3 - 2 * progress);
        entity.x =
          (motion.sourceLane + (entity.targetLane - motion.sourceLane) * smooth) * LANE_WIDTH;
        if (progress === 1) {
          entity.lane = entity.targetLane;
          entity.x = entity.lane * LANE_WIDTH;
          entity.targetLane = undefined;
          entity.signal = 0;
          motion.movingAt = null;
          motion.decisionAt = Infinity;
        }
      }
    } else if (s.time >= motion.decisionAt) {
      motion.decisionAt = s.time + this.rules.decisionSeconds;
      const lead = Math.max(
        75 + relative,
        35 + relative * (this.rules.signalSeconds + LANE_CHANGE_TIME),
      );
      if (
        entity.z < -lead &&
        (this.rules.maneuverChance === 1 || this.random() < this.rules.maneuverChance)
      ) {
        const turnDirection = this.random() < 0.5 ? -1 : 1;
        for (const offset of [turnDirection, -turnDirection]) {
          const lane = entity.lane + offset;
          if (
            !this.road.lanes.includes(lane) ||
            directionForLane(s.options.mode, lane) !== direction ||
            !this.destinationClear(entity, lane, this.rules.signalSeconds + LANE_CHANGE_TIME) ||
            !this.leavesEscapeLane(entity, lane)
          )
            continue;
          motion.sourceLane = entity.lane;
          motion.warningAt = s.time;
          motion.movingAt = null;
          entity.targetLane = lane;
          entity.signal = offset as -1 | 1;
          break;
        }
      }
    }
    return actualSpeed * direction;
  }

  private destinationClear(entity: Entity, lane: number, horizon: number): boolean {
    const ownSpeed =
      (entity.speed ?? trafficSpec(entity.variant).cruiseSpeed * this.rules.trafficSpeed) *
      (entity.direction ?? 1);
    return !this.state.entities.some((other) => {
      if (other.id === entity.id || Math.abs(other.y - entity.y) > 3.5) return false;
      const occupiesLane =
        other.lane === lane ||
        other.targetLane === lane ||
        Math.abs(other.x - lane * LANE_WIDTH) < 2.5;
      if (!occupiesLane) return false;
      const gap = entity.z - other.z;
      if (other.kind === 'pickup' || other.kind === 'ramp') return Math.abs(gap) < 32;
      const otherSpeed =
        other.kind === 'traffic'
          ? (other.speed ?? trafficSpec(other.variant).cruiseSpeed * this.rules.trafficSpeed) *
            (other.direction ?? 1)
          : 0;
      const futureGap = gap + (otherSpeed - ownSpeed) * horizon;
      const bodyGap =
        (trafficBounds(entity.variant).length +
          (other.kind === 'traffic' ? trafficBounds(other.variant).length : BARRICADE_BODY.depth)) /
          2 +
        this.rules.spawnClearance;
      return (
        gap * futureGap <= 0 || Math.min(Math.abs(gap), Math.abs(futureGap)) < Math.max(24, bodyGap)
      );
    });
  }

  private leavesEscapeLane(entity: Entity, destination: number): boolean {
    const occupied = new Set([entity.lane, destination]);
    for (const other of this.state.entities) {
      if (
        other.id === entity.id ||
        other.kind === 'pickup' ||
        other.kind === 'ramp' ||
        Math.abs(other.z - entity.z) > 22
      )
        continue;
      occupied.add(other.lane);
      if (other.targetLane !== undefined) occupied.add(other.targetLane);
      for (const lane of this.road.lanes)
        if (Math.abs(other.x - lane * LANE_WIDTH) < 2) occupied.add(lane);
    }
    return (
      occupied.size <= this.maxBlockedLanes &&
      this.preservesGroundRoute({ ...entity, targetLane: destination }) &&
      this.preservesRampRunways({ ...entity, targetLane: destination })
    );
  }

  private roofFloor(): number {
    if (this.rampId !== null) {
      const ramp = this.state.entities.find((entity) => entity.id === this.rampId);
      if (ramp && !ramp.passed) return this.rampSurface(ramp).y;
      this.rampId = null;
    }
    if (this.roofId === null) return 0;
    const s = this.state;
    const roof = s.entities.find((entity) => entity.id === this.roofId);
    if (roof?.kind === 'traffic') {
      const bounds = trafficBounds(roof.variant);
      const top = roof.y + bounds.height;
      if (
        Math.abs(s.x - roof.x) < bounds.width / 2 + 0.45 &&
        Math.abs(roof.z) < bounds.length / 2 + 0.65 &&
        Math.abs(s.y - top) < 0.08 &&
        s.vy <= 0
      )
        return top;
    }
    this.roofId = null;
    return 0;
  }

  private rampSurface(ramp: Entity, z = ramp.z, x = this.state.x) {
    const kind = normalizeRampKind(ramp.rampKind);
    const t = (RAMP_LAYOUT.length / 2 + z) / RAMP_LAYOUT.length;
    const centre = sampleRamp(kind, t);
    const lateral = (x - ramp.x) / ((RAMP_LAYOUT.width / 2) * Math.cos(centre.bank));
    return { ...sampleRamp(kind, t, lateral), lateral };
  }

  private rideRamp(
    ramp: Entity,
    oldZ: number,
    previousX: number,
    previousY: number,
    controls: Controls,
  ): void {
    const s = this.state,
      half = RAMP_LAYOUT.length / 2;
    const surface = this.rampSurface(ramp);
    const poweredFlight =
      (controls.fly && !controls.dive && s.air > 0 && !this.flightExhausted) || s.rocket > 0;
    if (this.rampId === ramp.id && (Math.abs(surface.lateral) > 0.88 || poweredFlight)) {
      this.rampId = null;
      this.pendingRampRoll = null;
      ramp.passed = true;
      return;
    }
    if (ramp.passed || ramp.z < -half || oldZ > half) return;
    if (this.rampId !== ramp.id) {
      const oldSurface = this.rampSurface(ramp, oldZ, previousX);
      const enteringToe = oldZ <= -half;
      const crossingDeck = previousY >= oldSurface.y - 0.035;
      const touchingDeck = Math.abs(s.y - surface.y) <= 0.08;
      // Contact at the toe, or a car descending onto a deck; airborne passes stay clear.
      if (
        this.rampId !== null ||
        poweredFlight ||
        Math.abs(surface.lateral) > 0.88 ||
        s.vy > 0.1 ||
        s.y > surface.y + 0.12 ||
        (!enteringToe && !crossingDeck && !touchingDeck)
      )
        return;
      this.rampId = ramp.id;
      this.roofId = null;
    }
    s.y = surface.y;
    s.vy = 0;
    s.rampBank = surface.bank;
    s.rampPitch = surface.pitch;
    if (ramp.z >= half) {
      const kind = normalizeRampKind(ramp.rampKind);
      s.vy = kind === 'straight' ? RAMP_LAYOUT.launchSpeed : RAMP_LAYOUT.rollLaunchSpeed;
      this.rampId = null;
      ramp.passed = true;
      s.events.push({
        type: 'hop',
        label: kind === 'straight' ? 'STRAIGHT LAUNCH' : 'ROLL LAUNCH',
      });
      if (kind !== 'straight') {
        this.pendingRampRoll = { id: ramp.id, direction: kind === 'roll-left' ? -1 : 1 };
        s.rollCooldown = Math.max(s.rollCooldown, 1.7);
      }
    }
  }

  private launchRampRoll(): void {
    const pending = this.pendingRampRoll;
    if (!pending) return;
    const s = this.state;
    if (s.y <= 0 || s.roll > 0 || s.status !== 'playing') {
      this.pendingRampRoll = null;
      return;
    }
    const ramp = s.entities.find((entity) => entity.id === pending.id);
    if (ramp && ramp.z <= RAMP_LAYOUT.length / 2 + PLAYER_BODY.length / 2) return;
    if (s.y - this.roofFloor() < ROLL_CLEARANCE) return;
    this.pendingRampRoll = null;
    s.rollDirection = pending.direction;
    s.rollDuration = RAMP_LAYOUT.rollDuration;
    s.roll = s.rollDuration;
    s.invincible = Math.max(s.invincible, s.rollDuration + 0.05);
    this.trick('roll', pending.direction === -1 ? 'LEFT BARREL ROLL' : 'RIGHT BARREL ROLL', 100);
  }

  private moveVertically(dt: number, controls: Controls, floor = 0): void {
    const s = this.state;
    if (s.rocket > 0) {
      s.vy = approach(s.vy, clamp((10 - s.y) * 2, -3, 9), 5, dt);
      s.air = Math.min(100, s.air + dt * 20);
    } else if (controls.fly && !controls.dive && !this.flightExhausted && s.air > 0) {
      if (s.y <= floor && s.vy <= 0) {
        if (s.air < 4) this.flightExhausted = true;
        else {
          s.vy = 10;
          s.events.push({ type: 'hop', label: 'LIFT OFF' });
        }
      }
      if (!this.flightExhausted) {
        s.vy = approach(s.vy, 5.4, 3.2, dt);
        s.air = Math.max(0, s.air - this.rules.flightDrain * dt);
        if (s.air === 0) this.flightExhausted = true;
      }
    } else {
      s.vy -= (controls.dive ? 48 : 18) * dt;
    }
    s.y = clamp(s.y + s.vy * dt, floor, 18);
    if (s.y >= 18) s.vy = Math.min(s.vy, 0);
    if (s.y === floor) {
      s.vy = 0;
      s.roll = 0;
      s.air = Math.min(100, s.air + this.rules.groundRecharge * dt);
    }
  }

  private pickup(kind: PickupKind): void {
    const s = this.state;
    const labels: Record<PickupKind, string> = {
      bolt: '+1 BOLT',
      air: `AIR +${this.rules.airPickup}`,
      shield: 'SHIELD ACTIVE',
      magnet: 'MAGNET ACTIVE',
      double: 'DOUBLE SCORE',
      rocket: 'ROCKET BOOST',
    };
    switch (kind) {
      case 'bolt':
        s.bolts++;
        s.score += 25 * s.combo * (s.double > 0 ? 2 : 1) * this.rules.scoreMultiplier;
        break;
      case 'air':
        s.air = Math.min(100, s.air + this.rules.airPickup);
        break;
      case 'shield':
        s.shield = 15;
        break;
      case 'magnet':
        s.magnet = 10;
        break;
      case 'double':
        s.double = 12;
        break;
      case 'rocket':
        s.rocket = 5;
        s.invincible = Math.max(s.invincible, 5.5);
        s.vy = Math.max(s.vy, 10);
        this.flightExhausted = false;
        break;
    }
    s.events.push({ type: 'pickup', label: labels[kind] });
  }

  private spawnWave(): void {
    const s = this.state;
    this.wave++;
    if (this.road.lanes.length === 1) {
      this.spawnSingleLaneWave();
      return;
    }
    const lanes = [...this.road.lanes];
    // Never block the whole road: every wave retains at least two open lanes.
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    const count = Math.min(
      lanes.length - 1,
      1 + Math.min(2, Math.floor(s.distance / this.rules.waveStage)),
    );
    const aerial =
      s.distance > this.rules.aerialAfter && this.random() < 1 / this.rules.aerialEvery;
    const risingPair = this.random() < 0.5;
    for (let i = 0; i < count; i++) {
      const sky = aerial
        ? i < 2
        : s.distance > this.rules.aerialAfter * (650 / 950) &&
          this.random() < this.rules.aerialChance;
      const y =
        aerial && sky
          ? risingPair
            ? [8, 11.5][i]
            : [11.5, 7.5][i]
          : sky
            ? 7.5 + this.random() * 4.5
            : 0;
      const kind = sky || this.random() < 0.18 ? 'barrier' : 'traffic';
      this.add(
        kind,
        lanes[i],
        aerial
          ? -this.rules.spawnAhead + 5 - i * (risingPair ? 12 : 32) - this.random() * 12
          : -this.rules.spawnAhead - this.random() * 38,
        y,
      );
    }
    // A hanging obstruction challenges flight while preserving the wave's open lanes.
    if (s.distance > this.rules.aerialAfter * (700 / 950) && this.random() < 0.2)
      this.add(
        'barrier',
        lanes[0],
        -this.rules.spawnAhead - 12 - this.random() * 35,
        8 + this.random() * 3,
      );
    const rewardLane = lanes[count];
    if (aerial || this.random() < 1 / this.rules.rampEvery)
      this.add('ramp', rewardLane, -this.rules.spawnAhead + 20 + this.random() * 45);
    const kinds: PickupKind[] = ['air', 'shield', 'magnet', 'double', 'rocket'];
    const reward =
      this.random() < 1 / this.rules.bonusEvery
        ? kinds[Math.floor(this.random() * kinds.length)]
        : 'bolt';
    this.add(
      'pickup',
      rewardLane,
      aerial ? -this.rules.spawnAhead + 5 : -this.rules.spawnAhead + 18,
      aerial ? 5.5 : 1.15,
      reward,
    );
    if (aerial) {
      for (let i = 0; i <= 8; i++)
        this.add(
          'pickup',
          rewardLane,
          -this.rules.spawnAhead + 65 - i * 20,
          1.15 + Math.sin((i / 8) * Math.PI) * 6.2,
          'bolt',
        );
    } else {
      for (let i = 0; i < 3; i++)
        this.add('pickup', rewardLane, -this.rules.spawnAhead + 2 - i * 12, 1.15, 'bolt');
    }
  }

  /** A single lane trades steering escapes for well-separated flight encounters. */
  private spawnSingleLaneWave(): void {
    const s = this.state;
    const ahead = Math.max(this.rules.spawnAhead, this.rules.rocketSpeed * 3.2 + 20);
    const aerial =
      s.distance > this.rules.aerialAfter && this.random() < 1 / this.rules.aerialEvery;
    const roll = this.random();
    const kind = aerial
      ? 'barrier'
      : roll < 1 / this.rules.rampEvery
        ? 'ramp'
        : roll < 0.65
          ? 'traffic'
          : 'barrier';
    // A ramp is a complete flight encounter, rather than an extra body behind another one.
    this.add(kind, 0, -ahead - this.random() * 60, aerial ? 8 + this.random() * 4 : 0);
    this.add('pickup', 0, -ahead + 70 + this.random() * 40, 1.15, 'air');
    if (aerial) this.add('pickup', 0, -ahead + 40, 4.8, 'bolt');
  }

  private chooseTrafficVariant(): number {
    const total = TRAFFIC_CATALOG.reduce((sum, spec) => sum + spec.weight, 0);
    let sample = this.random() * total;
    for (const [index, spec] of TRAFFIC_CATALOG.entries()) {
      sample -= spec.weight;
      if (sample <= 0) return index;
    }
    return 0;
  }

  private canPlaceRoadObstacle(lane: number, z: number, length: number): boolean {
    const occupied = new Set<number>([lane]);
    for (const other of this.state.entities) {
      if (other.passed || other.y > (other.kind === 'pickup' ? 3 : 1)) continue;
      const sameLane =
        other.lane === lane ||
        other.targetLane === lane ||
        Math.abs(other.x - lane * LANE_WIDTH) < 2.4;
      const otherLength =
        other.kind === 'traffic'
          ? trafficBounds(other.variant).length
          : other.kind === 'ramp'
            ? RAMP_LAYOUT.length
            : other.kind === 'barrier'
              ? BARRICADE_BODY.depth
              : 0;
      const gap = Math.abs(other.z - z);
      if (this.road.lanes.length === 1 && (other.kind === 'traffic' || other.kind === 'barrier')) {
        const flightWindow = flightCycleSeconds(this.rules);
        const closing =
          this.rules.rocketSpeed +
          (this.state.options.mode === 'opposite' ? 32 * this.rules.trafficSpeed : 0);
        if (gap < closing * flightWindow + (length + otherLength) / 2) return false;
      }
      if (
        sameLane &&
        gap <
          (other.kind === 'pickup' || other.kind === 'ramp'
            ? 34
            : Math.max(24, (length + otherLength) / 2 + this.rules.spawnClearance))
      )
        return false;
      if (
        (other.kind === 'traffic' || other.kind === 'barrier') &&
        gap < (length + otherLength) / 2 + 10
      ) {
        occupied.add(other.lane);
        if (other.targetLane !== undefined) occupied.add(other.targetLane);
        for (const candidate of this.road.lanes)
          if (Math.abs(other.x - candidate * LANE_WIDTH) < 2) occupied.add(candidate);
      }
    }
    return occupied.size <= this.maxBlockedLanes;
  }

  private spawnAmbientTraffic(): void {
    const s = this.state;
    const cars = s.entities.filter((entity) => entity.kind === 'traffic');
    const target = Math.min(
      Math.floor(this.rules.trafficPerLane * this.road.lanes.length),
      10 + Math.floor(s.distance / 50),
    );
    if (cars.length >= target || s.entities.length >= 190) return;
    const count = this.random() < 0.35 ? 2 : 1;
    for (
      let n = 0;
      n < count && s.entities.filter((entity) => entity.kind === 'traffic').length < target;
      n++
    ) {
      const variant = this.chooseTrafficVariant();
      const firstLane = Math.floor(this.random() * this.road.lanes.length);
      let placed = false;
      for (let attempt = 0; attempt < 15 && !placed; attempt++) {
        const lane = this.road.lanes[(firstLane + attempt) % this.road.lanes.length];
        const z = -this.rules.spawnAhead - 60 - this.random() * 170;
        if (this.canPlaceRoadObstacle(lane, z, trafficBounds(variant).length)) {
          placed = this.add('traffic', lane, z, 0, undefined, variant);
        }
      }
    }
  }

  private add(
    kind: Entity['kind'],
    lane: number,
    z: number,
    y = 0,
    pickup?: PickupKind,
    selectedVariant?: number,
  ): boolean {
    if (!this.road.lanes.includes(lane)) return false;
    const variant =
      selectedVariant ??
      (kind === 'traffic'
        ? this.chooseTrafficVariant()
        : Math.floor(this.random() * TRAFFIC_CATALOG.length));
    if (kind === 'traffic' && this.road.lanes.length === 1) {
      const closing =
        this.rules.rocketSpeed +
        (this.state.options.mode === 'opposite'
          ? trafficSpec(variant).cruiseSpeed * this.rules.trafficSpeed
          : 0);
      z = Math.min(z, -closing * 3.2 - 20);
    }
    if (
      this.road.lanes.length === 1 &&
      this.state.time > 0 &&
      (kind === 'ramp' || (kind === 'barrier' && y === 0))
    )
      z = Math.min(z, -this.rules.rocketSpeed * 3.2 - 20) - this.random() * 30;
    if (
      kind === 'traffic' &&
      this.state.entities.filter((entity) => entity.kind === 'traffic').length >=
        this.rules.trafficCap
    )
      return false;
    if (
      (kind === 'traffic' || (kind === 'barrier' && y === 0)) &&
      !this.canPlaceRoadObstacle(
        lane,
        z,
        kind === 'traffic' ? trafficBounds(variant).length : BARRICADE_BODY.depth,
      )
    )
      return false;
    const entity: Entity = {
      id: this.nextId++,
      kind,
      lane,
      x: lane * LANE_WIDTH,
      y,
      z,
      variant,
    };
    if (kind === 'traffic') {
      entity.direction = directionForLane(this.state.options.mode, lane);
      entity.speed = trafficSpec(variant).cruiseSpeed * this.rules.trafficSpeed;
      entity.appearance =
        trafficSpec(variant).livery === 'none'
          ? Math.floor(this.random() * TRAFFIC_PAINTS.length)
          : 0;
    }
    if (pickup) entity.pickup = pickup;
    if (
      !this.preservesGroundRoute(entity) ||
      !this.preservesSingleLaneFlight(entity) ||
      !this.preservesRampRunways(entity)
    )
      return false;
    if (kind === 'ramp') entity.rampKind = this.nextRampKind();
    this.state.entities.push(entity);
    if (kind === 'ramp') this.rampReservations.push(this.rampReservation(entity));
    if (this.road.lanes.length === 1 && (kind === 'traffic' || (kind === 'barrier' && y === 0))) {
      const body = this.physicalBody(entity)!;
      const depth = (PLAYER_BODY.length + body.length) / 2;
      const firstContactDistance =
        ((-entity.z - depth) * this.rules.cruiseSpeed) /
        (this.rules.cruiseSpeed + Math.max(0, -body.speedMin));
      this.add(
        'pickup',
        lane,
        -Math.max(25, firstContactDistance - this.rules.cruiseSpeed * 1.3),
        1.15,
        'air',
      );
    }
    return true;
  }

  private random(): number {
    return this.randomSource();
  }
}

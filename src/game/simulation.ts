import { GANTRY_LAYOUT, PLAYER_BODY } from './road-layout';

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
}
export interface GameEvent {
  type: string;
  label?: string;
}
export interface GameState {
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

const freshState = (status: GameStatus): GameState => ({
  status,
  time: 0,
  distance: 0,
  score: 0,
  bolts: 0,
  speed: 44,
  lane: 0,
  x: 0,
  y: 0,
  vy: 0,
  air: 100,
  roll: 0,
  rollDirection: 1,
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

const LANE_WIDTH = 3.6;
const ROLL_DURATION = 0.65;
// A full roll needs enough tyre clearance for the body to rotate above the surface.
const ROLL_CLEARANCE = Math.hypot(PLAYER_BODY.width / 2, PLAYER_BODY.height);
// Original model bounds [width, height, length], shared with renderer.ts.
// Each traffic model is uniformly scaled so its length never exceeds 6 m.
const TRAFFIC_BOUNDS = [
  [1.9, 1.43, 4.64],
  [1.82, 1.47, 4.04],
  [2, 1.82, 4.94],
  [1.92, 1.63, 4.74],
  [2.06, 2.2, 5.34],
  [2.02, 1.77, 5.58],
  [2.43, 3, 8.14],
  [2.6, 3.16, 12.22],
  [2.61, 2.98, 16.12],
] as const;
const trafficBounds = (variant: number) => {
  const [width, height, length] = TRAFFIC_BOUNDS[((variant % 9) + 9) % 9];
  const scale = Math.min(1, 6 / length);
  return { width: width * scale, height: height * scale, length: length * scale };
};
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
}

/** A renderer-independent run. All distances are metres, speeds metres/second.
 * The player stays at z=0; incoming entities travel from negative to positive z.
 * Roll and pickup effects are remaining seconds, and lane is the target lane.
 */
export class Simulation {
  state: GameState = freshState('menu');
  private readonly seed: number;
  private randomState: number;
  private nextId = 1;
  private nextWaveDistance = 130;
  private wave = 0;
  private previous: Controls = { ...EMPTY_CONTROLS };
  private flightExhausted = false;
  private roofId: number | null = null;
  private riddenRoofs = new Set<number>();
  private motions = new Map<number, TrafficMotion>();
  private nextMilestone = 1000;
  private airborneTime = 0;
  private bigAirAwarded = false;
  private resolvedGantry = -1;

  constructor(seed = 1729) {
    this.seed = seed >>> 0;
    this.randomState = this.seed;
  }

  start(): void {
    this.state = freshState('playing');
    this.randomState = this.seed;
    this.nextId = 1;
    this.nextWaveDistance = 130;
    this.nextMilestone = 1000;
    this.motions.clear();
    this.airborneTime = 0;
    this.bigAirAwarded = false;
    this.resolvedGantry = -1;
    this.wave = 0;
    this.previous = { ...EMPTY_CONTROLS };
    this.flightExhausted = false;
    this.roofId = null;
    this.riddenRoofs.clear();
    for (let i = 0; i < 5; i++) this.add('pickup', 0, -38 - i * 13, 1.15, 'bolt');
    // A clear centre lane gives a new player time to read the road.
    this.add('traffic', -1, -160);
    this.add('traffic', 1, -190);
    this.add('ramp', 0, -245);
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
    this.state = freshState('menu');
    this.previous = { ...EMPTY_CONTROLS };
    this.flightExhausted = false;
    this.roofId = null;
    this.riddenRoofs.clear();
    this.motions.clear();
    this.airborneTime = 0;
    this.bigAirAwarded = false;
    this.resolvedGantry = -1;
  }

  getRollReadiness(): 'grounded' | 'low-air' | 'cooldown' | 'ready' {
    const s = this.state;
    if (s.y - this.roofFloor() < ROLL_CLEARANCE) return 'grounded';
    if (s.air < 8) return 'low-air';
    return s.rollCooldown > 0 ? 'cooldown' : 'ready';
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
      const lane = clamp(s.lane + (right ? 1 : -1), -2, 2);
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
      s.rollDirection = rollLeft ? -1 : 1;
      s.rollCooldown = 1.7;
      s.invincible = Math.max(s.invincible, 0.72);
      s.air -= 8;
      s.lane = clamp(s.lane + s.rollDirection, -2, 2);
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
    const cruise = 44 + Math.min(10, s.distance / 2200);
    s.boosting = controls.accelerate || s.rocket > 0;
    const targetSpeed = s.rocket > 0 ? 86 : controls.accelerate ? cruise + 22 : cruise;
    s.speed = approach(s.speed, targetSpeed, 1.9, dt);
    const travel = s.speed * dt;
    const previousDistance = s.distance;
    s.distance += travel;
    while (s.distance >= this.nextMilestone) {
      s.score += 250 * (this.nextMilestone / 1000) * s.combo * (s.double > 0 ? 2 : 1);
      s.events.push({ type: 'milestone', label: `${this.nextMilestone / 1000} KM MILESTONE` });
      this.nextMilestone += 1000;
    }
    s.score += travel * 0.6 * s.combo * (s.double > 0 ? 2 : 1);
    const previousX = s.x;
    s.x = approach(s.x, s.lane * LANE_WIDTH, 11, dt);
    const previousY = s.y;
    this.moveVertically(dt, controls, this.roofFloor());
    this.collideGantries(previousDistance, previousX, previousY);
    if (s.status !== 'playing') return;

    for (const entity of s.entities) {
      const oldZ = entity.z;
      // Traffic travels forward too; stationary pickups/ramps meet the full road speed.
      const trafficSpeed = entity.kind === 'traffic' ? this.moveTraffic(entity) : 0;
      entity.z += Math.max(20, s.speed - trafficSpeed) * dt;
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
        if (!entity.passed && dx < 1.5 && s.y < 0.55 && oldZ < 2 && entity.z > -2) {
          entity.passed = true;
          s.y = 0.03;
          s.vy = 11;
          s.events.push({ type: 'hop', label: 'LIFT OFF' });
        }
        continue;
      }
      const bounds =
        entity.kind === 'traffic'
          ? trafficBounds(entity.variant)
          : { width: 3, height: 1.3, length: 0.7 };
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
          s.score += 100 * s.combo * (s.double > 0 ? 2 : 1);
          s.events.push({ type: 'near-miss', label: `NEAR MISS ×${s.combo}` });
        }
      }
    }
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
      this.nextWaveDistance += Math.max(68, 120 - s.distance / 100);
    }
  }

  private trick(type: string, label: string, points: number): void {
    const s = this.state;
    s.combo = Math.min(10, s.combo + 1);
    s.comboTimer = 4.5;
    s.score += points * s.combo * (s.double > 0 ? 2 : 1);
    s.events.push({ type, label });
  }

  private collideGantries(distance: number, x: number, y: number): void {
    const s = this.state;
    const layout = GANTRY_LAYOUT;
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

  private moveTraffic(entity: Entity): number {
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
    const baseSpeed = 12 + (entity.variant % 5) * 2.5;
    if (s.time >= motion.brakeAt) {
      if (entity.z < -110) motion.brakeUntil = s.time + 1.2;
      motion.brakeAt = Infinity;
    }
    const following =
      entity.z < -95 &&
      s.entities.some(
        (other) =>
          other.id !== entity.id &&
          other.kind === 'traffic' &&
          Math.abs(other.y - entity.y) < 3 &&
          Math.abs(other.x - entity.x) < 1.8 &&
          entity.z - other.z > 7 &&
          entity.z - other.z < 24,
      );
    entity.braking = entity.z < -65 && (s.time < motion.brakeUntil || following);
    const actualSpeed = baseSpeed * (entity.braking ? 0.65 : 1);
    const relative = Math.max(20, s.speed - baseSpeed * 0.65);
    if (entity.targetLane !== undefined) {
      if (motion.movingAt === null) {
        if (s.time - motion.warningAt >= 1) {
          // Reserve completion distance for an unexpected rocket picked up mid-maneuver.
          const worstClosing = Math.max(20, 86 - baseSpeed * 0.65);
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
            motion.decisionAt = s.time + 1.8;
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
      motion.decisionAt = s.time + 1.8;
      const lead = Math.max(75 + relative, 35 + relative * (1 + LANE_CHANGE_TIME));
      if (entity.z < -lead) {
        const direction = this.random() < 0.5 ? -1 : 1;
        for (const offset of [direction, -direction]) {
          const lane = entity.lane + offset;
          if (
            lane < -2 ||
            lane > 2 ||
            !this.destinationClear(entity, lane, 1 + LANE_CHANGE_TIME) ||
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
    return actualSpeed;
  }

  private destinationClear(entity: Entity, lane: number, horizon: number): boolean {
    const ownSpeed = (12 + (entity.variant % 5) * 2.5) * (entity.braking ? 0.65 : 1);
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
          ? (12 + (other.variant % 5) * 2.5) * (other.braking ? 0.65 : 1)
          : 0;
      const futureGap = gap + (otherSpeed - ownSpeed) * horizon;
      return gap * futureGap <= 0 || Math.min(Math.abs(gap), Math.abs(futureGap)) < 24;
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
      for (let lane = -2; lane <= 2; lane++)
        if (Math.abs(other.x - lane * LANE_WIDTH) < 2) occupied.add(lane);
    }
    return occupied.size < 5;
  }

  private roofFloor(): number {
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
        s.air = Math.max(0, s.air - 20 * dt);
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
      s.air = Math.min(100, s.air + 28 * dt);
    }
  }

  private pickup(kind: PickupKind): void {
    const s = this.state;
    const labels: Record<PickupKind, string> = {
      bolt: '+1 BOLT',
      air: 'AIR +35',
      shield: 'SHIELD ACTIVE',
      magnet: 'MAGNET ACTIVE',
      double: 'DOUBLE SCORE',
      rocket: 'ROCKET BOOST',
    };
    switch (kind) {
      case 'bolt':
        s.bolts++;
        s.score += 25 * s.combo * (s.double > 0 ? 2 : 1);
        break;
      case 'air':
        s.air = Math.min(100, s.air + 35);
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
    const lanes = [-2, -1, 0, 1, 2];
    // Never block the whole road: every wave retains at least two open lanes.
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    }
    const count = 1 + Math.min(2, Math.floor(s.distance / 950));
    const aerial = s.distance > 950 && this.wave % 3 === 0;
    for (let i = 0; i < count; i++) {
      const sky = aerial ? i < 2 : s.distance > 650 && this.random() < 0.2;
      const y =
        aerial && sky
          ? this.wave % 6 === 0
            ? [8, 11.5][i]
            : [11.5, 7.5][i]
          : sky
            ? 7 + this.random() * 5
            : 0;
      const kind = !sky && this.random() < 0.18 ? 'barrier' : 'traffic';
      this.add(
        kind,
        lanes[i],
        aerial ? -235 - i * (this.wave % 6 === 0 ? 12 : 32) : -240 - this.random() * 38,
        y,
      );
    }
    // A hanging obstruction challenges flight while preserving the wave's open lanes.
    if (s.distance > 700 && this.wave % 5 === 0) this.add('barrier', lanes[0], -258, 8);
    const rewardLane = lanes[count];
    if (aerial || this.wave % 4 === 0) this.add('ramp', rewardLane, aerial ? -187 : -218);
    const kinds: PickupKind[] = ['air', 'shield', 'magnet', 'double', 'rocket'];
    const reward = this.wave % 3 === 0 ? kinds[Math.floor(this.random() * kinds.length)] : 'bolt';
    this.add('pickup', rewardLane, aerial ? -235 : -222, aerial ? 5.5 : 1.15, reward);
    if (aerial) {
      for (let i = 0; i <= 8; i++)
        this.add(
          'pickup',
          rewardLane,
          -175 - i * 20,
          1.15 + Math.sin((i / 8) * Math.PI) * 6.2,
          'bolt',
        );
    } else {
      for (let i = 0; i < 3; i++) this.add('pickup', rewardLane, -238 - i * 12, 1.15, 'bolt');
    }
  }

  private add(kind: Entity['kind'], lane: number, z: number, y = 0, pickup?: PickupKind): void {
    const entity: Entity = {
      id: this.nextId++,
      kind,
      lane,
      x: lane * LANE_WIDTH,
      y,
      z,
      variant: Math.floor(this.random() * 9),
    };
    if (pickup) entity.pickup = pickup;
    this.state.entities.push(entity);
  }

  private random(): number {
    // Mulberry32 keeps the complete random sequence local to a run, including seed 0.
    let value = (this.randomState += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}

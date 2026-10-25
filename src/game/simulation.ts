export type GameStatus = 'menu' | 'playing' | 'paused' | 'crashed';
export type PickupKind = 'bolt' | 'air' | 'shield' | 'magnet' | 'double' | 'rocket';
export interface Entity {
  id: number; kind: 'traffic' | 'pickup' | 'barrier' | 'ramp';
  x: number; y: number; z: number; lane: number; variant: number; pickup?: PickupKind; passed?: boolean;
}
export interface GameEvent { type: string; label?: string }
export interface GameState {
  status: GameStatus; time: number; distance: number; score: number; bolts: number;
  speed: number; lane: number; x: number; y: number; vy: number; air: number;
  roll: number; rollDirection: number; rollCooldown: number; boosting: boolean;
  combo: number; comboTimer: number; shield: number; magnet: number; double: number;
  rocket: number; invincible: number; entities: Entity[]; events: GameEvent[]; nearMisses: number;
}
export interface Controls {
  left: boolean; right: boolean; accelerate: boolean; fly: boolean;
  dive: boolean; rollLeft: boolean; rollRight: boolean;
}
export const EMPTY_CONTROLS: Controls = Object.freeze({
  left: false, right: false, accelerate: false, fly: false, dive: false, rollLeft: false, rollRight: false,
});

const freshState = (status: GameStatus): GameState => ({
  status, time: 0, distance: 0, score: 0, bolts: 0, speed: 44,
  lane: 0, x: 0, y: 0, vy: 0, air: 100, roll: 0, rollDirection: 1,
  rollCooldown: 0, boosting: false, combo: 1, comboTimer: 0, shield: 0,
  magnet: 0, double: 0, rocket: 0, invincible: 0, entities: [], events: [], nearMisses: 0,
});

const LANE_WIDTH = 3.6;
const ROLL_DURATION = 0.65;
// Original model bounds [width, height, length], shared with renderer.ts.
// Each traffic model is uniformly scaled so its length never exceeds 6 m.
const TRAFFIC_BOUNDS = [
  [1.9, 1.43, 4.64], [1.82, 1.47, 4.04], [2, 1.82, 4.94],
  [1.92, 1.63, 4.74], [2.06, 2.2, 5.34], [2.02, 1.77, 5.58],
  [2.43, 3, 8.14], [2.6, 3.16, 12.22], [2.61, 2.98, 16.12],
] as const;
const trafficBounds = (variant: number) => {
  const [width, height, length] = TRAFFIC_BOUNDS[((variant % 9) + 9) % 9];
  const scale = Math.min(1, 6 / length);
  return { width: width * scale, height: height * scale, length: length * scale };
};
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const approach = (value: number, target: number, rate: number, dt: number) =>
  target + (value - target) * Math.exp(-rate * dt);

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

  constructor(seed = 1729) {
    this.seed = seed >>> 0;
    this.randomState = this.seed;
  }

  start(): void {
    this.state = freshState('playing');
    this.randomState = this.seed;
    this.nextId = 1;
    this.nextWaveDistance = 130;
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
    if (s.rollCooldown <= 0 && s.air >= 8 && controls.rollLeft !== controls.rollRight && (rollLeft || rollRight)) {
      s.roll = ROLL_DURATION;
      s.rollDirection = rollLeft ? -1 : 1;
      s.rollCooldown = 1.7;
      s.invincible = Math.max(s.invincible, 0.72);
      s.air -= 8;
      s.lane = clamp(s.lane + s.rollDirection, -2, 2);
      s.events.push({ type: 'roll', label: 'BARREL ROLL' });
    }
    if (!controls.fly) this.flightExhausted = false;
    this.previous = { ...controls };
    const count = Math.ceil(dt / (1 / 120));
    const step = dt / count;
    for (let i = 0; i < count && s.status === 'playing'; i++) this.step(step, controls);
  }

  private step(dt: number, controls: Controls): void {
    const s = this.state;
    for (const key of ['roll', 'rollCooldown', 'shield', 'magnet', 'double', 'rocket', 'invincible', 'comboTimer'] as const) {
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
    s.distance += travel;
    s.score += travel * 0.6 * s.combo * (s.double > 0 ? 2 : 1);
    s.x = approach(s.x, s.lane * LANE_WIDTH, 11, dt);
    const previousY = s.y;
    this.moveVertically(dt, controls, this.roofFloor());

    for (const entity of s.entities) {
      const oldZ = entity.z;
      // Traffic travels forward too; stationary pickups/ramps meet the full road speed.
      const trafficSpeed = entity.kind === 'traffic' ? 12 + (entity.variant % 5) * 2.5 : 0;
      entity.z += Math.max(20, s.speed - trafficSpeed) * dt;
      const dx = Math.abs(s.x - entity.x);
      if (entity.kind === 'pickup') {
        const magnetic = s.magnet > 0 && entity.pickup === 'bolt';
        const reachX = magnetic ? 5.6 : 1.25;
        const reachY = magnetic ? 4.5 : 1.8;
        const reachZ = magnetic ? 9 : 2.3;
        if (!entity.passed && dx < reachX && Math.abs(s.y + 0.9 - entity.y) < reachY
          && oldZ < reachZ && entity.z > -reachZ) {
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
      const bounds = entity.kind === 'traffic' ? trafficBounds(entity.variant) : { width: 3, height: 1.3, length: 0.7 };
      const top = entity.y + bounds.height;
      const width = (2.23 + bounds.width) / 2 - 0.28;
      const depth = (4.3 + bounds.length) / 2 - 0.45;
      const verticalOverlap = s.y + 1.12 > entity.y + 0.12 && s.y < top - 0.12;
      // Feet crossing a roof from above are a landing, rather than a side impact.
      if (entity.kind === 'traffic' && s.vy <= 0 && previousY >= top - 0.035 && s.y <= top
        && dx < bounds.width / 2 + 0.45 && Math.abs(entity.z) < bounds.length / 2 + 0.65) {
        s.y = top;
        s.vy = 0;
        this.roofId = entity.id;
        entity.passed = true;
        if (!this.riddenRoofs.has(entity.id)) {
          this.riddenRoofs.add(entity.id);
          s.score += 150 * s.combo * (s.double > 0 ? 2 : 1);
          s.comboTimer = 4.5;
          s.events.push({ type: 'roof-ride', label: 'ROOF RIDE' });
        }
      } else if (!entity.passed && dx < width && verticalOverlap && oldZ < depth && entity.z > -depth) {
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
    s.entities = s.entities.filter(entity => entity.z < 36 && !(entity.kind === 'pickup' && entity.passed));
    if (s.status === 'playing' && s.distance >= this.nextWaveDistance) {
      this.spawnWave();
      this.nextWaveDistance += Math.max(68, 120 - s.distance / 100);
    }
  }

  private roofFloor(): number {
    if (this.roofId === null) return 0;
    const s = this.state;
    const roof = s.entities.find(entity => entity.id === this.roofId);
    if (roof?.kind === 'traffic') {
      const bounds = trafficBounds(roof.variant);
      const top = roof.y + bounds.height;
      if (Math.abs(s.x - roof.x) < bounds.width / 2 + 0.45
        && Math.abs(roof.z) < bounds.length / 2 + 0.65 && Math.abs(s.y - top) < 0.08 && s.vy <= 0) return top;
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
      s.air = Math.min(100, s.air + 28 * dt);
    }
  }

  private pickup(kind: PickupKind): void {
    const s = this.state;
    const labels: Record<PickupKind, string> = {
      bolt: '+1 BOLT', air: 'AIR +35', shield: 'SHIELD ACTIVE',
      magnet: 'MAGNET ACTIVE', double: 'DOUBLE SCORE', rocket: 'ROCKET BOOST',
    };
    switch (kind) {
      case 'bolt':
        s.bolts++;
        s.score += 25 * s.combo * (s.double > 0 ? 2 : 1);
        break;
      case 'air': s.air = Math.min(100, s.air + 35); break;
      case 'shield': s.shield = 15; break;
      case 'magnet': s.magnet = 10; break;
      case 'double': s.double = 12; break;
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
    for (let i = 0; i < count; i++) {
      const sky = s.distance > 650 && this.random() < 0.2;
      const y = sky ? 7 + this.random() * 5 : 0;
      const kind = !sky && this.random() < 0.18 ? 'barrier' : 'traffic';
      this.add(kind, lanes[i], -240 - this.random() * 38, y);
    }
    // A hanging obstruction challenges flight while preserving the wave's open lanes.
    if (s.distance > 700 && this.wave % 5 === 0) this.add('barrier', lanes[0], -258, 8);
    const rewardLane = lanes[count];
    if (this.wave % 4 === 0) this.add('ramp', rewardLane, -218);
    const kinds: PickupKind[] = ['air', 'shield', 'magnet', 'double', 'rocket'];
    const reward = this.wave % 3 === 0 ? kinds[Math.floor(this.random() * kinds.length)] : 'bolt';
    this.add('pickup', rewardLane, -222, 1.15, reward);
    for (let i = 0; i < 3; i++) this.add('pickup', rewardLane, -238 - i * 12, 1.15, 'bolt');
  }

  private add(kind: Entity['kind'], lane: number, z: number, y = 0, pickup?: PickupKind): void {
    const entity: Entity = {
      id: this.nextId++, kind, lane, x: lane * LANE_WIDTH, y, z,
      variant: Math.floor(this.random() * 9),
    };
    if (pickup) entity.pickup = pickup;
    this.state.entities.push(entity);
  }

  private random(): number {
    // Mulberry32 keeps the complete random sequence local to a run, including seed 0.
    let value = this.randomState += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }
}

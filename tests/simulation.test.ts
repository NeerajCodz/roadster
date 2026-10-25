import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_CONTROLS,
  Simulation,
  type Controls,
  type Entity,
  type PickupKind,
} from '../src/game/simulation.ts';

const controls = (changes: Partial<Controls> = {}): Controls => ({ ...EMPTY_CONTROLS, ...changes });
const advance = (game: Simulation, seconds: number, input = controls(), clearRoad = true) => {
  const frames = Math.ceil(seconds * 60);
  for (let frame = 0; frame < frames; frame++) {
    if (clearRoad) game.state.entities = [];
    game.update(seconds / frames, input);
  }
};
const playing = () => {
  const game = new Simulation(123);
  game.start();
  game.state.entities = [];
  return game;
};
const obstacle = (changes: Partial<Entity> = {}): Entity => ({
  id: 999,
  kind: 'traffic',
  x: 0,
  y: 0,
  z: -2,
  lane: 0,
  variant: 0,
  ...changes,
});
const collect = (game: Simulation, pickup: PickupKind, changes: Partial<Entity> = {}) => {
  game.state.entities = [obstacle({ kind: 'pickup', pickup, y: 1, z: 0, ...changes })];
  game.update(1 / 60, controls());
};

test('menu and pause freeze the run; resume continues and menu ends it', () => {
  const game = new Simulation(123);
  game.update(1, controls({ accelerate: true }));
  assert.equal(game.state.distance, 0);
  game.start();
  advance(game, 0.5);
  assert.ok(game.state.distance > 0);
  game.pause();
  const frozen = { time: game.state.time, distance: game.state.distance, air: game.state.air };
  game.update(0.1, controls({ fly: true }));
  assert.deepEqual(
    { time: game.state.time, distance: game.state.distance, air: game.state.air },
    frozen,
  );
  game.resume();
  game.update(0.1, controls());
  assert.ok(game.state.distance > frozen.distance);
  game.menu();
  assert.equal(game.state.status, 'menu');
  game.update(0.1, controls());
  assert.equal(game.state.distance, 0);
});

test('a held lane key changes one lane, release permits another, and road edges clamp', () => {
  const game = playing();
  advance(game, 0.5, controls({ right: true }));
  assert.equal(game.state.lane, 1);
  assert.ok(game.state.x > 3.2 && game.state.x <= 3.6);
  game.update(1 / 60, controls());
  game.update(1 / 60, controls({ right: true }));
  assert.equal(game.state.lane, 2);
  game.update(1 / 60, controls());
  game.update(1 / 60, controls({ right: true }));
  assert.equal(game.state.lane, 2);
  game.update(1 / 60, controls());
  game.update(1 / 60, controls({ left: true, right: true }));
  assert.equal(game.state.lane, 2);
});

test('acceleration raises speed and releasing settles toward cruise', () => {
  const game = playing();
  const initial = game.state.speed;
  advance(game, 2, controls({ accelerate: true }));
  assert.ok(game.state.speed > initial + 12);
  assert.equal(game.state.boosting, true);
  const boosted = game.state.speed;
  advance(game, 2);
  assert.ok(game.state.speed < boosted - 8);
  assert.equal(game.state.boosting, false);
});

test('holding flight climbs with finite air; releasing lands and recharges', () => {
  const game = playing();
  advance(game, 1, controls({ fly: true }));
  assert.ok(game.state.y > 3);
  assert.ok(game.state.air > 70 && game.state.air < 90);
  advance(game, 3);
  assert.equal(game.state.y, 0);
  assert.ok(game.state.air > 90);
});

test('exhausted flight lands even with the button held and never escapes altitude limits', () => {
  const game = playing();
  let highest = 0;
  for (let i = 0; i < 600; i++) {
    game.state.entities = [];
    game.update(1 / 60, controls({ fly: true }));
    highest = Math.max(highest, game.state.y);
    assert.ok(game.state.air >= 0 && game.state.air <= 100);
  }
  assert.ok(highest <= 18);
  assert.equal(game.state.y, 0);
  game.update(1 / 60, controls());
  game.update(1 / 60, controls({ fly: true }));
  assert.ok(game.state.y > 0, 'releasing resets the exhausted flight latch');
});

test('dive brings a flying car down faster', () => {
  const normal = playing();
  const diving = playing();
  normal.state.y = diving.state.y = 12;
  advance(normal, 0.5);
  advance(diving, 0.5, controls({ dive: true }));
  assert.ok(diving.state.y < normal.state.y - 2);
});

test('traffic collision crashes and later updates cannot resume a crashed run', () => {
  const game = playing();
  game.state.entities = [obstacle()];
  game.update(1 / 60, controls());
  assert.equal(game.state.status, 'crashed');
  assert.ok(game.state.events.some((event) => event.type === 'crash'));
  const distance = game.state.distance;
  game.resume();
  game.update(1, controls({ fly: true }));
  assert.equal(game.state.status, 'crashed');
  assert.equal(game.state.distance, distance);
});

test('flying over ground traffic avoids collision but matching sky traffic hits', () => {
  const game = playing();
  game.state.y = 8;
  game.state.entities = [obstacle()];
  game.update(1 / 60, controls());
  assert.equal(game.state.status, 'playing');
  game.state.entities = [obstacle({ y: 8 })];
  game.update(1 / 60, controls());
  assert.equal(game.state.status, 'crashed');
});

test('barrel roll grants collision protection and cannot repeat from a held key', () => {
  const game = playing();
  game.state.entities = [obstacle()];
  game.update(1 / 60, controls({ rollLeft: true }));
  assert.equal(game.state.status, 'playing');
  assert.ok(game.state.roll > 0 && game.state.invincible > 0);
  assert.equal(game.state.rollDirection, -1);
  advance(game, 3, controls({ rollLeft: true }));
  assert.equal(game.state.roll, 0);
  assert.equal(game.state.invincible, 0);
  game.update(1 / 60, controls());
  game.update(1 / 60, controls({ rollRight: true }));
  assert.ok(game.state.roll > 0);
  assert.equal(game.state.rollDirection, 1);
});

test('shield absorbs one collision and expires; an unprotected later hit crashes', () => {
  const game = playing();
  collect(game, 'shield');
  assert.ok(game.state.shield > 0);
  game.state.entities = [obstacle()];
  game.update(1 / 60, controls());
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.shield, 0);
  assert.ok(game.state.events.some((event) => event.type === 'shield'));
  advance(game, 2);
  game.state.entities = [obstacle()];
  game.update(1 / 60, controls());
  assert.equal(game.state.status, 'crashed');
});

test('bolts add currency and score exactly once and update events are transient', () => {
  const game = playing();
  const baseline = game.state.score;
  collect(game, 'bolt');
  assert.equal(game.state.bolts, 1);
  assert.ok(game.state.score > baseline + 20);
  assert.equal(game.state.entities.length, 0);
  assert.ok(game.state.events.some((event) => event.type === 'pickup'));
  game.update(1 / 60, controls());
  assert.equal(game.state.bolts, 1);
  assert.equal(game.state.events.length, 0);
});

test('air pickups replenish without overfilling', () => {
  const game = playing();
  game.state.air = 40;
  collect(game, 'air');
  assert.ok(game.state.air >= 70);
  collect(game, 'air');
  collect(game, 'air');
  assert.equal(game.state.air, 100);
});

test('double-score pickup increases the reward for the next bolt', () => {
  const normal = playing();
  const doubled = playing();
  collect(doubled, 'double');
  assert.ok(doubled.state.double > 0);
  const beforeNormal = normal.state.score;
  const beforeDouble = doubled.state.score;
  collect(normal, 'bolt');
  collect(doubled, 'bolt');
  assert.ok(doubled.state.score - beforeDouble > (normal.state.score - beforeNormal) * 1.8);
});

test('magnet collects nearby off-lane bolts while ordinary collection cannot', () => {
  const normal = playing();
  const magnet = playing();
  collect(magnet, 'magnet');
  assert.ok(magnet.state.magnet > 0);
  collect(normal, 'bolt', { x: 3.6, lane: 1, z: -5 });
  collect(magnet, 'bolt', { x: 3.6, lane: 1, z: -5 });
  assert.equal(normal.state.bolts, 0);
  assert.equal(magnet.state.bolts, 1);
});

test('rocket pickup lifts and accelerates the car with temporary protection', () => {
  const game = playing();
  const speed = game.state.speed;
  collect(game, 'rocket');
  advance(game, 0.8);
  assert.ok(game.state.rocket > 0 && game.state.invincible > 0);
  assert.ok(game.state.y > 3);
  assert.ok(game.state.speed > speed + 15);
});

test('a close pass awards one near miss and combo expires without another', () => {
  const game = playing();
  game.state.entities = [obstacle({ x: 2.6, z: 3 })];
  advance(game, 0.2, controls(), false);
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.nearMisses, 1);
  assert.ok(game.state.combo > 1);
  assert.ok(game.state.score >= 100);
  advance(game, 0.2, controls(), false);
  assert.equal(game.state.nearMisses, 1);
  advance(game, 6);
  assert.equal(game.state.combo, 1);
});

test('a ramp automatically hops a grounded car without spending air', () => {
  const game = playing();
  game.state.entities = [obstacle({ kind: 'ramp', z: -1 })];
  game.update(1 / 60, controls());
  advance(game, 0.2);
  assert.ok(game.state.y > 1);
  assert.equal(game.state.air, 100);
});

test('opening traffic leaves a fair straight-ahead start and longer runs add traffic', () => {
  const game = new Simulation(77);
  game.start();
  advance(game, 3, controls(), false);
  assert.equal(game.state.status, 'playing');
  game.state.invincible = 1000;
  advance(game, 30, controls(), false);
  assert.ok(game.state.distance > 1000);
  assert.ok(
    game.state.entities.some((entity) => entity.kind === 'traffic' || entity.kind === 'barrier'),
  );
  assert.ok(game.state.entities.every((entity) => entity.z < 40));
});

test('the same seed and controls replay identically; a different seed changes the road', () => {
  const first = new Simulation(4);
  const second = new Simulation(4);
  const other = new Simulation(5);
  for (const game of [first, second, other]) {
    game.start();
    game.state.invincible = 1000;
  }
  for (let frame = 0; frame < 900; frame++) {
    const input = controls({
      accelerate: frame > 120,
      fly: frame > 240 && frame < 300,
      right: frame === 600,
    });
    for (const game of [first, second, other]) game.update(1 / 60, input);
  }
  assert.deepEqual(first.state, second.state);
  assert.notDeepEqual(first.state.entities, other.state.entities);
});

test('ordinary frame rates produce equivalent travel and a stalled frame is bounded', () => {
  const sixty = playing();
  const thirty = playing();
  for (let i = 0; i < 120; i++) sixty.update(1 / 60, controls({ accelerate: true }));
  for (let i = 0; i < 60; i++) thirty.update(1 / 30, controls({ accelerate: true }));
  assert.ok(sixty.state.distance > 100 && thirty.state.distance > 100);
  assert.ok(Math.abs(sixty.state.distance - thirty.state.distance) < 0.02);
  assert.ok(Math.abs(sixty.state.speed - thirty.state.speed) < 0.02);
  const prior = sixty.state.distance;
  sixty.update(99, controls());
  assert.ok(sixty.state.distance - prior < 10);
  const snapshot = structuredClone(sixty.state);
  sixty.update(Number.NaN, controls());
  sixty.update(-1, controls());
  assert.equal(sixty.state.distance, snapshot.distance);
});

test('restart clears a crash and every transient pickup or movement effect', () => {
  const game = playing();
  Object.assign(game.state, {
    status: 'crashed',
    score: 900,
    bolts: 20,
    y: 9,
    vy: 8,
    air: 0,
    lane: 2,
    x: 7.2,
    shield: 3,
    magnet: 3,
    double: 3,
    rocket: 3,
    invincible: 3,
    combo: 5,
    comboTimer: 3,
    roll: 1,
    rollCooldown: 1,
    nearMisses: 3,
  });
  game.start();
  assert.equal(game.state.status, 'playing');
  for (const value of [
    game.state.score,
    game.state.bolts,
    game.state.distance,
    game.state.y,
    game.state.vy,
    game.state.lane,
    game.state.x,
    game.state.shield,
    game.state.magnet,
    game.state.double,
    game.state.rocket,
    game.state.invincible,
    game.state.roll,
    game.state.rollCooldown,
    game.state.nearMisses,
  ])
    assert.equal(value, 0);
  assert.equal(game.state.air, 100);
  assert.equal(game.state.combo, 1);
});

test('a roll shifts exactly one lane and spends eight air', () => {
  const game = playing();
  game.state.y = 5;
  game.update(1 / 60, controls({ rollRight: true }));
  assert.equal(game.state.lane, 1);
  assert.equal(game.state.air, 92);
  advance(game, 0.5, controls({ rollRight: true }));
  assert.equal(game.state.lane, 1);
  assert.ok(game.state.x > 3.2);
});

test('a roll needs eight air and spending the last eight never makes air negative', () => {
  const low = playing();
  low.state.y = 5;
  low.state.air = 7;
  low.update(1 / 60, controls({ rollLeft: true }));
  assert.equal(low.state.lane, 0);
  assert.equal(low.state.roll, 0);
  assert.equal(low.state.invincible, 0);
  assert.equal(low.state.air, 7);
  const enough = playing();
  enough.state.y = 5;
  enough.state.air = 8;
  enough.update(1 / 60, controls({ rollLeft: true }));
  assert.equal(enough.state.lane, -1);
  assert.equal(enough.state.air, 0);
  advance(enough, 0.2, controls({ fly: true }));
  assert.ok(enough.state.y < 5, 'depleted air cannot sustain flight');
});

test('a combo multiplies distance score and combines with double score', () => {
  const ordinary = playing();
  const combo = playing();
  const both = playing();
  combo.state.combo = both.state.combo = 3;
  combo.state.comboTimer = both.state.comboTimer = 4;
  both.state.double = 4;
  for (const game of [ordinary, combo, both]) advance(game, 0.5);
  assert.ok(Math.abs(combo.state.score - ordinary.state.score * 3) < 0.001);
  assert.ok(Math.abs(both.state.score - ordinary.state.score * 6) < 0.001);
});

test('traffic collision height follows the actual vehicle body', () => {
  const sedan = playing();
  const van = playing();
  for (const game of [sedan, van]) {
    game.state.y = 1.8;
    game.state.vy = 0;
  }
  sedan.state.entities = [obstacle({ variant: 0, z: -1 })];
  van.state.entities = [obstacle({ variant: 4, z: -1 })];
  sedan.update(1 / 120, controls());
  van.update(1 / 120, controls());
  assert.equal(sedan.state.status, 'playing', 'a sedan fits below the player');
  assert.equal(van.state.status, 'crashed', 'a tall van still occupies this height');
});

test('long vehicle collision reaches farther forward without an oversized carrier hitbox', () => {
  const sedan = playing();
  const bus = playing();
  const carrier = playing();
  sedan.state.entities = [obstacle({ variant: 0, z: -4.6 })];
  bus.state.entities = [obstacle({ variant: 7, z: -4.6 })];
  carrier.state.entities = [obstacle({ variant: 8, z: -8 })];
  for (const game of [sedan, bus, carrier]) game.update(1 / 120, controls());
  assert.equal(sedan.state.status, 'playing');
  assert.equal(bus.state.status, 'crashed');
  assert.equal(
    carrier.state.status,
    'playing',
    'the carrier is rendered at no more than six metres long',
  );
});

test('descending onto a traffic roof lands safely and awards one roof ride', () => {
  const game = playing();
  game.state.y = 1.55;
  game.state.vy = -5;
  game.state.air = 45;
  game.state.entities = [obstacle({ variant: 0, z: -0.6 })];
  game.update(1 / 30, controls());
  assert.equal(game.state.status, 'playing');
  assert.ok(Math.abs(game.state.y - 1.43) < 0.01);
  assert.equal(game.state.vy, 0);
  assert.equal(game.state.events.filter((event) => event.label === 'ROOF RIDE').length, 1);
  assert.ok(game.state.score >= 100);
  advance(game, 0.5, controls(), false);
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.y, 0, 'the player drops back to the road after the vehicle passes');
});

test('an aerial barrier can be flown underneath but hits at its occupied altitude', () => {
  const low = playing();
  const high = playing();
  low.state.y = 5;
  high.state.y = 8;
  for (const game of [low, high])
    game.state.entities = [obstacle({ kind: 'barrier', y: 8, z: -1 })];
  low.update(1 / 60, controls());
  high.update(1 / 60, controls());
  assert.equal(low.state.status, 'playing');
  assert.equal(high.state.status, 'crashed');
});

test('generated roads include all traffic styles and aerial hazards with open lanes', () => {
  const game = new Simulation(123);
  game.start();
  game.state.invincible = 1000;
  const variants = new Set<number>();
  let aerialBarrier = false;
  for (let frame = 0; frame < 7200; frame++) {
    game.update(1 / 60, controls());
    for (const entity of game.state.entities) {
      if (entity.kind === 'traffic') variants.add(entity.variant);
      if (entity.kind === 'barrier' && entity.y >= 7) {
        aerialBarrier = true;
        const blocked = new Set(
          game.state.entities
            .filter(
              (other) =>
                other.kind !== 'pickup' &&
                other.kind !== 'ramp' &&
                Math.abs(other.z - entity.z) < 8,
            )
            .map((other) => other.lane),
        );
        assert.ok(blocked.size < 5, 'a hazard row always leaves a lane open');
      }
    }
  }
  assert.equal(variants.size, 9);
  assert.ok(aerialBarrier, 'flight has an overhead hazard to avoid');
});
